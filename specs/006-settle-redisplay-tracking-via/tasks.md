---

description: "Task list for Settle Redisplay Tracking via Wall-Clock Timeout"
---

# Tasks: Settle Redisplay Tracking via Wall-Clock Timeout

**Input**: Design documents from `/specs/006-settle-redisplay-tracking-via/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Required for every Orchestrator change, per Constitution Principle III.

**Organization**: US1 (a quiet page eventually settles) and US2 (genuine churn is unaffected, and
the timer itself is cleaned up) share the same underlying implementation — there's no separate
production code per story here, only different behaviors of the one wall-clock fallback. US1's
phase builds the fallback itself, including the `disconnectIfAllResolved` wiring found necessary
during planning (see plan.md's "Scope correction"); US2's phase adds the timer cleanup on
resolve/settle and the tests proving no regression to existing redisplay behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US2)

## Path Conventions

Single project (unchanged): `src/orchestrator/adOrchestrator.ts` and
`tests/unit/orchestrator/adOrchestrator.test.ts` only — no new files.

No Setup phase — no new package dependency, no new module.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The new state every later task builds on. **No user story work can begin until this
phase is complete.**

- [X] T001 Add `REDISPLAY_SETTLE_TIMEOUT_MS` constant and a `settleTimer: ReturnType<typeof
      setTimeout> | null` field on `TrackedSlot` in `src/orchestrator/adOrchestrator.ts`, per
      data-model.md. Initialize `settleTimer: null` alongside the rest of `TrackedSlot`'s initial
      fields in `run()`'s `trackedSlots.push(...)`.
      **Verified**: constant added (exported — see T005's deviation note) alongside
      `INITIAL_REDISPLAYS_REMAINING`/`INITIAL_QUIET_BATCHES_REMAINING`; field added to `TrackedSlot`
      with the same invariant-documentation style as `stopViewabilityWatch`; initialized in
      `trackedSlots.push(...)`.
- [X] T002 Add the `notifySlotSettled` hook in `src/orchestrator/adOrchestrator.ts`, per
      data-model.md's "New notify hook" section: a `createAdOrchestrator`-scope
      `let notifySlotSettled: (() => void) | null = null;`. In `run(root)`, assign
      `notifySlotSettled = disconnectIfAllResolved;` immediately after `disconnectIfAllResolved` is
      defined (before the `MutationObserver` starts or any slot is processed). In `resolveSlot()`
      and `settleRedisplayTracking()`, call `notifySlotSettled?.()` as the last step, after their
      existing behavior. **Why this is Foundational, not part of a later story**: without it, a
      slot settled via the new wall-clock path (T004) would never prompt the top-level release
      check to run on a page with no further mutations — the exact resource-retention gap this
      feature exists to close would remain unfixed even with the timer itself working correctly.
      Depends on nothing (independent of T001, but must land before T004's tests can pass
      meaningfully).
      **Deviation from plan**: implemented together with T006 (clearing `slot.settleTimer`) in the
      same edit to `resolveSlot()`/`settleRedisplayTracking()`, since both are small additions to
      the same two function bodies — no functional difference from doing them separately.
      **Verified**: T005's `disconnect()`-spy test proves this wiring actually works end-to-end,
      not just that it compiles.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 2: User Story 1 - A quiet page's ad tracking eventually releases its resources (Priority: P1) 🎯 MVP

**Goal**: A rendered ad slot on a page that produces no further DOM mutations after render has its
redisplay tracking settle anyway, instead of `quietBatchesRemaining` stalling forever one batch
short of zero — and the top-level `MutationObserver` actually disconnects as a result.

**Independent Test**: Render a single slot on an otherwise quiet page; advance fake timers past
`REDISPLAY_SETTLE_TIMEOUT_MS` with no further mutation batch; confirm the slot settled (a later
removal of its rendered element produces no redisplay) **and** that the top-level
`MutationObserver`'s `disconnect()` was actually called — settling the slot alone isn't sufficient
proof; the resource release is the point.

- [X] T003 [US1] Add a `scheduleSettleTimer(slot)` helper in `src/orchestrator/adOrchestrator.ts`,
      alongside the existing `resolveSlot`/`settleRedisplayTracking` helpers, per data-model.md:
      clears any existing `slot.settleTimer` first, then sets a new one for
      `REDISPLAY_SETTLE_TIMEOUT_MS`. The timer callback is wrapped in try/catch (Constitution
      Principle V — a schedule this SDK doesn't control the timing of) and, inside the try: no-ops
      if `slot.resolved` is already `true`, or if `slot.renderedElement` is `null` or no longer
      `.isConnected`; otherwise calls `settleRedisplayTracking(slot)` (which, via T002, now also
      triggers `notifySlotSettled`). Depends on T001, T002.
      **Verified**: implemented exactly as specified.
- [X] T004 [US1] Call `scheduleSettleTimer(slot)` in `runSlot()`'s successful-render path (after
      `slot.renderedElement` is assigned) and in `processMutationBatch`'s redisplay branch (after
      `slot.renderedElement = current` is assigned) — the same two places
      `slot.quietBatchesRemaining` is already reset to `INITIAL_QUIET_BATCHES_REMAINING` today, so
      every (re)display restarts the wall-clock fallback exactly like it restarts the mutation-count
      one. Depends on T003.
      **Verified**: both call sites wired; confirmed by T005's and T007's tests.
- [X] T005 [US1] Extend `tests/unit/orchestrator/adOrchestrator.test.ts` with `jest.useFakeTimers()`
      (matching `viewabilityDetector.test.ts`'s existing pattern):
      1. **Quiet-page settle, including actual resource release (quickstart Scenario 1)**: render a
         single slot on an otherwise quiet page, `jest.spyOn(MutationObserver.prototype,
         "disconnect")`, advance fake timers past `REDISPLAY_SETTLE_TIMEOUT_MS` with zero further
         mutation batches — confirm `disconnect` was called (proves the `notifySlotSettled` wiring
         from T002 actually works, not just that `slot.resolved` flipped internally). Then remove
         the rendered element and confirm no redisplay happens (tracking had already settled).
      2. **Mutation-count settling still wins when it happens first (quickstart Scenario 2)**:
         produce 10 consecutive quiet mutation batches well before the wall-clock threshold (the
         existing FR-008 setup), then advance fake timers the rest of the way to
         `REDISPLAY_SETTLE_TIMEOUT_MS` — confirm no error and no observable double-settle (e.g. no
         second `disconnect` call beyond the one mutation-count settling already produces today).
      Depends on T004.
      **Deviation, found during implementation**: a prototype-wide `jest.spyOn(MutationObserver
      .prototype, "disconnect")` (as originally planned) is unsafe in this test file — other,
      pre-existing tests (e.g. "resolves each slot independently — a hung slot never blocks
      another") leave their own `MutationObserver` permanently active on the shared jsdom
      `document` (their hung promise never resolves, so `disconnectIfAllResolved` never fires for
      them), and DOM mutations performed by *this* test were observed to trigger *their* stale
      observers too, polluting the prototype-wide call count (first run: expected 0 calls, got 2).
      Fixed by capturing only the specific `MutationObserver` instance this test's own `run()` call
      constructs (via a `Proxy` on the global constructor's `construct` trap) and spying on that
      one instance instead — isolated from any other test's leftover observers. Also required
      exporting `REDISPLAY_SETTLE_TIMEOUT_MS` from `adOrchestrator.ts` (not originally scoped, but
      matches the `MAX_WATCH_DURATION_MS` precedent from PR #8's review — avoids duplicating the
      magic number in tests).
      **Verified**: both tests pass; 38/38 in this file.

**Checkpoint**: User Story 1 is functional and independently testable (quickstart.md Scenarios 1–2).

---

## Phase 3: User Story 2 - Legitimate redisplay recovery still works within the window (Priority: P1)

**Goal**: Prove the wall-clock fallback never preempts genuine redisplay churn, and that its own
timer is always released once no longer needed — it must not become a new leak of the same kind
this feature exists to close.

**Independent Test**: Genuinely remove-and-reinsert a slot's element several times within the
wall-clock window; confirm every redisplay still succeeds exactly as today. Separately, resolve a
slot for good before the wall-clock threshold elapses; confirm its timer never fires afterward.

- [X] T006 [US2] In `src/orchestrator/adOrchestrator.ts`, clear `slot.settleTimer` (if pending) in
      both `resolveSlot()` and `settleRedisplayTracking()`, in addition to their existing behavior
      (and T002's `notifySlotSettled` call) — per data-model.md's invariant, mirroring the existing
      discipline already required of `stopViewabilityWatch`. Depends on T003.
      **Verified**: implemented together with T002 (see its deviation note); T008 confirms a
      resolved slot's timer is actually cancelled, not just harmlessly a no-op if it fires late.
- [X] T007 [US2] Extend `tests/unit/orchestrator/adOrchestrator.test.ts`: **genuine churn within the
      window (quickstart Scenario 3)** — genuinely remove-and-reinsert a slot's element several
      times (fewer than the redisplay budget), spaced so the final redisplay lands shortly before
      `REDISPLAY_SETTLE_TIMEOUT_MS` would have elapsed since the *previous* render — confirm every
      removal is still followed by a redisplay of the same, already-fetched `ad` exactly as today
      (mirrors the existing FR-009/FR-010 test setup). Depends on T004, T006.
      **Verified**: passes — 2 genuine redisplays each land 1s before their own window would have
      elapsed since the prior render; `client.requestAd` still called exactly once throughout.
- [X] T008 [US2] Extend the same file: **resolved-for-good cancels its timer (quickstart Scenario
      4)** — exhaust a slot's redisplay budget via genuine removals (existing FR-010 setup) well
      before the wall-clock threshold, then advance fake timers past where the timer would
      otherwise have fired — confirm no error and no double-processing of the already-resolved
      slot. **Independent per-slot timers (quickstart Scenario 5)** — two slots, one receiving
      ongoing genuine mutation batches and one receiving none after its initial render; advance
      fake timers past `REDISPLAY_SETTLE_TIMEOUT_MS` — confirm the quiet slot settles via the
      wall-clock fallback while the churning slot's own settling is unaffected. Depends on T006.
      **Verified**: both tests pass. The independent-timers test required care to actually
      distinguish "quiet" from "churning": both slots start identically, so the churning slot must
      receive its own genuine redisplay *before* the quiet slot's threshold elapses (restarting its
      timer) — otherwise both would settle via the wall-clock fallback simultaneously and the test
      wouldn't prove independence at all.

**Checkpoint**: Both user stories verified (quickstart.md Scenarios 1–5).

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T009 [P] Run `npm run lint`, `npx tsc --noEmit`, and `npm test` clean across the whole
      feature; confirm the full existing suite (features 001–005 plus the #8 dedup/leak fixes)
      still passes unmodified alongside the new tests.
      **Verified**: 129/129 tests pass (5 new, 124 pre-existing unmodified), lint clean, typecheck
      clean, `npm run build` compiles.
- [X] T010 [P] Walk through quickstart.md Scenarios 1–5 end-to-end (all unit-level, per
      quickstart.md's own note that this is an internal timing fix with nothing new to observe on
      a live page) and confirm each matches its documented expected outcome.
      **Verified**: all 5 scenarios map directly to T005/T007/T008's tests and all pass — Scenario
      1 (quiet-page settle + actual `disconnect()`), Scenario 2 (mutation-count wins first),
      Scenario 3 (genuine churn unaffected), Scenario 4 (resolved-for-good cancels its timer),
      Scenario 5 (independent per-slot timers).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS all user stories. T001/T002 are independent
  of each other but both required before T003.
- **User Story 1 (Phase 2)**: Depends on Foundational (T001, T002).
- **User Story 2 (Phase 3)**: Depends on T003/T004 (US1) existing — its cleanup wiring (T006)
  extends the same helpers US1 introduces, and its tests (T007/T008) verify no regression to
  behavior US1's implementation could affect.
- **Polish (Phase 4)**: Depends on both user stories.

### Parallel Opportunities

- T001, T002 [P] — different concerns within the same file, no shared dependency between them.
- T009, T010 (Polish) in parallel.
- Everything else in this feature touches the same one or two files in a dependency chain, so
  there's little other true parallelism — matches the plan's "single self-contained file" scope.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundational) — both T001 (timer state) and T002 (the release-check wiring) are
   required; skipping T002 would ship a timer that settles slots internally without ever actually
   releasing the top-level `MutationObserver`, silently failing to deliver SC-001.
2. Phase 2 (User Story 1) — a quiet page settles via the wall-clock fallback and its resources
   are actually released.
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1–2, including T005's `disconnect()` spy
   assertion — not just that the slot's internal state changed.
4. This alone closes ad-serve-client#9. User Story 2's cleanup/no-regression proof can follow
   independently, though in practice T006 (clearing the timer on resolve) should land before this
   ships, since without it a resolved slot's stale timer is harmless but sloppy — see Phase 3's
   own note.

### Incremental Delivery

1. Foundational → wall-clock state and the release-check wiring are both ready.
2. User Story 1 → validate → a static page's ad tracking now bounds its own resource retention,
   provably (SC-001).
3. User Story 2 → validate → confirms SC-002 (no regression to redisplay resilience) and SC-003
   (no new failure mode) explicitly, and closes the timer-cleanup gap that would otherwise leave
   a stale (harmless, but invariant-violating) `settleTimer` reference behind on early resolution
   — the same class of issue caught in PR #8's review for `stopViewabilityWatch`.

## Follow-ups (explicitly out of scope for this feature)

- **No publisher-configurable timeout value**: `REDISPLAY_SETTLE_TIMEOUT_MS` is a fixed internal
  constant, matching the `MAX_WATCH_DURATION_MS` precedent (spec Assumptions) — not exposed
  configuration.
- **`notifySlotSettled` assumes a single `run()` call per orchestrator instance** (matching this
  SDK's actual usage in `index.ts` — `run()` is called once per page load). If a future change ever
  called `run()` more than once on the same `createAdOrchestrator(...)` instance with overlapping
  in-flight slots from a prior call, the module-scope `notifySlotSettled` reference would point at
  whichever `run()` call assigned it last, not necessarily the one that owns a given settling slot.
  Not a real risk today — no code path calls `run()` more than once — but worth a comment at the
  declaration site so a future change to that usage pattern doesn't silently reintroduce it.
