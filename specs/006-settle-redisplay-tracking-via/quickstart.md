# Quickstart: Settle Redisplay Tracking via Wall-Clock Timeout

This is an internal timing fix with no visible change to ad rendering, network requests, or DOM
output — there's nothing new to observe in a browser's Network tab or a live host page. Every
scenario below is verified at the unit level with `jest.useFakeTimers()`, the same approach
`tests/unit/utils/viewabilityDetector.test.ts` already uses for the `MAX_WATCH_DURATION_MS`
precedent this feature mirrors. A live 2-minute wait on a real page would exercise the same code
path but isn't a practical or more trustworthy way to validate it.

## Prerequisites

- This repo's existing unit test suite runnable (`npm test`), unchanged setup.

## Scenario 1: A quiet page settles via the wall-clock fallback (US1, Acceptance Scenario 1)

In `tests/unit/orchestrator/adOrchestrator.test.ts`: render a slot, then advance fake timers past
`REDISPLAY_SETTLE_TIMEOUT_MS` with **no** further DOM mutation (unlike the existing FR-008 test,
which advances by appending 15 unrelated elements to produce real mutation batches).

**Expected**: the slot settles (mirrors the existing FR-008 test's final assertion — a later
removal of the rendered element produces no redisplay, confirming tracking already stopped)
without any mutation batch ever having fired past the initial render.

## Scenario 2: Genuine mutation-count settling still wins when it happens first (US1, Acceptance Scenario 2)

Render a slot, produce 10 consecutive quiet mutation batches well before
`REDISPLAY_SETTLE_TIMEOUT_MS` would elapse (the existing FR-008 test setup), then advance fake
timers the rest of the way to the wall-clock threshold.

**Expected**: settling already happened via the mutation-count path; the wall-clock timer firing
afterward is a no-op with no observable side effect (no double-settle, no error).

## Scenario 3: Genuine redisplay churn within the window is unaffected (US2, Acceptance Scenarios 1–2)

Render a slot, then genuinely remove-and-reinsert its element several times (fewer than the
redisplay budget) spaced within the wall-clock window — the existing FR-009/FR-010 redisplay test
setup — with the final redisplay landing shortly before `REDISPLAY_SETTLE_TIMEOUT_MS` would have
elapsed since the *previous* render.

**Expected**: every genuine removal is still followed by a redisplay exactly as today (`ad`
re-rendered, not re-requested); the wall-clock timer never preempts a redisplay that would
otherwise have succeeded, because each redisplay restarts the slot's timer.

## Scenario 4: A slot that resolves for good before the timeout cancels its pending timer (Edge Case)

Render a slot, exhaust its redisplay budget via genuine removals (existing FR-010 test setup) well
before `REDISPLAY_SETTLE_TIMEOUT_MS`, then advance fake timers past where the wall-clock timer
would otherwise have fired.

**Expected**: no error, no double-processing of an already-resolved slot — confirms the timer was
actually cleared on resolution, not merely rendered harmless by a runtime guard alone.

## Scenario 5: Independent per-slot timers on a mixed page (Edge Case)

Two slots on the same page: one receives ongoing genuine mutation batches, the other receives
none after its initial render. Advance fake timers past `REDISPLAY_SETTLE_TIMEOUT_MS`.

**Expected**: the quiet slot settles via the wall-clock fallback; the churning slot's own settling
timing (via whichever path reaches it first) is unaffected by the quiet slot's timer.
