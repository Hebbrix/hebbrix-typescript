# Hebbrix TypeScript SDK

Typed TypeScript/JavaScript client for Hebbrix memory, retrieval, and
outcome-learning APIs.

## Install

```bash
npm install hebbrix@2.3.1
```

Node.js 16+ and modern browsers are supported.

## Quick start

```typescript
import { MemoryClient } from "hebbrix";

const client = new MemoryClient({ apiKey: "hbx_your_api_key" });
const collection = await client.collections.create({ name: "Support memory" });
const memory = await client.memories.create({
  collection_id: collection.id,
  content: "Customer prefers concise replies",
  wait_for_index: true,
  idempotency_key: "customer-42-preference-v1",
});
const results = await client.search({
  query: "How should replies be formatted?",
  collection_id: collection.id,
});
console.log(memory, results);
```

## Durable readiness

Memory writes return either a searchable completion or a durable `202` receipt.
A durable receipt means the database commit succeeded while indexing is still
converging; it is not a failure and does not justify a duplicate write.

When `wait_for_index: true`, the SDK accepts the receipt and polls its status
URL. It returns only after `searchable: true`. If the client deadline expires,
it throws `IndexingTimeoutError`; the error retains the receipt, durable memory
IDs, and status URL. Reuse the same idempotency key with the same body to recover
the same logical resources.

Single writes and batch writes use the same one-write readiness rule. The
client sends exactly one mutation, then uses read-only status requests. Set
`index_timeout_ms` and `index_poll_interval_ms` on `memories.create()` to tune
that client-side wait. A signal can cancel the initial request; once a receipt
is available, cancellation stops only the read-only polling.
`IndexingAbortedError` then preserves the durable receipt and IDs so
cancellation cannot be mistaken for a failed write. Terminal `failed`,
`cancelled`, or `canceled` states raise `IndexingTerminalError` with the same
receipt context.

```typescript
const controller = new AbortController();
const ready = await client.memories.create({
  content: "Customer prefers concise replies",
  wait_for_index: true,
  index_timeout_ms: 30_000,
  index_poll_interval_ms: 250,
  signal: controller.signal,
  idempotency_key: "customer-42-preference-v1",
});
```

```typescript
const receipt = await client.memories.createBatch({
  memories: [{ content: "First fact" }, { content: "Second fact" }],
  collection_id: "collection-42",
  wait_for_index: false,
  idempotency_key: "import-42",
});
const completed = await client.memories.waitForBatchSearchable(receipt);
```

## Pagination

`collections.list()` returns `Promise<CursorPage<Collection>>`, matching the
runtime response. Read collections from `page.items` and pass
`page.next_cursor` into the next call. `memories.list()` returns item arrays for
backward compatibility; use `memories.listPage()` for cursor metadata.

```typescript
let cursor: string | undefined;
do {
  const page = await client.collections.list({ limit: 100, cursor });
  for (const collection of page.items) console.log(collection.id);
  cursor = page.next_cursor ?? undefined;
} while (cursor);
```

## Advanced capabilities and entitlements

The client exposes the canonical `/v1` temporal, working-memory, consolidation,
memory-tool, and RL contracts. RL metrics and evaluation require the Pro plan.
Process-wide RL training and checkpoint mutation require an admin role.
Entitlement failures throw `EntitlementError` and preserve the stable error
code, current/required plan, request ID, and support action.

The experimental World Model is intentionally not exported by this public SDK.
It remains withdrawn until a trained, versioned production model artifact and
an end-to-end public serving contract are available.

The authoritative account capability matrix is available from
`GET /v1/users/me/capabilities`.

## Release compatibility

The production API publishes exact build and artifact compatibility at
[`GET /v1/release`](https://api.hebbrix.com/v1/release). The public OpenAPI is
[`/openapi.json`](https://api.hebbrix.com/openapi.json).

- [Documentation](https://docs.hebbrix.com)
- [API reference](https://api.hebbrix.com/docs)
- [npm package](https://www.npmjs.com/package/hebbrix)
- [Support](https://www.hebbrix.com/contact)

## License

MIT. See `LICENSE` in the distribution.
