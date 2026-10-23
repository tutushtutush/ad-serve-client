export const MAX_AUDIENCE_LABELS = 20;
export const MAX_AUDIENCE_LABEL_LENGTH = 40;

const LABEL_PATTERN = /^[a-z0-9][a-z0-9_:.-]*$/;

/**
 * Turns an untrusted list into the audience labels ad-serve-api accepts: string entries only, trimmed and
 * lowercased, kept only when they match the label pattern and are 1 to 40 characters, repeats removed (the
 * first wins), then at most the first MAX_AUDIENCE_LABELS. Invalid and repeated entries are removed before the
 * cap, so they never use up a slot. Anything that is not a list gives an empty list. Generic — no knowledge of
 * what a label means to a platform or an advertiser.
 */
export function normalizeAudienceLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const label = entry.trim().toLowerCase();
    if (label.length === 0 || label.length > MAX_AUDIENCE_LABEL_LENGTH || !LABEL_PATTERN.test(label)) {
      continue;
    }
    if (seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
    if (labels.length === MAX_AUDIENCE_LABELS) {
      break;
    }
  }
  return labels;
}
