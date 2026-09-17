---

description: "Task list for Ad Slot Request & Render Flow"
---

# Tasks: Ad Slot Request & Render Flow

**Input**: Design documents from `/specs/001-loader-and-first/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required for the Orchestrator/Client/Renderer layers, per Constitution Principle III —
every change to those layers MUST ship with unit tests using an injected fake for its
collaborators. `src/index.ts` (the composition root) and `loader/snippet.js` are intentionally
**not** unit tested, matching the sibling `ad-serve-api`'s `server.ts` convention: both are thin
wiring shells verified instead via quickstart.md's browser-based scenarios.

**Organization**: Tasks are grouped by user story (spec.md priorities) to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)
- Every task names its exact file path(s) and its test file path where applicable

## Path Conventions

Single project (per plan.md): `src/`, `loader/`, and `tests/unit/` at repository root.

---

## Phase 1: Setup

**Purpose**: Project initialization — no feature code yet.

- [ ] T001 Initialize TypeScript project: `package.json` (`build`, `test`, `lint`, `typecheck`
      scripts), `tsconfig.json` (strict mode, ES2017 target, DOM lib), ESLint config
      (`eslint.config.mjs`, typescript-eslint); install `typescript`, `eslint`,
      `typescript-eslint` as dev dependencies.
- [ ] T002 [P] Configure Jest for browser-like unit tests: `jest.config.ts` (`ts-jest` preset,
      `testEnvironment: "jsdom"`); install `jest`, `ts-jest`, `jest-environment-jsdom`,
      `@types/jest`, `@types/node` as dev dependencies.
- [ ] T003 [P] Configure the esbuild bundle: a build script (`scripts/build.mjs`) that bundles
      `src/index.ts` into `dist/ad-serve-client.js` as a single IIFE, wired to `package.json`'s
      `build` script; install `esbuild` as a dev dependency.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story depends on. **No user story work starts before this
phase is complete.**

- [ ] T004 [P] Implement `src/utils/withTimeout.ts`: a generic promise-timeout wrapper with no
      business meaning (used by the Client to satisfy FR-008). Unit tests in
      `tests/unit/utils/withTimeout.test.ts` covering: the wrapped promise resolves before the
      timeout, and it rejects/aborts once the timeout elapses.
- [ ] T005 [P] Implement `src/utils/escapeForMarkup.ts`: generic string escaping for untrusted
      text before HTML interpolation (used by the Renderer, research.md's sandboxed-iframe
      decision). Unit tests in `tests/unit/utils/escapeForMarkup.test.ts` covering `<`, `>`, `&`,
      and quote characters.
- [ ] T006 Implement `src/client/adDecisionClient.ts`: `createAdDecisionClient(fetchImpl)`
      returning `requestAd(request: AdDecisionRequest): Promise<AdDecisionResult>` that builds the
      `GET /ads` query string from `platformId`/`adTypeId`/`country`/`deviceType`, bounds the
      request with `AbortController` + `withTimeout` (T004), and normalizes every outcome —
      `{ad: {...}}`, `{ad: null}`, `404`, `400`, a network error, and a malformed body — to
      `{status: "filled", ad}` or `{status: "empty"}` per
      [contracts/ad-decision-client-contract.md](./contracts/ad-decision-client-contract.md). Unit
      tests in `tests/unit/client/adDecisionClient.test.ts` using a fake `fetch`, covering every
      row of that contract's response-handling table. Depends on T004.
- [ ] T007 Implement slot discovery and config parsing in
      `src/orchestrator/adOrchestrator.ts`: `createAdOrchestrator(...)` scans a given root
      (`document`) for `[data-ad-serve-slot]` elements and reads `data-platform-id`,
      `data-ad-type-id`, `data-country`, `data-device-type` into an `AdSlotConfig`
      (data-model.md); a slot missing `platformId` or `adTypeId` is marked invalid per FR-005.
      Unit tests in `tests/unit/orchestrator/adOrchestrator.test.ts` (using jsdom fragments)
      covering: a valid slot is discovered with its config; a slot missing `data-platform-id` is
      marked invalid; a slot missing `data-ad-type-id` is marked invalid; optional
      `country`/`deviceType` are read when present and omitted when absent.
- [ ] T008 Implement `src/index.ts` composition root: on load, drains `window.adServe.q` (no
      queued commands are defined by this feature beyond triggering slot discovery — see
      [contracts/slot-markup-contract.md](./contracts/slot-markup-contract.md)), constructs the
      Client (T006) and Orchestrator (T007), and runs the discovery pass. No unit test for this
      wiring shell itself (see Tests note above) — verified via quickstart.md. Depends on T006,
      T007.
- [ ] T009 [P] Author `loader/snippet.js`: the hand-authored script (never passed through
      esbuild, per Constitution Principle II) that sets
      `window.adServe = window.adServe || { q: [] }` and appends an async `<script>` tag loading
      the built bundle. No unit test (outside the build) — verified via quickstart.md.

**Checkpoint**: Foundation ready — user story phases below can begin.

---

## Phase 3: User Story 1 - A visitor sees an ad in a designated slot (Priority: P1) 🎯 MVP

**Goal**: A page with one correctly configured ad slot and an available matching ad displays that
ad's creative in the slot.

**Independent Test**: Load a page with a single, correctly configured ad slot against an
ad-serve-api instance known to have a matching ad; confirm the ad's creative appears in the slot
(quickstart.md Scenario 1).

- [ ] T010 [US1] Implement `src/renderer/adRenderer.ts`: `createAdRenderer(documentImpl)`
      returning `renderAd(slotElement, ad)` that builds a sandboxed
      `<iframe sandbox="allow-popups" srcdoc="...">` string from the `AdCreative` fields (escaping
      every text field via `escapeForMarkup`, T005), sets the iframe's `width`/`height` from the
      ad's dimensions, and appends it into `slotElement`. Unit tests in
      `tests/unit/renderer/adRenderer.test.ts` (jsdom) covering: the iframe is appended with the
      narrow `sandbox` attribute and no `allow-scripts`/`allow-same-origin`; creative text fields
      are escaped in the resulting markup; `width`/`height` are applied. Depends on T005.
- [ ] T011 [US1] Wire the "filled" path into `src/orchestrator/adOrchestrator.ts` (T007): for
      each valid slot, call `adDecisionClient.requestAd` (T006); when the result's `status` is
      `"filled"`, call `adRenderer.renderAd` (T010) with the slot element and the ad payload.
      Unit tests added to `tests/unit/orchestrator/adOrchestrator.test.ts` covering: a valid slot
      with a `"filled"` result invokes the renderer with the correct element and ad payload.
      Depends on T006, T007, T010.
- [ ] T012 [US1] Manually verify quickstart.md Scenario 1 against a running ad-serve-api instance
      and the built bundle (T003, T008, T009): the ad becomes visible within 2 seconds and the
      rest of the test page is unaffected.

**Checkpoint**: User Story 1 is fully functional and independently testable.

---

## Phase 4: User Story 2 - The page keeps working when no ad is shown (Priority: P2)

**Goal**: An invalid slot, an unavailable ad, or a failed/timed-out/malformed request all resolve
to an empty slot with no visible error, and the rest of the page is unaffected.

**Independent Test**: Load a page with an ad slot under each failure condition in turn (no ad
available, invalid configuration, request failure/timeout) and confirm the slot stays empty with
no visible error in every case (quickstart.md Scenarios 2–4).

- [ ] T013 [US2] Extend `tests/unit/client/adDecisionClient.test.ts` (T006) to explicitly confirm
      every failure case from
      [contracts/ad-decision-client-contract.md](./contracts/ad-decision-client-contract.md)
      normalizes to `{status: "empty"}`: `{ad: null}`, `404`, `400`, a network error, an aborted
      timeout (using T004's `withTimeout` with a `fetch` fake that never resolves), and an
      unparseable response body. Add any case not already covered. Depends on T006.
- [ ] T014 [US2] Extend `src/orchestrator/adOrchestrator.ts` (T007/T011) so that: (a) a slot
      marked invalid never triggers a call to `adDecisionClient` (FR-005); (b) a `"empty"` result
      leaves the slot untouched, with no DOM change and nothing thrown; (c) before calling the
      renderer for a `"filled"` result, the slot element's `isConnected` is checked and the result
      is discarded (treated as empty) if the slot has left the page (FR-009). Unit tests added to
      `tests/unit/orchestrator/adOrchestrator.test.ts` covering: an invalid slot never calls the
      Client; an `"empty"` result never calls the Renderer; a `"filled"` result for a
      no-longer-connected element never calls the Renderer. Depends on T007, T011.
- [ ] T015 [US2] In `src/index.ts` (T008), wrap each slot's pipeline call so that any unexpected
      exception is caught and never propagates to the host page (Constitution Principle V), and
      confirm one slot's failure/rejection does not stop any other slot's pipeline from running to
      completion. Depends on T008, T014.
- [ ] T016 [US2] Manually verify quickstart.md Scenarios 2, 3, and 4 (no ad available, invalid
      slot configuration, ad-serve-api unreachable/slow) against a running instance: the slot
      stays empty with no visible error in every case, within the bounded timeout, and the rest of
      the page is unaffected.

**Checkpoint**: User Stories 1 and 2 both verified.

---

## Phase 5: User Story 3 - Multiple ad slots on the same page act independently (Priority: P3)

**Goal**: A page with two or more independently configured ad slots resolves each slot's outcome
on its own, with no slot's delay or failure affecting any other slot.

**Independent Test**: Load a page with two or more differently configured ad slots (one that will
receive a matching ad, one that will not) and confirm each slot's outcome matches its own
configuration, independent of the other slot's result (quickstart.md Scenario 5).

- [ ] T017 [P] [US3] Extend `src/orchestrator/adOrchestrator.ts`'s run entry point (T014) to start
      every discovered slot's pipeline independently — without awaiting one slot's full pipeline
      before starting the next — so no slot's timing or outcome can block or be affected by
      another's. Unit tests added to `tests/unit/orchestrator/adOrchestrator.test.ts` covering:
      two slots, one resolving `"filled"` and one resolving `"empty"`, both are attempted and each
      resolves to its own correct outcome regardless of the other's timing or result. Depends on
      T014.
- [ ] T018 [US3] Manually verify quickstart.md Scenario 5 (two slots on one page resolve
      independently) against a running instance.

**Checkpoint**: All three user stories independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      feature. Confirm `npm run build` produces `dist/ad-serve-client.js` and that a plain static
      HTML page loading `loader/snippet.js` (T009) plus the built bundle behaves as described in
      [contracts/slot-markup-contract.md](./contracts/slot-markup-contract.md).
- [ ] T020 [P] Walk through every scenario in [quickstart.md](./quickstart.md) (1–5) end-to-end
      against a running ad-serve-api instance; reconcile any drift against
      [contracts/slot-markup-contract.md](./contracts/slot-markup-contract.md) and
      [contracts/ad-decision-client-contract.md](./contracts/ad-decision-client-contract.md).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational and US1's Orchestrator wiring (T011) —
  independently testable via its own failure-path scenarios once US1 exists.
- **User Story 3 (Phase 5)**: Depends on Foundational and US2's Orchestrator hardening (T014) —
  extends the run loop to run slots independently; independently testable via its own two-slot
  scenario.
- **Polish (Phase 6)**: Depends on all three user stories.

### Parallel Opportunities

- T002, T003 (Setup) can run in parallel with T001.
- T004, T005 (Foundational) can run in parallel once T001–T003 are done.
- T009 (Foundational, loader snippet) can run in parallel with T004–T008 — it touches no shared
  file.
- T017 (US3) is the only user-story task marked [P] — it modifies the same orchestrator file as
  T014, so treat this as "parallel with unrelated work," not with T014 itself.
- T019, T020 (Polish) in parallel.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (User Story 1).
2. **STOP and VALIDATE**: run quickstart.md Scenario 1 against a running ad-serve-api instance.
3. This is the smallest deployable slice: one slot, on one page, successfully requesting and
   displaying an ad.

### Incremental Delivery

Each user story phase (3 → 4 → 5) is its own reviewable increment: complete the phase, run its
quickstart scenario(s), merge, move to the next. Phases 4 and 5 build directly on the Orchestrator
introduced in Phase 3 rather than introducing new modules — that overlap is expected for a
foundational, single-pipeline feature and is not a sign of missing work.
