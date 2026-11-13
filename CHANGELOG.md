# Changelog

## 2.10.0 — 2026-11-13 (service failures, answer finality)

- `answer_status` `"unavailable"` (server 1.4.30): a service the evidence depends on failed for this request and nothing answers. `shouldAnswer` declines it with action `retry`; never tell the user the fact is absent. Earlier versions declined it as `malformed_response`.
- Types: search and Reason responses gain `answer_finality` (`final`, `provisional`, `none`): whether an answerable response covers the whole scope (index ready) or only the evidence indexed so far. An agent acting on an answer, or any action with side effects, waits for `final`.

## 2.9.0 — 2026-11-12 (applicable rules, consistent abstention flags)

- An `unverified` search response whose rows include `evidence_role: "applicable_rule"` (server 1.4.27) returns reason `applicable_rule` and action `use_as_context`, those rules first in `decision.context`: policy that speaks to the asked case but that the API has not verified decides it. Let your model apply it, or call `reason`. A rule is never an authorization; `authorization_not_verifiable` still comes first. `APPLICABLE_RULE` is exported.
- `{ history: true }` no longer overrides an explicit abstention flag on an `answerable` response: a response marked `answerable` that also sets `no_match`, `abstain_recommended` or `decision_abstained` contradicts itself and is declined in every mode, with that flag as the reason. History mode still answers a `superseded` response from its earlier versions (its flags concern the present), never one with `no_match`.
- Types: search rows gain `evidence_role` (`answer`, `applicable_rule`, `related`).

## 2.8.0 — 2026-11-11 (high-stakes readiness, history and suggestions)

- `shouldAnswer(response, { requireReady: true })` (also on `usableMemories` and `answerContext`): for high-stakes flows, holds the answer with action `retry` and reason `index_not_ready` until `indexing.status` is `ready` and `indexing.answer_risk` is `none`. A response that does not report its indexing is not ready.
- Behaviour change: `{ history: true }` now applies only when the server answered or marked the response `superseded`; it no longer overrides `unverified`, `no_relevant_memory` or `indexing`.
- A Reason result for a suggestion or plan (`grounding.answerability: "context_only"`) returns the new action `use_as_context` with its memories in `context`; `answerContext` lists them as context that is neither an established fact nor permission to act.
- Types: the included profile's `projection` gains `failed`, `failed_writes`, `failure` and `retry_after_seconds` (server 1.4.25); `OutcomeActionPolicy` gains `keep_evidence` and the read-only `evidence_from` (`OutcomeKeptDefinition`).

## 2.7.0 — 2026-11-11 (answer decisions and answer context)

- New `shouldAnswer(response, options?)`: decides in code whether a `searchWithProof()` or `reason()` response may be answered from, returning an `AnswerDecision` with `answer`, `action` (`answer`, `say_unknown`, `abstain`, `verify_authorization`, `ask_user`, `retry` or `say_no_longer_current`), `reason`, the usable `memories` and the `context` rows never to answer from. `{ history: true }` counts superseded and historical versions for questions about the past.
- New `answerContext(response, decision)`: renders the end user's standing profile (facts with category, confidence and date, topics to avoid, scope, and whether it is still being projected or unavailable) beside the rows the decision allows, each with its date, memory type, subject and support.
- New `usableMemories(response)` and the response types `AnswerStatus`, `RevisionStatus` and profile `scope` / `projection`.
- Docs: `memories.create()` stores verbatim unless `infer: true`, while `POST /v1/memories` extracts by default; examples pass `infer` and `wait_for_index` explicitly.

## 2.6.0 — 2026-10-19 (compact responses, entity scope, chat answers)

- Behaviour change: `search()` and `searchWithProof()` now send `view: "compact"` by default (rows keep content, identity, score, rank, timestamps, `low_confidence` and entity scope; the safety envelope and proof context are unchanged; ranking diagnostics need `debug: true`). Pass `view: "full"` for the previous per-row metadata. `search()` returns rows only and no longer requests the unused ProofLoop token unless `include_proof_context` is set.
- `reason()` now sends `view: "compact"` by default: the answer, abstention fields (`decision_abstained`, `abstain_reason`), cited sources and safety envelope are kept and the internal decision diagnostics are omitted. Pass `view: "full"` or `debug: true` for the full response.
- Add `prefer_entity_match` and `include_profile` search options (sent only when true), and type `applies_to`/`entity_match` on rows and `query_entities`/`profile`/`view` on the response.
- Add `chatAnswerFields()` with the `ChatAnswerStyle`/`ChatAnswerOptions` types: validated `answer_style` (`"natural"` or `"quote"`) and `no_information_reply` request-body fields for `/v1/chat/completions` through any OpenAI-compatible client.
- Requires the server release of 2026-10-19 for the `/search/reason` compact view; the other options are accepted by current servers.

## 2.5.3 — 2026-10-14 (candidate memory_ids)

- `ProofLoopCandidate` gains optional `memory_ids` (at most 50 ids of 1-255 characters) naming the exact memories that action applies; when the candidate becomes the decision's action, its outcome is credited to those memories.
- The advisor input snapshot (`decideWithAdvice`) admits and validates `memory_ids` before any evidence read, callback or write.
- Requires the server release that credits outcomes only to memories bound to the action taken; a `proof_context` attests what was retrieved and no longer earns per-memory outcome credit by itself.

## 2.5.2 — 2026-10-06 (compact advice, batches and confirmation)

- Correct the canonical docs URL and simplify stable onboarding into three calls.
- Add optional compact search/advice, unrounded reranker signal typing, bounded per-item decision/outcome batches and explicit capture-confirmation transports.
- Type new opt-in selection controls without changing existing policy defaults.
- Preserve complete server receipts, exact scope, caller probabilities and ACT-as-advice boundaries. Matching server/package publication is required; no performance or execution-authority claim.

## 2.5.1 — 2026-10-04 (advisory horizon helpers)

- Carry optional remaining_decisions and max_pilot_decisions through evidence reads and the once-only advisor callback.
- Keep actual caller distribution validation, owner scope and observe-mode logging unchanged.
- New backend v3 controls remain explicit experimental opt-ins; these helpers do not execute actions or establish performance, calibration or superiority.

## 2.5.0 — 2026-10-04 (stable SDK, npm `latest`)

- Add typed v3 change-response and declared optional-feature configuration.
- Add atomic setup options for explicit configuration and success-minus-cost metrics.
- Preserve advisor input/probability validation and owner/context boundaries.
- Backend v3 methods remain explicit experimental opt-ins; stable packaging does not establish learning quality or execution permission.

## 2.5.0-rc.4 — 2026-10-03 (prerelease)

- Snapshot advisor context/candidates and reject scope overrides or mutable identities.
- Validate the complete finite logging distribution against original candidates before writing.
- Invoke the callback once; preserve caller probabilities without normalization or retries.
- Caller probabilities are not authenticated randomization; no execution authority or measured learning-performance gain is claimed.

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
