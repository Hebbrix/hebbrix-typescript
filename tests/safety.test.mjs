import assert from "node:assert/strict";
import test from "node:test";

import { enforceSearchSafety, MemoryClient } from "../dist/index.mjs";

const supported = {
  query: "what tool?",
  results: [{ memory_id: "mem-1", content: "Uses Zed", score: 0.9 }],
  total: 1,
  search_type: "hybrid",
  processing_time_ms: 1,
  no_match: false,
  abstain_recommended: false,
  query_confidence: 0.9,
  grounding: { status: "supported" },
  evidence_ids: ["mem-1"],
  safety_contract_version: "search-safety-v1",
};

test("preserves rows bound to authoritative evidence", () => {
  assert.deepEqual(enforceSearchSafety(supported).results, supported.results);
});

test("fails closed when safety metadata is absent", () => {
  const result = enforceSearchSafety({ results: supported.results, total: 1 });
  assert.equal(result.no_match, true);
  assert.equal(result.abstain_recommended, true);
  assert.equal(result.query_confidence, 0);
  assert.deepEqual(result.results, []);
  assert.match(result.sdk_safety_reason, /^missing_safety_fields:/);
});

test("fails closed when a row is not evidence-bound", () => {
  const result = enforceSearchSafety({ ...supported, evidence_ids: [] });
  assert.equal(result.no_match, true);
  assert.deepEqual(result.results, []);
  assert.equal(result.sdk_safety_reason, "rows_not_bound_to_evidence_ids");
});

test("preserves evidence-bound degraded rows with the abstention signal", () => {
  const result = enforceSearchSafety({
    ...supported,
    degraded: true,
    abstain_recommended: true,
    query_confidence: 0.45,
  });
  assert.deepEqual(result.results, supported.results);
  assert.equal(result.no_match, false);
  assert.equal(result.abstain_recommended, true);
  assert.equal(result.sdk_safety_reason, "degraded_evidence_preserved");
});

test("memory create forwards every scope and keeps idempotency out of the body", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        results: [{ id: "mem-1", memory_id: "mem-1", event: "ADD" }],
        processing_status: "completed",
        searchable: true,
        created_count: 1,
        updated_count: 0,
        skipped_count: 0,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    const response = await client.memories.create({
      content: "A scoped fact",
      collection_id: "collection-1",
      user_id: "user-1",
      agent_id: "agent-1",
      run_id: "run-1",
      app_id: "support",
      namespace: "production",
      wait_for_index: true,
      idempotency_key: "retry-1",
    });
    const body = JSON.parse(request.options.body);
    assert.equal(response.results[0].id, "mem-1");
    assert.equal(request.options.headers.Authorization, "Bearer test");
    assert.equal(request.options.headers["Idempotency-Key"], "retry-1");
    assert.equal(body.idempotency_key, undefined);
    assert.equal(body.user_id, "user-1");
    assert.equal(body.agent_id, "agent-1");
    assert.equal(body.run_id, "run-1");
    assert.equal(body.infer, false);
    assert.equal(body.wait_for_index, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("batch readiness and transport headers remain explicit", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(
      JSON.stringify({
        created: 1,
        failed: 0,
        memory_ids: ["mem-1"],
        errors: [],
        results: [{ id: "mem-1", memory_id: "mem-1", processing_status: "completed" }],
        processing_status: "completed",
        searchable: true,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    const receipt = await client.memories.createBatch({
      memories: [{ content: "A batch fact" }],
      collection_id: "collection-1",
      wait_for_index: true,
      idempotency_key: "batch-retry-1",
    });
    const body = JSON.parse(request.options.body);
    assert.equal(receipt.searchable, true);
    assert.equal(new URL(request.url).pathname, "/v1/memories/batch");
    assert.equal(request.options.headers.Authorization, "Bearer test");
    assert.equal(request.options.headers["Idempotency-Key"], "batch-retry-1");
    assert.equal(body.idempotency_key, undefined);
    assert.equal(body.wait_for_index, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("async batch polling waits for every memory and supports cancellation", async () => {
  const originalFetch = globalThis.fetch;
  const calls = new Map();
  globalThis.fetch = async (url) => {
    const id = new URL(url).pathname.split("/").at(-1);
    const count = (calls.get(id) || 0) + 1;
    calls.set(id, count);
    const ready = count >= 2;
    return new Response(
      JSON.stringify({
        id,
        processing_status: ready ? "completed" : "processing",
        searchable: ready,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    const ready = await client.memories.waitForBatchSearchable(
      {
        created: 2,
        failed: 0,
        memory_ids: ["mem-1", "mem-2"],
        errors: [],
        results: [],
        processing_status: "processing",
        searchable: false,
      },
      { timeoutMs: 1_000, pollIntervalMs: 1 },
    );
    assert.equal(ready.searchable, true);
    assert.equal(ready.processing_status, "completed");
    assert.deepEqual(new Set(ready.results.map((row) => row.memory_id)), new Set(["mem-1", "mem-2"]));

    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    await assert.rejects(
      () => client.memories.waitForBatchSearchable(ready, { signal: controller.signal }),
      /caller cancelled/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("empty successful responses resolve without JSON parsing errors", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, {
      status: 204,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    await assert.doesNotReject(() => client.memories.delete("mem-1"));
    assert.equal(request.options.headers.Authorization, "Bearer test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("procedure lifecycle uses the canonical OpenAPI path and payloads", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    const path = new URL(url).pathname;
    let body = { status: "success", procedures: [] };
    if (path === "/v1/procedures" && options.method === "POST") {
      body = { status: "success", procedure_id: "procedure-1" };
    } else if (path.endsWith("/execute")) {
      body = { status: "success", execution_result: { output: "recovered" } };
    } else if (options.method === "PATCH") {
      body = { status: "success", procedure: { id: "procedure-1", name: "updated" } };
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    const created = await client.procedural.create({
      name: "restart proxy",
      description: "Recover the query proxy",
      trigger_condition: "proxy unavailable",
      action_sequence: ["recycle proxy once"],
      metadata: { owner: "on-call" },
    });
    const executed = await client.procedural.execute("procedure-1", { incident: "INC-1" });
    const updated = await client.procedural.update("procedure-1", {
      trigger_condition: "proxy unhealthy",
      action_sequence: ["page on-call", "recycle proxy once"],
    });
    await client.procedural.delete("procedure-1");
    assert.equal(created.id, "procedure-1");
    assert.deepEqual(executed, { output: "recovered" });
    assert.deepEqual(updated, { id: "procedure-1", name: "updated" });

    assert.deepEqual(
      requests.map((request) => [new URL(request.url).pathname, request.options.method]),
      [
        ["/v1/procedures", "POST"],
        ["/v1/procedures/procedure-1/execute", "POST"],
        ["/v1/procedures/procedure-1", "PATCH"],
        ["/v1/procedures/procedure-1", "DELETE"],
      ],
    );
    assert.deepEqual(JSON.parse(requests[0].options.body).condition, {
      expression: "proxy unavailable",
    });
    assert.deepEqual(JSON.parse(requests[0].options.body).action, {
      steps: ["recycle proxy once"],
    });
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      input_state: { incident: "INC-1" },
    });
    assert.deepEqual(JSON.parse(requests[2].options.body).condition, {
      expression: "proxy unhealthy",
    });
    assert.equal(requests[3].options.headers.Authorization, "Bearer test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reason forwards isolation scopes and preserves authoritative safety", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        answer: "Use Zed",
        sources: [{ memory_id: "mem-1", content: "Uses Zed", score: 0.9 }],
        metadata: {},
        no_match: false,
        abstain_recommended: false,
        query_confidence: 0.9,
        grounding: { status: "supported" },
        evidence_ids: ["mem-1"],
        safety_contract_version: "search-safety-v1",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    const response = await client.reason({
      query: "Which editor?",
      collection_id: "collection-1",
      user_id: "user-1",
      agent_id: "agent-1",
      run_id: "run-1",
      facets: ["editor"],
    });
    const body = JSON.parse(request.options.body);
    assert.equal(response.evidence_ids[0], "mem-1");
    assert.equal(body.user_id, "user-1");
    assert.equal(body.agent_id, "agent-1");
    assert.equal(body.run_id, "run-1");
    assert.deepEqual(body.facets, ["editor"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ProofLoop policy insights encode repeated action keys", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ actions: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
    await client.proofloop.policyInsights("routing", {
      action_keys: ["approve", "ask"],
      user_id: "user-1",
    });
    const parsed = new URL(requestedUrl);
    assert.deepEqual(parsed.searchParams.getAll("action_key"), ["approve", "ask"]);
    assert.equal(parsed.searchParams.get("user_id"), "user-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GA high-level resources expose the public contract surface", () => {
  const client = new MemoryClient({ apiKey: "test", baseUrl: "https://unit.test" });
  const resourceMethods = [
    [client.memories, ["create", "listPage", "get", "update", "delete"]],
    [client.memoryJobs, ["get", "wait"]],
    [client.corrections, ["create", "relevant", "get", "delete"]],
    [client.procedural, ["create", "list", "get", "execute", "update", "delete"]],
    [client.proofloop, [
      "decide",
      "getDecision",
      "defineMetric",
      "listMetrics",
      "policyInsights",
      "evaluatePolicy",
      "recordOutcome",
      "proof",
      "publicKey",
    ]],
  ];
  for (const [resource, methods] of resourceMethods) {
    for (const method of methods) assert.equal(typeof resource[method], "function");
  }
  assert.equal(typeof client.searchWithProof, "function");
  assert.equal(typeof client.reason, "function");
});
