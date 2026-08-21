/**
 * Type definitions for AI Memory SDK
 */

export interface ClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user_id: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  tier: "free" | "starter" | "pro" | "enterprise";
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  memory_count: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  collection_id: string;
  content: string;
  importance: number;
  source_type: string;
  source_reference?: string;
  access_count: number;
  last_accessed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryWithMetadata extends Memory {
  metadata: Record<string, any>;
}

export interface SearchResult {
  memory_id: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  search_type: string;
  processing_time_ms: number;
  proof_context?: ProofContext;
}

export interface ProofContext {
  schema_version: "proofloop-context-v1";
  context_id: string;
  token: string;
  manifest_digest: string;
  evidence_manifest: Record<string, any>;
  trace_id?: string;
  issued_at: string;
  expires_at: string;
}

export interface ProofLoopCandidate {
  action_key: string;
  description?: string;
  features?: Record<string, any>;
}

export interface ProofLoopDecisionParams {
  policy_key: string;
  candidates: ProofLoopCandidate[];
  proof_context?: ProofContext | string;
  collection_id?: string;
  user_id?: string;
  [key: string]: any;
}

export interface ReasoningSource {
  memory_id: string;
  content: string;
  score: number;
}

export interface ReasoningResponse {
  answer: string;
  sources: ReasoningSource[];
  metadata: Record<string, any>;
  reasoning_context?: Record<string, any>;
}

export interface CreateCollectionParams {
  name: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UpdateCollectionParams {
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface CreateMemoryParams {
  collection_id: string;
  content: string;
  importance?: number;
  source_type?: string;
  source_reference?: string;
  metadata?: Record<string, any>;
}

export interface UpdateMemoryParams {
  content?: string;
  importance?: number;
  metadata?: Record<string, any>;
}

export interface SearchParams {
  query: string;
  collection_id?: string;
  limit?: number;
  search_type?: "hybrid" | "vector" | "bm25" | "graph";
  filters?: Record<string, any>;
  user_id?: string;
}

export interface ReasonParams {
  query: string;
  collection_id?: string;
  provider?: "gemini" | "openai" | "anthropic";
  include_steps?: boolean;
}

export interface ListParams {
  skip?: number;
  limit?: number;
}

export interface APIKeyResponse {
  id: string;
  name: string;
  key: string;
  prefix: string;
  created_at: string;
}
