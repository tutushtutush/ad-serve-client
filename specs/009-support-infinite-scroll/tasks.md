---

description: "Task list for Discover and Fill Dynamically Inserted Ad Slots"
---

# Tasks: Discover and Fill Dynamically Inserted Ad Slots

**Input**: Design documents from `/specs/009-support-infinite-scroll/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required for every Orchestrator change, per Constitution Principle III. `index.ts`'s
queue-draining/`refresh` wiring is Loader code with no existing unit-test convention (plan.md
Technical Context) — verified via quickstart.md's manual Scenario 5 instead.

**Organization**: All four user stories are different guarantees of the *same* underlying
mechanism — making `run()` safely re-entrant and reachable from outside `index.ts`'s one-shot
bootstrap — not separately shippable production code. Foundational lands the mechanism itself (the
per-slot settle-callback fix, the cross-call dedup set, and the public `refresh`/queue-draining
surface) together with the baseline test proving each piece works in isolation; each User Story
phase then adds the specific test that proves *that story's* acceptance scenarios, confirming
existing coverage where Foundational's baseline test already happens to cover it. This mirrors how
features 006 and 008 organized this same file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Conventions

Single project (unchanged): `src/orchestrator/adOrchestrator.ts`, `src/index.ts`, and
`tests/unit/orchestrator/adOrchestrator.test.ts` only — no new files, no new dependency.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The re-entrancy mechanism every user story depends on. **No user story work can begin
until this phase is complete.**

- [X] T001 In `src/orchestrator/adOrchestrator.ts`: replace the single module-level
      `notifySlotSettled` pointer (and its `safeNotifySlotSettled` wrapper) with a `notifySettled:
      () => void` field on `TrackedSlot` (data-model.md), assigned to that call's own
      `disconnectIfAllResolved` at creation time in `run()`'s `trackedSlots.push(...)`.
      `resolveSlot(slot)` and `settleRedisplayTracking(slot)` call `slot.notifySettled()` instead of
      the shared outer reference, wrapped in the same try/catch `safeNotifySlotSettled` used
      (Constitution Principle V — a throwing host-page `MutationObserver` polyfill must not
      propagate). Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`: call `run()` twice
      with two different, non-overlapping roots, each with one slot; drive each slot to settle
      independently (enough quiet mutation batches); assert each call's own `MutationObserver`
      disconnects only from its own slot settling, never as a side effect of the other call's slot
      (quickstart.md Scenario 3 — this is the regression test for the bug `adOrchestrator.ts`'s own
      pre-existing comment on `notifySlotSettled` already documented).
      **Verified**: `disconnectIfAllResolved` moved above the discovery loop (function declarations
      hoist, so no behavior change) so each `TrackedSlot` can capture it at creation time. Regression
      test added under "re-discovery across multiple run() calls (feature 009)" using the same
      `MutationObserver` Proxy-capture technique as the existing wall-clock test.
- [X] T002 In `src/orchestrator/adOrchestrator.ts`: add a `claimedElements = new
      WeakSet<Element>()` inside `createAdOrchestrator`'s closure (data-model.md). In `run()`'s
      discovery loop, skip any `groupDiscoveredSlots(root)` result whose `element` is already in
      `claimedElements` before a `TrackedSlot` is created for it; add an element to
      `claimedElements` at the moment a `TrackedSlot` is created for it. In `processMutationBatch`'s
      redisplay branch, also add `current` to `claimedElements` at the same point
      `slot.renderedElement = current` is assigned, so a redisplayed replacement element is
      recognized as claimed too, not just the originally-discovered one. Add a test in
      `tests/unit/orchestrator/adOrchestrator.test.ts`: call `run(document)` with one slot, let it
      fill, then call `run(document)` again with no new slots added; assert `client.requestAd` and
      `renderer.renderAd` are each still called exactly once in total (quickstart.md Scenario 2).
      Depends on T001 (same file/region).
      **Verified**: implemented exactly as specified. Test added and passing.
- [X] T003 In `src/index.ts`: extend the `Window.adServe` type declaration with an optional
      `refresh?: (root?: Node & ParentNode) => void` (data-model.md). In `main()`, after the
      existing `orchestrator.run(document)` call, define `window.adServe.refresh = (root) => { try {
      orchestrator.run(root ?? document); } catch { /* Constitution Principle V */ } }`; then drain
      whatever is already in `window.adServe.q` (invoke each entry as a zero-argument callback,
      individually wrapped in try/catch so one throwing callback doesn't stop the rest — FR-009);
      then replace `window.adServe.q.push` with a function that invokes its argument immediately
      (same try/catch), so a callback pushed afterward runs without waiting for a later drain
      (research.md Decision 4, contracts/public-api-delta.md). `refresh` MUST be defined before the
      existing queue is drained, since a queued callback may itself call
      `window.adServe.refresh(...)`. Depends on T001, T002 (the orchestrator must be safely
      re-entrant before it's exposed to repeat external calls).
      **Verified**: implemented as specified; also tightened `q`'s type from `unknown[]` to
      `Array<() => void>` (data-model.md's documented shape). `npm run typecheck`/`npm run lint`
      clean.

**Checkpoint**: Foundation ready — `run()` is safely re-entrant and reachable via
`window.adServe.refresh`; user story test coverage can now be added/confirmed.

---

## Phase 2: User Story 1 - Newly loaded content gets ads, not just what was on the page at first load (Priority: P1) 🎯 MVP

**Goal**: A genuinely new ad slot, inserted after the page's initial slots were processed, gets
discovered and filled by a later `run()`/`refresh()` call.

**Independent Test**: Load a page, insert additional ad-slot markup, signal readiness. Confirm the
new slots get filled (quickstart.md Scenario 1).

- [X] T004 [US1] Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`: call
      `orchestrator.run(document)` against a DOM with one slot; let it fill. Append a second,
      distinct slot element to `document`. Call `orchestrator.run(document)` again. Assert
      `client.requestAd` is called once for the first slot (during the first call) and once for the
      second slot (during the second call), and the second slot's element receives a render.
      Depends on T001, T002.
      **Verified**: test passing.

**Checkpoint**: User Story 1 is functional and independently testable (quickstart.md Scenario 1).

---

## Phase 3: User Story 2 - A signal sent before the ad SDK has finished starting up still gets honored (Priority: P1)

**Goal**: A `window.adServe.q.push(...)` call made before this SDK finishes starting up still
results in its slots being filled once startup completes, with no extra action from the host page.

**Independent Test**: Push a readiness callback onto `window.adServe.q` before the SDK bundle
loads; confirm it's honored once the bundle finishes starting up (quickstart.md Scenario 5).

**Note**: No unit test file for this — `index.ts` is Loader code with no existing test convention
(plan.md Technical Context). Verified manually.

- [X] T005 [US2] Follow quickstart.md Scenario 5: build the bundle (`npm run build`), serve a test
      page that inlines `loader/snippet.js` followed immediately by
      `window.adServe.q.push(function () { window.adServe.refresh(); })` — pushed before the async
      SDK `<script>` tag has had a chance to load — and confirm via the network tab that `GET /ads`
      requests for any slots present at that point are made once the bundle finishes starting up,
      not dropped. Depends on T003.
      **Verified**: ran the built bundle in a jsdom harness (equivalent to a real browser's network
      tab for this check — `window.fetch` faked to record every `GET /ads` URL requested) with the
      loader snippet run first, a callback pushed onto `window.adServe.q` before the bundle loads,
      then the bundle evaluated. Confirmed: the queued callback ran once the bundle finished
      starting up, `window.adServe.refresh` was defined before the drain, and exactly one `GET /ads`
      request was made (the initial-load slot; the queued `refresh()` call correctly made zero
      additional requests for that same already-claimed slot, per T002).

**Checkpoint**: User Story 2 is functional (quickstart.md Scenario 5).

---

## Phase 4: User Story 3 - Signaling new content twice, or over a region that overlaps earlier content, never double-fills anything (Priority: P1)

**Goal**: A later readiness signal whose scanned region overlaps already-handled content never
re-requests or re-renders an already-claimed slot — including a slot whose rendered element has
since been replaced by a redisplay.

**Independent Test**: Signal readiness twice over overlapping content, including at least one
already-filled slot; confirm it's untouched the second time, while any genuinely new slot in the
same signal still fills (quickstart.md Scenarios 2, 4).

**Note**: Scenario 2's baseline case is already covered by T002's own test. This phase confirms
that coverage and adds the subtler redisplay case.

- [X] T006 [US3] Confirm (from T002) that `tests/unit/orchestrator/adOrchestrator.test.ts` covers
      an overlapping/duplicate `run(document)` call making zero additional `client.requestAd`/
      `renderer.renderAd` calls for an already-claimed slot (quickstart.md Scenario 2, US3
      Acceptance Scenario 1). Depends on T002.
      **Verified**: confirmed present ("a later run() call over already-handled content never
      re-requests or re-renders an already-claimed slot (US3)") and passing.
- [X] T007 [US3] Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`: call
      `orchestrator.run(document)` with one slot; let it fill. Remove that rendered element and
      insert a fresh replacement element at the same group position (triggering the existing
      redisplay path via a mutation batch). Call `orchestrator.run(document)` again. Assert the
      redisplay itself reused the already-fetched ad (existing feature 006 behavior, unchanged) and
      the second `run(document)` call makes no additional `client.requestAd` call for that slot —
      confirming the replacement element was recorded as claimed too, not just the original one
      (quickstart.md Scenario 4, Edge Cases). Depends on T002.
      **Verified**: test passing.

**Checkpoint**: User Story 3 is functional and independently testable (quickstart.md Scenarios 2,
4).

---

## Phase 5: User Story 4 - A page can keep loading more content indefinitely, and each new batch fills independently (Priority: P2)

**Goal**: An unbounded sequence of readiness signals, each covering a distinct new batch of slots,
fills every batch independently — no batch's outcome or timing depends on, or interferes with, any
other's.

**Independent Test**: Signal readiness several times in sequence, each preceded by inserting a
distinct new batch of slots; confirm every batch fills independently, and that one batch's slot
failing doesn't affect later batches.

**Note**: Cross-call independence is already covered by T001's own test. This phase confirms that
coverage and adds the sequential/failure-isolation case specific to this story.

- [X] T008 [US4] Confirm (from T001) that `tests/unit/orchestrator/adOrchestrator.test.ts` covers
      two `run()` calls on disjoint roots settling independently, with neither call's
      `MutationObserver` disconnecting as a side effect of the other's slot settling (US4
      Acceptance Scenario 1). Depends on T001.
      **Verified**: confirmed present (T001's regression test) and passing.
- [X] T009 [US4] Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`: call
      `orchestrator.run(rootA)` with a slot whose `client.requestAd` rejects (simulating a failure);
      then call `orchestrator.run(rootB)` with a distinct, healthy slot. Assert `rootB`'s slot fills
      normally, unaffected by `rootA`'s slot having failed (US4 Acceptance Scenario 2, quickstart.md
      Scenario 6's failure-isolation guarantee extended across separate calls). Depends on T001,
      T002.
      **Verified**: test passing.

**Checkpoint**: All four user stories independently functional and tested.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T010 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      repository.
      **Verified**: 165/165 tests, lint, and typecheck all clean.
- [X] T011 [P] Run `npm run build` and confirm the built bundle compiles; manually re-run
      quickstart.md Scenario 5 against the built bundle as the final end-to-end confirmation of
      US2's guarantee (T005 already covers this during Phase 3, but Polish confirms it still holds
      against the final, fully-merged build).
      **Verified**: `npm run build` compiles; T005's jsdom-harness check re-run against this final
      build, same PASS result (queued callback honored, `refresh` defined before drain, exactly one
      `GET /ads` request for the one initial-load slot).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS all user stories. Internally sequential
  (same file/region): T001 → T002 → T003.
- **User Story 1 (Phase 2)**: Depends on Foundational (T001, T002).
- **User Story 2 (Phase 3)**: Depends on Foundational (T003, which itself depends on T001–T002).
- **User Story 3 (Phase 4)**: Depends on Foundational (T002).
- **User Story 4 (Phase 5)**: Depends on Foundational (T001, T002).
- **Polish (Phase 6)**: Depends on all of Phases 1–5.

### Parallel Opportunities

- None within Foundational — T001, T002, T003 all touch the same two files in a dependent order.
- T006 and T007 (US3) [not marked P — same file, but independent test cases; may be written in
  either order] — omitted `[P]` since both edit the same test file's describe block.
- T010 and T011 (Polish) [P] — independent checks.
- Once Foundational (Phase 1) completes, T004 (US1), T005 (US2), T006–T007 (US3), and T008–T009
  (US4) have no dependencies on each other and could be written in any order by different
  contributors, though all share `adOrchestrator.test.ts` as their target file except T005.

---

## Implementation Strategy

### MVP First (Foundational + User Story 1 Only)

1. Complete Phase 1: Foundational — `run()` becomes safely re-entrant, deduped, and reachable via
   `window.adServe.refresh`.
2. Complete Phase 2: User Story 1's dedicated test coverage.
3. **STOP and VALIDATE**: run quickstart.md Scenario 1.
4. This alone delivers the core value: new content gets ads, the same mechanism every other story
   depends on already proven correct.

### Incremental Delivery

1. Foundational → mechanism exists, safely re-entrant and externally reachable.
2. User Story 1 → validate → new content gets filled.
3. User Story 2 → validate → a signal sent before startup isn't lost.
4. User Story 3 → validate → overlapping signals never double-fill.
5. User Story 4 → validate → unbounded repeated signals each fill independently.
6. Polish → lint/typecheck/test/build clean, final quickstart re-run.

## Follow-ups (explicitly out of scope for this feature)

- **`POST /ads/batch`**: not introduced by this feature — each newly discovered slot still issues
  its own independent `requestAd` call (research.md Decision 6).
- **Persistent "what was this scrolled-away slot filled with" cache**: explicitly decided against —
  a slot recreated after scrolling out of this SDK's existing bounded redisplay/settle window gets
  a fresh ad, by design (spec.md Assumptions).
