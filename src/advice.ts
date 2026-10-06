/** Wire integrity only. Does not authenticate caller probabilities or grant authority. */
import type { ProofLoopCandidate } from "./types";

export function snapshotBatchItems(items: unknown, outcomes = false): Record<string, any>[] {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50)
    throw new Error("batch items must contain 1-50 requests");
  const copied = jsonSnapshot(items, "batch items", 4_000_000) as Record<string, any>[];
  for (const item of copied) {
    if (item === null || Array.isArray(item) || typeof item !== "object")
      throw new Error("each batch item must be an object");
    if (typeof item.idempotency_key !== "string" || !item.idempotency_key.trim() || item.idempotency_key.length > 160)
      throw new Error("each batch item needs a nonempty idempotency_key");
    if (outcomes && (typeof item.decision_id !== "string" || !item.decision_id.trim() ||
        item.outcome === null || typeof item.outcome !== "object" || Array.isArray(item.outcome)))
      throw new Error("outcome items need decision_id and an outcome object");
    if (!outcomes && "proof_context" in item) {
      const context = item.proof_context;
      const token = typeof context === "string" ? context : context?.token;
      if (typeof token !== "string" || !token.trim())
        throw new Error("proof_context must contain the original proof token");
      if ("proof_context_token" in item && item.proof_context_token !== token)
        throw new Error("conflicting proof context tokens");
      delete item.proof_context;
      item.proof_context_token = token;
    }
  }
  return copied;
}

function jsonSnapshot(
  value: unknown,
  field: string,
  maxBytes: number,
): unknown {
  const ancestors = new Set<object>();
  const copy = (item: unknown): unknown => {
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || item === null || ancestors.has(item)) {
      throw new Error(`${field} must contain finite acyclic JSON values`);
    }
    const array = Array.isArray(item);
    if (
      !array &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    ) {
      throw new Error(`${field} must contain plain JSON objects`);
    }
    ancestors.add(item);
    const entries: [string, unknown][] = [];
    for (const key of Reflect.ownKeys(item)) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (
        typeof key !== "string" ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        throw new Error(
          `${field} must contain only enumerable JSON data fields`,
        );
      }
      entries.push([key, copy(descriptor.value)]);
    }
    let result: unknown;
    if (array) {
      if (
        entries.length !== item.length ||
        entries.some(([key], index) => key !== String(index))
      ) {
        throw new Error(
          `${field} must contain dense JSON arrays without extra fields`,
        );
      }
      result = entries.map(([, child]) => child);
    } else result = Object.fromEntries(entries);
    ancestors.delete(item);
    return result;
  };
  const result = copy(value);
  if (new TextEncoder().encode(JSON.stringify(result)).length > maxBytes) {
    throw new Error(`${field} exceeds the API JSON size limit`);
  }
  return result;
}

export function snapshotAdvisorInputs(
  candidates: ProofLoopCandidate[],
  context: Record<string, unknown>,
): {
  candidates: ProofLoopCandidate[];
  context: Record<string, unknown>;
  keys: string[];
} {
  if (!context || typeof context !== "object" || Array.isArray(context))
    throw new Error("context must be a JSON object");
  if (
    !Array.isArray(candidates) ||
    candidates.length < 1 ||
    candidates.length > 50
  )
    throw new Error("candidates must contain 1-50 distinct actions");
  const contextCopy = jsonSnapshot(context, "context", 16_384) as Record<
    string,
    unknown
  >;
  const candidatesCopy = jsonSnapshot(
    candidates,
    "candidates",
    64_000,
  ) as ProofLoopCandidate[];
  const keys: string[] = [];
  for (const candidate of candidatesCopy) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      Object.keys(candidate).some(
        (key) => !["action_key", "description", "features"].includes(key),
      )
    )
      throw new Error("invalid candidate fields");
    const key = candidate.action_key;
    if (
      typeof key !== "string" ||
      key.trim() !== key ||
      key.length > 160 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(key) ||
      keys.includes(key)
    )
      throw new Error(
        "candidate action_key must be an exact unique valid identity",
      );
    if (
      candidate.description != null &&
      (typeof candidate.description !== "string" ||
        candidate.description.length > 1000)
    )
      throw new Error("invalid candidate description");
    if (
      Object.prototype.hasOwnProperty.call(candidate, "features") &&
      (!candidate.features ||
        typeof candidate.features !== "object" ||
        Array.isArray(candidate.features))
    )
      throw new Error("candidate features must be a JSON object");
    keys.push(key);
  }
  return { candidates: candidatesCopy, context: contextCopy, keys };
}

export function validatedAdvisorSelection(
  selection: unknown,
  keys: string[],
): {
  chosen_action_key: string;
  action_probability: number;
  behavior_probabilities: Record<string, number>;
} {
  const value = jsonSnapshot(selection, "advisor selection", 64_000) as Record<
    string,
    unknown
  >;
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      "action_probability,behavior_probabilities,chosen_action_key"
  )
    throw new Error(
      "advisor must return choice and actual complete logging distribution",
    );
  const chosen = value.chosen_action_key;
  if (typeof chosen !== "string" || !keys.includes(chosen))
    throw new Error("chosen_action_key must be one of the original candidates");
  const probabilities = value.behavior_probabilities;
  if (
    !probabilities ||
    typeof probabilities !== "object" ||
    Array.isArray(probabilities) ||
    Object.keys(probabilities).length !== keys.length ||
    keys.some(
      (key) => !Object.prototype.hasOwnProperty.call(probabilities, key),
    )
  )
    throw new Error(
      "behavior_probabilities must cover exactly all original candidates",
    );
  const probability = (p: unknown): number => {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1)
      throw new Error("logging probabilities must be finite numbers in [0, 1]");
    return p;
  };
  const detached = Object.fromEntries(
    keys.map((key) => [
      key,
      probability((probabilities as Record<string, unknown>)[key]),
    ]),
  );
  const sum = Object.values(detached).reduce((total, p) => total + p, 0);
  if (Math.abs(sum - 1) > 1e-8)
    throw new Error(
      "behavior_probabilities must sum to 1; the helper never renormalizes",
    );
  const selectedProbability = probability(value.action_probability);
  if (selectedProbability <= 0 || detached[chosen] <= 0)
    throw new Error("chosen action must have a positive logging probability");
  if (Math.abs(detached[chosen] - selectedProbability) > 1e-8)
    throw new Error(
      "action_probability must match chosen behavior probability",
    );
  return {
    chosen_action_key: chosen,
    action_probability: selectedProbability,
    behavior_probabilities: detached,
  };
}
