---

description: "Task list for Originate and Attach a Visitor Session Identifier"
---

# Tasks: Originate and Attach a Visitor Session Identifier

**Input**: Design documents from `/specs/008-originate-a-client-side/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required for every layer change, per Constitution Principle III.

**Organization**: US1 (persisted across page loads) and US2 (shared across one page load's
requests) are delivered by the same underlying mechanism — one utility, originated once per page
load and threaded as a single value — so both land together in Foundational; their own phases
each add the test coverage that specifically proves that user story's guarantee. US3 (Fail-Silent
degradation) is, like every prior feature's equivalent story in this codebase, largely a side
effect of the design itself — its phase adds dedicated, explicit test coverage proving that, not
new production code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)

## Path Conventions

Single project (unchanged): `src/` and `tests/unit/` at repository root.

No new dependency. One new file (`src/utils/sessionId.ts`) plus its test; every other task extends
an existing file.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The utility and threading every user story depends on.
**No user story work can begin until this phase is complete.**

- [X] T001 Create `src/utils/sessionId.ts`: export `SessionStorageLike` (`getItem`/`setItem`) and
      `getOrCreateSessionId(storage, randomUUIDImpl)` (data-model.md) — reads `storage.getItem`
      under a well-known private key; if non-empty, returns it; otherwise calls `randomUUIDImpl()`
      (if present), persists it via `storage.setItem`, and returns it. Returns `undefined` when
      `storage`/`randomUUIDImpl` is absent, the stored value is empty, or any step throws (one
      try/catch around the whole body — research.md Decision 4). Create
      `tests/unit/utils/sessionId.test.ts` covering: no stored value + generator present →
      generates and persists (US1); stored value present → returned as-is, generator/setItem never
      called (US1); no `randomUUIDImpl` → `undefined`, `setItem` never called (US3); `getItem`
      throws → `undefined` (US3); `setItem` throws → `undefined` (US3); empty-string stored value
      → treated as absent, freshly generated (Edge Case).
      **Verified**: 7/7 tests pass.
- [X] T002 Extend `src/types.ts`: add `sessionId?: string` to `AdDecisionRequest` (data-model.md).
      No parsing change needed elsewhere — `adDecisionClient.ts`'s `buildQueryString` already
      needs its own edit (T003) to actually send it.
      **Verified**: `npm run typecheck` clean.
- [X] T003 Extend `src/client/adDecisionClient.ts`'s `buildQueryString`: append `sessionId` to the
      query string when present, same `if (request.sessionId)` pattern as `country`/`deviceType`
      (contracts/ad-decision-request-delta.md). Update
      `tests/unit/client/adDecisionClient.test.ts`: a request with `sessionId` produces a query
      string that includes it; a request without it produces the identical query string as before
      this feature. Depends on T002.
      **Verified**: 16/16 tests pass (15 original + 1 new).
- [X] T004 [P] Extend `src/utils/buildTrackingUrl.ts`: add `sessionId?: string` to its `params`
      type, appended to the query string only when present — identical treatment to `impressionId`
      (data-model.md). Update `tests/unit/utils/buildTrackingUrl.test.ts`: a call with `sessionId`
      includes it in the built URL; a call without it (or with `sessionId: ""`) produces the
      identical URL as before this feature.
      **Verified**: 9/9 tests pass (5 original + 4 new).
- [X] T005 Extend `src/client/viewableImpressionClient.ts`: add `sessionId?: string` to
      `ViewableImpressionReport`, forwarded into its `buildTrackingUrl` call
      (contracts/tracking-requests-delta.md). Update
      `tests/unit/client/viewableImpressionClient.test.ts`: a report with `sessionId` produces a
      beacon/fetch URL that includes it; a report without it is unchanged from before this
      feature. Depends on T004.
      **Verified**: 12/12 tests pass (10 original + 2 new).
- [X] T006 Extend `src/renderer/adRenderer.ts`: add a `sessionId?: string` 4th parameter to
      `renderAd`, forwarded through `resolveClickHref` into its `buildTrackingUrl` call
      (data-model.md, contracts/tracking-requests-delta.md). Update
      `tests/unit/renderer/adRenderer.test.ts`: `renderAd` called with a `sessionId` produces a
      click `href` that includes it; called without one produces the identical `href` as before
      this feature. Depends on T004.
      **Verified**: 45/45 tests pass (43 original + 2 new).
- [X] T007 Extend `src/orchestrator/adOrchestrator.ts`: add `sessionId?: string` to
      `AdOrchestratorDeps`; forward it into every `client.requestAd({...slot.config, sessionId})`
      call, every `trackingClient.reportViewableImpression({..., sessionId})` call, and every
      `renderer.renderAd(..., sessionId)` call (both the initial-render and redisplay call sites —
      data-model.md). Update `tests/unit/orchestrator/adOrchestrator.test.ts`: an orchestrator
      created with `sessionId: "s-1"` produces `requestAd`/`reportViewableImpression`/`renderAd`
      calls that all include it; one created without `sessionId` behaves identically to today.
      Depends on T002, T003, T005, T006.
      **Verified**: required updating two pre-existing exact positional-argument assertions on
      `renderer.renderAd` (they now receive an explicit trailing `undefined` 4th argument, which
      Jest's `toHaveBeenCalledWith` does not ignore the way it ignores an `undefined`-valued object
      property) — not anticipated at tasks-generation time. 41/41 tests pass after that fix (39
      original, 2 fixed).
- [X] T008 Extend `src/index.ts`'s `main()`: call `getOrCreateSessionId(window.sessionStorage,
      typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID.bind(window.crypto)
      : undefined)` (research.md Decisions 2–3) and pass the result into
      `createAdOrchestrator({ ..., sessionId })`. Wrapped by `main()`'s existing top-level
      try/catch (already present for the rest of this function) — no new one needed. Depends on
      T001, T007.
      **Verified**: `npm run typecheck` clean; `npm run build` compiles and the built bundle
      contains both the guarded `crypto?.randomUUID` check and the bound `crypto.randomUUID` call,
      never an unguarded access.

**Checkpoint**: Foundation ready — user story test coverage can now be added/confirmed.

---

## Phase 2: User Story 1 - A visitor's activity across separate page loads in one visit is attributed to the same session (Priority: P1) 🎯 MVP

**Goal**: The same session identifier is read back on a second page load rather than a new one
being minted.

**Independent Test**: Run `getOrCreateSessionId` twice against the same underlying fake storage,
confirm the second call returns the first call's value.

- [X] T009 [US1] Confirm (already added in T001) `tests/unit/utils/sessionId.test.ts` covers both
      halves of this story explicitly: a call with nothing stored originates and persists
      (Acceptance Scenario 2); a subsequent call with that value now "stored" (the fake's
      `getItem` returning it) reads it back unchanged, never regenerating (Acceptance Scenario 1).
      Depends on T001.
      **Verified**: already implemented as part of T001's two "US1" tests — confirmed present and
      passing.

**Checkpoint**: User Story 1 is functional and independently testable (quickstart.md Scenarios
1–2).

---

## Phase 3: User Story 2 - Every ad request on one page load shares the same session identifier (Priority: P1)

**Goal**: Two ad slots on the same page produce requests/reports/click URLs carrying the identical
session identifier.

**Independent Test**: Run the Orchestrator with two tracked slots and a fixed `sessionId`, confirm
every resulting `requestAd`/`reportViewableImpression`/`renderAd` call carries that same value.

**Note**: Mechanically guaranteed by T007's design (one value read once, forwarded everywhere) —
this phase's job is the dedicated multi-slot test proving it, not new production code.

- [X] T010 [US2] Add a `tests/unit/orchestrator/adOrchestrator.test.ts` case with two tracked
      slots (two different `platformId`/`adTypeId` groups), a fixed `sessionId` on the
      orchestrator's deps, a `viewabilityDetector` fake that fires viewable for one slot's ad, and
      a `renderer` fake whose `renderAd` calls are inspectable. Assert both `client.requestAd`
      calls, the `trackingClient.reportViewableImpression` call, and the `renderer.renderAd` call
      all carry the identical `sessionId`. Depends on T007.
      **Verified**: 43/43 tests pass (41 + this new case).

**Checkpoint**: User Stories 1 and 2 both verified (quickstart.md Scenario 3).

---

## Phase 4: User Story 3 - Ad serving and tracking keep working exactly as before when no session identifier is available (Priority: P2)

**Goal**: Prove, not just assert, that an unavailable/throwing storage or missing
`crypto.randomUUID` never blocks or alters ad serving/rendering/tracking.

**Independent Test**: Simulate storage throwing on every access; confirm ad requests, rendering,
clicks, and viewable-impression reports still happen exactly as before, only without a
`sessionId`.

**Note**: Like every prior feature's equivalent story here, most of the production code already
exists — `getOrCreateSessionId`'s single try/catch (T001) and every downstream call site's
existing optional-field handling (T003–T007) already implement this. This phase's job is dedicated
test coverage.

- [X] T011 [US3] Confirm (or add, if not already present from T001) explicit
      `tests/unit/utils/sessionId.test.ts` coverage for: `getItem` throwing → `undefined`;
      `setItem` throwing → `undefined`; `randomUUIDImpl` undefined with nothing stored →
      `undefined`, `setItem` never called. Depends on T001.
      **Verified**: already implemented as part of T001's "US3 — Fail-Silent degradation" describe
      block — confirmed present and passing (plus a fourth case, storage entirely absent, beyond
      what was originally scoped).
- [X] T012 [US3] Add a `tests/unit/orchestrator/adOrchestrator.test.ts` case with
      `sessionId: undefined` on the orchestrator's deps (simulating T001's degrade-to-absent
      outcome). Assert ad requests are still made, the ad still renders, and
      click/viewable-impression tracking still fire exactly as they do in this file's pre-existing
      "no sessionId" baseline — i.e., confirm this is genuinely a no-op path, not a new one.
      Depends on T007.
      **Verified**: included in the same commit as T010 (both added to the new "visitor session
      identifier threading" describe block) — 43/43 tests pass.

**Checkpoint**: All three user stories verified (quickstart.md Scenarios 4–6).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T013 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      repository.
      **Verified**: 159/159 tests, lint, and typecheck all clean.
- [X] T014 [P] Run `npm run build` and confirm the built bundle still loads/executes in this
      repo's existing manual-check setup (if one exists), otherwise confirm the build step itself
      completes without error and the output still references `sessionStorage`/`crypto` only
      through the guarded, optional-chained form (no unguarded access that would throw in an
      environment lacking either).
      **Verified**: `npm run build` compiles; this repo has no manual-check/demo-page setup, so
      confirmed via `grep` on the built bundle instead — both `crypto?.randomUUID` (the guard) and
      `crypto.randomUUID` (the bound call, only reached after the guard passes) are present, no
      unguarded access.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS all user stories. Internally sequential:
  T001 → T002/T004 [P] → T003/T005/T006 → T007 → T008.
- **User Story 1 (Phase 2)**: Depends on Foundational (T001). Independently testable without T002–
  T008.
- **User Story 2 (Phase 3)**: Depends on Foundational (T007, which itself depends on T001–T006).
- **User Story 3 (Phase 4)**: Depends on Foundational (T001, T007) — adds coverage, not new
  production code.
- **Polish (Phase 5)**: Depends on all of Phases 1–4.

### Parallel Opportunities

- T002 and T004 [P] once T001 is done — different files, no shared dependency.
- T005 and T006 [P] once T004 is done — different files.
- T013, T014 (Polish) in parallel.

---

## Implementation Strategy

### MVP First (Foundational + User Story 1 Only)

1. Complete Phase 1: Foundational (the utility exists and is wired everywhere, even before its
   multi-slot/degrade guarantees have dedicated tests).
2. Complete Phase 2: User Story 1's dedicated test coverage.
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1–2.
4. This alone delivers SC-001 for the origination mechanism itself.

### Incremental Delivery

1. Foundational → utility exists, threaded everywhere.
2. User Story 1 → validate → persistence across page loads proven.
3. User Story 2 → validate → same-page-load sharing proven.
4. User Story 3 → validate → Fail-Silent degradation proven.
5. Polish → lint/typecheck/test/build clean.

## Follow-ups (explicitly out of scope for this feature)

- **`POST /ads/batch`**: this SDK has no batch-decision client to extend (research.md Decision 6).
- **Cross-tab/cross-device session concepts**: explicitly out of scope (spec.md Assumptions) —
  `sessionStorage`'s own single-tab lifetime is the entire session boundary this feature uses.
