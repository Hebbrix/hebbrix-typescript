import type { GroundingReceipt } from "./types";

interface SafetyRow {
  memory_id?: string;
  id?: string;
}

export interface SafetyEnvelope {
  no_match: boolean;
  abstain_recommended: boolean;
  query_confidence: number;
  grounding: GroundingReceipt;
  evidence_ids: string[];
  evidence_claims?: unknown[];
  safety_contract_version: string;
  degraded?: boolean;
  sdk_safety_reason?: string;
  [key: string]: unknown;
}

const REQUIRED_FIELDS = [
  "no_match",
  "abstain_recommended",
  "query_confidence",
  "grounding",
  "evidence_ids",
  "safety_contract_version",
] as const;

/**
 * Validate the API-owned grounding receipt before exposing evidence to an agent.
 * A malformed or explicit no-match response is converted into one deterministic
 * no-match envelope. Degraded, evidence-bound rows remain visible together with
 * the API's abstention signal so the SDK cannot introduce a false negative.
 */
export function enforceSearchSafety<T extends object>(
  response: T,
  rowsKey: "results" | "sources" = "results",
): T & SafetyEnvelope {
  const data = { ...response } as Record<string, unknown>;
  const rawRows = data[rowsKey];
  const rows: SafetyRow[] = Array.isArray(rawRows) ? rawRows : [];
  const missing = REQUIRED_FIELDS.filter(
    (field) => !Object.prototype.hasOwnProperty.call(data, field),
  );

  let reason: string | undefined;
  if (missing.length > 0) {
    reason = `missing_safety_fields:${missing.join(",")}`;
  } else if (
    typeof data.no_match !== "boolean" ||
    typeof data.abstain_recommended !== "boolean"
  ) {
    reason = "invalid_abstention_fields";
  } else if (
    typeof data.query_confidence !== "number" ||
    !Number.isFinite(data.query_confidence) ||
    data.query_confidence < 0 ||
    data.query_confidence > 1
  ) {
    reason = "invalid_query_confidence";
  } else if (
    typeof data.grounding !== "object" ||
    data.grounding === null ||
    Array.isArray(data.grounding)
  ) {
    reason = "invalid_grounding_receipt";
  } else if (!Array.isArray(data.evidence_ids)) {
    reason = "invalid_evidence_ids";
  } else if (data.safety_contract_version !== "search-safety-v1") {
    reason = "unsupported_safety_contract_version";
  } else if (!Array.isArray(rawRows)) {
    reason = "invalid_evidence_rows";
  } else if (data.evidence_ids.some((id) => typeof id !== "string" || !id.trim())) {
    reason = "invalid_evidence_ids";
  } else if (new Set(data.evidence_ids).size !== data.evidence_ids.length) {
    reason = "duplicate_evidence_ids";
  } else if (rows.some((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return true;
    const id = "memory_id" in row ? row.memory_id : row.id;
    return typeof id !== "string" || !id.trim() ||
      ("memory_id" in row && "id" in row && row.memory_id !== row.id);
  })) {
    reason = "invalid_evidence_row_identity";
  } else if (rows.length === 0 && data.no_match === false) {
    reason = "no_evidence_rows";
  } else {
    const evidenceIds = new Set(data.evidence_ids.map(String));
    const rowIds = rows
      .map((row) => row.memory_id ?? row.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (rowIds.some((value) => !evidenceIds.has(value))) {
      reason = "rows_not_bound_to_evidence_ids";
    } else if (data.no_match && (rowIds.length > 0 || evidenceIds.size > 0)) {
      reason = "no_match_contains_evidence";
    }
  }

  if (reason || data.no_match === true) {
    data[rowsKey] = [];
    if (rowsKey === "results") data.total = 0;
    data.no_match = true;
    data.abstain_recommended = true;
    data.query_confidence = 0;
    data.evidence_ids = [];
    data.evidence_claims = [];
    if (rowsKey === "sources") {
      data.answer = null;
      data.citations = [];
    }
    if (reason) {
      data.sdk_safety_reason = reason;
      data.grounding = { status: "no_grounded_match", reason };
    }
  } else if (data.degraded === true || data.abstain_recommended === true) {
    data.sdk_safety_reason = "degraded_evidence_preserved";
  }

  return data as unknown as T & SafetyEnvelope;
}
