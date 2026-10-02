# Changelog

## 2.5.0-rc.3 — 2026-10-02 (prerelease, npm `next`)

- Add typed one-call policy setup and scoped descriptive learning reports.
- Add a bounded advisor callback that records the actual chosen action and
  caller-supplied distribution; no external action is executed or authorized.
- New helpers require the October 2 outcome-followup backend release or a
  compatible successor. Check `/v1/release` before using the new endpoints.
- Learning performance and reliable model compliance with feedback are not
  established. This release makes no superiority or benchmark claim.

## 2.5.0-rc.2 — 2026-10-01 (prerelease, npm `next`)

- Add typed context enrollment, revision-checked policy configuration,
  scoped evidence cards and exact action-advice helpers.
- Preserve collection/end-user scope and JSON context. ACT remains advisory;
  callers must independently authorize external actions.
- Policy configuration/advice requires backend `e5f6g7h8i868` or a compatible
  successor. Existing protected workflow transports are unchanged.

## 2.5.0-rc.1 — 2026-09-09 (prerelease, npm `next`)

- Add typed native experience program, job, review, revision, policy activation
  and one-use execution-permission transports.
- Preserve separate credentials, opaque evidence, uncertainty and authorization
  receipts; never convert recommendations into execution permission.
- Require the matching `b5c6d7e8f959` backend, not yet deployed to public
  production. Stable 2.4.0 remains the production recommendation.

## 2.4.0 — 2026-09-07

- Add typed Evidence Loop methods for owner-managed verifiers, durable episodes, actual-execution claims, protected outcome delivery and evidence assessments.
- Preserve incomplete outcomes, scope, replay and permission receipts. Verifier errors never fall back to caller-reported outcomes.
- Reject malformed, ambiguous or unknown evidence contracts before exposing unsupported synthesis; retain valid degraded evidence with its abstention signal.
- Protected ledger methods require the connected Evidence Loop backend, separately scoped verifier credentials and external execution/outcome checks. They do not grant permission or execute actions.

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
