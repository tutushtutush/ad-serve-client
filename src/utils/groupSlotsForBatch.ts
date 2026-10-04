/**
 * Splits items into groups that share a key (each group keeps discovery order, and groups are
 * ordered by where their first item was found), then cuts each group into chunks of at most
 * `chunkSize`. Generic — no knowledge of what the items or the key mean.
 */
export function groupSlotsForBatch<T>(
  items: T[],
  keyOf: (item: T) => string,
  chunkSize: number,
): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const chunks: T[][] = [];
  for (const group of groups.values()) {
    for (let start = 0; start < group.length; start += chunkSize) {
      chunks.push(group.slice(start, start + chunkSize));
    }
  }
  return chunks;
}
