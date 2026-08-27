/**
 * Main Hebbrix client
 */

import {
  AuthResource,
  CollectionsResource,
  MemoriesResource,
  MemoryJobsResource,
  CorrectionsResource,
  SearchResource,
  RLResource,
  ProceduralResource,
  TemporalResource,
  WorkingMemoryResource,
  ConsolidationResource,
  MemoryToolsResource,
  ProofLoopResource,
} from "./resources";
import {
  ClientConfig,
  SearchParams,
  SearchResult,
  ReasonParams,
  ReasoningResponse,
} from "./types";
import {
  HebbrixError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ServerError,
  EntitlementError,
} from "./errors";

export class MemoryClient {
  private apiKey?: string;
  private baseUrl: string;
  private timeout: number;

  public auth: AuthResource;
  public collections: CollectionsResource;
  public memories: MemoriesResource;
  public memoryJobs: MemoryJobsResource;
  public corrections: CorrectionsResource;
  private searchResource: SearchResource;
  public rl: RLResource;
  public procedural: ProceduralResource;
  public temporal: TemporalResource;
  public workingMemory: WorkingMemoryResource;
  public consolidation: ConsolidationResource;
  public memoryTools: MemoryToolsResource;
  public proofloop: ProofLoopResource;

  constructor(config: ClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.hebbrix.com";
    this.timeout = config.timeout || 120000;

    // Remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, "");

    // Initialize resources
    this.auth = new AuthResource(this);
    this.collections = new CollectionsResource(this);
    this.memories = new MemoriesResource(this);
    this.memoryJobs = new MemoryJobsResource(this);
    this.corrections = new CorrectionsResource(this);
    this.searchResource = new SearchResource(this);
    this.rl = new RLResource(this);
    this.procedural = new ProceduralResource(this);
    this.temporal = new TemporalResource(this);
    this.workingMemory = new WorkingMemoryResource(this);
    this.consolidation = new ConsolidationResource(this);
    this.memoryTools = new MemoryToolsResource(this);
    this.proofloop = new ProofLoopResource(this);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "hebbrix-typescript/2.3.1",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private handleError(response: Response, data: any): never {
    const statusCode = response.status;
    const envelope = data?.error || data?.detail || {};
    const nested = envelope?.message;
    const details = nested && typeof nested === "object" ? nested : envelope;
    const message =
      details?.message ||
      (typeof nested === "string" ? nested : undefined) ||
      response.statusText;
    const code = details?.code || envelope?.code;
    const requestId =
      details?.request_id ||
      envelope?.request_id ||
      response.headers.get("X-Request-ID") ||
      undefined;

    if (statusCode === 401) {
      throw new AuthenticationError(message, { code, requestId, details });
    } else if (statusCode === 404) {
      throw new NotFoundError(message, { code, requestId, details });
    } else if (statusCode === 422) {
      const errors = data?.error?.details || [];
      throw new ValidationError(message, errors, { code, requestId, details });
    } else if (statusCode === 429) {
      throw new RateLimitError(message, { code, requestId, details });
    } else if (statusCode >= 500) {
      throw new ServerError(message, { code, requestId, details });
    } else if (
      (statusCode === 402 || statusCode === 403) &&
      (String(code || "").includes("ENTITLEMENT") ||
        ["feature_not_available", "tier_upgrade_required"].includes(
          details?.error,
        ))
    ) {
      throw new EntitlementError(message, statusCode, {
        code,
        requestId,
        details,
      });
    } else {
      throw new HebbrixError(message, statusCode, { code, requestId, details });
    }
  }

  async request<T = any>(
    method: string,
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const {
      headers: requestHeaders,
      signal: requestSignal,
      ...requestOptions
    } = options;
    const response = await fetch(url, {
      ...requestOptions,
      method,
      headers: {
        ...this.getHeaders(),
        ...(requestHeaders || {}),
      },
      signal: requestSignal || AbortSignal.timeout(this.timeout),
    });

    let data: any = undefined;
    const contentType = response.headers.get("content-type");

    // DELETE/204 responses and a few successful webhook-style operations have
    // no body. Reading them with response.json() throws despite a successful
    // HTTP status, so parse exactly once and treat an empty payload as void.
    const responseText = await response.text();
    if (responseText) {
      if (contentType?.includes("application/json")) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { detail: responseText };
        }
      } else {
        data = responseText;
      }
    }

    if (!response.ok) {
      this.handleError(response, data);
    }

    // Successful durable-write metadata is split between the JSON receipt and
    // transport headers. Preserve it in one object before returning so a later
    // client-side readiness timeout can retain every recovery identifier.
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const requestId = response.headers.get("X-Request-ID");
      const statusUrl = response.headers.get("Location");
      const outboxEventId = response.headers.get("X-Hebbrix-Index-Event");
      const retryAfter = response.headers.get("Retry-After");
      const idempotencyReplay = response.headers.get("X-Idempotent-Replay");
      data = {
        ...data,
        ...(data.request_id === undefined && requestId
          ? { request_id: requestId }
          : {}),
        ...(data.status_url === undefined && statusUrl
          ? { status_url: statusUrl }
          : {}),
        ...(data.outbox_event_id === undefined && outboxEventId
          ? { outbox_event_id: outboxEventId }
          : {}),
        ...(data.retry_after === undefined && retryAfter
          ? { retry_after: retryAfter }
          : {}),
        ...(data.idempotency_replay === undefined && idempotencyReplay
          ? { idempotency_replay: idempotencyReplay.toLowerCase() === "true" }
          : {}),
      };
    }

    return data as T;
  }

  async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    let url = path;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((item) => searchParams.append(key, String(item)));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
      url += `?${searchParams.toString()}`;
    }

    return this.request<T>("GET", url);
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    return this.request<T>("POST", path, {
      body: JSON.stringify(body),
    });
  }

  async patch<T = any>(path: string, body?: any): Promise<T> {
    return this.request<T>("PATCH", path, {
      body: JSON.stringify(body),
    });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  // Convenience methods
  async search(params: SearchParams): Promise<SearchResult[]> {
    return this.searchResource.search(params);
  }

  async searchWithProof(
    params: SearchParams,
  ): Promise<import("./types").SearchResponse> {
    return this.searchResource.searchWithProof(params);
  }

  async reason(params: ReasonParams): Promise<ReasoningResponse> {
    return this.searchResource.reason(params);
  }
}
