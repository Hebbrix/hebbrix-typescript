import assert from "node:assert/strict";
import test from "node:test";
import { ProofLoopResource } from "../dist/index.mjs";

test("protected ledger methods preserve scopes, incomplete outcomes and server permission receipts", async () => {
  const calls = [];
  const receipt = {
    authorization_granted: false,
    status: "review_required",
    replayed: true,
  };
  const client = Object.fromEntries(
    ["get", "post"].map((method) => [
      method,
      async (...args) => {
        calls.push([method, ...args]);
        return receipt;
      },
    ]),
  );
  const api = new ProofLoopResource(client);
  const scope = {
    policy_key: "workflow.choice",
    collection_id: "collection",
    user_id: "end-user",
  };
  const registration = {
    ...scope,
    api_key_id: "verifier-key",
    source_system: "verifier",
    metric_keys: ["success"],
  };
  const episode = {
    ...scope,
    verifier_id: "verifier",
    idempotency_key: "episode-key",
  };
  const execution = {
    attempt_id: "attempt",
    status: "started",
    actual_action_key: "baseline",
    arguments_digest: "a".repeat(64),
  };
  const delivery = {
    decision_id: "decision",
    source_event_id: "source-event",
    evidence_digest: "b".repeat(64),
    execution_digest: "c".repeat(64),
    observations: [
      {
        metric_key: "success",
        value: 1,
        is_final: false,
        observed_at: "2026-09-07T12:00:00Z",
      },
    ],
  };
  for (const result of [
    await api.registerVerifier(registration),
    await api.createEpisode(episode),
    await api.getEpisode("episode", 100),
    await api.recordExecution("decision", execution),
    await api.verifierEvidence("verifier", "decision"),
    await api.deliverVerifiedOutcomes("verifier", delivery),
    await api.assessment("decision", 100),
    await api.closeEpisode("episode", "interrupted"),
    await api.revokeVerifier("verifier"),
  ])
    assert.equal(result, receipt);
  assert.deepEqual(calls, [
    ["post", "/v1/learning/verifiers", registration],
    ["post", "/v1/learning/episodes", episode],
    ["get", "/v1/learning/episodes/episode", { offset: 100 }],
    ["post", "/v1/learning/decisions/decision/executions", execution],
    ["get", "/v1/learning/verifiers/verifier/decisions/decision"],
    ["post", "/v1/learning/verifiers/verifier/events", delivery],
    [
      "get",
      "/v1/learning/decisions/decision/assessment",
      { evidence_offset: 100 },
    ],
    ["post", "/v1/learning/episodes/episode/close", { status: "interrupted" }],
    ["post", "/v1/learning/verifiers/verifier/revoke", {}],
  ]);
});

test("a verifier error never falls back to caller-reported outcomes", async () => {
  let calls = 0;
  const api = new ProofLoopResource({
    post: async () => {
      calls++;
      throw new Error("verifier rejected");
    },
  });
  await assert.rejects(
    api.deliverVerifiedOutcomes("verifier", {}),
    /verifier rejected/,
  );
  assert.equal(calls, 1);
});
