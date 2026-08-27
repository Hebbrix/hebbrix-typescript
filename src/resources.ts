/**
 * API Resource classes
 */

import type { MemoryClient } from "./client";
import type {
  AuthResponse,
  User,
  Collection,
  Memory,
  MemoryWithMetadata,
  SearchResult,
  SearchResponse,
  ReasoningResponse,
  CreateCollectionParams,
  UpdateCollectionParams,
  CreateMemoryParams,
  MemoryAddResponse,
  BatchMemoryCreateParams,
  BatchMemoryResponse,
  UpdateMemoryParams,
  SearchParams,
  ReasonParams,
  ListParams,
  MemoryListParams,
  CursorPage,
  MemoryJobReceipt,
  CorrectionCreateParams,
  CorrectionSearchParams,
  APIKeyResponse,
  ProofLoopDecisionParams,
  ProofLoopMetricParams,
} from "./types";
import { enforceSearchSafety } from "./safety";
import {
  IndexingAbortedError,
  IndexingTerminalError,
  IndexingTimeoutError,
} from "./errors";

class BaseResource {
  constructor(protected client: MemoryClient) {}
}

export class AuthResource extends BaseResource {
  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    fullName: string,
  ): Promise<AuthResponse> {
    return this.client.post<AuthResponse>("/v1/auth/register", {
      email,
      password,
      full_name: fullName,
    });
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.client.post<AuthResponse>("/v1/auth/login", {
      email,
      password,
    });
  }

  /**
   * Create a new API key
   */
  async createApiKey(name: string): Promise<APIKeyResponse> {
    return this.client.post<APIKeyResponse>("/v1/auth/api-keys", { name });
  }

  /**
   * Get current user information
   */
  async getMe(): Promise<User> {
    return this.client.get<User>("/v1/auth/me");
  }
}

export class CollectionsResource extends BaseResource {
  /**
   * Create a new collection
   */
  async create(params: CreateCollectionParams): Promise<Collection> {
    return this.client.post<Collection>("/v1/collections", params);
  }

  /**
   * List all collections
   */
  async list(params: ListParams = {}): Promise<CursorPage<Collection>> {
    return this.client.get<CursorPage<Collection>>("/v1/collections", params);
  }

  /**
   * Get a specific collection
   */
  async get(collectionId: string): Promise<Collection> {
    return this.client.get<Collection>(`/v1/collections/${collectionId}`);
  }

  /**
   * Update a collection
   */
  async update(
    collectionId: string,
    params: UpdateCollectionParams,
  ): Promise<Collection> {
    return this.client.patch<Collection>(
      `/v1/collections/${collectionId}`,
      params,
    );
  }

  /**
   * Delete a collection
   */
  async delete(collectionId: string): Promise<void> {
    await this.client.delete(`/v1/collections/${collectionId}`);
  }
}

export class MemoriesResource extends BaseResource {
  /**
   * Create one logical memory write. When `wait_for_index=true`, a durable
   * pending receipt is polled without issuing a second create request.
   */
  async create(params: CreateMemoryParams): Promise<MemoryAddResponse> {
    if (!params.content?.trim() && !params.messages?.length) {
      throw new TypeError("content or messages must be provided");
    }
    const {
      idempotency_key,
      signal,
      index_timeout_ms,
      index_poll_interval_ms,
      ...input
    } = params;
    const receipt = await this.client.request<MemoryAddResponse>(
      "POST",
      "/v1/memories",
      {
        headers: idempotency_key
          ? { "Idempotency-Key": idempotency_key }
          : undefined,
        body: JSON.stringify({
          source_type: "text",
          metadata: {},
          infer: false,
          wait_for_index: false,
          ...input,
        }),
        signal,
      },
    );
    if (params.wait_for_index && !this.isSearchableCompletion(receipt)) {
      return this.waitForSearchable(receipt, {
        timeoutMs: index_timeout_ms,
        pollIntervalMs: index_poll_interval_ms,
        signal,
        idempotencyKey: idempotency_key,
      });
    }
    return receipt;
  }

  /** Poll a single-write durable receipt until every accepted memory is searchable. */
  async waitForSearchable(
    receipt: MemoryAddResponse,
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      signal?: AbortSignal;
      idempotencyKey?: string;
    } = {},
  ): Promise<MemoryAddResponse> {
    if (this.isSearchableCompletion(receipt)) {
      return receipt;
    }
    if (this.isTerminalStatus(receipt.processing_status)) {
      const status = String(receipt.processing_status).toLowerCase();
      throw new IndexingTerminalError(
        `memory indexing reached terminal state ${status}`,
        receipt,
        status,
        { idempotencyKey: options.idempotencyKey },
      );
    }
    const ids = this.memoryIds(receipt);
    if (!ids.length) {
      throw new Error("memory receipt does not contain a durable memory id");
    }
    const timeoutMs = Math.max(0, options.timeoutMs ?? 60_000);
    const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 500);
    const deadline = Date.now() + timeoutMs;
    const paths = ids.map((id, index) =>
      index === 0 && receipt.status_url
        ? this.readinessPath(receipt.status_url, id)
        : `/v1/memories/${encodeURIComponent(id)}`,
    );

    while (true) {
      this.throwIfPollingAborted(receipt, options);
      if (Date.now() >= deadline) {
        throw new IndexingTimeoutError(
          `memory was not searchable within ${timeoutMs}ms; the write is durable`,
          receipt,
          { idempotencyKey: options.idempotencyKey },
        );
      }

      let rows: MemoryWithMetadata[];
      try {
        rows = await Promise.all(
          paths.map((path) =>
            this.client.request<MemoryWithMetadata>("GET", path, {
              signal: options.signal,
            }),
          ),
        );
      } catch (error) {
        if (options.signal?.aborted) {
          throw new IndexingAbortedError(
            "memory readiness polling was aborted after the write became durable",
            receipt,
            { idempotencyKey: options.idempotencyKey, cause: error },
          );
        }
        throw error;
      }

      const terminal = rows.find((row) =>
        this.isTerminalStatus(row.processing_status),
      );
      if (terminal) {
        const status = String(terminal.processing_status).toLowerCase();
        throw new IndexingTerminalError(
          `memory ${terminal.id} indexing reached terminal state ${status}`,
          receipt,
          status,
          { idempotencyKey: options.idempotencyKey },
        );
      }
      if (
        rows.every(
          (row) =>
            row.searchable === true &&
            String(row.processing_status || "").toLowerCase() === "completed",
        )
      ) {
        return {
          ...receipt,
          processing_status: "completed",
          searchable: true,
          results: receipt.results.map((result) => ({
            ...result,
            processing_status: "completed",
          })),
        };
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        continue;
      }
      await this.pollingDelay(
        Math.min(pollIntervalMs, remainingMs),
        receipt,
        options,
      );
    }
  }

  private memoryIds(receipt: MemoryAddResponse): string[] {
    return [
      ...new Set(
        (receipt.results || [])
          .map((row) => row.memory_id || row.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  }

  private isSearchableCompletion(receipt: MemoryAddResponse): boolean {
    return (
      receipt.searchable === true &&
      String(receipt.processing_status || "").toLowerCase() === "completed"
    );
  }

  private isTerminalStatus(status: string | undefined): boolean {
    return ["failed", "cancelled", "canceled"].includes(
      String(status || "").toLowerCase(),
    );
  }

  private readinessPath(statusUrl: string, memoryId: string): string {
    try {
      const parsed = new URL(statusUrl, "https://status.hebbrix.invalid");
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return `/v1/memories/${encodeURIComponent(memoryId)}`;
      }
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return `/v1/memories/${encodeURIComponent(memoryId)}`;
    }
  }

  private throwIfPollingAborted(
    receipt: MemoryAddResponse,
    options: { signal?: AbortSignal; idempotencyKey?: string },
  ): void {
    if (options.signal?.aborted) {
      throw new IndexingAbortedError(
        "memory readiness polling was aborted after the write became durable",
        receipt,
        {
          idempotencyKey: options.idempotencyKey,
          cause: options.signal.reason,
        },
      );
    }
  }

  private async pollingDelay(
    delayMs: number,
    receipt: MemoryAddResponse,
    options: { signal?: AbortSignal; idempotencyKey?: string },
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(
          new IndexingAbortedError(
            "memory readiness polling was aborted after the write became durable",
            receipt,
            {
              idempotencyKey: options.idempotencyKey,
              cause: options.signal?.reason,
            },
          ),
        );
      };
      const timer = setTimeout(() => {
        options.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delayMs);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) {
        onAbort();
      }
    });
  }

  /**
   * Create up to 100 memories with one unambiguous readiness contract.
   * `wait_for_index=true` resolves only for a fully searchable batch. A durable
   * server-side 202 is polled to the caller's deadline; expiry raises a typed
   * `IndexingTimeoutError` carrying the original durable receipt.
   */
  async createBatch(
    params: BatchMemoryCreateParams,
  ): Promise<BatchMemoryResponse> {
    if (!params.memories?.length || params.memories.length > 100) {
      throw new TypeError("memories must contain between 1 and 100 items");
    }
    if (params.memories.some((item) => !item.content?.trim())) {
      throw new TypeError("every batch memory must contain non-empty content");
    }
    const {
      idempotency_key,
      signal,
      index_timeout_ms,
      index_poll_interval_ms,
      ...body
    } = params;
    const receipt = await this.client.request<BatchMemoryResponse>(
      "POST",
      "/v1/memories/batch",
      {
        headers: idempotency_key
          ? { "Idempotency-Key": idempotency_key }
          : undefined,
        body: JSON.stringify({ wait_for_index: false, ...body }),
        signal,
      },
    );
    if (params.wait_for_index && !receipt.searchable) {
      return this.waitForBatchSearchable(receipt, {
        timeoutMs: index_timeout_ms,
        pollIntervalMs: index_poll_interval_ms,
        signal,
      });
    }
    return receipt;
  }

  /** Poll every item in an asynchronous batch receipt until it is searchable. */
  async waitForBatchSearchable(
    receipt: BatchMemoryResponse,
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<BatchMemoryResponse> {
    const ids = [...new Set(receipt.memory_ids || [])];
    if (!ids.length) {
      throw new Error("batch receipt does not contain memory_ids");
    }
    const timeoutMs = Math.max(0, options.timeoutMs ?? 60_000);
    const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 500);
    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (options.signal?.aborted) {
        throw (
          options.signal.reason ||
          new Error("batch readiness polling was aborted")
        );
      }
      const rows = await Promise.all(ids.map((id) => this.get(id)));
      const terminal = rows.find((row: any) =>
        ["failed", "cancelled", "canceled"].includes(
          String(row.processing_status || "").toLowerCase(),
        ),
      ) as any;
      if (terminal) {
        throw new Error(
          `memory ${terminal.id} indexing reached terminal state ${terminal.processing_status}`,
        );
      }
      if (rows.every((row: any) => row.searchable === true)) {
        return {
          ...receipt,
          processing_status: "completed",
          searchable: true,
          results: ids.map((id) => ({
            id,
            memory_id: id,
            processing_status: "completed",
          })),
        };
      }
      if (Date.now() >= deadline) {
        throw new IndexingTimeoutError(
          `batch was not searchable within ${timeoutMs}ms; the write is durable`,
          receipt,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * List memories
   */
  async listPage(params: MemoryListParams = {}): Promise<CursorPage<Memory>> {
    return this.client.get<CursorPage<Memory>>("/v1/memories", params);
  }

  /** Back-compatible one-page convenience; use listPage for cursor metadata. */
  async list(params: MemoryListParams = {}): Promise<Memory[]> {
    const page = await this.listPage(params);
    return page.items;
  }

  /**
   * Get a specific memory
   */
  async get(memoryId: string): Promise<MemoryWithMetadata> {
    return this.client.get<MemoryWithMetadata>(`/v1/memories/${memoryId}`);
  }

  /**
   * Update a memory
   */
  async update(memoryId: string, params: UpdateMemoryParams): Promise<Memory> {
    return this.client.patch<Memory>(`/v1/memories/${memoryId}`, params);
  }

  /**
   * Delete a memory
   */
  async delete(memoryId: string): Promise<void> {
    await this.client.delete(`/v1/memories/${memoryId}`);
  }
}

export class MemoryJobsResource extends BaseResource {
  async get(jobId: string): Promise<MemoryJobReceipt> {
    return this.client.get<MemoryJobReceipt>(`/v1/memory-jobs/${jobId}`);
  }

  async wait(
    jobId: string,
    options: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<MemoryJobReceipt> {
    const timeoutMs = Math.max(0, options.timeoutMs ?? 60_000);
    const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 500);
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const receipt = await this.get(jobId);
      const status = String(receipt.status || "").toLowerCase();
      if (["completed", "failed", "cancelled", "canceled"].includes(status)) {
        return receipt;
      }
      if (Date.now() >= deadline) {
        throw new Error(`memory job ${jobId} did not finish in ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}

export class CorrectionsResource extends BaseResource {
  async create(params: CorrectionCreateParams): Promise<Record<string, any>> {
    const { idempotency_key, ...body } = params;
    return this.client.request("POST", "/v1/corrections", {
      headers: idempotency_key
        ? { "Idempotency-Key": idempotency_key }
        : undefined,
      body: JSON.stringify({
        correction_type: "preference",
        confidence: 1,
        ...body,
      }),
    });
  }

  async relevant(
    params: CorrectionSearchParams,
  ): Promise<Array<Record<string, any>>> {
    return this.client.get("/v1/corrections/relevant", {
      include_global: false,
      limit: 10,
      ...params,
    });
  }

  async get(correctionId: string): Promise<Record<string, any>> {
    return this.client.get(`/v1/corrections/${correctionId}`);
  }

  async delete(correctionId: string): Promise<Record<string, any>> {
    return this.client.delete(`/v1/corrections/${correctionId}`);
  }
}

export class SearchResource extends BaseResource {
  /**
   * Search memories
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.searchWithProof(params);

    return response.results;
  }

  /** Search while preserving the automatic ProofLoop evidence context. */
  async searchWithProof(params: SearchParams): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>("/v1/search", {
      query: params.query,
      collection_id: params.collection_id,
      user_id: params.user_id,
      agent_id: params.agent_id,
      run_id: params.run_id,
      limit: params.limit || 10,
      search_type: params.search_type || "hybrid",
      filters: params.filters || {},
      fast: params.fast,
      threshold: params.threshold,
      include_low_confidence: params.include_low_confidence ?? false,
      group_by_source: params.group_by_source ?? true,
      debug: params.debug ?? false,
    });
    return enforceSearchSafety(response);
  }

  /**
   * Find similar memories
   */
  async similar(memoryId: string, limit = 10): Promise<SearchResult[]> {
    const response = await this.client.get<SearchResponse>(
      `/v1/search/similar/${memoryId}`,
      { limit },
    );

    return response.results;
  }

  /**
   * Perform reasoning over memories
   */
  async reason(params: ReasonParams): Promise<ReasoningResponse> {
    const response = await this.client.post<ReasoningResponse>(
      "/v1/search/reason",
      {
        query: params.query,
        collection_id: params.collection_id,
        provider: params.provider,
        include_steps: params.include_steps ?? false,
        user_id: params.user_id,
        agent_id: params.agent_id,
        run_id: params.run_id,
        facets: params.facets ?? [],
      },
    );
    return enforceSearchSafety(response, "sources");
  }
}

export class ProofLoopResource extends BaseResource {
  /** Create a causal decision bound to search/chat evidence automatically. */
  async decide(params: ProofLoopDecisionParams): Promise<Record<string, any>> {
    const context = params.proof_context;
    const token = typeof context === "string" ? context : context?.token;
    const { proof_context: _context, ...body } = params;
    return this.client.post("/v1/learning/decisions", {
      ...body,
      ...(token ? { proof_context_token: token } : {}),
    });
  }

  async recordOutcome(
    decisionId: string,
    body: {
      observations?: Record<string, any>[];
      reward?: number;
      success?: boolean;
      idempotency_key?: string;
    },
  ): Promise<Record<string, any>> {
    return this.client.post(`/v1/learning/decisions/${decisionId}/outcomes`, {
      observations: [],
      ...body,
    });
  }

  async getDecision(decisionId: string): Promise<Record<string, any>> {
    return this.client.get(`/v1/learning/decisions/${decisionId}`);
  }

  async defineMetric(
    params: ProofLoopMetricParams,
  ): Promise<Record<string, any>> {
    return this.client.post("/v1/learning/metrics", params);
  }

  async listMetrics(
    params: {
      policy_key?: string;
      collection_id?: string;
      user_id?: string;
    } = {},
  ): Promise<Record<string, any>> {
    return this.client.get("/v1/learning/metrics", params);
  }

  async policyInsights(
    policyKey: string,
    params: {
      collection_id?: string;
      user_id?: string;
      action_keys?: string[];
      context?: Record<string, any>;
    } = {},
  ): Promise<Record<string, any>> {
    return this.client.get(`/v1/learning/policies/${policyKey}/insights`, {
      collection_id: params.collection_id,
      user_id: params.user_id,
      action_key: params.action_keys,
      context: params.context ? JSON.stringify(params.context) : undefined,
    });
  }

  async evaluatePolicy(
    policyKey: string,
    params: {
      collection_id?: string;
      user_id?: string;
      limit?: number;
    } = {},
  ): Promise<Record<string, any>> {
    return this.client.post(`/v1/learning/policies/${policyKey}/evaluate`, {
      collection_id: params.collection_id,
      user_id: params.user_id,
      limit: params.limit ?? 500,
    });
  }

  async proof(decisionId: string): Promise<Record<string, any>> {
    return this.client.get(`/v1/learning/decisions/${decisionId}/proof`);
  }

  async publicKey(keyId?: string): Promise<Record<string, any>> {
    return this.client.get("/v1/learning/proof-key", {
      key_id: keyId,
    });
  }
}

export class RLResource extends BaseResource {
  /**
   * Train the Memory Manager agent using RL
   */
  async trainMemoryManager(params: {
    num_episodes?: number;
    [key: string]: any;
  }): Promise<any> {
    return this.client.post("/v1/rl/train/memory-manager", {
      num_episodes: params.num_episodes || 100,
      ...params,
    });
  }

  /**
   * Train the Answer Agent using RL
   */
  async trainAnswerAgent(params: {
    num_episodes?: number;
    [key: string]: any;
  }): Promise<any> {
    return this.client.post("/v1/rl/train/answer-agent", {
      num_episodes: params.num_episodes || 100,
      ...params,
    });
  }

  /**
   * Get RL training metrics
   */
  async getMetrics(): Promise<any> {
    return this.client.get("/v1/rl/metrics");
  }

  /**
   * Evaluate a trained RL agent
   */
  async evaluate(agentType: string, collectionId?: string): Promise<any> {
    return this.client.post("/v1/rl/evaluate", {
      agent_type: agentType,
      collection_id: collectionId,
    });
  }
}

export class ProceduralResource extends BaseResource {
  private unwrapProcedure(response: any): any {
    if (response?.procedure) return response.procedure;
    if (response?.procedure_id && !response?.id) {
      return { ...response, id: response.procedure_id };
    }
    return response;
  }

  /**
   * Create a new procedure
   */
  async create(params: {
    name: string;
    description: string;
    trigger_condition: string;
    action_sequence: string[];
    collection_id?: string;
    category?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const response = await this.client.post("/v1/procedures", {
      name: params.name,
      description: params.description,
      condition: { expression: params.trigger_condition },
      action: { steps: params.action_sequence },
      collection_id: params.collection_id,
      category: params.category,
      parameters: params.metadata || {},
    });
    return this.unwrapProcedure(response);
  }

  /**
   * List procedures
   */
  async list(params?: {
    collection_id?: string;
    category?: string;
    skip?: number;
    limit?: number;
  }): Promise<any[]> {
    const response = await this.client.get<any>("/v1/procedures", {
      collection_id: params?.collection_id,
      category: params?.category,
      skip: params?.skip || 0,
      limit: params?.limit || 100,
    });
    return Array.isArray(response) ? response : response?.procedures || [];
  }

  /**
   * Get a specific procedure
   */
  async get(procedureId: string): Promise<any> {
    const response = await this.client.get(`/v1/procedures/${procedureId}`);
    return this.unwrapProcedure(response);
  }

  /**
   * Execute a procedure
   */
  async execute(
    procedureId: string,
    context?: Record<string, any>,
  ): Promise<any> {
    const response = await this.client.post(
      `/v1/procedures/${procedureId}/execute`,
      {
        input_state: context || {},
      },
    );
    return response?.execution_result || response;
  }

  /**
   * Update a procedure
   */
  async update(
    procedureId: string,
    params: {
      name?: string;
      description?: string;
      trigger_condition?: string;
      action_sequence?: string[];
      metadata?: Record<string, any>;
    },
  ): Promise<any> {
    const body: Record<string, any> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.description !== undefined) body.description = params.description;
    if (params.trigger_condition !== undefined) {
      body.condition = { expression: params.trigger_condition };
    }
    if (params.action_sequence !== undefined) {
      body.action = { steps: params.action_sequence };
    }
    if (params.metadata !== undefined) body.parameters = params.metadata;
    const response = await this.client.patch(
      `/v1/procedures/${procedureId}`,
      body,
    );
    return this.unwrapProcedure(response);
  }

  /**
   * Delete a procedure
   */
  async delete(procedureId: string): Promise<void> {
    await this.client.delete(`/v1/procedures/${procedureId}`);
  }
}

export class TemporalResource extends BaseResource {
  /**
   * Add a temporal fact to the knowledge graph
   */
  async addFact(params: {
    subject: string;
    predicate: string;
    object: string;
    valid_from: string;
    valid_until?: string;
    observed_at?: string;
    subject_type?: string;
    object_type?: string;
    confidence?: number;
    source_memory_id?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    return this.client.post("/v1/temporal/facts", {
      subject: params.subject,
      subject_type: params.subject_type || "ENTITY",
      predicate: params.predicate,
      object: params.object,
      object_type: params.object_type || "ENTITY",
      valid_from: params.valid_from,
      valid_until: params.valid_until,
      observed_at: params.observed_at,
      confidence: params.confidence || 1.0,
      source_memory_id: params.source_memory_id,
      metadata: params.metadata || {},
    });
  }

  /**
   * Query temporal facts
   */
  async queryFacts(params: {
    subject?: string;
    predicate?: string;
    object?: string;
    at_time?: string;
  }): Promise<any[]> {
    if (!params.subject) {
      throw new TypeError("subject is required by the temporal query contract");
    }
    let rows: any[];
    if (params.at_time) {
      const response: any = await this.queryAtTime({
        subject: params.subject,
        predicate: params.predicate,
        timestamp: params.at_time,
      });
      rows = response.facts || [];
    } else if (params.predicate) {
      const response: any = await this.history(
        params.subject,
        params.predicate,
      );
      rows = response.history || [];
    } else {
      throw new TypeError("predicate or at_time is required");
    }
    return params.object === undefined
      ? rows
      : rows.filter((row) => row.object === params.object);
  }

  async queryAtTime(params: {
    subject: string;
    timestamp: string;
    predicate?: string;
  }): Promise<any> {
    return this.client.post("/v1/temporal/facts/query-at-time", params);
  }

  async history(subject: string, predicate: string, limit = 50): Promise<any> {
    return this.client.get("/v1/temporal/facts/history", {
      subject,
      predicate,
      limit,
    });
  }

  async conflicts(subject: string, predicate: string): Promise<any> {
    return this.client.get("/v1/temporal/facts/conflicts", {
      subject,
      predicate,
    });
  }

  async invalidate(
    subject: string,
    predicate: string,
    object: string,
  ): Promise<any> {
    return this.client.post("/v1/temporal/facts/invalidate", {
      subject,
      predicate,
      object,
    });
  }

  /**
   * Query knowledge state at a specific point in time
   */
  async pointInTime(timestamp: string, entity?: string): Promise<any> {
    if (!entity) {
      throw new TypeError(
        "entity is required and maps to the canonical subject",
      );
    }
    return this.queryAtTime({
      timestamp,
      subject: entity,
    });
  }

  /** Permanently delete a tenant-scoped temporal fact by stable ID. */
  async deleteFact(factId: string): Promise<any> {
    return this.client.delete(`/v1/temporal/facts/${factId}`);
  }
}

export class WorkingMemoryResource extends BaseResource {
  public readonly sessionId: string;

  constructor(client: MemoryClient) {
    super(client);
    this.sessionId = `sdk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  /**
   * Add item to working memory buffer
   */
  async add(params: {
    role: string;
    content: string;
    metadata?: Record<string, any>;
    session_id?: string;
  }): Promise<any> {
    return this.client.post("/v1/working-memory/add", {
      session_id: params.session_id || this.sessionId,
      role: params.role,
      content: params.content,
      metadata: params.metadata || {},
    });
  }

  /**
   * Get current working memory context
   */
  async getContext(
    sessionId = this.sessionId,
    includeCompressed = false,
  ): Promise<any> {
    return this.client.get(`/v1/working-memory/context/${sessionId}`, {
      include_compressed: includeCompressed,
    });
  }

  /**
   * Compress working memory buffer
   */
  async compress(sessionId = this.sessionId): Promise<any> {
    return this.client.post(`/v1/working-memory/compress/${sessionId}`);
  }

  /**
   * Clear working memory buffer
   */
  async clear(sessionId = this.sessionId): Promise<any> {
    return this.client.delete(`/v1/working-memory/clear/${sessionId}`);
  }
}

export class ConsolidationResource extends BaseResource {
  /**
   * Trigger memory consolidation
   */
  async consolidate(
    collectionId: string,
    lookbackDays = 7,
    utilityThreshold = 0.3,
  ): Promise<any> {
    return this.client.post("/v1/consolidation/consolidate", {
      collection_id: collectionId,
      lookback_days: lookbackDays,
      utility_threshold: utilityThreshold,
    });
  }

  /**
   * Get consolidation statistics
   */
  async getStats(collectionId: string): Promise<any> {
    return this.client.get(`/v1/consolidation/stats/${collectionId}`);
  }
}

export class MemoryToolsResource extends BaseResource {
  /**
   * Replace memory content
   */
  async replace(params: {
    memory_id: string;
    old_content: string;
    new_content: string;
    collection_id: string;
    reason?: string;
  }): Promise<any> {
    return this.client.post("/v1/memory-tools/replace", {
      memory_id: params.memory_id,
      old_content: params.old_content,
      new_content: params.new_content,
      collection_id: params.collection_id,
    });
  }

  /**
   * Insert new memory at position
   */
  async insert(params: {
    collection_id: string;
    content: string;
    position?: number;
    reason?: string;
    importance?: number;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const metadata = { ...(params.metadata || {}) };
    if (params.position !== undefined)
      metadata.requested_position = params.position;
    if (params.reason !== undefined) metadata.reason = params.reason;
    return this.client.post("/v1/memory-tools/insert", {
      collection_id: params.collection_id,
      content: params.content,
      importance: params.importance ?? 0.5,
      metadata,
    });
  }

  /**
   * Re-evaluate memory in light of new information
   */
  async rethink(memoryId: string, collectionId: string): Promise<any> {
    return this.client.post("/v1/memory-tools/rethink", {
      memory_id: memoryId,
      collection_id: collectionId,
    });
  }
}
