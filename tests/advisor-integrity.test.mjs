import assert from "node:assert/strict";
import test from "node:test";
import { ProofLoopResource } from "../dist/index.mjs";

const inputs = () => ({
  policy_key: "integrity",
  context: { scope: { environment: "sandbox" } },
  candidates: [
    { action_key: "a", features: { nested: ["original"] } },
    { action_key: "b" },
  ],
  collection_id: "c",
  user_id: "u",
  idempotency_key: "once",
});
const choice = () => ({
  chosen_action_key: "b",
  action_probability: 1,
  behavior_probabilities: { a: 0, b: 1 },
});
function transport(read = async () => ({ authorization_granted: false })) {
  const calls = { get: [], post: [] };
  const api = new ProofLoopResource({
    get: async (...args) => {
      calls.get.push(args);
      return read(...args);
    },
    post: async (...args) => {
      calls.post.push(args);
      return { decision_id: "d" };
    },
  });
  return { api, calls };
}
for (const stage of ["evidence_read", "advisor"])
  test(`nested input snapshot survives ${stage} mutation`, async () => {
    const params = inputs(),
      original = JSON.parse(JSON.stringify(params));
    let invoked = 0;
    const mutate = () => {
      params.context.scope.environment = "production";
      params.candidates[0].features.nested.push("changed");
      params.candidates.push({ action_key: "foreign" });
      params.user_id = "foreign";
    };
    const { api, calls } = transport(async () => {
      if (stage === "evidence_read") mutate();
      return {};
    });
    await api.decideWithAdvice({
      ...params,
      advisor: async () => {
        invoked++;
        if (stage === "advisor") mutate();
        return choice();
      },
    });
    assert.deepEqual(JSON.parse(calls.get[0][1].context), original.context);
    assert.deepEqual(calls.post[0][1].context, original.context);
    assert.deepEqual(calls.post[0][1].candidates, original.candidates);
    assert.equal(calls.post[0][1].user_id, "u");
    assert.equal(calls.post[0][1].mode, "observe");
    assert.equal(calls.post.length, 1);
    assert.equal(invoked, 1);
  });
test("returned probabilities do not remain aliased to callback result", async () => {
  const { api, calls } = transport(),
    selected = choice();
  await api.decideWithAdvice({ ...inputs(), advisor: async () => selected });
  selected.behavior_probabilities.b = 0;
  assert.deepEqual(calls.post[0][1].behavior_probabilities, { a: 0, b: 1 });
});
test("pilot horizon reaches advice, not the logged decision", async () => {
  const { api, calls } = transport();
  await api.decideWithAdvice({ ...inputs(), remaining_decisions: 80, max_pilot_decisions: 2, advisor: async () => choice() });
  assert.equal(calls.get[0][1].remaining_decisions, 80);
  assert.equal(calls.get[0][1].max_pilot_decisions, 2);
  assert.equal("remaining_decisions" in calls.post[0][1], false);
  assert.equal("max_pilot_decisions" in calls.post[0][1], false);
});
for (const horizon of [true, 0, 10001, 1.5]) test(`invalid pilot horizon ${horizon} fails before advice`, async () => {
  const { api, calls } = transport();
  await assert.rejects(api.decideWithAdvice({ ...inputs(), remaining_decisions: horizon, advisor: async () => choice() }));
  assert.equal(calls.get.length, 0);
  assert.equal(calls.post.length, 0);
});
const invalidChoices = [
  null,
  [],
  { ...choice(), user_id: "foreign" },
  { ...choice(), chosen_action_key: "foreign" },
  { ...choice(), chosen_action_key: null },
  { ...choice(), behavior_probabilities: null },
  { ...choice(), behavior_probabilities: { b: 1 } },
  { ...choice(), behavior_probabilities: { a: 0, b: 1, c: 0 } },
  { ...choice(), behavior_probabilities: { a: 0, b: true } },
  { ...choice(), behavior_probabilities: { a: 0, b: "1" } },
  { ...choice(), behavior_probabilities: { a: 0, b: NaN } },
  { ...choice(), behavior_probabilities: { a: 0, b: Infinity } },
  { ...choice(), behavior_probabilities: { a: -0.1, b: 1.1 } },
  { ...choice(), behavior_probabilities: { a: 0.1, b: 1 } },
  ...[true, "1", null, NaN, 0, 1.1, 0.5].map((p) => ({
    ...choice(),
    action_probability: p,
  })),
  {
    chosen_action_key: "b",
    action_probability: 0,
    behavior_probabilities: { a: 1, b: 0 },
  },
];
invalidChoices.forEach((selected, i) =>
  test(`bad choice ${i} never writes`, async () => {
    const { api, calls } = transport();
    let invoked = 0;
    await assert.rejects(
      api.decideWithAdvice({
        ...inputs(),
        advisor: async () => {
          invoked++;
          return selected;
        },
      }),
    );
    assert.equal(calls.get.length, 1);
    assert.equal(invoked, 1);
    assert.equal(calls.post.length, 0);
  }),
);
const invalidInputs = [
  {policy_key:" invalid"}, {policy_key:"path/policy"}, {policy_key:{}},
  {collection_id:{}}, {user_id:{}}, {idempotency_key:[]},
  {user_id:"x".repeat(256)}, {idempotency_key:"x".repeat(161)},
  { candidates: [] },
  { candidates: [{ action_key: "a" }, { action_key: "a" }] },
  { candidates: [{ action_key: " a" }] },
  { candidates: [{ action_key: true }] },
  { candidates: [{ action_key: "a", unexpected: "field" }] },
  { candidates: [{ action_key: "a", features: [] }] },
  { candidates: [{ action_key: "a", description: 12 }] },
  {
    candidates: Array.from({ length: 51 }, (_, i) => ({
      action_key: String(i),
    })),
  },
  { context: [] },
  { context: { x: NaN } },
  { context: { x: undefined } },
  { context: { x: new Date() } },
  { context: { x: "x".repeat(17000) } },
  { context: { x: () => 1 } },
  { context: { x: BigInt(1) } },
  { prior_strength: 4 },
];
invalidInputs.forEach((bad, i) =>
  test(`bad input ${i} fails before retrieval or callback`, async () => {
    const { api, calls } = transport();
    let invoked = 0;
    await assert.rejects(
      api.decideWithAdvice({
        ...inputs(),
        ...bad,
        advisor: async () => {
          invoked++;
          return choice();
        },
      }),
    );
    assert.equal(calls.get.length, 0);
    assert.equal(invoked, 0);
    assert.equal(calls.post.length, 0);
  }),
);
for (const probabilities of [
  { a: 0.3, b: 0.7 },
  { a: 0, b: 1 },
  { a: 0.3, b: 0.700000005 },
])
  test(`valid distribution preserved ${probabilities.b}`, async () => {
    const { api, calls } = transport();
    await api.decideWithAdvice({
      ...inputs(),
      advisor: async () => ({
        chosen_action_key: "b",
        action_probability: probabilities.b,
        behavior_probabilities: probabilities,
      }),
    });
    assert.deepEqual(calls.post[0][1].behavior_probabilities, probabilities);
  });
test("single action remains explicit", async () => {
  const { api, calls } = transport();
  await api.decideWithAdvice({
    ...inputs(),
    candidates: [{ action_key: "a" }],
    advisor: async () => ({
      chosen_action_key: "a",
      action_probability: 1,
      behavior_probabilities: { a: 1 },
    }),
  });
  assert.equal(calls.post.length, 1);
});
for (const stage of ["read", "advisor", "write"])
  test(`no retry after ${stage} failure`, async () => {
    let reads = 0,
      callbacks = 0,
      writes = 0;
    const fail = () => {
      throw new Error("bounded failure");
    };
    const api = new ProofLoopResource({
      get: async () => {
        reads++;
        return stage === "read" ? fail() : {};
      },
      post: async () => {
        writes++;
        return stage === "write" ? fail() : {};
      },
    });
    await assert.rejects(
      api.decideWithAdvice({
        ...inputs(),
        advisor: async () => {
          callbacks++;
          return stage === "advisor" ? fail() : choice();
        },
      }),
      /bounded failure/,
    );
    assert.equal(reads, 1);
    assert.equal(callbacks, stage === "read" ? 0 : 1);
    assert.equal(writes, stage === "write" ? 1 : 0);
  });
test("cycles, accessors, and symbol fields do not silently change the wire", async () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = {
    get environment() {
      throw new Error("getter must not run");
    },
  };
  const symbol = { [Symbol("scope")]: "private" };
  for (const context of [cyclic, accessor, symbol]) {
    const { api, calls } = transport();
    await assert.rejects(
      api.decideWithAdvice({
        ...inputs(),
        context,
        advisor: async () => choice(),
      }),
    );
    assert.equal(calls.get.length, 0);
    assert.equal(calls.post.length, 0);
  }
});
