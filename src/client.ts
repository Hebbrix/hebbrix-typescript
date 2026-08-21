/**
 * Main Hebbrix client
 */

import {
  AuthResource,
  CollectionsResource,
  MemoriesResource,
  SearchResource,
  RLResource,
  ProceduralResource,
  TemporalResource,
  WorkingMemoryResource,
  ConsolidationResource,
  MemoryToolsResource,
  WorldModelResource,
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
} from "./errors";

export class MemoryClient {
  private apiKey?: string;
  private baseUrl: string;
  private timeout: number;

  public auth: AuthResource;
  public collections: CollectionsResource;
  public memories: MemoriesResource;
  private searchResource: SearchResource;
  public rl: RLResource;
  public procedural: ProceduralResource;
  public temporal: TemporalResource;
  public workingMemory: WorkingMemoryResource;
  public consolidation: ConsolidationResource;
  public memoryTools: MemoryToolsResource;
  public worldModel: WorldModelResource;
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
    this.searchResource = new SearchResource(this);
    this.rl = new RLResource(this);
    this.procedural = new ProceduralResource(this);
    this.temporal = new TemporalResource(this);
    this.workingMemory = new WorkingMemoryResource(this);
    this.consolidation = new ConsolidationResource(this);
    this.memoryTools = new MemoryToolsResource(this);
    this.worldModel = new WorldModelResource(this);
    this.proofloop = new ProofLoopResource(this);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "hebbrix-typescript/2.1.0",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  private handleError(response: Response, data: any): never {
    const statusCode = response.status;
    const message = data?.error?.message || data?.detail || response.statusText;

    if (statusCode === 401) {
      throw new AuthenticationError(message);
    } else if (statusCode === 404) {
      throw new NotFoundError(message);
    } else if (statusCode === 422) {
      const errors = data?.error?.details || [];
      throw new ValidationError(message, errors);
    } else if (statusCode === 429) {
      throw new RateLimitError(message);
    } else if (statusCode >= 500) {
      throw new ServerError(message);
    } else {
      throw new HebbrixError(message, statusCode);
    }
  }

  async request<T = any>(
    method: string,
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {}),
      },
      ...options,
      signal: AbortSignal.timeout(this.timeout),
    });

    let data: any;
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      this.handleError(response, data);
    }

    return data as T;
  }

  async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    let url = path;

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
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
