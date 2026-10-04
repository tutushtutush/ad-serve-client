# Tasks: Responsive ad types per breakpoint

**Input**: Design documents from `/specs/011-responsive-ad-types/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/responsive-ad-types-api.md

**Tests**: Included. The constitution (Principle III) requires unit tests for every Orchestrator change.

**Organization**: Grouped by user story. Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)

## Phase 1: Setup

- [ ] T001 Confirm a clean baseline on branch `011-responsive-ad-types`: run `npm ci`, then `npm run typecheck`, `npm run lint` and `npm test`; all must pass before any change

---

## Phase 2: Foundational (blocks all stories)

- [ ] T002 [P] Create `src/utils/breakpointList.ts`: pure `parseBreakpointList(raw)` turning `"0:a,768:b"` into entries of whole-number minimum width ≥ 0 and non-blank value (trimmed, malformed entries dropped, split at the first colon), and pure `pickByBreakpoint(entries, width)` returning the value with the largest minimum width ≤ width, first listed on ties, or undefined; add `tests/unit/utils/breakpointList.test.ts` covering boundaries, ties, order, malformed input and empty input (research Decisions 3-4)
- [ ] T003 [P] Create `src/utils/viewportWidth.ts`: pure `readViewportWidth(win)` returning `win.innerWidth` when it is a finite number ≥ 0, else 0, and never throwing even if reading it throws; add `tests/unit/utils/viewportWidth.test.ts` (research Decision 6)
- [ ] T004 Add optional `declaredAdTypeId` and `declaredAdTypes` (the raw attribute text) to `AdSlotConfig` in `src/types.ts`, used only for slot identity
- [ ] T005 Add an optional `getViewportWidth?: () => number` dependency to `AdOrchestratorDeps` in `src/orchestrator/adOrchestrator.ts` (default: always 0), and give the exported `parseSlotConfig(element, viewportWidth = 0)` its second parameter, without changing behavior yet

**Checkpoint**: shared pieces compile; no behavior change; existing tests still pass.

---

## Phase 3: User Story 1 - One slot, the right size for each screen (P1) 🎯 MVP

**Goal**: a slot's `data-ad-types` picks the ad type for the screen width at discovery.

**Independent Test**: same slot at 390px, 768px, 900px and 1280px requests the expected type each time.

- [ ] T006 [P] [US1] Create `tests/unit/orchestrator/adOrchestrator.responsive.test.ts` using the injected fakes from the existing orchestrator tests: with `getViewportWidth` returning 390 the request carries the phone type; 1280 the desktop type; exactly 768 picks the 768 entry; with entries at 0, 768 and 1024 a width of 900 picks 768
- [ ] T007 [US1] In `parseSlotConfig` in `src/orchestrator/adOrchestrator.ts`, read `data-ad-types`, parse and pick with T002, and set `adTypeId` to the pick; thread the width from `getViewportWidth` through `groupDiscoveredSlots` so each newly discovered slot is resolved once
- [ ] T008 [US1] In `src/index.ts`, pass `getViewportWidth: () => readViewportWidth(window)` (T003) when creating the orchestrator

**Checkpoint**: US1 works end to end and is demonstrable on its own.

---

## Phase 4: User Story 2 - Existing single-type slots keep working (P1)

**Goal**: slots without a list are unchanged, and the single type is the fallback.

**Independent Test**: the entire existing test suite passes unchanged, plus precedence scenarios.

- [ ] T009 [P] [US2] Extend `tests/unit/orchestrator/adOrchestrator.responsive.test.ts`: a slot with only `data-ad-type-id` requests that type at any width; with both attributes a usable list wins; with both and a list that yields nothing, `data-ad-type-id` is used
- [ ] T010 [US2] In `parseSlotConfig` in `src/orchestrator/adOrchestrator.ts`, apply the precedence from data-model.md: usable list first, else `data-ad-type-id`, else the slot is invalid (return null); confirm existing `parseSlotConfig` tests pass untouched

**Checkpoint**: US1 and US2 both pass.

---

## Phase 5: User Story 3 - Reports match the ad that was shown (P1)

**Goal**: the resolved type is used for rendering, clicks and views, and survives resizes and element replacement.

**Independent Test**: at each width the render, click and viewable reports carry the resolved type; resizing causes no new request; a replaced element keeps its ad.

- [ ] T011 [P] [US3] Extend `tests/unit/orchestrator/adOrchestrator.responsive.test.ts`: the renderer placement and the viewable-impression report carry the resolved type; changing the injected width after discovery causes no new request and no change; replacing the slot element after the width changed still renders once into the replacement with a single request (FR-008, FR-009)
- [ ] T012 [US3] In `src/orchestrator/adOrchestrator.ts` set `declaredAdTypeId` and `declaredAdTypes` from the raw attributes in `parseSlotConfig`, and build `makeGroupKey` from them instead of the resolved `adTypeId`, so identity is independent of screen width while the tracked slot keeps its frozen `config.adTypeId` (research Decision 2)

**Checkpoint**: reporting and identity are correct across resize and replacement.

---

## Phase 6: User Story 4 - Mistakes never break the page (P2)

**Goal**: bad input is ignored safely.

**Independent Test**: malformed lists, no usable entry, and a screen narrower than every minimum all behave per the spec with no errors.

- [ ] T013 [P] [US4] Extend `tests/unit/orchestrator/adOrchestrator.responsive.test.ts`: a list with a malformed entry still uses the valid entry; no usable entry and no `data-ad-type-id` makes no request and does not throw; a width narrower than every minimum with no fallback makes no request; a throwing or non-numeric width source is treated as 0
- [ ] T014 [US4] Make any gap found by T013 pass in `src/orchestrator/adOrchestrator.ts` or `src/utils/breakpointList.ts` (the pieces from T002 and T007 should already cover most of it)
- [ ] T015 [US4] Manual: `npm run build`, serve a throwaway plain HTML page (not committed) with the loader snippet and a `data-ad-types` slot, and run quickstart.md sections 2 to 4 at two widths with the ad API stubbed (as was done for feature 010)

---

## Phase 7: Polish

- [ ] T016 Grep `src/` to confirm no framework reference was introduced (FR-011) and that `adDecisionClient.ts` and `adRenderer.ts` are unchanged (FR-010)
- [ ] T017 Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`; all must pass with existing tests unchanged (FR-012); then bump `package.json` and the lockfile version to 1.4.0
- [ ] T018 Open a PR to `main` for review; after merge the owner tags v1.4.0 (tag pushes fail from the cloud session's git proxy), then bump the pin in ad-serve-api

---

## Dependencies & Order

- T001, then Phase 2 (T002 and T003 in parallel, then T004, then T005), then US1 to US4.
- US1 first (MVP). US2 builds on T007 in the same function. US3 needs US1 and T004. US4's tests can start after US1.
- Within a story: tests (marked P) first and failing, then implementation. T007, T010, T012 and T014 all edit `adOrchestrator.ts`, so they run in order, not in parallel.

## Implementation Strategy

MVP is Phase 3 (one slot, right size per screen). Ship US1 to US3 together, since reporting must match the type shown before this goes live; US4 hardens it. Re-requesting on resize and scale-to-fit are out of scope (research Decision 7).
