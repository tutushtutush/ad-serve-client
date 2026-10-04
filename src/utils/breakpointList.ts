export interface BreakpointEntry {
  minWidth: number;
  value: string;
}

/**
 * Parses a "minWidth:value" comma-separated list such as "0:small,768:large". Entries whose width
 * is not a whole number >= 0, or whose value is blank, are dropped; the rest keep their order.
 * Generic — no knowledge of what the values mean.
 */
export function parseBreakpointList(raw: string | null | undefined): BreakpointEntry[] {
  if (!raw) {
    return [];
  }

  const entries: BreakpointEntry[] = [];
  for (const part of raw.split(",")) {
    const separator = part.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const width = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!/^\d+$/.test(width) || value === "") {
      continue;
    }
    entries.push({ minWidth: Number(width), value });
  }
  return entries;
}

/**
 * Picks the value of the entry with the largest minimum width that is not above `width`. When two
 * entries share a minimum width, the first listed wins. Returns undefined when none fits.
 */
export function pickByBreakpoint(entries: BreakpointEntry[], width: number): string | undefined {
  let best: BreakpointEntry | undefined;
  for (const entry of entries) {
    if (entry.minWidth <= width && (best === undefined || entry.minWidth > best.minWidth)) {
      best = entry;
    }
  }
  return best?.value;
}
