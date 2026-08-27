# Changelog

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
