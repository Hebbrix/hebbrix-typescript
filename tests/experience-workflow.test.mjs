import assert from "node:assert/strict";
import test from "node:test";
import { ExperienceWorkflowResource, MemoryClient } from "../dist/index.mjs";

test("native workflow transport preserves single-attempt receipts, CAS and escaped IDs", async () => {
  const calls = [];
  const receipt = { authorization_granted: false, replayed: true, status: "unknown" };
  const api = new ExperienceWorkflowResource(Object.fromEntries(["get", "post"].map(method => [method,
    async (...args) => { calls.push([method, ...args]); return receipt; },
  ])));
  const config = { model: "explicit-model", applicability_keys: ["kind"], maximum_attempts: 2,
    budget_microusd: 200, per_attempt_microusd: 100 };
  const registration = { config, policy_key: "repairs", worker_key_id: "worker", memory_collection_id: "lessons" };
  const dispatch = { input_digest: "a".repeat(64), request_digest: "b".repeat(64) };
  const completed = { output: { hypotheses: [], insufficient_evidence_reason: "No diagnostics" },
    request_digest: dispatch.request_digest, provider_response_digest: "c".repeat(64), reported_microusd: 12 };
  const review = { expected_sequence: 1, expected_digest: "d".repeat(64), candidate_digest: "e".repeat(64),
    verdict: "blocked", rationale: "Does not support generalization" };
  for (const result of [await api.register(registration), await api.program("p/x"), await api.stop("p/x"),
    await api.claim("p/x", "claim"), await api.job("j/x"), await api.dispatch("j/x", dispatch),
    await api.complete("j/x", completed), await api.uncertain("j/x", dispatch.request_digest, "provider_failure"),
    await api.lessons("p/x", { limit: 4 }), await api.reviewQueue("p/x", { limit: 2 }),
    await api.lesson("l/x"), await api.review("l/x", review), await api.reviews("l/x", { after_sequence: 1 }),
  ]) assert.equal(result, receipt);
  const root = "/v1/learning/experiences";
  assert.deepEqual(calls, [
    ["post", root + "/programs", registration], ["get", root + "/programs/p%2Fx"],
    ["post", root + "/programs/p%2Fx/stop"], ["post", root + "/programs/p%2Fx/claim", { request_key: "claim" }],
    ["get", root + "/jobs/j%2Fx"], ["post", root + "/jobs/j%2Fx/dispatch", dispatch],
    ["post", root + "/jobs/j%2Fx/complete", completed],
    ["post", root + "/jobs/j%2Fx/uncertain", { request_digest: dispatch.request_digest, reason: "provider_failure" }],
    ["get", root + "/programs/p%2Fx/lessons", { limit: 4 }],
    ["get", root + "/programs/p%2Fx/review-queue", { limit: 2 }], ["get", root + "/lessons/l%2Fx"],
    ["post", root + "/lessons/l%2Fx/reviews", review], ["get", root + "/lessons/l%2Fx/reviews", { after_sequence: 1 }],
  ]);
  assert.ok(new MemoryClient().experiences instanceof ExperienceWorkflowResource);
});

test("uncertain dispatch is not retried or downgraded", async () => {
  let calls = 0;
  const api = new ExperienceWorkflowResource({ post: async () => { calls++; throw new Error("timeout"); } });
  await assert.rejects(api.dispatch("job", { input_digest: "a".repeat(64), request_digest: "b".repeat(64) }), /timeout/);
  assert.equal(calls, 1);
});

test("permission and revision transports preserve owner CAS, exact binding and no implicit grant", async () => {
  const calls = [];
  const api = new ExperienceWorkflowResource(Object.fromEntries(["get", "post"].map(method => [method,
    async (...args) => { calls.push([method, ...args]); return { authorization_granted: false }; },
  ])));
  const policy = { actor_key_id: "actor", tool_key: "local.reply", target_digest: "a".repeat(64),
    action_keys: ["concise"], maximum_argument_bytes: 1000, maximum_dispatches: 2, permit_seconds: 30,
    capability_contract: "Only application-enforced local reply adapter" };
  const activation = { policy_id: "policy", expected_sequence: 1, expected_digest: "b".repeat(64), rationale: "Owner promotion" };
  const invocation = { tool_key: "local.reply", target: { id: "local" }, arguments: { format: "concise" } };
  const permit = { lesson_id: "lesson", decision_id: "decision", request_key: "once", invocation };
  const revision = { request_key: "revision", expected_sequence: 1, expected_digest: "c".repeat(64),
    candidate_digest: "d".repeat(64), hypothesis: { advice: "bounded", rationale: "observed", limitations: "one source", future_verification: "unseen cases" }, rationale: "Narrow the original" };
  await api.definePermission("p/x", policy);
  await api.activatePermission("p/x", activation);
  await api.permissionState("p/x");
  await api.issuePermit("p/x", permit);
  await api.dispatchPermit("permit/x", "e".repeat(64));
  await api.permit("permit/x");
  await api.revise("l/x", revision);
  assert.deepEqual(calls, [
    ["post", "/v1/learning/experiences/programs/p%2Fx/permission-policies", policy],
    ["post", "/v1/learning/experiences/programs/p%2Fx/permission-activation", activation],
    ["get", "/v1/learning/experiences/programs/p%2Fx/permission-state"],
    ["post", "/v1/learning/experiences/programs/p%2Fx/permits", permit],
    ["post", "/v1/learning/experiences/permits/permit%2Fx/dispatch", { invocation_digest: "e".repeat(64) }],
    ["get", "/v1/learning/experiences/permits/permit%2Fx"],
    ["post", "/v1/learning/experiences/lessons/l%2Fx/revisions", revision],
  ]);
});
