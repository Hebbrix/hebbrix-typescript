import assert from "node:assert/strict";
import test from "node:test";

import { answerContext, shouldAnswer } from "../dist/index.mjs";

// answerContext gives your own model the profile beside the rows it may use.
// The chatbot guide asked search for include_profile and then built the prompt
// from the rows alone, so a standing preference never reached the model.

const row = (id, content, fields = {}) => ({
  memory_id: id,
  id,
  content,
  score: 0.9,
  low_confidence: false,
  is_current: true,
  revision_status: "current",
  ...fields,
});

const search = (rows, profile, fields = {}) => ({
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
  ...(profile === undefined ? {} : { profile }),
  ...fields,
});

const PROFILE = {
  status: "ok",
  facts: [
    {
      category: "preference",
      key: "answer_style",
      value: "short answers",
      confidence: 0.92,
      updated_at: "2026-11-08T10:00:00Z",
    },
    { category: "health", key: "allergy", value: "peanuts" },
  ],
  count: 2,
  avoid_topics: ["politics"],
  end_user_id: "user-42",
  as_of: "2026-11-08T10:00:00Z",
  scope: { collection_id: "c-1", end_user_id: "user-42", agent_id: null },
  projection: { status: "ready", pending_writes: 0, capped: false },
};

const ALLERGY = row("m1", "The user is allergic to peanuts.", {
  stated_at: "2026-11-02T09:00:00Z",
  subject: "user",
  applies_to: [],
  metadata: { memory_type: "fact" },
  grounding: { status: "supported", support_basis: "verified_span" },
});

test("profile and rows reach the model with their dates, types and support", () => {
  assert.equal(
    answerContext(search([ALLERGY], PROFILE)),
    "Standing profile of this user (applies to every reply; collection_id c-1; " +
      "end_user_id user-42; as of 2026-11-08; projection ready):\n" +
      "- preference / answer_style: short answers (confidence 0.92, updated " +
      "2026-11-08)\n" +
      "- health / allergy: peanuts\n" +
      "- avoid topics: politics\n" +
      "\n" +
      "Memories to answer from (current, supported for this message):\n" +
      "[1] (fact; stated 2026-11-02; about user; current; support verified_span)\n" +
      "The user is allergic to peanuts.",
  );
});

test("only the rows shouldAnswer allows are listed", () => {
  const weak = row("m2", "Maybe the user likes cashews.", { low_confidence: true });
  const response = search([ALLERGY, weak], PROFILE);
  const context = answerContext(response, shouldAnswer(response));
  assert.ok(!context.includes("cashews"));
  assert.ok(context.includes("[1]") && !context.includes("[2]"));
});

test("a declined decision keeps the standing profile", () => {
  const context = answerContext(
    search([ALLERGY], PROFILE, { answer_status: "no_relevant_memory" }),
  );
  assert.ok(context.startsWith("Standing profile of this user"));
  assert.ok(!context.includes("Memories to answer from"));
});

test("a profile still being projected says so", () => {
  const pending = {
    ...PROFILE,
    facts: [],
    avoid_topics: [],
    projection: { status: "pending", pending_writes: 50, capped: true },
  };
  assert.equal(
    answerContext(search([], pending, { answer_status: "no_relevant_memory" })),
    "Standing profile of this user (applies to every reply; collection_id c-1; " +
      "end_user_id user-42; as of 2026-11-08; projection pending):\n" +
      "- still being updated: at least 50 recent writes not yet reflected; a fact " +
      "here may be missing or about to change.",
  );
});

test("an unavailable profile is not presented as empty", () => {
  const context = answerContext(
    search([ALLERGY], { status: "unavailable", facts: [], count: 0 }),
  );
  assert.ok(
    context.startsWith("Standing profile of this user: unavailable for this request."),
  );
});

test("nothing to add is an empty string", () => {
  assert.equal(answerContext(search([], undefined, { answer_status: "no_relevant_memory" })), "");
  assert.equal(answerContext(null), "");
});

test("history rows are labelled with their revision status", () => {
  const old = row("m0", "The user lived in Austin.", {
    revision_status: "superseded",
    is_current: false,
    stated_at: "2025-01-05T00:00:00Z",
  });
  const context = answerContext(
    search([old], undefined, { answer_status: "superseded" }),
    undefined,
    { history: true },
  );
  assert.deepEqual(context.split("\n").slice(0, 2), [
    "Memories to answer from (earlier versions are labelled):",
    "[1] (stated 2025-01-05; superseded)",
  ]);
});

test("reason sources render too", () => {
  const response = {
    answer: "Peanuts.",
    sources: [
      {
        memory_id: "m1",
        content: "The user is allergic to peanuts.",
        revision_status: "current",
        created_at: "2026-11-02T09:00:00Z",
        metadata: { memory_type: "fact" },
      },
    ],
    answer_status: "answerable",
    no_match: false,
    abstain_recommended: false,
    decision_abstained: false,
  };
  assert.deepEqual(answerContext(response).split("\n"), [
    "Memories to answer from (current, supported for this message):",
    "[1] (fact; saved 2026-11-02; current)",
    "The user is allergic to peanuts.",
  ]);
});
