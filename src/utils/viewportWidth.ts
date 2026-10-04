/**
 * Reads the width of the window the SDK runs in. Anything unreadable or not a finite number >= 0
 * counts as 0, and a getter that throws (a hostile or sandboxed environment) never propagates.
 */
export function readViewportWidth(win: { innerWidth?: unknown }): number {
  try {
    const width = win.innerWidth;
    return typeof width === "number" && Number.isFinite(width) && width >= 0 ? width : 0;
  } catch {
    return 0;
  }
}
