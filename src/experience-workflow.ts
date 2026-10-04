/** Native workflow transport. Separate owner, worker and reviewer credentials.
 * No provider call or autonomous tool execution is started by this resource.
 */
import type { MemoryClient } from "./client";

export interface ReflectionConfig {
  model: string;
  applicability_keys: string[];
  maximum_attempts: number;
  budget_microusd: number;
  per_attempt_microusd: number;
  lease_seconds?: number;
}

export interface ExperienceProgramInput {
  collection_id?: string;
  memory_collection_id: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  policy_key: string;
  worker_key_id: string;
  reviewer_key_id?: string;
  source_since?: string;
  config: ReflectionConfig;
}

export interface ReflectionOutput {
  schema_version?: "experience-reflection-output-v1";
  hypotheses: Array<{
    advice: string;
    rationale: string;
    limitations: string;
    future_verification: string;
  }>;
  insufficient_evidence_reason?: string | null;
}

export interface LessonReviewInput {
  expected_sequence: number;
  expected_digest: string | null;
  candidate_digest: string;
  verdict: "eligible" | "blocked" | "retracted";
  rationale: string;
}

export interface LessonRevisionInput extends Omit<LessonReviewInput, "verdict"> {
  request_key: string;
  hypothesis: ReflectionOutput["hypotheses"][number];
}

export type ReflectionUncertainty =
  | "provider_failure"
  | "invalid_provider_output"
  | "completion_delivery_uncertain";

const root = "/v1/learning/experiences";
const resource = (kind: string, id: string) => `${root}/${kind}/${encodeURIComponent(id)}`;

export class ExperienceWorkflowResource {
  constructor(private client: MemoryClient) {}

  definePermission(id: string, policy: {
    actor_key_id: string; tool_key: string; target_digest: string; action_keys: string[];
    maximum_argument_bytes: number; maximum_dispatches: number; permit_seconds: number; capability_contract: string;
  }) {
    return this.client.post(`${resource("programs", id)}/permission-policies`, policy);
  }
  activatePermission(id: string, activation: {
    policy_id: string | null; expected_sequence: number; expected_digest: string | null; rationale: string;
  }) {
    return this.client.post(`${resource("programs", id)}/permission-activation`, activation);
  }
  permissionState(id: string) {
    return this.client.get(`${resource("programs", id)}/permission-state`);
  }
  issuePermit(id: string, input: {
    lesson_id: string; decision_id: string; request_key: string;
    invocation: { tool_key: string; target: Record<string, unknown>; arguments: Record<string, unknown> };
  }) {
    return this.client.post(`${resource("programs", id)}/permits`, input);
  }
  dispatchPermit(id: string, invocationDigest: string) {
    return this.client.post(`${resource("permits", id)}/dispatch`, { invocation_digest: invocationDigest });
  }
  permit(id: string) {
    return this.client.get(resource("permits", id));
  }

  register(input: ExperienceProgramInput) {
    return this.client.post(`${root}/programs`, input);
  }
  program(id: string) {
    return this.client.get(resource("programs", id));
  }
  stop(id: string) {
    return this.client.post(`${resource("programs", id)}/stop`);
  }
  claim(id: string, requestKey: string) {
    return this.client.post(`${resource("programs", id)}/claim`, { request_key: requestKey });
  }
  job(id: string) {
    return this.client.get(resource("jobs", id));
  }
  /** A dispatch grant is single-use. Never retry a provider call after uncertainty. */
  dispatch(id: string, input: { input_digest: string; request_digest: string }) {
    return this.client.post(`${resource("jobs", id)}/dispatch`, input);
  }
  complete(id: string, input: {
    output: ReflectionOutput;
    request_digest: string;
    provider_response_digest: string;
    reported_microusd: number;
  }) {
    return this.client.post(`${resource("jobs", id)}/complete`, input);
  }
  uncertain(id: string, requestDigest: string, reason: ReflectionUncertainty) {
    return this.client.post(`${resource("jobs", id)}/uncertain`, {
      request_digest: requestDigest, reason,
    });
  }
  lessons(id: string, params: { after_id?: string; limit?: number } = {}) {
    return this.client.get(`${resource("programs", id)}/lessons`, params);
  }
  reviewQueue(id: string, params: { after_id?: string; limit?: number } = {}) {
    return this.client.get(`${resource("programs", id)}/review-queue`, params);
  }
  lesson(id: string) {
    return this.client.get(resource("lessons", id));
  }
  review(id: string, input: LessonReviewInput) {
    return this.client.post(`${resource("lessons", id)}/reviews`, input);
  }
  revise(id: string, input: LessonRevisionInput) {
    return this.client.post(`${resource("lessons", id)}/revisions`, input);
  }
  reviews(id: string, params: { after_sequence?: number; limit?: number } = {}) {
    return this.client.get(`${resource("lessons", id)}/reviews`, params);
  }
}
