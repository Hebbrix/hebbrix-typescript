# Hebbrix TypeScript SDK

Typed TypeScript/JavaScript client for Hebbrix memory, retrieval, and
outcome-learning APIs.

## Install

The current stable package is **2.5.2**. Start with memory storage and search, or
the three-call outcome-learning workflow below. Advanced evidence transports
are opt-in. Installing the SDK does not grant execution permission or establish
a learning-performance advantage.

```bash
npm install hebbrix@2.5.2
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

## Learn from outcomes in three calls

Use server-side selection when Hebbrix should choose. Read-only advice is for a
caller that intentionally chooses outside Hebbrix; an LLM can ignore that advice.

```typescript
await client.proofloop.setupPolicy("support.reply.v1", {
  user_id: "customer-42",
  context_schema: { version: "v1", fields: {
    issue: { values: ["delivery", "billing"], required: true },
  } },
  actions: {
    explain: { description: "Explain the delivery status", target: "ticket",
      risk_tier: "low", exploration_allowed: true },
    review: { description: "Request a support review", target: "ticket",
      risk_tier: "low", exploration_allowed: true },
  },
  configuration: { strategy: "posterior_sampling" },
});
const decision = await client.proofloop.decide({
  policy_key: "support.reply.v1", user_id: "customer-42", mode: "auto",
  context: { issue: "delivery" },
  candidates: [{ action_key: "explain" }, { action_key: "review" }],
  idempotency_key: "ticket-42-decision",
});
// Your application checks permission and performs the action separately.
await client.proofloop.recordOutcome(decision.decision_id, {
  success, idempotency_key: "ticket-42-result",
});
```

`success` must be the actual result from your application or an independently
authorized verifier, not a prediction or the recommendation itself. Keep action
identities and required context stable. Use a new policy/version when their
meaning changes. See the
[recommended defaults](https://hebbrix.com/docs/learning).

## Advice and integration boundaries

`proofloop.actionAdvice(...)` reads an exact configured action and context. The
canonical `gate` is `ASK`, `REVIEW`, `ACT`, or `BLOCK`. `BLOCK` dominates; `ACT` is
advice, not permission. Your current authorization and human-approval policy
must independently allow the action before any execution. Scores are not permits.

Version 2.5.2 adds compact advice, batch, and explicit confirmation helpers.
These need matching Round9 server routes. Complete receipts remain on the server;
compact views retain scope and safety caveats.

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

- [Documentation](https://hebbrix.com/docs)
- [API reference](https://api.hebbrix.com/docs)
- [npm package](https://www.npmjs.com/package/hebbrix)
- [Support](https://www.hebbrix.com/contact)

## License

MIT. See `LICENSE` in the distribution.

## Stability

Stable SDK versions follow semantic versioning. Patch updates correct defects;
new optional fields and methods are additive. Required context, action identity,
owner scope, and historical outcomes are not silently rewritten. Experimental
APIs are marked separately. Security and correctness guards may tighten
immediately; migrations and incompatible changes must document the supported
replacement. Read [CHANGELOG.md](CHANGELOG.md), pin production dependencies, and
do not treat release cadence as a performance or compliance guarantee.
