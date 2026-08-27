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
  no_match: boolean;
  abstain_recommended: boolean;
  query_confidence: number;
  grounding: GroundingReceipt;
  evidence_ids: string[];
  evidence_claims?: EvidenceClaim[];
  safety_contract_version: string;
  degraded?: boolean;
  sdk_safety_reason?: string;
  proof_context?: ProofContext;
}

export interface GroundingReceipt {
  status: string;
  reason?: string;
  contract_version?: string;
  [key: string]: unknown;
}

export interface EvidenceClaim {
  memory_id: string;
  claims: Record<string, unknown>;
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
  answer: string | null;
  sources: ReasoningSource[];
  metadata: Record<string, any>;
  no_match: boolean;
  abstain_recommended: boolean;
  query_confidence: number;
  grounding: GroundingReceipt;
  evidence_ids: string[];
  evidence_claims?: EvidenceClaim[];
  safety_contract_version: string;
  degraded?: boolean;
  sdk_safety_reason?: string;
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
  collection_id?: string;
  content?: string;
  messages?: Array<{ role: string; content: string }>;
  importance?: number;
  source_type?: string;
  source_reference?: string;
  metadata?: Record<string, any>;
  infer?: boolean;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  app_id?: string;
  namespace?: string;
  wait_for_index?: boolean;
  async_dispatch?: boolean;
  title?: string;
  tags?: string[];
  source?: string;
  /** Stable retry key sent as the Idempotency-Key transport header. */
  idempotency_key?: string;
}

export interface MemoryAddResult {
  id: string;
  memory_id?: string;
  event: "ADD" | "UPDATE" | "NOOP" | string;
  memory?: string;
  reason?: string;
}

export interface MemoryAddResponse {
  results: MemoryAddResult[];
  collection_id?: string;
  processing_status: string;
  searchable: boolean;
  outbox_event_id?: string;
  status_url?: string;
  job_id?: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
}

export interface BatchMemoryItemParams {
  content: string;
  collection_id?: string;
  importance?: number;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface BatchMemoryCreateParams {
  memories: BatchMemoryItemParams[];
  collection_id?: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  app_id?: string;
  namespace?: string;
  wait_for_index?: boolean;
  /** Stable retry key sent as the Idempotency-Key transport header. */
  idempotency_key?: string;
  /** Optional caller cancellation signal; it is never serialized. */
  signal?: AbortSignal;
}

export interface BatchMemoryResponse {
  created: number;
  failed: number;
  memory_ids: string[];
  errors: string[];
  results: Array<{
    id: string;
    memory_id?: string;
    processing_status: string;
  }>;
  processing_status: string;
  searchable: boolean;
  outbox_event_id?: string;
  status_url?: string;
}

export interface UpdateMemoryParams {
  content?: string;
  importance?: number;
  metadata?: Record<string, any>;
  wait_for_index?: boolean;
}

export interface SearchParams {
  query: string;
  collection_id?: string;
  limit?: number;
  search_type?: "hybrid" | "vector" | "bm25" | "graph";
  filters?: Record<string, any>;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  fast?: boolean;
  threshold?: number;
  include_low_confidence?: boolean;
  group_by_source?: boolean;
  debug?: boolean;
}

export interface ReasonParams {
  query: string;
  collection_id?: string;
  provider?: "gemini" | "openai" | "anthropic";
  include_steps?: boolean;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  facets?: string[];
}

export interface ListParams {
  skip?: number;
  limit?: number;
}

export interface MemoryListParams {
  collection_id?: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  scope?: "all";
  cursor?: string;
  limit?: number;
  include_superseded?: boolean;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor?: string | null;
  has_more: boolean;
  total_count: number;
}

export interface MemoryJobReceipt {
  job_id?: string;
  status: string;
  [key: string]: any;
}

export interface CorrectionCreateParams {
  corrected_content: string;
  correction_type?: "preference" | "factual" | "procedural" | string;
  original_content?: string;
  context?: string;
  memory_id?: string;
  collection_id?: string;
  user_id?: string;
  agent_id?: string;
  confidence?: number;
  metadata?: Record<string, any>;
  idempotency_key?: string;
}

export interface CorrectionSearchParams {
  query: string;
  correction_type?: string;
  collection_id?: string;
  user_id?: string;
  agent_id?: string;
  include_global?: boolean;
  limit?: number;
}

export interface ProofLoopMetricParams {
  policy_key: string;
  metric_key: string;
  name: string;
  min_value: number;
  max_value: number;
  collection_id?: string;
  user_id?: string;
  [key: string]: any;
}

export interface APIKeyResponse {
  id: string;
  name: string;
  key: string;
  prefix: string;
  created_at: string;
}
