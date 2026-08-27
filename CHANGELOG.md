# Changelog

## 2.3.1 — 2026-08-27

- Make single-memory `wait_for_index` a client-enforced readiness contract:
  submit exactly one write, poll the durable receipt to searchable completion,
  preserve receipt and idempotency context on timeout or cancellation, and
  reject terminal indexing states.

## 2.3.0 — 2026-08-27

- Reconcile every exported advanced method with the canonical public OpenAPI,
  including temporal, working-memory, consolidation, memory-tool, and RL routes.
- Correct `collections.list()` to return `CursorPage<Collection>` at both type
  and runtime levels, with clean-tarball compile and runtime coverage.
- Treat durable-but-indexing batch results as `202`, poll them through the SDK,
  and throw `IndexingTimeoutError` with the durable receipt on client deadline.
- Preserve structured entitlement metadata in `EntitlementError`.
- Add a route-manifest release gate and clean-tarball installation verification.
- Withdraw the experimental World Model from the public SDK until a trained,
  versioned production model artifact and serving contract exist.
- Publish compatibility through `GET /v1/release`; remove the broken repository
  metadata and retain valid artifact and support links.

## 2.2.1 — 2026-08-26

- Preserve bearer authentication, content type, user agent, idempotency, and
  caller-supplied headers on every request.
- Handle `204`, empty, and non-JSON successful responses without attempting an
  unconditional JSON parse.
- Preserve valid evidence-bound search rows during a degraded or abstaining
  server response while retaining the safety metadata; malformed and explicit
  no-match envelopes still fail closed.
- Preserve caller-provided abort signals while retaining the default timeout.
- Add `temporal.deleteFact(factId)` for tenant-scoped, idempotent cleanup of
  facts created through the temporal API.
- Align procedure create/list/get/update/execute/delete with the canonical
  `/v1/procedures` REST and OpenAPI contract, including empty `204` deletion.
- Add explicit synchronous/asynchronous batch readiness receipts and
  `waitForBatchSearchable`, which polls every accepted memory, propagates
  terminal failures, respects deadlines, and supports cancellation.

The supported server/SDK release pair is published by the server OpenAPI
document in `info.x-hebbrix-sdk-compatibility`. Patch releases preserve the
public API within the same major version.

## 2.2.0

- Added the GA scoped memory, corrections, search proof, and ProofLoop surface.
