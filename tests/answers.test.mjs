import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ANSWER_ACTIONS,
  ANSWER_STATUSES,
  enforceSearchSafety,
  REVISION_STATUSES,
  shouldAnswer,
  usableMemories,
} from "../dist/index.mjs";

// The shapes /v1/search and /v1/search/reason return, with invented values.
const row = (id, fields = {}) => ({
  memory_id: id,
  id,
  content: `memory ${id}`,
  score: 0.9,
  low_confidence: false,
  is_current: true,
  revision_status: "current",
  stated_at: "2026-11-07T00:00:00Z",
  ...fields,
});

const search = (fields = {}, rows = [row("new")]) => ({
  query: "q",
  results: rows,
  total: rows.length,
  no_match: false,
  abstain_recommended: false,
  answer_status: "answerable",
  query_confidence: 0.9,
  grounding: { status: "supported" },
  evidence_ids: rows.map((r) => r.memory_id),
  safety_contract_version: "search-safety-v1",
  ...fields,
});

const source = (id, fields = {}) => {
  const { low_confidence: _, ...kept } = row(id, fields);
  return kept;
};

const reason = (fields = {}, sources = [source("new")]) => ({
  answer: "Use green.",
  sources,
  metadata: {},
  no_match: false,
  abstain_recommended: false,
  decision_abstained: false,
  abstain_reason: null,
  cited_context: null,
  answer_status: "answerable",
  reasoning_status: "completed",
  query_confidence: 0.9,
  grounding: { status: "supported" },
  evidence_ids: sources.map((r) => r.memory_id),
  safety_contract_version: "search-safety-v1",
  ...fields,
});

test("an answerable search gives its current evidence rows", () => {
  const decision = shouldAnswer(search());
  assert.equal(decision.answer, true);
  assert.equal(decision.action, "answer");
  assert.deepEqual(decision.memories.map((r) => r.memory_id), ["new"]);
  assert.deepEqual(usableMemories(search()), decision.memories);
});

test("the fields a model needs survive the decision", () => {
  const [kept] = shouldAnswer(search()).memories;
  assert.equal(kept.revision_status, "current");
  assert.equal(kept.stated_at, "2026-11-07T00:00:00Z");
});

test("only established current rows of a page are evidence", () => {
  const page = [
    row("new"),
    row("candidate", { low_confidence: true }),
    row("old", {
      is_current: false,
      revision_status: "superseded",
      low_confidence: true,
    }),
    row("copy", { is_current: false, revision_status: "historical" }),
    row("unsaid", { low_confidence: undefined }),
    row("unlabelled", { revision_status: undefined }),
  ];
  const decision = shouldAnswer(search({}, page));
  assert.deepEqual(decision.memories.map((r) => r.memory_id), ["new"]);
  assert.deepEqual(decision.context.map((r) => r.memory_id), [
    "candidate",
    "old",
    "copy",
    "unsaid",
    "unlabelled",
  ]);
});

for (const [status, action] of Object.entries(ANSWER_ACTIONS)) {
  if (status === "answerable") continue;
  test(`${status} never reaches a model: ${action}`, () => {
    const rows = status === "no_relevant_memory" ? [] : [row("m", { low_confidence: true })];
    const decision = shouldAnswer(search({ answer_status: status }, rows));
    assert.equal(decision.answer, false);
    assert.equal(decision.reason, status);
    assert.equal(decision.action, action);
    assert.deepEqual(decision.memories, []);
    assert.deepEqual(usableMemories(search({ answer_status: status }, rows)), []);
  });
}

for (const flag of ["no_match", "abstain_recommended", "decision_abstained"]) {
  test(`${flag} overrides an answerable status`, () => {
    const decision = shouldAnswer(search({ [flag]: true }));
    assert.equal(decision.answer, false);
    assert.equal(decision.reason, flag);
    assert.equal(decision.action, "abstain");
    assert.deepEqual(decision.memories, []);
    assert.equal(decision.context.length, 1);
  });
}

test("an answerable status without evidence rows abstains", () => {
  const rows = [row("m", { low_confidence: true })];
  const decision = shouldAnswer(search({}, rows));
  assert.equal(decision.reason, "no_usable_memories");
  assert.equal(decision.answer, false);
});

test("reason sources carry no low_confidence and count when cited", () => {
  const decision = shouldAnswer(reason());
  assert.equal(decision.answer, true);
  assert.deepEqual(decision.memories.map((r) => r.memory_id), ["new"]);
});

test("a reason abstention gives its context, never an answer", () => {
  const decision = shouldAnswer(
    reason({
      answer: null,
      decision_abstained: true,
      abstain_reason: "decision_not_verified",
      answer_status: "unverified",
      cited_context: "Rule [1] does not cover this case.",
    }),
  );
  assert.equal(decision.answer, false);
  assert.equal(decision.action, "abstain");
  assert.equal(decision.cited_context, "Rule [1] does not cover this case.");
  assert.deepEqual(decision.memories, []);
});

test("a reason past its deadline abstains with what it found", () => {
  const decision = shouldAnswer(
    reason({
      answer: null,
      decision_abstained: true,
      abstain_reason: "reasoning_timed_out",
      abstain_recommended: true,
      answer_status: "unverified",
      reasoning_status: "timed_out",
    }),
  );
  assert.equal(decision.answer, false);
  assert.equal(decision.context.length, 1);
});

test("a history question reads earlier versions, labelled", () => {
  const rows = [
    row("old", { is_current: false, revision_status: "superseded", low_confidence: true }),
    row("copy", { is_current: false, revision_status: "historical", low_confidence: true }),
    row("new"),
    row("candidate", { low_confidence: true }),
  ];
  const page = search({ answer_status: "superseded", abstain_recommended: true }, rows);
  assert.equal(shouldAnswer(page).answer, false);
  const decision = shouldAnswer(page, { history: true });
  assert.equal(decision.answer, true);
  assert.equal(decision.reason, "history");
  assert.deepEqual(decision.memories.map((r) => r.memory_id), ["old", "copy", "new"]);
  assert.deepEqual(decision.context.map((r) => r.memory_id), ["candidate"]);
});

test("a conflict is never resolved by asking for history", () => {
  const rows = [
    row("a", { revision_status: "conflicting", low_confidence: true }),
    row("b", { revision_status: "conflicting", low_confidence: true }),
  ];
  const decision = shouldAnswer(search({ answer_status: "conflicting" }, rows), {
    history: true,
  });
  assert.equal(decision.answer, false);
  assert.equal(decision.action, "ask_user");
  assert.equal(decision.context.length, 2);
});

test("a history question with nothing earlier follows the response", () => {
  const decision = shouldAnswer(search({ answer_status: "indexing" }, []), {
    history: true,
  });
  assert.equal(decision.action, "retry");
});

test("a response it does not understand fails closed", () => {
  for (const value of [null, undefined, "text", {}, { results: [row("m")] }]) {
    const decision = shouldAnswer(value);
    assert.equal(decision.answer, false);
    assert.equal(decision.reason, "unsupported_response");
  }
  const unknown = shouldAnswer(search({ answer_status: "future_status" }));
  assert.equal(unknown.reason, "malformed_response");
  assert.deepEqual(unknown.memories, []);
});

test("an envelope the SDK rejected stays rejected", () => {
  const broken = enforceSearchSafety(search({ safety_contract_version: "future" }));
  assert.ok(broken.sdk_safety_reason);
  const decision = shouldAnswer(broken);
  assert.equal(decision.answer, false);
  assert.equal(decision.reason, "malformed_response");
});

test("a degraded response the SDK preserved is decided on its fields", () => {
  const degraded = enforceSearchSafety(search({ degraded: true }));
  assert.equal(degraded.sdk_safety_reason, "degraded_evidence_preserved");
  assert.equal(shouldAnswer(degraded).answer, true);
});

// The public SDK repository carries no copy of the API's contract.
const OPENAPI = new URL("../../../docs/api/openapi.json", import.meta.url);

test("it agrees with the API's contract", { skip: !existsSync(OPENAPI) }, () => {
  const openapi = JSON.parse(readFileSync(OPENAPI, "utf8"));
  const schemas = openapi.components.schemas;
  const rowFields = Object.keys(schemas.SearchResult.properties);
  for (const field of [
    "low_confidence",
    "is_current",
    "revision_status",
    "superseded_by",
    "supersedes",
    "conflicts_with",
    "stated_at",
    "replaced_values",
    "currency_basis",
  ]) {
    assert.ok(rowFields.includes(field), field);
  }
  const statusText = schemas.SearchResponse.properties.answer_status.description;
  for (const status of ANSWER_STATUSES) assert.ok(statusText.includes(status), status);
  const memoryFields = schemas.MemoryWithMetadata.properties;
  const revisionText = memoryFields.revision_status.description;
  for (const status of REVISION_STATUSES) {
    assert.ok(revisionText.includes(status), status);
  }
  assert.ok(memoryFields.revision_link_status);
  for (const field of ["decision_abstained", "abstain_reason", "cited_context", "reasoning_status"]) {
    assert.ok(schemas.ReasoningResponse.properties[field], field);
  }
});

test("an unverified permission is its own action with the rule as context", () => {
  // The rule is evidence of the rule; the asker's membership is not established.
  const decision = shouldAnswer(
    search({
      answer_status: "unverified",
      abstain_recommended: true,
      confidence_reason: "authorization_not_verifiable",
    }),
  );
  assert.equal(decision.answer, false);
  assert.equal(decision.reason, "authorization_not_verifiable");
  assert.equal(decision.action, "verify_authorization");
  assert.deepEqual(decision.memories, []);
  assert.deepEqual(
    decision.context.map((r) => r.memory_id),
    ["new"],
  );
});

test("history never overrides an unverified response", () => {
  const old = row("old", {
    is_current: false,
    revision_status: "historical",
    low_confidence: true,
  });
  const page = search({ answer_status: "unverified", abstain_recommended: true }, [old]);
  const decision = shouldAnswer(page, { history: true });
  assert.equal(decision.answer, false);
  assert.equal(decision.action, "abstain");
});

test("a high-stakes answer waits for a ready index", () => {
  assert.equal(
    shouldAnswer(search({ indexing: { status: "ready", answer_risk: "none" } }), {
      requireReady: true,
    }).answer,
    true,
  );
  for (const indexing of [
    { status: "incomplete", answer_risk: "may_change" },
    { status: "ready", answer_risk: "may_change" },
    undefined,
  ]) {
    const decision = shouldAnswer(search({ indexing }), { requireReady: true });
    assert.equal(decision.answer, false);
    assert.equal(decision.action, "retry");
    assert.equal(decision.reason, "index_not_ready");
  }
});

test("a suggestion is context to shape, never an answer", () => {
  const page = {
    answer: null,
    sources: [{ memory_id: "camera", content: "The user owns a Fuji X-T5." }],
    decision_abstained: true,
    answer_status: "unverified",
    grounding: { status: "supported", answerability: "context_only" },
  };
  const decision = shouldAnswer(page);
  assert.equal(decision.answer, false);
  assert.equal(decision.action, "use_as_context");
  assert.deepEqual(
    decision.context.map((r) => r.memory_id),
    ["camera"],
  );
});

for (const flag of ["abstain_recommended", "decision_abstained", "no_match"]) {
  test(`an answerable status beside ${flag} fails closed in every mode`, () => {
    // A contradictory envelope (the server never sends one): answerable, an
    // explicit abstention flag, and only an earlier, unestablished row.
    const page = search(
      { indexing: { status: "ready", answer_risk: "none" }, [flag]: true },
      [
        row("synthetic-history", {
          revision_status: "historical",
          is_current: false,
          low_confidence: true,
        }),
      ],
    );
    for (const options of [{}, { history: true }, { history: true, requireReady: true }]) {
      const decision = shouldAnswer(page, options);
      assert.equal(decision.answer, false);
      assert.equal(decision.reason, flag);
      assert.equal(decision.action, "abstain");
      assert.deepEqual(decision.memories, []);
      assert.deepEqual(usableMemories(page, options), []);
    }
  });
}

test("a superseded Reason result still answers a history question", () => {
  const page = reason(
    { answer: null, decision_abstained: true, answer_status: "superseded" },
    [source("old", { is_current: false, revision_status: "superseded" })],
  );
  assert.equal(shouldAnswer(page).answer, false);
  const decision = shouldAnswer(page, { history: true });
  assert.equal(decision.answer, true);
  assert.equal(decision.reason, "history");
  assert.deepEqual(decision.memories.map((r) => r.memory_id), ["old"]);
});

test("history never answers a response that matched nothing", () => {
  const page = search(
    { answer_status: "superseded", abstain_recommended: true, no_match: true },
    [row("old", { is_current: false, revision_status: "superseded", low_confidence: true })],
  );
  const decision = shouldAnswer(page, { history: true });
  assert.equal(decision.answer, false);
  assert.equal(decision.reason, "superseded");
});

test("an applicable rule is policy context, never an answer", () => {
  const page = search(
    {
      answer_status: "unverified",
      abstain_recommended: true,
      confidence_reason: "soft_claim_candidate",
    },
    [
      row("case", { low_confidence: true, evidence_role: "related" }),
      row("rule", { low_confidence: true, evidence_role: "applicable_rule" }),
    ],
  );
  const decision = shouldAnswer(page);
  assert.equal(decision.answer, false);
  assert.equal(decision.reason, "applicable_rule");
  assert.equal(decision.action, "use_as_context");
  assert.deepEqual(decision.memories, []);
  assert.deepEqual(decision.context.map((r) => r.memory_id), ["rule", "case"]);
  assert.deepEqual(usableMemories(page), []);
});

test("a rule never answers an authorization question", () => {
  const page = search(
    {
      answer_status: "unverified",
      abstain_recommended: true,
      confidence_reason: "authorization_not_verifiable",
    },
    [row("rule", { low_confidence: true, evidence_role: "applicable_rule" })],
  );
  const decision = shouldAnswer(page);
  assert.equal(decision.answer, false);
  assert.equal(decision.reason, "authorization_not_verifiable");
});

test("a failed service is retried, never reported absent", () => {
  const decision = shouldAnswer(search({ answer_status: "unavailable" }, []));
  assert.equal(decision.answer, false);
  assert.equal(decision.reason, "unavailable");
  assert.equal(decision.action, "retry");
});
