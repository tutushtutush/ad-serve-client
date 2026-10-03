export const MAX_CATEGORIES = 10;

/**
 * Turns an untrusted list into a clean list of categories: string entries only, trimmed, blanks
 * dropped, duplicates removed ignoring case (the first spelling wins), capped at MAX_CATEGORIES.
 * Generic — no knowledge of what the categories mean or which ones the ad server accepts.
 */
export function normalizeCategories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const categories: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    const key = trimmed.toLowerCase();
    if (trimmed === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    categories.push(trimmed);
    if (categories.length === MAX_CATEGORIES) {
      break;
    }
  }
  return categories;
}
