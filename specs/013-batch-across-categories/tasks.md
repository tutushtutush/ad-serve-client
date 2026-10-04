---

description: "Task list for 013-batch-across-categories"
---

# Tasks: One batch per scan across categories

**Tests**: REQUIRED (Constitution III). Write each test first and watch it fail.

Paths are relative to the `ad-serve-client` repository root.

## Phase 1: Setup

- [ ] T001 On branch `013-per-slot-category-in`, run `npm ci && npm run typecheck && npm run lint && npm test` and note the passing baseline.

## Phase 2: User Story 1 - Slots in different categories share one batch (P1) 🎯 MVP

- [ ] T002 [P] [US1] Update and add failing tests in `tests/unit/client/adDecisionClient.test.ts`: `requestAdBatch` writes each request's `category` on its placement (omitting it when absent); sends the top-level `category` only when `shared.category` is given; never sends `dedupeFallback`.
- [ ] T003 [US1] In `src/client/adDecisionClient.ts` write each placement's `category` and keep the shared-field handling. Make T002 pass.
- [ ] T004 [P] [US1] Update `tests/unit/orchestrator/adOrchestrator.batch.test.ts` (failing first): music, comedy and sports slots in one scan make one `requestAdBatch` call whose requests carry their own categories; slots with no own category carry the page category; a slot with none carries none; each slot renders its own entry's ad.
- [ ] T005 [US1] In `src/orchestrator/adOrchestrator.ts` group slots by country and device type only, put each slot's resolved category on its request, and pass a shared category only when all placements share it. Make T004 pass.

## Phase 3: User Story 2 - Shared details still split batches (P1)

- [ ] T006 [P] [US2] Add failing orchestrator tests: slots differing in country or device type make separate batches; slots sharing both but differing in category and ad type share one; more than 50 slots split into chunks.
- [ ] T007 [US2] Fix anything T006 exposes. Make T006 pass.

## Phase 4: User Story 3 - Fallback and compatibility unchanged (P1)

- [ ] T008 [P] [US3] Add tests: a null or throwing batch makes every slot request itself; one `failed` entry falls back alone; a batch whose placements share a category passes it as `shared.category`; a mixed batch passes none; spec 012's other scenarios still pass.
- [ ] T009 [US3] Fix anything T008 exposes.

## Phase 5: User Story 4 - Large batches get enough time (P2)

- [ ] T010 [P] [US4] Add failing client tests with fake timers: a batch of ten placements is not aborted at the single-request limit but is aborted at its scaled limit; the scaled limit is capped; a single request keeps its limit.
- [ ] T011 [US4] Add a small helper in `src/client/adDecisionClient.ts` computing the batch limit (`base + 250 ms * (n - 1)`, capped at the larger of 10 s and `base`) and use it for `requestAdBatch`. Make T010 pass.

## Phase 6: Polish and release

- [ ] T012 [P] Update `specs/001-loader-and-first/contracts/ad-decision-client-contract.md` to describe per-placement categories and the new grouping, pointing at `specs/013-batch-across-categories/contracts/batch-request.md`.
- [ ] T013 Run `npm run typecheck && npm run lint && npm test && npm run build`; confirm all spec 012 scenarios pass (adjusted for the new grouping).
- [ ] T014 After merge: bump `package.json` and the lockfile to 1.6.0, tag `v1.6.0`, and bump the `ad-serve-client` pin in ad-serve-api (separate PR there).

## Order

T001, then US1 (MVP), then US2, US3, US4, then polish. One PR; commit per phase. T014 happens after the PR merges.
