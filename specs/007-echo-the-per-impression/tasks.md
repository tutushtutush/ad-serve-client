---

description: "Task list for Echo the Per-Impression Idempotency Key on Tracking Reports"
---

# Tasks: Echo the Per-Impression Idempotency Key on Tracking Reports

**Input**: Design documents from `/specs/007-echo-the-per-impression/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required for every API Client/Renderer/Orchestrator change, per Constitution Principle III.

**Organization**: US1 (click) and US2 (viewable-impression) are independent send sites that both
depend on the same two foundational pieces — `AdCandidate.impressionId` (the field itself) and
`buildTrackingUrl`'s new optional parameter (the shared plumbing both send sites use). US3
(degrade-safe fallback) adds no new production code of its own; it's regression coverage proving
`impressionId` never becomes a new gating condition on top of US1/US2's changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)

## Path Conventions

Single project (unchanged): extends `src/types.ts`, `src/utils/buildTrackingUrl.ts`,
`src/renderer/adRenderer.ts`, `src/client/viewableImpressionClient.ts`,
`src/orchestrator/adOrchestrator.ts` and their existing test files — no new files, no new
dependencies.

No Setup phase — no new package dependency, no new module.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The field and the shared plumbing every later task builds on. **No user story work
can begin until this phase is complete.**

- [X] T001 Add `impressionId?: string` to the `AdCandidate` interface in `src/types.ts`, per
      data-model.md, alongside the existing `adConfigId?: string`.
- [X] T002 [P] Add tests in `tests/unit/utils/buildTrackingUrl.test.ts` for the new optional
      `impressionId` parameter: (a) when provided, the built URL's query string includes
      `impressionId=<value>` alongside the existing three params; (b) when omitted/`undefined`,
      the built URL is byte-identical to today's output (no `impressionId` key at all, not even
      empty). Write these first so they fail against the current implementation.
- [X] T003 Extend `buildTrackingUrl` in `src/utils/buildTrackingUrl.ts` (depends on T002): change
      its `params` type to `{ platformId: string; adTypeId: string; adConfigId: string;
      impressionId?: string }`, build the `URLSearchParams` from the three required fields first,
      then conditionally `.set("impressionId", params.impressionId)` only when it's a non-empty
      string, per research.md Decision 5.

**Checkpoint**: Foundation ready — `AdCandidate` can carry `impressionId`, and both send sites'
shared URL builder can forward it. US1 and US2 implementation can now proceed independently.

---

## Phase 2: User Story 1 - A double-clicked ad only counts one click (Priority: P1) 🎯 MVP

**Goal**: The click-tracking URL this SDK builds includes the serving's `impressionId` whenever
one is available, so ad-serve-api's own dedup (already shipped) actually applies to this SDK's
click reports.

**Independent Test**: quickstart.md Scenario 1 — render an `AdCandidate` with `impressionId` set
and confirm the rendered markup's `href` query string includes it.

### Tests for User Story 1

- [X] T004 [P] [US1] Add a test in `tests/unit/renderer/adRenderer.test.ts`: a clickable
      `AdCandidate` with both `adConfigId` and `impressionId` set produces a click `href` whose
      query string includes `impressionId=<the same value>` (quickstart.md Scenario 1).
- [X] T005 [P] [US1] Add a test in `tests/unit/renderer/adRenderer.test.ts`: a clickable
      `AdCandidate` with `adConfigId` set but `impressionId` absent produces a click `href`
      byte-identical to today's pre-feature output — no `impressionId` param at all (quickstart.md
      Scenario 4, click side).
- [X] T006 [P] [US1] Add a test in `tests/unit/renderer/adRenderer.test.ts` mirroring the existing
      "non-string `adConfigId` degrades safely" regression test: a schema-drifted `AdCandidate`
      with a non-string `impressionId` (e.g. a number or object) produces a click `href` with no
      `impressionId` param — never a stringified garbage value (quickstart.md Scenario 5).

### Implementation for User Story 1

- [X] T007 [US1] Update `resolveClickHref` in `src/renderer/adRenderer.ts` (depends on T001, T003,
      and should be checked against T004–T006): add an `impressionId: unknown` parameter, coerce
      it via the existing `asSafeString()` helper (same treatment as `adConfigId`), and pass the
      result through to `buildTrackingUrl`'s new `impressionId` field only when non-empty. Update
      the call site at `resolveClickHref(safeHref, ad.adConfigId, placement, apiBaseUrl)` to also
      pass `ad.impressionId`.

**Checkpoint**: User Story 1 is fully functional and independently testable — click-tracking URLs
now carry `impressionId` end-to-end.

---

## Phase 3: User Story 2 - A duplicate viewable-impression report only counts once (Priority: P1)

**Goal**: The viewable-impression report this SDK sends includes the serving's `impressionId`
whenever one is available, and a redisplay of the same ad reuses the original `impressionId`
rather than fabricating a new one.

**Independent Test**: quickstart.md Scenarios 2 and 3 — trigger a viewable-impression report for
a slot whose `AdCandidate` has `impressionId` set, and confirm the report carries it; confirm a
redisplayed instance's report reuses the same value.

### Tests for User Story 2

- [X] T008 [P] [US2] Add tests in `tests/unit/client/viewableImpressionClient.test.ts`: (a) a
      report with `impressionId` set produces a request URL whose query string includes it; (b) a
      report with `impressionId` omitted produces a request URL byte-identical to today's
      pre-feature output.
- [X] T009 [P] [US2] Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`: a slot whose
      resolved `AdCandidate` includes `impressionId`, with a fake `viewabilityDetector` that
      immediately reports viewable, results in `trackingClient.reportViewableImpression` being
      called with `impressionId` matching the decision response's value (quickstart.md Scenario
      2).
- [X] T010 [P] [US2] Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`, extending the
      existing redisplay test setup (feature 006): after a genuine removal-and-redisplay within
      the slot's redisplay budget, the viewable-impression report produced for the *redisplayed*
      instance carries the identical `impressionId` as the original serving — confirming no new
      identifier is ever minted client-side on redisplay (quickstart.md Scenario 3).

### Implementation for User Story 2

- [X] T011 [US2] Add `impressionId?: string` to the `ViewableImpressionReport` interface in
      `src/client/viewableImpressionClient.ts` (depends on T003) and forward it to
      `buildTrackingUrl`'s new `impressionId` field in `reportViewableImpression`.
- [X] T012 [US2] Update `ViewableImpressionClientLike.reportViewableImpression`'s parameter type
      in `src/orchestrator/adOrchestrator.ts` to include the new optional `impressionId` field
      (depends on T011), and update `startViewabilityWatch`'s `onViewable` callback to pass
      `asSafeString(slot.ad?.impressionId)` alongside the existing `platformId`/`adTypeId`/
      `adConfigId` fields. No change needed to redisplay handling itself — `slot.ad` (and
      therefore `slot.ad.impressionId`) already survives redisplay unchanged (research.md
      Decision 3), so T010's test should pass once this task reads from the same retained object.

**Checkpoint**: User Stories 1 AND 2 both work independently — every tracking report this SDK
produces now carries `impressionId` when available.

---

## Phase 4: User Story 3 - Tracking keeps working when no identifier is available (Priority: P2)

**Goal**: Confirm `impressionId`'s introduction changes nothing about whether tracking happens —
only whether the extra parameter is present.

**Independent Test**: quickstart.md Scenario 6 — an `AdCandidate` with `impressionId` present but
`adConfigId` absent must still produce today's exact fallback behavior (no click-tracking URL, no
viewable-impression report).

### Tests for User Story 3

- [X] T013 [P] [US3] Add a test in `tests/unit/renderer/adRenderer.test.ts`: an `AdCandidate` with
      `impressionId` set but `adConfigId` absent still falls back to the direct `safeHref` (or no
      href, if unlinked) exactly as today — `impressionId` alone never triggers building a click
      URL (quickstart.md Scenario 6, click side).
- [X] T014 [P] [US3] Add a test in `tests/unit/orchestrator/adOrchestrator.test.ts`: a slot whose
      `AdCandidate` has `impressionId` set but `adConfigId` absent never calls
      `trackingClient.reportViewableImpression` — matching today's existing "no adConfigId, no
      report" behavior (quickstart.md Scenario 6, viewable-impression side).

**No implementation tasks** — by construction, T007 and T012 only ever add `impressionId` to a
request that was already going to be built/sent; the `adConfigId`/`apiBaseUrl` gating that decides
*whether* to build/send is untouched (FR-006). These tests exist purely to prove that guarantee
holds after US1/US2 land.

**Checkpoint**: All three user stories are independently verified — the feature is complete.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the whole feature.

- [X] T015 [P] Run `npm run lint` and `npm run typecheck`; fix any issues surfaced by the new
      `impressionId` field/parameter threading.
- [X] T016 Run `npm test` (full suite) and confirm every test — new and pre-existing — passes.
- [X] T017 Walk through quickstart.md's six scenarios against the finished implementation and
      confirm each matches its stated expectation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — start immediately. BLOCKS all user stories.
- **User Story 1 (Phase 2)**: Depends on Foundational. No dependency on US2 or US3.
- **User Story 2 (Phase 3)**: Depends on Foundational. No dependency on US1 or US3 — can be built
  in parallel with Phase 2 by a different contributor.
- **User Story 3 (Phase 4)**: Depends on US1 (T007) and US2 (T012) having landed, since its tests
  assert on their combined behavior (both send sites' unchanged gating). Purely test-only.
- **Polish (Phase 5)**: Depends on all prior phases.

### Within Each User Story

- Tests (T004–T006, T008–T010, T013–T014) are written first and should fail against
  pre-implementation code.
- Implementation (T007, T011–T012) follows, making its story's tests pass.

### Parallel Opportunities

- T002 (buildTrackingUrl tests) can be written in parallel with T001 (types.ts) — different
  files — but T003's implementation depends on both existing first.
- Once Phase 1 completes, Phase 2 (US1) and Phase 3 (US2) touch entirely different files
  (`adRenderer.ts`/its test vs. `viewableImpressionClient.ts`+`adOrchestrator.ts`/their tests) and
  can proceed fully in parallel.
- Within Phase 2: T004, T005, T006 are all in the same file (`adRenderer.test.ts`) but
  independent test cases — parallelizable as separate edits if desired, though same-file
  contention makes true concurrent execution impractical for a single contributor.
- Within Phase 3: T008 (different file) can run in parallel with T009/T010 (same file as each
  other).

---

## Parallel Example: Foundational + User Story 1/2 kickoff

```bash
# Phase 1, in parallel:
Task: "Add impressionId?: string to AdCandidate in src/types.ts"                     # T001
Task: "Add buildTrackingUrl tests for optional impressionId param"                   # T002

# After Phase 1 completes, Phase 2 and Phase 3 in parallel:
Task: "US1: adRenderer click-URL tests + resolveClickHref implementation"            # T004-T007
Task: "US2: viewableImpressionClient + adOrchestrator tests and implementation"      # T008-T012
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational.
2. Complete Phase 2: User Story 1 (click-tracking dedup).
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1, 4 (click side), and 5.
4. This alone lets ad-serve-api's existing click dedup start working for this SDK's traffic.

### Incremental Delivery

1. Foundational → Phase 2 (US1) → validate → this is already a shippable, independently valuable
   increment.
2. Add Phase 3 (US2) → validate → viewable-impression dedup now also works.
3. Add Phase 4 (US3) → validate → regression coverage confirms nothing else changed.
4. Phase 5 → full-suite confirmation before merge.

## Notes

- [P] tasks touch different files or independent test cases with no dependency on an incomplete
  task.
- Constitution Principle III requires unit tests for every Orchestrator/API Client/Renderer
  change — every implementation task above has corresponding test tasks before it.
- Per the project's PR-before-merge convention: open a PR from `007-echo-the-per-impression`
  against `main` and get it reviewed before merging, matching every prior feature in this repo.
