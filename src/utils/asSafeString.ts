// Coerces an opaque, untyped value to a string, or "" if it isn't one — the shared guard every
// call site handling data of unknown/drifted shape from ad-serve-api's response uses (FR-010,
// feature 003; reused by feature 004's click-URL building and feature 005's viewability
// reporting), so "what counts as safely a string" is defined once, not reimplemented per caller.
export function asSafeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
