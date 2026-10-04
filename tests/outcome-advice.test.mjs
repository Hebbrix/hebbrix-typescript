import assert from "node:assert/strict";
import test from "node:test";
import { ProofLoopResource } from "../dist/index.mjs";

test("risk opt-in and advice preserve scopes, JSON context, and revisions", async () => {
  const calls = [];
  const api = new ProofLoopResource({
    request: async (...args) => { calls.push(args); return { authorization_granted: false }; },
    get: async (...args) => { calls.push(args); return { authorization_granted: false }; },
  });
  await api.configurePolicy("policy:key", { configuration: { actions: {} }, expected_revision: 2 });
  assert.deepEqual(calls[0], ["PUT", "/v1/learning/policies/policy%3Akey/configuration", {
    body: JSON.stringify({ expected_revision: 2, configuration: { actions: {} } }),
  }]);
  await api.policyConfiguration("policy:key", { user_id: "alice" });
  await api.policyAdvice("policy:key", { context: { issue: "slow" }, remaining_decisions: 100, max_pilot_decisions: 2 });
  const result = await api.actionAdvice("Restart sandbox", {
    policy_key: "policy:key", action_key: "restart", user_id: "alice",
  });
  assert.equal(calls[1][1].user_id, "alice");
  assert.deepEqual(JSON.parse(calls[2][1].context), { issue: "slow" });
  assert.equal(calls[2][1].remaining_decisions, 100);
  assert.equal(calls[2][1].max_pilot_decisions, 2);
  assert.equal(calls[3][0], "/v1/confidence");
  assert.equal(calls[3][1].end_user_id, "alice");
  assert.equal(result.authorization_granted, false);
  await api.registerContextSchema("policy:key", { context_schema: { version: "v1", fields: {} } });
  await api.contextSchema("policy:key", { user_id: "alice" });
  assert.deepEqual(calls[4], ["PUT", "/v1/learning/policies/policy%3Akey/context-schema", {
    body: JSON.stringify({ context_schema: { version: "v1", fields: {} } }),
  }]);
  assert.equal(calls[5][0], "/v1/learning/policies/policy%3Akey/context-schema");
  assert.equal(calls[5][1].user_id, "alice");
});
