---

description: "Task list for 012-batch-ad-requests"
---

# Tasks: Batched ad requests with same-page deduplication

**Input**: `/specs/012-batch-ad-requests/` (plan.md, spec.md, research.md, data-model.md, contracts/batch-request.md,
quickstart.md)

**Tests**: REQUIRED (Constitution III). Write each test first and watch it fail.

**Organization**: Grouped by user story; every task leaves `npm run typecheck`, `npm run lint` and `npm test` green.

## Format: `[ID] [P?] [Story] Description`

Paths are relative to the `ad-serve-client` repository root.

---

## Phase 1: Setup

- [X] T001 On branch `012-batch-ad-requests`, run `npm ci && npm run typecheck && npm run lint && npm test` and note the passing baseline.

## Phase 2: Foundational (blocks all stories)

- [X] T002 [P] Write failing tests in `tests/unit/client/adDecisionClient.test.ts` for `requestAdBatch`: it POSTs JSON to `/ads/batch` with the placements, shared fields and `dedupe: true` (omitting absent fields, never sending `dedupeFallback`); maps `found` to filled, `no-ad`/`not-found` to empty, `error`/`invalid` to failed; returns `null` for a network error, timeout, non-OK status, malformed body, wrong length, or echoed ids that differ.
- [X] T003 Add `BatchEntryResult` to `src/types.ts` and implement `requestAdBatch` in `src/client/adDecisionClient.ts` (widen `FetchLike`'s init with optional `method`, `headers`, `body`). Make T002 pass.
- [X] T004 [P] Write failing tests in `tests/unit/utils/groupSlotsForBatch.test.ts`: slots group by `[category, country, deviceType]`, preserve discovery order, differ in platform id/ad type within one group, and chunk at 50.
- [X] T005 Implement `src/utils/groupSlotsForBatch.ts` (pure, generic over the slot type, takes a key function and a chunk size). Make T004 pass.

## Phase 3: User Story 1 - Slots on one page get different ads (P1) 🎯 MVP

**Independent test**: three same-type same-category slots in one scan send one batch with dedupe on, and each slot shows its entry's ad.

- [ ] T006 [P] [US1] Write failing tests in `tests/unit/orchestrator/adOrchestrator.batch.test.ts`: three slots in one `run()` call `requestAdBatch` once with three requests and the shared category and session id, and no `requestAd`; each slot renders its own entry's ad; a `no-ad` entry leaves its slot empty without a `requestAd`; a single slot uses `requestAd` only.
- [ ] T007 [US1] In `src/orchestrator/adOrchestrator.ts`, split `runSlot` into requesting and a shared `applyResult(slot, result)`, add `requestAdBatch?` to `AdDecisionClientLike`, and in `run()` group slots with `groupSlotsForBatch` (key uses `resolveCategory`), calling `runBatch` for groups of two or more and `runSlot` for groups of one. Make T006 pass.

## Phase 4: User Story 2 - Different details batch separately (P1)

- [ ] T008 [P] [US2] Add failing orchestrator tests: music and comedy slots make two batches each carrying only its own category; slots with no own category use the page category (set via `setContext`) and group with slots that declare that same category; different ad types with the same category share a batch; differing country or device type split batches; a scan of 51 same-category slots makes one batch of 50 and one single request for the remaining slot.
- [ ] T009 [US2] Fix anything T008 exposes in grouping/chunking in `src/orchestrator/adOrchestrator.ts`. Make T008 pass.

## Phase 5: User Story 3 - A failed batch never leaves slots worse off (P1)

- [ ] T010 [P] [US3] Add failing orchestrator tests: `requestAdBatch` returning `null` (and throwing) makes every slot call `requestAd` and render or stay empty as before; an entry with status `failed` falls back for that slot only while the others keep their batch results; nothing throws to the caller; no slot is left unresolved.
- [ ] T011 [US3] Implement the fallback in `runBatch` (whole-batch null or throw, per-entry failed). Make T010 pass.

## Phase 6: User Story 4 - Everything else keeps working (P2)

- [ ] T012 [P] [US4] Add orchestrator tests: slots claimed by an earlier `run()` are not requested again and new slots in a later `run()` make their own batch; a slot removed while the batch is in flight is dropped without rendering; responsive ad types put each slot's width-chosen type in its placement; a fake client without `requestAdBatch` keeps the single path.
- [ ] T013 [US4] Fix anything T012 exposes. Make T012 pass.

## Phase 7: Polish

- [ ] T014 [P] Update the SDK documentation or contract notes that describe slot requests to mention batching, the grouping rule and the fallback (search `specs/001-loader-and-first/contracts/` and any README for the right place).
- [ ] T015 Run `npm run typecheck && npm run lint && npm test` and confirm every existing test passes unchanged; walk through `quickstart.md` against the tests.

---

## Dependencies & order

Phase 1, then Phase 2, then the stories. US1 is the MVP. US2 to US4 build on the batch path from T007. Polish last.

## Parallel opportunities

T002 with T004 (different files); T006, T008, T010, T012 are each in the same file as their neighbours but in
different phases.

## Implementation strategy

MVP is Phases 1-3 plus the fallback (US3) for safety: do not ship batching without it. Commit per phase; one PR.
