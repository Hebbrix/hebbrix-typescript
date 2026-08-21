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
  UpdateMemoryParams,
  SearchParams,
  ReasonParams,
  ListParams,
  APIKeyResponse,
  ProofLoopDecisionParams,
} from "./types";

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
  async list(params: ListParams = {}): Promise<Collection[]> {
    return this.client.get<Collection[]>("/v1/collections", params);
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
   * Create a new memory
   */
  async create(params: CreateMemoryParams): Promise<Memory> {
    return this.client.post<Memory>("/v1/memories", params);
  }

  /**
   * List memories
   */
  async list(
    params: ListParams & { collection_id?: string } = {},
  ): Promise<Memory[]> {
    return this.client.get<Memory[]>("/v1/memories", params);
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

export class SearchResource extends BaseResource {
  /**
   * Search memories
   */
  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.client.post<SearchResponse>("/v1/search", {
      query: params.query,
      collection_id: params.collection_id,
      limit: params.limit || 10,
      search_type: params.search_type || "hybrid",
      filters: params.filters || {},
    });

    return response.results;
  }

  /** Search while preserving the automatic ProofLoop evidence context. */
  async searchWithProof(params: SearchParams): Promise<SearchResponse> {
    return this.client.post<SearchResponse>("/v1/search", {
      query: params.query,
      collection_id: params.collection_id,
      user_id: params.user_id,
      limit: params.limit || 10,
      search_type: params.search_type || "hybrid",
      filters: params.filters || {},
    });
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
    return this.client.post<ReasoningResponse>("/v1/search/reason", {
      query: params.query,
      collection_id: params.collection_id,
      provider: params.provider,
      include_steps: params.include_steps || false,
    });
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

  async proof(decisionId: string): Promise<Record<string, any>> {
    return this.client.get(`/v1/learning/decisions/${decisionId}/proof`);
  }

  async publicKey(): Promise<Record<string, any>> {
    return this.client.get("/v1/learning/proof-key");
  }
}

export class RLResource extends BaseResource {
  /**
   * Train the Memory Manager agent using RL
   */
  async trainMemoryManager(params: {
    collection_id?: string;
    num_episodes?: number;
    [key: string]: any;
  }): Promise<any> {
    return this.client.post("/rl/train/memory-manager", {
      collection_id: params.collection_id,
      num_episodes: params.num_episodes || 100,
      ...params,
    });
  }

  /**
   * Train the Answer Agent using RL
   */
  async trainAnswerAgent(params: {
    collection_id?: string;
    num_episodes?: number;
    [key: string]: any;
  }): Promise<any> {
    return this.client.post("/rl/train/answer-agent", {
      collection_id: params.collection_id,
      num_episodes: params.num_episodes || 100,
      ...params,
    });
  }

  /**
   * Get RL training metrics
   */
  async getMetrics(): Promise<any> {
    return this.client.get("/rl/metrics");
  }

  /**
   * Evaluate a trained RL agent
   */
  async evaluate(agentType: string, collectionId?: string): Promise<any> {
    return this.client.post("/rl/evaluate", {
      agent_type: agentType,
      collection_id: collectionId,
    });
  }
}

export class ProceduralResource extends BaseResource {
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
    return this.client.post("/procedural", {
      name: params.name,
      description: params.description,
      trigger_condition: params.trigger_condition,
      action_sequence: params.action_sequence,
      collection_id: params.collection_id,
      category: params.category,
      metadata: params.metadata || {},
    });
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
    return this.client.get("/procedural", {
      collection_id: params?.collection_id,
      category: params?.category,
      skip: params?.skip || 0,
      limit: params?.limit || 100,
    });
  }

  /**
   * Get a specific procedure
   */
  async get(procedureId: string): Promise<any> {
    return this.client.get(`/procedural/${procedureId}`);
  }

  /**
   * Execute a procedure
   */
  async execute(
    procedureId: string,
    context?: Record<string, any>,
  ): Promise<any> {
    return this.client.post(`/procedural/${procedureId}/execute`, {
      context: context || {},
    });
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
    return this.client.patch(`/procedural/${procedureId}`, params);
  }

  /**
   * Delete a procedure
   */
  async delete(procedureId: string): Promise<void> {
    await this.client.delete(`/procedural/${procedureId}`);
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
    valid_from?: string;
    valid_until?: string;
    confidence?: number;
    source_memory_id?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    return this.client.post("/temporal/facts", {
      subject: params.subject,
      predicate: params.predicate,
      object: params.object,
      valid_from: params.valid_from,
      valid_until: params.valid_until,
      confidence: params.confidence || 1.0,
      source_memory_id: params.source_memory_id,
      metadata: params.metadata || {},
    });
  }

  /**
   * Query temporal facts
   */
  async queryFacts(params?: {
    subject?: string;
    predicate?: string;
    object?: string;
    at_time?: string;
  }): Promise<any[]> {
    return this.client.get("/temporal/facts", {
      subject: params?.subject,
      predicate: params?.predicate,
      object: params?.object,
      at_time: params?.at_time,
    });
  }

  /**
   * Query knowledge state at a specific point in time
   */
  async pointInTime(timestamp: string, entity?: string): Promise<any> {
    return this.client.post("/temporal/point-in-time", {
      timestamp,
      entity,
    });
  }
}

export class WorkingMemoryResource extends BaseResource {
  /**
   * Add item to working memory buffer
   */
  async add(params: {
    role: string;
    content: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    return this.client.post("/working-memory", {
      role: params.role,
      content: params.content,
      metadata: params.metadata || {},
    });
  }

  /**
   * Get current working memory context
   */
  async getContext(): Promise<any> {
    return this.client.get("/working-memory/context");
  }

  /**
   * Compress working memory buffer
   */
  async compress(): Promise<any> {
    return this.client.post("/working-memory/compress");
  }

  /**
   * Clear working memory buffer
   */
  async clear(): Promise<any> {
    return this.client.delete("/working-memory");
  }
}

export class ConsolidationResource extends BaseResource {
  /**
   * Trigger memory consolidation
   */
  async consolidate(collectionId: string, threshold = 100): Promise<any> {
    return this.client.post("/consolidation/consolidate", {
      collection_id: collectionId,
      threshold,
    });
  }

  /**
   * Get consolidation statistics
   */
  async getStats(collectionId: string): Promise<any> {
    return this.client.get("/consolidation/stats", {
      collection_id: collectionId,
    });
  }

  /**
   * Archive old memories
   */
  async archive(collectionId: string, beforeDate?: string): Promise<any> {
    return this.client.post("/consolidation/archive", {
      collection_id: collectionId,
      before_date: beforeDate,
    });
  }
}

export class MemoryToolsResource extends BaseResource {
  /**
   * Replace memory content
   */
  async replace(params: {
    memory_id: string;
    new_content: string;
    reason?: string;
  }): Promise<any> {
    return this.client.post("/memory-tools/replace", {
      memory_id: params.memory_id,
      new_content: params.new_content,
      reason: params.reason,
    });
  }

  /**
   * Insert new memory at position
   */
  async insert(params: {
    collection_id: string;
    content: string;
    position: number;
    reason?: string;
  }): Promise<any> {
    return this.client.post("/memory-tools/insert", {
      collection_id: params.collection_id,
      content: params.content,
      position: params.position,
      reason: params.reason,
    });
  }

  /**
   * Re-evaluate memory in light of new information
   */
  async rethink(memoryId: string, query: string): Promise<any> {
    return this.client.post("/memory-tools/rethink", {
      memory_id: memoryId,
      query,
    });
  }
}

export class WorldModelResource extends BaseResource {
  /**
   * Simulate retrieval without actually retrieving
   */
  async imagineRetrieval(query: string, collectionId?: string): Promise<any> {
    return this.client.post("/world-model/imagine-retrieval", {
      query,
      collection_id: collectionId,
    });
  }

  /**
   * Plan memory operations to achieve goal
   */
  async plan(goal: string, collectionId?: string): Promise<any> {
    return this.client.post("/world-model/plan", {
      goal,
      collection_id: collectionId,
    });
  }
}
