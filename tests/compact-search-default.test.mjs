import assert from "node:assert/strict";
import test from "node:test";
import { SearchResource } from "../dist/index.mjs";

const envelope = () => ({
  query: "q",
  results: [{ memory_id: "m", content: "fact", score: 0.9, metadata: {}, created_at: "2026-10-18" }],
  total: 1,
  no_match: false,
  abstain_recommended: false,
  query_confidence: 0.9,
  grounding: { status: "supported" },
  evidence_ids: ["m"],
  safety_contract_version: "search-safety-v1",
  view: "compact",
  query_entities: [],
  profile: { status: "ok", facts: [], count: 0 },
});

const recorder = () => {
  const calls = [];
  return { calls, client: { post: async (...args) => { calls.push(args); return envelope(); } } };
};

test("searchWithProof defaults to the compact view and keeps the proof default", async () => {
  const { calls, client } = recorder();
  const response = await new SearchResource(client).searchWithProof({ query: "q", user_id: "u" });
  const body = calls[0][1];
  assert.equal(body.view, "compact");
  assert.equal("include_proof_context" in body, false);
  assert.equal("prefer_entity_match" in body, false);
  assert.equal("include_profile" in body, false);
  assert.equal(response.view, "compact");
  assert.equal(response.profile.status, "ok");
});

test("rows-only search does not request the proof token", async () => {
  const { calls, client } = recorder();
  const rows = await new SearchResource(client).search({ query: "q", user_id: "u" });
  assert.equal(rows.length, 1);
  assert.equal(calls[0][1].view, "compact");
  assert.equal(calls[0][1].include_proof_context, false);
  await new SearchResource(client).search({ query: "q", user_id: "u", include_proof_context: true });
  assert.equal(calls[1][1].include_proof_context, true);
});

test("full view, debug and the new search options are explicit", async () => {
  const { calls, client } = recorder();
  await new SearchResource(client).searchWithProof({
    query: "q", user_id: "u", view: "full", debug: true, prefer_entity_match: true, include_profile: true,
  });
  const body = calls[0][1];
  assert.equal(body.view, "full");
  assert.equal(body.debug, true);
  assert.equal(body.prefer_entity_match, true);
  assert.equal(body.include_profile, true);
});

test("an invalid view fails before any request", async () => {
  const { calls, client } = recorder();
  await assert.rejects(new SearchResource(client).searchWithProof({ query: "q", view: "tiny" }), /view must be full or compact/);
  assert.equal(calls.length, 0);
});

test("reason defaults to the compact view and sends debug only when set", async () => {
  const calls = [];
  const client = {
    post: async (...args) => {
      calls.push(args);
      return { answer: "a", sources: [], metadata: {}, no_match: false, abstain_recommended: false,
        query_confidence: 0.9, grounding: { status: "supported" }, evidence_ids: [],
        safety_contract_version: "search-safety-v1" };
    },
  };
  await new SearchResource(client).reason({ query: "q", user_id: "u" });
  assert.equal(calls[0][1].view, "compact");
  assert.equal("debug" in calls[0][1], false);
  await new SearchResource(client).reason({ query: "q", user_id: "u", view: "full", debug: true });
  assert.equal(calls[1][1].view, "full");
  assert.equal(calls[1][1].debug, true);
});
