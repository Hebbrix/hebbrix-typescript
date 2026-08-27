import assert from "node:assert/strict";
import test from "node:test";

import {
  IndexingAbortedError,
  IndexingTerminalError,
  IndexingTimeoutError,
  MemoryClient,
} from "../dist/index.mjs";

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("100 forced-pending single writes use one POST and return only after searchable completion", async () => {
  const originalFetch = globalThis.fetch;
  const ready = new Set();
  let creates = 0;
  let readinessReads = 0;
  let searches = 0;

  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/memories" && options.method === "POST") {
      creates += 1;
      const body = JSON.parse(options.body);
      const id = `mem-${body.content.split("-").at(-1)}`;
      assert.equal(body.wait_for_index, true);
      assert.equal(body.index_timeout_ms, undefined);
      assert.equal(body.index_poll_interval_ms, undefined);
      assert.equal(body.signal, undefined);
      return response(
        {
          results: [{ id, memory_id: id, event: "ADD" }],
          processing_status: "processing",
          searchable: false,
          outbox_event_id: `event-${id}`,
          status_url: `https://api.hebbrix.example/v1/memories/${id}?readiness=1`,
          request_id: `request-${id}`,
          created_count: 1,
          updated_count: 0,
          skipped_count: 0,
        },
        202,
      );
    }
    if (
      parsed.pathname.startsWith("/v1/memories/") &&
      options.method === "GET"
    ) {
      readinessReads += 1;
      assert.equal(parsed.origin, "https://unit.test");
      assert.equal(parsed.searchParams.get("readiness"), "1");
      const id = parsed.pathname.split("/").at(-1);
      ready.add(id);
      return response({
        id,
        processing_status: "completed",
        searchable: true,
      });
    }
    if (parsed.pathname === "/v1/search" && options.method === "POST") {
      searches += 1;
      const id = `mem-${JSON.parse(options.body).query.split("-").at(-1)}`;
      assert.equal(ready.has(id), true, `${id} was searched before readiness`);
      return response({
        query: id,
        results: [{ memory_id: id, content: id, score: 1 }],
        total: 1,
        search_type: "hybrid",
        processing_time_ms: 1,
        no_match: false,
        abstain_recommended: false,
        query_confidence: 1,
        grounding: { status: "supported" },
        evidence_ids: [id],
        safety_contract_version: "search-safety-v1",
      });
    }
    throw new Error(`unexpected request ${options.method} ${parsed.pathname}`);
  };

  try {
    const client = new MemoryClient({
      apiKey: "test",
      baseUrl: "https://unit.test",
    });
    for (let index = 0; index < 100; index += 1) {
      const receipt = await client.memories.create({
        content: `forced-pending-${index}`,
        wait_for_index: true,
        index_timeout_ms: 1_000,
        index_poll_interval_ms: 50,
        idempotency_key: `single-${index}`,
      });
      assert.equal(receipt.searchable, true);
      assert.equal(receipt.processing_status, "completed");
      const rows = await client.search({ query: `ready-${index}` });
      assert.equal(rows[0].memory_id, `mem-${index}`);
    }
    assert.equal(creates, 100);
    assert.equal(readinessReads, 100);
    assert.equal(searches, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("single-write deadline preserves the durable receipt and idempotency context", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([options.method, new URL(url).pathname]);
    return new Response(
      JSON.stringify({
        results: [
          { id: "mem-timeout", memory_id: "mem-timeout", event: "ADD" },
        ],
        processing_status: "processing",
        searchable: false,
        created_count: 1,
        updated_count: 0,
        skipped_count: 0,
      }),
      {
        status: 202,
        headers: {
          "content-type": "application/json",
          "X-Request-ID": "request-timeout",
          "X-Hebbrix-Index-Event": "event-timeout",
          "X-Idempotent-Replay": "true",
          Location: "/v1/memories/mem-timeout",
          "Retry-After": "1",
        },
      },
    );
  };

  try {
    const client = new MemoryClient({
      apiKey: "test",
      baseUrl: "https://unit.test",
    });
    await assert.rejects(
      client.memories.create({
        content: "durable timeout",
        wait_for_index: true,
        index_timeout_ms: 0,
        idempotency_key: "logical-timeout",
      }),
      (error) => {
        assert.ok(error instanceof IndexingTimeoutError);
        assert.deepEqual(error.memoryIds, ["mem-timeout"]);
        assert.equal(error.statusUrl, "/v1/memories/mem-timeout");
        assert.equal(error.requestId, "request-timeout");
        assert.equal(error.outboxEventId, "event-timeout");
        assert.equal(error.indexingEventId, "event-timeout");
        assert.equal(error.eventId, "event-timeout");
        assert.equal(error.idempotencyReplay, true);
        assert.equal(error.idempotencyKey, "logical-timeout");
        assert.equal(error.retryAfter, "1");
        assert.deepEqual(error.recovery.memory_ids, ["mem-timeout"]);
        assert.equal(error.recovery.status_url, "/v1/memories/mem-timeout");
        assert.equal(error.receipt.searchable, false);
        assert.equal(error.receipt.retry_after, "1");
        return true;
      },
    );
    assert.deepEqual(calls, [["POST", "/v1/memories"]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retrying a timed-out write reuses the exact body and idempotency header", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (_url, options) => {
    writes.push({
      body: options.body,
      idempotencyKey: options.headers["Idempotency-Key"],
    });
    const completed = writes.length === 2;
    return new Response(
      JSON.stringify({
        results: [{ id: "mem-replay", memory_id: "mem-replay", event: "ADD" }],
        processing_status: completed ? "completed" : "processing",
        searchable: completed,
        created_count: 1,
        updated_count: 0,
        skipped_count: 0,
      }),
      {
        status: completed ? 201 : 202,
        headers: {
          "content-type": "application/json",
          Location: "/v1/memories/mem-replay",
          ...(completed ? { "X-Idempotent-Replay": "true" } : {}),
        },
      },
    );
  };

  try {
    const client = new MemoryClient({
      apiKey: "test",
      baseUrl: "https://unit.test",
    });
    const params = {
      content: "one logical write",
      wait_for_index: true,
      index_timeout_ms: 0,
      idempotency_key: "logical-replay",
    };
    await assert.rejects(client.memories.create(params), IndexingTimeoutError);
    const replay = await client.memories.create(params);
    assert.equal(replay.searchable, true);
    assert.equal(replay.idempotency_replay, true);
    assert.equal(replay.results[0].id, "mem-replay");
    assert.equal(writes.length, 2);
    assert.equal(writes[0].body, writes[1].body);
    assert.equal(writes[0].idempotencyKey, "logical-replay");
    assert.equal(writes[1].idempotencyKey, "logical-replay");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AbortSignal stops single-write polling and retains the accepted receipt", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let postCount = 0;
  let getCount = 0;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === "/v1/memories") {
      postCount += 1;
      return response(
        {
          results: [{ id: "mem-abort", memory_id: "mem-abort", event: "ADD" }],
          processing_status: "processing",
          searchable: false,
          outbox_event_id: "event-abort",
          status_url: "/v1/memories/mem-abort",
          created_count: 1,
          updated_count: 0,
          skipped_count: 0,
        },
        202,
      );
    }
    getCount += 1;
    queueMicrotask(() => controller.abort(new Error("caller stopped waiting")));
    return response({
      id: "mem-abort",
      processing_status: "processing",
      searchable: false,
    });
  };

  try {
    const client = new MemoryClient({
      apiKey: "test",
      baseUrl: "https://unit.test",
    });
    await assert.rejects(
      client.memories.create({
        content: "durable cancellation",
        wait_for_index: true,
        signal: controller.signal,
        index_poll_interval_ms: 500,
        idempotency_key: "logical-abort",
      }),
      (error) => {
        assert.ok(error instanceof IndexingAbortedError);
        assert.deepEqual(error.memoryIds, ["mem-abort"]);
        assert.equal(error.outboxEventId, "event-abort");
        assert.equal(error.idempotencyKey, "logical-abort");
        assert.match(String(error.cause), /caller stopped waiting/);
        return true;
      },
    );
    assert.equal(postCount, 1);
    assert.equal(getCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("single-write polling rejects failed and both cancelled spellings", async () => {
  for (const terminalStatus of ["failed", "cancelled", "canceled"]) {
    const originalFetch = globalThis.fetch;
    let postCount = 0;
    globalThis.fetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === "/v1/memories") {
        postCount += 1;
        return response(
          {
            results: [
              { id: "mem-terminal", memory_id: "mem-terminal", event: "ADD" },
            ],
            processing_status: "processing",
            searchable: false,
            status_url: "/v1/memories/mem-terminal",
            created_count: 1,
            updated_count: 0,
            skipped_count: 0,
          },
          202,
        );
      }
      return response({
        id: "mem-terminal",
        processing_status: terminalStatus,
        searchable: false,
      });
    };
    try {
      const client = new MemoryClient({
        apiKey: "test",
        baseUrl: "https://unit.test",
      });
      await assert.rejects(
        client.memories.create({
          content: `terminal ${terminalStatus}`,
          wait_for_index: true,
        }),
        (error) => {
          assert.ok(error instanceof IndexingTerminalError);
          assert.equal(error.processingStatus, terminalStatus);
          assert.deepEqual(error.memoryIds, ["mem-terminal"]);
          return true;
        },
      );
      assert.equal(postCount, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("a terminal state in the initial durable receipt fails without polling", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return response(
      {
        results: [{ id: "mem-failed", memory_id: "mem-failed", event: "ADD" }],
        processing_status: "failed",
        searchable: false,
        status_url: "/v1/memories/mem-failed",
        created_count: 1,
        updated_count: 0,
        skipped_count: 0,
      },
      202,
    );
  };

  try {
    const client = new MemoryClient({
      apiKey: "test",
      baseUrl: "https://unit.test",
    });
    await assert.rejects(
      client.memories.create({ content: "failed", wait_for_index: true }),
      (error) => {
        assert.ok(error instanceof IndexingTerminalError);
        assert.equal(error.processingStatus, "failed");
        assert.deepEqual(error.memoryIds, ["mem-failed"]);
        return true;
      },
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wait_for_index=false returns the pending receipt immediately", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    callCount += 1;
    requestBody = JSON.parse(options.body);
    return response(
      {
        results: [
          { id: "mem-pending", memory_id: "mem-pending", event: "ADD" },
        ],
        processing_status: "processing",
        searchable: false,
        status_url: "/v1/memories/mem-pending",
        created_count: 1,
        updated_count: 0,
        skipped_count: 0,
      },
      202,
    );
  };

  try {
    const client = new MemoryClient({
      apiKey: "test",
      baseUrl: "https://unit.test",
    });
    const receipt = await client.memories.create({
      content: "return immediately",
      wait_for_index: false,
      index_timeout_ms: 123,
      index_poll_interval_ms: 77,
    });
    assert.equal(receipt.searchable, false);
    assert.equal(callCount, 1);
    assert.equal(requestBody.wait_for_index, false);
    assert.equal(requestBody.index_timeout_ms, undefined);
    assert.equal(requestBody.index_poll_interval_ms, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
