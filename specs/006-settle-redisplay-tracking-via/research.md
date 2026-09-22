# Phase 0 Research: Settle Redisplay Tracking via Wall-Clock Timeout

No `[NEEDS CLARIFICATION]` markers remain in the spec or Technical Context, so this phase
documents the design decision and alternatives considered rather than resolving open unknowns.

## Decision: Per-slot one-shot `setTimeout`, restarted on every (re)display

Give each `TrackedSlot` its own wall-clock timer, started when the slot is first rendered and
restarted every time it's redisplayed (the same two points `quietBatchesRemaining` is already
reset today). If it fires before the slot has settled or resolved through the existing
mutation-count path, it calls `settleRedisplayTracking(slot)` directly — the exact same function
and outcome the quiet-batch path already produces, just reached by a different trigger. The timer
is cleared in `resolveSlot()` and `settleRedisplayTracking()`, the two places a slot's tracked
lifetime already ends or settles today, so it can never fire after the fact.

**Rationale**:
- Mirrors an already-established, already-reviewed pattern in this exact codebase —
  `viewabilityDetector.ts`'s `MAX_WATCH_DURATION_MS` timer, added in ad-serve-client#8 to solve
  the structurally identical problem (a watch with no bound other than a condition that might
  never occur). Reusing the same shape (one-shot timer, cleared by every path that makes it moot)
  keeps this fix legible against a precedent a future reader will likely already know.
- Requires no new browser API and no change to any other module — `setTimeout`/`clearTimeout` are
  already used elsewhere in this codebase (`viewabilityDetector.ts`,
  `adDecisionClient.ts`'s `withTimeout.ts`).
- Naturally handles every case in the spec's edge cases: a slot that settles via mutation-count
  first simply clears the pending wall-clock timer (no-op fires never happen because the timer is
  already cancelled, not because of a runtime check racing the callback); a slot that keeps
  churning legitimately gets its timer restarted on every redisplay, exactly like
  `quietBatchesRemaining` does today, so it's never closer to firing than the time since the *last*
  redisplay — consistent with today's "keep resetting the budget while genuine churn continues"
  behavior.

**Alternatives considered**:

1. **A single shared "heartbeat" interval that periodically re-checks every tracked slot's time
   since last mutation.** Rejected: introduces a new recurring interval with its own start/stop
   lifecycle to manage (start on first slot, stop when none remain) — strictly more moving parts
   than N independent one-shot timers that each clean up via the exact same `resolveSlot`/
   `settleRedisplayTracking` calls already responsible for ending a slot's tracked lifetime today.
   Per-slot timers also naturally support each slot resetting its own deadline independently on
   redisplay, which a shared interval would need extra bookkeeping to replicate.

2. **Lower `INITIAL_QUIET_BATCHES_REMAINING` or synthesize an extra mutation batch right after
   render to advance the counter.** Rejected: doesn't address the root cause. The bug is that a
   page which produces *zero* further mutations after the render-triggered batch stalls
   permanently one batch short of settling — no fixed starting count avoids this, since the
   counter only ever advances on a genuine mutation batch, and a truly static page produces none.

3. **Force-settle on `visibilitychange`/`pagehide`.** Rejected as a *replacement*: this only helps
   when the tab backgrounds or the page unloads, not the actual failure case in ad-serve-client#9
   (a page that stays foregrounded and simply never mutates near the ad slot again). Could be a
   valid complementary future enhancement, but adding a new browser event listener is out of scope
   per the spec's Assumptions (no new detection mechanism is needed to satisfy FR-001) and isn't
   needed once the wall-clock timer alone fully resolves the reported gap.

## Threshold value

Reuses the `MAX_WATCH_DURATION_MS` precedent (2 minutes) per the spec's Assumptions section —
generous enough that any realistic hydration/redraw churn a host page produces will have already
happened well within the window, while still bounding worst-case retention to a fixed, known
duration instead of the page's entire lifetime.
