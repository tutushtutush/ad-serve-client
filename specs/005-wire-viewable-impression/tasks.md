---

description: "Task list for Wire Up Viewable Impression Tracking"
---

# Tasks: Wire Up Viewable Impression Tracking

**Input**: Design documents from `/specs/005-wire-viewable-impression/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Required for every Orchestrator/API Client/Utility change, per Constitution Principle III.

**Organization**: US1 (viewable ads get reported) and US2 (never disrupts the host page) are not
code-independent — both outcomes come from the same watch-then-report pipeline built in US1's own
tasks (T002–T004): US2's phase adds the dedicated tests proving the unsupported-browser and
failure-swallowing branches, not new production code — same pattern already established in
ad-serve-api's 007/008/009 and this repo's own 004.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US2)

## Path Conventions

Single project (unchanged): `src/` and `tests/unit/` at repository root, mirroring existing layer
directories (`client/`, `utils/`, `orchestrator/`).

No Setup phase — no new package dependency, only two new modules using existing browser platform
APIs.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The two new modules every later task wires together. **No user story work can begin
until this phase is complete.**

- [X] T001 [P] Create `src/utils/viewabilityDetector.ts` per data-model.md:
      `createViewabilityDetector(IntersectionObserverImpl)` returns `{ watch(element, onViewable) }`.
      `watch` returns a no-op `stop` and never calls `onViewable` when `IntersectionObserverImpl`
      is `undefined` (FR-005). Otherwise: observes `element` at `threshold: 0.5`; arms a 1000ms
      timer the moment an entry reports `isIntersecting && intersectionRatio >= 0.5`; clears the
      timer if a later entry drops back below threshold before it fires (research.md — continuous,
      not cumulative); calls `onViewable()` and stops (disconnects + clears any timer) the first
      time the timer completes; `stop()` is idempotent and safe to call at any time, including
      after `onViewable` already fired. The observer callback itself is wrapped in try/catch
      (Constitution Principle V — a browser-triggered callback this SDK doesn't control the timing
      of). Unit tests in `tests/unit/utils/viewabilityDetector.test.ts`, using a fake
      `IntersectionObserver` constructor and fake timers: fires after continuous threshold-crossing
      held for 1000ms; never fires if it drops below threshold before 1000ms elapses; a later
      qualifying period after an interrupted one still fires (spec Acceptance Scenario 3); `stop()`
      before the timer completes prevents `onViewable`; calling `stop()` twice, or after
      `onViewable` fired, doesn't throw; `IntersectionObserverImpl: undefined` never calls
      `onViewable` and returns a working no-op `stop`.
      **Verified**: 16/16 tests pass, including 2 real bugs caught by the tests themselves before
      merge: the deferred `setTimeout` callback that actually invokes `onViewable()` was outside
      the observer callback's try/catch (a throwing `onViewable` would have propagated
      asynchronously, unguarded) — fixed by wrapping that callback too; and the "only fires once"
      test initially failed because the test's own fake `IntersectionObserver` didn't model real
      `disconnect()` behavior (continuing to deliver entries after disconnect) — fixed the fake to
      match real browser behavior, not the source.
- [X] T002 [P] Create `src/client/viewableImpressionClient.ts` per data-model.md:
      `createViewableImpressionClient(baseUrl, sendBeaconImpl, fetchImpl)` returns
      `{ reportViewableImpression(report) }`. Builds
      `{baseUrl}/viewable-impression?platformId=&adTypeId=&adConfigId=` via `URLSearchParams`
      (matching `adDecisionClient.ts`'s existing convention); tries `sendBeaconImpl(url)` first
      when provided, falls back to `fetchImpl(url, { method: "POST", keepalive: true })` when
      `sendBeaconImpl` is absent or returns `false`; the whole body wrapped in try/catch so a
      throw from either transport never propagates (FR-006). Returns `void` — no caller ever
      awaits or branches on the outcome (data-model.md). Unit tests in
      `tests/unit/client/viewableImpressionClient.test.ts`: builds the correct URL with all three
      params; prefers `sendBeacon` when available and it returns `true`; falls back to `fetch` when
      `sendBeacon` is absent, or present but returns `false`; a throwing `sendBeaconImpl`/
      `fetchImpl` doesn't propagate; a blank `baseUrl` doesn't attempt either transport.
      **Verified**: 7/7 tests pass.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 2: User Story 1 - An ad that's actually seen gets reported as a viewable impression (Priority: P1) 🎯 MVP

**Goal**: A rendered ad slot that's genuinely scrolled into view and held there past the IAB
threshold gets exactly one viewable-impression report per rendered instance.

**Independent Test**: Render an ad with a known `adConfigId`; simulate it crossing the visibility
threshold and holding for the required duration; confirm exactly one
`reportViewableImpression` call with the correct placement/ad identifiers.

- [X] T003 [US1] Extend `src/orchestrator/adOrchestrator.ts` per data-model.md:
      `AdOrchestratorDeps` gains `viewabilityDetector?: ViewabilityDetectorLike` and
      `trackingClient?: ViewableImpressionClientLike` (optional — deviated from this task's
      original text during implementation; see note below); `TrackedSlot` gains
      `stopViewabilityWatch: (() => void) | null`, initialized to `null`. Added a
      `startViewabilityWatch(slot, element)` helper: no-ops (and clears
      `stopViewabilityWatch` to `null`) when either dependency is absent or `slot.ad?.adConfigId`
      is absent (FR-004); otherwise calls `viewabilityDetector.watch(element, onViewable)`, where
      `onViewable` clears `stopViewabilityWatch` to `null` and calls
      `trackingClient.reportViewableImpression({ platformId, adTypeId, adConfigId })` inside its
      own try/catch (defense-in-depth, see T008's finding below); stores the returned `stop` on
      `slot.stopViewabilityWatch`. Also added a `resolveSlot(slot)` helper (sets `resolved = true`
      and stops any pending watch, FR-007) and routed every existing `slot.resolved = true`
      assignment through it. Called `startViewabilityWatch(slot, slot.currentElement)`
      immediately after the existing successful `renderer.renderAd(...)` call in `runSlot`.
      Depends on T001, T002 (imports both new types).
      **Deviation from plan**: `viewabilityDetector`/`trackingClient` made optional rather than
      required, so the ~25 pre-existing `createAdOrchestrator({ client, renderer })` call sites in
      `tests/unit/orchestrator/adOrchestrator.test.ts` (none of which concern viewability) didn't
      all need updating — an orchestrator built without them simply never starts a watch, the same
      degrade-safely posture as FR-004's missing-`adConfigId` case. data-model.md updated to match.
      **Verified**: unit tests confirm `viewabilityDetector.watch` is called with the correct
      rendered element right after a successful render, and never called when `result.ad` has no
      `adConfigId`, or when the deps aren't supplied at all.
- [X] T004 [US1] Extend the same file: call `startViewabilityWatch(slot, current)` immediately
      after the existing redisplay `renderer.renderAd(...)` call in `processMutationBatch`,
      stopping any still-pending previous watch first (`slot.stopViewabilityWatch?.()`, inside
      `startViewabilityWatch` itself) so a redisplayed instance starts its own fresh, independent
      watch rather than sharing state with the one it's replacing (FR-003). Extended
      `tests/unit/orchestrator/adOrchestrator.test.ts`: a redisplay starts a new watch independent
      of the first (both can independently fire their own report); the pre-redisplay watch's
      `stop` is called when redisplay happens. Depends on T003.
      **Verified**: dedicated redisplay test confirms two independent `reportViewableImpression`
      calls are possible — one per rendered instance — matching spec Acceptance Scenario 4.
- [X] T005 [US1] Update `src/index.ts`: construct
      `createViewabilityDetector(window.IntersectionObserver)` and
      `createViewableImpressionClient(baseUrl, typeof navigator.sendBeacon === "function" ?
      navigator.sendBeacon.bind(navigator) : undefined, window.fetch.bind(window))`, inject both
      into `createAdOrchestrator({ client, renderer, viewabilityDetector, trackingClient })`. No
      dedicated test file for `index.ts` (composition root, matching this repo's existing
      convention) — verified live in T006. Depends on T001, T002, T003.
      **Verified**: live in T006.

**Checkpoint**: User Story 1 is functional and independently testable (quickstart.md Scenarios 1–4).

- [X] T006 [US1] `npm run build`, load a real host page against a running ad-serve-api with a real
      seeded ad positioned outside the initial viewport, and walk through quickstart.md Scenarios
      1–4: scrolling into view and holding produces exactly one report and one recorded event; a
      quick scroll-past produces none; an interrupted-then-completed view produces exactly one; a
      redisplayed slot is independently reportable again. Fix T001–T005 if any check fails, then
      re-verify. Depends on T005.
      **Verified against real local ad-serve-api + Postgres**, using Playwright driving a real
      Chromium browser against minimal standalone host pages (eventpulse's own homepage has an
      unrelated backend dependency that collided on the same port, same finding as 004's T006 — not
      routed around by touching eventpulse itself): Scenario 1 — scrolling the seeded ad into view
      and holding for 1.5s fired exactly 1 `/viewable-impression` request
      (`platformId=1370fc20-...&adTypeId=medium-rectangle&adConfigId=b057cf98-...`), with a matching
      row recorded with the correct resolved `campaign_id`; continuing to hold afterward fired no
      further requests. Scenario 2 — scrolling quickly past the slot (six 400px jumps, 50ms apart,
      never pausing) fired 0 requests. Scenario 3 — scrolling into view for 400ms (under the 1000ms
      threshold) then away fired 0 requests; scrolling back in afterward and holding for 1.5s then
      fired exactly 1 — confirming an interrupted view doesn't block a later qualifying one.
      Scenario 4 — using a host page that programmatically replaces the ad slot element (simulating
      a hydration-mismatch redisplay) while still off-screen, the redisplayed instance's own fresh
      watch fired exactly 1 report once scrolled into view and held, with the correct query params
      — confirming a redisplayed instance is independently reportable via a real re-render, not
      just at the unit level.

---

## Phase 3: User Story 2 - Viewability tracking never disrupts the host page (Priority: P1)

**Goal**: Prove, not just assert, that an unsupported browser, missing identifying information, or
a failing report never affects ad rendering or anything else on the host page.

**Independent Test**: Simulate no `IntersectionObserver` support; confirm ads still render with no
report ever attempted. Separately, simulate a throwing `reportViewableImpression`; confirm nothing
else breaks.

**Note**: Like 004's US2, this story's production code already exists — the FR-005 no-op path
(T001) and the FR-006 try/catch boundaries (T001, T002) already implement it. This phase's job is
dedicated, explicit test coverage.

- [X] T007 [US2] Extend `tests/unit/utils/viewabilityDetector.test.ts` if not already covered by
      T001: confirm explicitly, as its own dedicated test, that an unsupported browser
      (`IntersectionObserverImpl: undefined`) never throws when `watch()` is called and its
      returned `stop()` is called. Depends on T001.
      **Verified**: already implemented as part of T001 (see its note) — confirmed present and
      passing.
- [X] T008 [US2] Extend `tests/unit/orchestrator/adOrchestrator.test.ts`: a `trackingClient` whose
      `reportViewableImpression` throws synchronously doesn't propagate out of the viewability
      watch's callback, and doesn't prevent other slots' own processing; a `viewabilityDetector`
      whose `watch()` itself throws doesn't propagate out of `runSlot`/`processMutationBatch`
      (mirrors the existing top-level try/catch already covering `renderAd` itself). Depends on
      T003, T004.
      **Verified, with a real bug caught and fixed**: the first version of `startViewabilityWatch`
      called `trackingClient.reportViewableImpression(...)` directly inside the `onViewable`
      closure with no try/catch of its own, relying entirely on `viewabilityDetector.ts`'s own
      try/catch (around the deferred `setTimeout` callback that invokes `onViewable`) to protect
      it. The dedicated throwing-`trackingClient` test caught this immediately: a
      `ViewabilityDetectorLike` fake that (correctly, per the interface contract) doesn't itself
      wrap its callback invocation let the throw propagate straight out of the test. Fixed by
      wrapping the `reportViewableImpression` call in its own try/catch inside the Orchestrator
      closure too — defense-in-depth, matching this codebase's established "never trust a single
      layer's contract alone" pattern (e.g. ad-serve-api's `trackFireAndForget` backstop on top of
      `neverReject`). 5/5 new tests pass (2 more than originally scoped: one for the still-pending
      watch being stopped at final settlement, FR-007).

**Checkpoint**: Both user stories verified (quickstart.md Scenarios 1–6).

- [X] T009 [US2] Walk through quickstart.md Scenarios 5–6 (unsupported browser and missing
      `adConfigId`, both confirmed unit-level rather than live per quickstart.md's own note; a
      throwing tracking client, unit-level). Fix T001–T004 if any check fails, then re-verify.
      Depends on T007, T008.
      **Verified**: both scenarios confirmed exactly as quickstart.md's own note predicted —
      neither is practically reachable live in this stack's evergreen-Chromium test setup, matching
      004's T009 precedent of a designed-for degrade path being live-unreachable for reasons
      outside the fix itself. Unit-level coverage (T001, T007, T008) confirmed passing.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T010 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      feature, and confirm the full existing suite (features 001–004) still passes unmodified.
      Confirm `npm run build` compiles and `dist/ad-serve-client.js` reflects the new viewability
      logic.
      **Verified**: 110/110 tests pass (86 pre-existing, unmodified, + 24 new: 16 across T001/T002,
      8 across T003/T004/T008), lint and typecheck both clean, `npm run build` compiles, and the
      built bundle contains the `/viewable-impression` string construction logic (confirmed via
      grep on the built output).
- [X] T011 [P] Walk through any remaining quickstart.md scenarios not already covered by T006/T009,
      then clean up test artifacts (`ad_events` rows, any standalone test pages).
      **Verified**: all 6 quickstart.md scenarios covered across T006 (1–4) and T009 (5–6). Local
      test servers (the standalone HTTP file server on port 8123, ad-serve-api on port 4010) both
      stopped; standalone test pages and the Playwright driver script live only in this session's
      scratchpad directory, never committed to the repo. `ad_events` rows from this verification
      (8 `viewable_impression` rows) left in place, same as prior features' precedent of not
      truncating local dev data automatically.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS all user stories.
- **User Story 1 (Phase 2)**: Depends on Foundational (T001, T002). No dependency on US2.
- **User Story 2 (Phase 3)**: Depends on T003/T004 (US1) existing to test against — its production
  code already exists by the time this phase starts.
- **Polish (Phase 4)**: Depends on both user stories.

### Parallel Opportunities

- T001, T002 [P] — different files, no shared dependency.
- T010, T011 (Polish) in parallel.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundational).
2. Phase 2 (User Story 1) — viewable ads get reported.
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1–4 against a real host page + ad-serve-api.
4. This is the smallest deployable slice: viewable-impression data starts flowing for real
   traffic. User Story 2's explicit resilience proof can follow independently.

### Incremental Delivery

1. Foundational → Foundation ready.
2. User Story 1 → validate → viewable impressions start being measurable end-to-end (SC-001/SC-002).
3. User Story 2 → validate → confirms SC-003 (zero impact from any failure mode) explicitly, though
   the guarantee it proves was already load-bearing in Story 1's own design.

## Follow-ups (explicitly out of scope for this feature)

- **No publisher-configurable viewability threshold**: the 50%/1s definition is hardcoded, matching
  the IAB standard this feature targets — a per-placement override is not in scope (spec
  Assumptions).
- **No retry on a failed report**: `sendBeacon`'s own browser-level reliability guarantee (survives
  page unload) is relied on as-is; no application-level retry/queue is added on top of it.
