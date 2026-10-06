import assert from "node:assert/strict";
import test from "node:test";
import { ProofLoopResource, SearchResource } from "../dist/index.mjs";

test("compact advice preserves exact scope and full remains the default", async () => {
  const calls = [];
  const api = new ProofLoopResource({ get: async (...args) => { calls.push(args); return { authorization_granted: false }; } });
  await api.policyAdvice("p:key", { context: { issue: "delivery" }, user_id: "u", view: "compact" });
  assert.equal(calls[0][0], "/v1/learning/policies/p%3Akey/advice");
  assert.deepEqual(calls[0][1], { context: '{"issue":"delivery"}', user_id: "u", view: "compact" });
  await api.policyAdvice("p:key");
  assert.equal("view" in calls[1][1], false);
  await assert.rejects(api.policyAdvice("p:key", { view: "unknown" }), /view/);
  assert.equal(calls.length, 2);
});

test("an explicit compact advisor still logs only its external choice once", async () => {
  const calls = [];
  const api = new ProofLoopResource({
    get: async (...args) => { calls.push(["get", ...args]); return { lesson_lines: ["Unverified caller evidence"], authorization_granted: false }; },
    post: async (...args) => { calls.push(["post", ...args]); return { decision_id: "d" }; },
  });
  await api.decideWithAdvice({ policy_key: "p", context: { issue: "delivery" }, view: "compact",
    candidates: [{ action_key: "a" }], advisor: async () => ({ chosen_action_key: "a", action_probability: 1, behavior_probabilities: { a: 1 } }) });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].view, "compact");
  assert.equal(calls[1][2].mode, "observe");
  assert.equal("view" in calls[1][2], false);
});

test("batch requests are detached, bounded and never retried automatically", async () => {
  const calls = [];
  const api = new ProofLoopResource({ post: async (...args) => { calls.push(args); return { atomic: false, rejected_count: 1 }; } });
  const items = [{ policy_key: "p", candidates: [{ action_key: "a" }], context: { issue: "delivery" }, idempotency_key: "d1", proof_context: { token: "original-token" } }];
  const result = await api.decideBatch(items);
  items[0].context.issue = "foreign";
  assert.equal(calls[0][1].items[0].context.issue, "delivery");
  assert.equal(calls[0][0], "/v1/learning/decisions/batch");
  assert.equal(calls[0][1].items[0].proof_context_token, "original-token");
  assert.deepEqual(items[0].proof_context, { token: "original-token" });
  assert.equal(result.atomic, false);
  await api.recordOutcomesBatch([{ decision_id: "d", idempotency_key: "o", outcome: { success: false } }]);
  assert.equal(calls[1][0], "/v1/learning/outcomes/batch");
  for (const bad of [[], Array.from({ length: 51 }, () => ({})), [{}], [{ idempotency_key: " " }], [{ idempotency_key: "k", bad: NaN }],
    [{ idempotency_key: "k", proof_context: {} }], [{ idempotency_key: "k", proof_context: "a", proof_context_token: "b" }]])
    await assert.rejects(api.decideBatch(bad));
  assert.equal(calls.length, 2);
});

test("confirmation requires affirmative caller outcome and scope", async () => {
  const calls = [];
  const api = new ProofLoopResource({ post: async (...args) => { calls.push(args); return {}; } });
  const fields = { observation_id: "o", idempotency_key: "i", success: false, confirmed: true, collection_id: "c", user_id: "u" };
  await api.confirmCapture("d/one", fields);
  assert.deepEqual(calls[0], ["/v1/learning/decisions/d%2Fone/confirm-capture", fields]);
  for (const patch of [{ success: "false" }, { success: 1 }, { confirmed: false }, { observation_id: "" }, { idempotency_key: " " }])
    await assert.rejects(api.confirmCapture("d", { ...fields, ...patch }));
  assert.equal(calls.length, 1);
});

test("compact search keeps authoritative grounding and unrounded score", async () => {
  const calls = [];
  const receipt = { query: "delivery", results: [{ memory_id: "m", content: "Delayed", score: 0.9, raw_rerank_score: 12.321 }], total: 1,
    no_match: false, abstain_recommended: false, query_confidence: 0.9,
    grounding: { status: "supported" }, evidence_ids: ["m"], safety_contract_version: "search-safety-v1" };
  const api = new SearchResource({ post: async (...args) => { calls.push(args); return receipt; } });
  const result = await api.searchWithProof({ query: "delivery", user_id: "u", view: "compact" });
  assert.equal(result.results[0].raw_rerank_score, 12.321);
  assert.deepEqual(result.evidence_ids, ["m"]);
  assert.equal(calls[0][1].view, "compact");
});
