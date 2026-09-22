// IAB viewability standard: at least 50% of the element's area visible within the viewport,
// continuously, for at least one second (research.md).
const VIEWABILITY_THRESHOLD = 0.5;
const VIEWABILITY_DURATION_MS = 1000;

// Caught in review (eventpulse #58 / ad-serve-client #7): a slot's viewability watch is
// deliberately kept running for as long as its rendered element stays connected, even after
// redisplay-tracking itself has settled (adOrchestrator.ts's settleRedisplayTracking) — a below-
// fold ad must stay eligible to be reported whenever the viewer eventually scrolls to it (SC-002).
// But with no upper bound, an ad that's never scrolled into view keeps its IntersectionObserver
// (and the closure capturing the full ad creative, including base64 image fields) alive for the
// entire page lifetime. This wall-clock cap bounds that: past this point the watch gives up and
// releases its resources, the same "no report" outcome as if viewability were simply never
// reached, rather than the watch itself becoming an unbounded leak.
export const MAX_WATCH_DURATION_MS = 2 * 60 * 1000;

export interface ViewabilityDetectorLike {
  // Starts watching `element`. Calls `onViewable` at most once, the first time the IAB
  // viewability condition is satisfied. Returns a `stop()` function that cancels the watch —
  // safe to call at any time, including after `onViewable` has already fired (a no-op then).
  // `onGiveUp`, if supplied, is called at most once instead of `onViewable` if
  // MAX_WATCH_DURATION_MS elapses with the threshold never reached — the caller's signal that
  // this watch's `stop()` reference is now stale/inert (see adOrchestrator.ts's
  // stopViewabilityWatch field), since internally self-stopping this way is otherwise
  // indistinguishable from still being active.
  watch(element: Element, onViewable: () => void, onGiveUp?: () => void): () => void;
}

/**
 * `IntersectionObserverImpl` is injected rather than read from the global, so callers (and
 * tests) control what "supported" means: `undefined` degrades every `watch()` call to a no-op
 * that never calls `onViewable`, matching FR-005's "unsupported browser" requirement without
 * this module ever touching a global itself.
 */
export function createViewabilityDetector(
  IntersectionObserverImpl: typeof IntersectionObserver | undefined,
): ViewabilityDetectorLike {
  function watch(element: Element, onViewable: () => void, onGiveUp?: () => void): () => void {
    if (!IntersectionObserverImpl) {
      return () => {};
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function clearPendingTimer(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function stop(): void {
      if (stopped) {
        return;
      }
      stopped = true;
      clearPendingTimer();
      clearTimeout(maxDurationTimer);
      observer.disconnect();
    }

    // Wrapped in try/catch: this callback is invoked by the browser on its own schedule, not by
    // code this SDK controls the timing of — an uncaught throw here must never reach the host
    // page's own execution (Constitution Principle V).
    const observer = new IntersectionObserverImpl(
      (entries) => {
        try {
          const entry = entries[entries.length - 1];
          if (entry.isIntersecting && entry.intersectionRatio >= VIEWABILITY_THRESHOLD) {
            if (timer === null) {
              timer = setTimeout(() => {
                try {
                  stop();
                  onViewable();
                } catch {
                  // See comment above the observer construction — this timer callback runs on
                  // its own schedule too, so it needs the same guard as the observer callback.
                }
              }, VIEWABILITY_DURATION_MS);
            }
          } else {
            // Dropped back below threshold before the timer fired: this view doesn't count, but
            // doesn't block a later qualifying one either — just clear the pending timer and keep
            // watching (research.md, spec Acceptance Scenario 3).
            clearPendingTimer();
          }
        } catch {
          // See comment above the observer construction.
        }
      },
      { threshold: VIEWABILITY_THRESHOLD },
    );

    observer.observe(element);

    // Bounds the watch's lifetime regardless of whether the IAB threshold is ever reached — see
    // MAX_WATCH_DURATION_MS above. stop() itself clears this timer too, making this a plain no-op
    // if the threshold already fired or the caller already stopped the watch first. Wrapped in
    // try/catch for the same reason as every other timer callback in this file (Constitution
    // Principle V): this runs on a schedule this SDK doesn't control.
    const maxDurationTimer = setTimeout(() => {
      try {
        stop();
        onGiveUp?.();
      } catch {
        // See comment above.
      }
    }, MAX_WATCH_DURATION_MS);

    return stop;
  }

  return { watch };
}
