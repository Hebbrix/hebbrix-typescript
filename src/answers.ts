/**
 * Decide in code what a search or Reason response lets you do.
 *
 * A model that is told "abstain_recommended: true" can still answer. Call
 * `shouldAnswer` before invoking the model and give it only `decision.memories`:
 * when the decision is not to answer, the model is never called, so it cannot
 * ignore the flag.
 *
 * ```typescript
 * const response = await client.searchWithProof({ query, user_id });
 * const decision = shouldAnswer(response);
 * if (!decision.answer) return replyFor(decision.action); // your own fixed reply
 * return myLlm(query, decision.memories);
 * ```
 *
 * `search()` returns only the rows, without the fields this needs; use
 * `searchWithProof()` or `reason()`. The decision is derived from the response
 * alone: nothing here calls the API, and it fails closed on a response it does
 * not understand.
 */

import type { AnswerStatus, RevisionStatus } from "./types";

export const ANSWER_STATUSES: readonly AnswerStatus[] = [
  "answerable",
  "conflicting",
  "superseded",
  "unverified",
  "indexing",
  "no_relevant_memory",
];

export const REVISION_STATUSES: readonly RevisionStatus[] = [
  "current",
  "superseded",
  "conflicting",
  "historical",
];

export type AnswerAction =
  | "answer"
  | "ask_user"
  | "say_no_longer_current"
  | "abstain"
  | "retry"
  | "say_unknown"
  | "verify_authorization"
  | "use_as_context";

/**
 * A permission question answered by a rule that restricts the act to a group no
 * memory ties the asker to (`confidence_reason` "authorization_not_verifiable"): the
 * rule is in `context`; check the asker's role in your own system.
 */
export const AUTHORIZATION_NOT_VERIFIABLE = "authorization_not_verifiable";

/**
 * A Reason request for a suggestion or plan has no stored answer: its sources
 * are the memories that should shape what your model composes
 * (`grounding.answerability` "context_only"). Context, never a verified fact or
 * a permission.
 */
export const CONTEXT_ONLY = "context_only";

/**
 * `requireReady`: the scope's index is not complete, or the server says the
 * answer may still change (`indexing.answer_risk`).
 */
export const INDEX_NOT_READY = "index_not_ready";

/** What to do instead of answering, for each `answer_status`. */
export const ANSWER_ACTIONS: Readonly<Record<AnswerStatus, AnswerAction>> = {
  answerable: "answer",
  conflicting: "ask_user",
  superseded: "say_no_longer_current",
  unverified: "abstain",
  indexing: "retry",
  no_relevant_memory: "say_unknown",
};

export interface AnswerDecision<Row = Record<string, any>> {
  /** True only when you may answer from `memories`. */
  answer: boolean;
  /** The `answer_status`, or why an `answerable` response still may not be used. */
  reason: string;
  action: AnswerAction;
  /** Safe to pass to a model as evidence; empty unless `answer` is true. */
  memories: Row[];
  /**
   * The other rows returned, each with its `revision_status` and
   * `low_confidence`: to show or to ask about, never to answer from.
   */
  context: Row[];
  /** Reason only: context for a decision it could not verify, with citations. */
  cited_context: string | null;
}

export interface AnswerOptions {
  /**
   * For a question about the past that your application recognises. It
   * overrides one thing: a superseded or historical row then counts as
   * evidence, so a response the server answered or marked `superseded` can be
   * answered from its earlier versions. It never overrides `unverified`,
   * `no_relevant_memory`, `indexing`, `conflicting` or
   * `authorization_not_verifiable`. Keep each row's `revision_status` and
   * `stated_at` in what you pass to the model, so it can tell the versions apart.
   */
  history?: boolean;
  /**
   * For high-stakes flows (money, health, actions): hold the answer, with
   * action `retry`, until `indexing.status` is `ready` and
   * `indexing.answer_risk` is `none`. A response that does not say is not ready.
   */
  requireReady?: boolean;
}

function isReady(data: Record<string, any>): boolean {
  const indexing = data.indexing;
  if (typeof indexing !== "object" || indexing === null) return false;
  return (
    indexing.status === "ready" &&
    (indexing.answer_risk === undefined ||
      indexing.answer_risk === null ||
      indexing.answer_risk === "none")
  );
}

// Set by the SDK on a response whose rows it kept although it is degraded: not
// a malformed envelope, so it is not a reason to fail closed on its own.
const PRESERVED = "degraded_evidence_preserved";

type Row = Record<string, any>;

function isEvidence(row: Row, searchRow: boolean): boolean {
  if (row.revision_status !== "current" || row.is_current === false) return false;
  // A row that does not say it is established is not.
  return searchRow ? row.low_confidence === false : row.low_confidence !== true;
}

function isHistory(row: Row, searchRow: boolean): boolean {
  return (
    row.revision_status === "superseded" ||
    row.revision_status === "historical" ||
    isEvidence(row, searchRow)
  );
}

/**
 * Whether you may answer from `response` (a `searchWithProof` or `reason`
 * result), the rows to answer from, and what to do when you may not.
 *
 * Every server signal is enforced: `answer_status`, `no_match`,
 * `abstain_recommended`, `decision_abstained`, `confidence_reason` and each
 * row's `low_confidence` and `revision_status`. A Reason result for a
 * suggestion or plan (`context_only`) returns action `use_as_context`: give
 * `decision.context` to your model to shape what it suggests, never as an
 * established fact or a permission to act.
 */
export function shouldAnswer<R extends object = Row>(
  response: object | null | undefined,
  options: AnswerOptions = {},
): AnswerDecision<R> {
  const declined = (
    reason: string,
    action: AnswerAction,
    context: Row[] = [],
    cited: string | null = null,
  ): AnswerDecision<R> => ({
    answer: false,
    reason,
    action,
    memories: [],
    context: context as R[],
    cited_context: cited,
  });

  if (
    typeof response !== "object" ||
    response === null ||
    !("answer_status" in response)
  ) {
    return declined("unsupported_response", "abstain");
  }
  const data = response as Record<string, any>;
  const status = data.answer_status as AnswerStatus;
  const safety = data.sdk_safety_reason;
  if (!ANSWER_STATUSES.includes(status) || (safety && safety !== PRESERVED)) {
    return declined("malformed_response", "abstain");
  }
  const searchRows = Array.isArray(data.results);
  const raw = searchRows ? data.results : data.sources;
  const rows: Row[] = (Array.isArray(raw) ? raw : []).filter(
    (row: unknown) => typeof row === "object" && row !== null,
  );
  const cited =
    typeof data.cited_context === "string" && data.cited_context
      ? data.cited_context
      : null;
  const allowed = (reason: string, usable: Row[]): AnswerDecision<R> => ({
    answer: true,
    reason,
    action: "answer",
    memories: usable as R[],
    context: rows.filter((row) => !usable.includes(row)) as R[],
    cited_context: cited,
  });

  if (status === "conflicting") {
    return declined(status, ANSWER_ACTIONS[status], rows, cited);
  }
  if (data.confidence_reason === AUTHORIZATION_NOT_VERIFIABLE) {
    return declined(AUTHORIZATION_NOT_VERIFIABLE, "verify_authorization", rows, cited);
  }
  if (data.grounding?.answerability === CONTEXT_ONLY) {
    return declined(CONTEXT_ONLY, "use_as_context", rows, cited);
  }
  if (options.requireReady && !isReady(data)) {
    return declined(INDEX_NOT_READY, "retry", rows, cited);
  }
  if (options.history && (status === "answerable" || status === "superseded")) {
    const usable = rows.filter((row) => isHistory(row, searchRows));
    if (usable.length > 0) return allowed("history", usable);
  }
  if (status !== "answerable") {
    return declined(status, ANSWER_ACTIONS[status], rows, cited);
  }
  for (const flag of ["no_match", "abstain_recommended", "decision_abstained"]) {
    if (data[flag] === true) return declined(flag, "abstain", rows, cited);
  }
  const usable = rows.filter((row) => isEvidence(row, searchRows));
  if (usable.length === 0) {
    return declined("no_usable_memories", "abstain", rows, cited);
  }
  return allowed(status, usable);
}

/**
 * The rows of `response` safe to pass to a model as evidence; empty when
 * `shouldAnswer` says not to answer.
 */
export function usableMemories<R extends object = Row>(
  response: object | null | undefined,
  options: AnswerOptions = {},
): R[] {
  return shouldAnswer<R>(response, options).memories;
}

/** The calendar date of an ISO timestamp (the API's dates are ISO 8601). */
function day(value: unknown): string | null {
  return typeof value === "string" && value ? value.slice(0, 10) : null;
}

const asRecord = (value: unknown): Row | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : null;

function formatConfidence(value: number): string {
  return value.toFixed(2);
}

function profileLines(profile: unknown): string[] {
  const data = asRecord(profile);
  if (!data) return [];
  if (data.status !== "ok") {
    // Unreadable is not empty: a preference may exist that was not returned.
    return ["Standing profile of this user: unavailable for this request."];
  }
  const facts = (Array.isArray(data.facts) ? data.facts : []).filter(
    (fact: unknown) => {
      const record = asRecord(fact);
      return record !== null && record.value != null && record.value !== "";
    },
  ) as Row[];
  const avoid = (
    Array.isArray(data.avoid_topics) ? data.avoid_topics : []
  ).filter((topic: unknown) => typeof topic === "string" && topic) as string[];
  const projection = asRecord(data.projection) ?? {};
  const pending = projection.status === "pending";
  const failed = projection.status === "failed";
  if (facts.length === 0 && avoid.length === 0 && !pending && !failed) return [];
  const scope = asRecord(data.scope) ?? { end_user_id: data.end_user_id };
  const details = Object.entries(scope)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key} ${value}`);
  if (day(data.as_of)) details.push(`as of ${day(data.as_of)}`);
  if (projection.status) details.push(`projection ${projection.status}`);
  const lines = [
    "Standing profile of this user (applies to every reply" +
      (details.length ? `; ${details.join("; ")}` : "") +
      "):",
  ];
  for (const fact of facts) {
    const name = ["category", "key"]
      .filter((key) => fact[key])
      .map((key) => String(fact[key]))
      .join(" / ");
    const meta: string[] = [];
    if (typeof fact.confidence === "number") {
      meta.push(`confidence ${formatConfidence(fact.confidence)}`);
    }
    if (day(fact.updated_at)) meta.push(`updated ${day(fact.updated_at)}`);
    const text = name ? `${name}: ${fact.value}` : String(fact.value);
    lines.push(`- ${text}` + (meta.length ? ` (${meta.join(", ")})` : ""));
  }
  if (avoid.length) lines.push(`- avoid topics: ${avoid.join(", ")}`);
  if (pending) {
    const count = projection.pending_writes;
    const writes =
      Number.isInteger(count) && count > 0
        ? `${projection.capped ? "at least " : ""}${count} recent writes`
        : "recent writes";
    lines.push(
      `- still being updated: ${writes} not yet reflected; a fact here may be ` +
        "missing or about to change.",
    );
  } else if (failed) {
    const count = projection.failed_writes;
    const writes =
      Number.isInteger(count) && count > 0 ? `${count} recent writes` : "recent writes";
    lines.push(
      `- incomplete: ${writes} could not be reflected; a fact from them may be ` +
        "missing.",
    );
  }
  return lines;
}

function memoryDetails(row: Row): string[] {
  const metadata = asRecord(row.metadata) ?? {};
  const details: string[] = [];
  const memoryType = metadata.memory_type || row.memory_type;
  if (memoryType) details.push(String(memoryType));
  if (day(row.stated_at)) details.push(`stated ${day(row.stated_at)}`);
  else if (day(row.created_at)) details.push(`saved ${day(row.created_at)}`);
  if (day(row.valid_until)) details.push(`valid until ${day(row.valid_until)}`);
  if (row.subject) details.push(`about ${row.subject}`);
  const names = (Array.isArray(row.applies_to) ? row.applies_to : []).filter(
    (name: unknown) => typeof name === "string" && name,
  );
  if (names.length) details.push(`names ${names.join(", ")}`);
  if (row.revision_status) details.push(String(row.revision_status));
  const grounding = asRecord(row.grounding) ?? asRecord(metadata.grounding);
  const support = grounding?.support_basis || grounding?.status;
  if (support) details.push(`support ${support}`);
  const outcomes = asRecord(metadata.outcome_evidence);
  if (outcomes && (outcomes.successes || outcomes.failures)) {
    details.push(
      `outcomes ${Math.trunc(Number(outcomes.successes) || 0)} worked, ` +
        `${Math.trunc(Number(outcomes.failures) || 0)} failed`,
    );
  }
  return details;
}

/**
 * The text to give your own model with the user's message: the end user's
 * standing profile and the memories `shouldAnswer` lets you answer from.
 *
 * Pass a `searchWithProof({ ..., include_profile: true })` or `reason()`
 * response, and the decision you already made on it (computed here when
 * omitted). The profile section lists each standing fact with its category,
 * confidence and date, the topics to avoid, the profile's scope, and whether it
 * is still being projected from recent writes; an unavailable profile is said
 * to be unavailable, never left out as if empty. The memories section lists
 * only `decision.memories`, numbered for citation, each with its memory type,
 * date, whom it is about, the names it states, its revision status and its
 * support. When the decision is not to answer, only the profile is returned:
 * standing preferences still shape a reply such as "I don't know that yet".
 * Returns "" when there is nothing to add.
 *
 * ```typescript
 * const response = await client.searchWithProof({ query, user_id, include_profile: true });
 * const decision = shouldAnswer(response);
 * if (!decision.answer) return replyFor(decision.action);
 * return myLlm(query, answerContext(response, decision));
 * ```
 */
export function answerContext(
  response: object | null | undefined,
  decision?: AnswerDecision<object>,
  options: AnswerOptions = {},
): string {
  const resolved = decision ?? shouldAnswer(response, options);
  const sections: string[] = [];
  const data = asRecord(response);
  const profile = profileLines(data?.profile);
  if (profile.length) sections.push(profile.join("\n"));
  if (resolved.answer && resolved.memories.length) {
    const lines = [
      resolved.reason === "history"
        ? "Memories to answer from (earlier versions are labelled):"
        : "Memories to answer from (current, supported for this message):",
    ];
    resolved.memories.forEach((memory, index) => {
      const row = memory as Row;
      const details = memoryDetails(row);
      lines.push(
        `[${index + 1}]` + (details.length ? ` (${details.join("; ")})` : ""),
      );
      lines.push(String(row.content ?? ""));
    });
    sections.push(lines.join("\n"));
  } else if (resolved.reason === CONTEXT_ONLY && resolved.context.length) {
    const lines = [
      "Memories that should shape the suggestion (context: not established facts, and never permission to act):",
    ];
    resolved.context.forEach((memory, index) => {
      const row = memory as Row;
      const details = memoryDetails(row);
      lines.push(
        `[${index + 1}]` + (details.length ? ` (${details.join("; ")})` : ""),
      );
      lines.push(String(row.content ?? ""));
    });
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}
