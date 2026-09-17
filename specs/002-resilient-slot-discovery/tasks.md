---

description: "Task list for Resilient Slot Discovery for Client-Rendered Host Pages"
---

# Tasks: Resilient Slot Discovery for Client-Rendered Host Pages

**Input**: Design documents from `/specs/002-resilient-slot-discovery/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Required for `src/orchestrator/adOrchestrator.ts`, per Constitution Principle III —
every change to it MUST ship with unit tests using injected fakes for the Client/Renderer
collaborators, exercised under jsdom's real `MutationObserver` implementation (not a fake, per
plan.md's Constitution Check).

**Organization**: Tasks are grouped by user story (spec.md priorities) to enable independent
verification of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)

## Path Conventions

Single project (per plan.md, unchanged from 001): `src/`, `tests/unit/` at repository root. No
new setup, dependencies, or configuration — this feature modifies one existing module and its
existing test file.

---

## Phase 1: Foundational (Core Implementation)

**Purpose**: The one change every user story depends on — there is no separate per-story
implementation, matching this feature's single-module scope (plan.md's Project Structure).

- [X] T001 Rewrite discovery/tracking in `src/orchestrator/adOrchestrator.ts`: introduce a
      **Tracked Slot** record (`config`, `groupPosition`, `currentElement`, `resolved` —
      data-model.md) computed by grouping discovered elements by
      `(platformId, adTypeId, country, deviceType)` in document order (research.md); replace the
      one-shot `discoverSlots` scan's role in `run(root)` with a `MutationObserver` on `root` that
      re-computes each unresolved Tracked Slot's `currentElement` from the current DOM on every
      mutation batch, wrapped in its own try/catch (Constitution Principle V — a defect here must
      degrade to "this mutation's re-mapping was skipped," never throw into the host page's
      render cycle); `runSlot`'s pipeline no longer holds a fixed `Element` reference — it reads
      the Tracked Slot's `currentElement` only at the moment the ad result is ready to render
      (FR-003), rendering nothing if it's `null` at that moment (FR-004, no new timeout —
      research.md); mark a Tracked Slot `resolved` once its outcome is determined and stop
      updating/observing it further (FR-008); a replacement never triggers a second
      `client.requestAd` call for the same Tracked Slot (FR-002).

      Unit tests in `tests/unit/orchestrator/adOrchestrator.test.ts`, extending the existing
      suite (feature 001's cases — valid/invalid slot, empty result, independent multi-slot — must
      still pass unmodified):
      - a slot's element is replaced once before the ad result resolves → the ad renders into the
        *new* element, not the original (US1).
      - a slot's element is replaced twice before the ad result resolves → exactly one ad is
        rendered, into the final element (US3, FR-005).
      - a slot's element is removed with no replacement before the ad result resolves → resolves
        empty, no render, nothing thrown (US2, FR-004).
      - two slots share identical configuration and only one's element is replaced → each
        resolves into its own correct current element, never crossed (FR-007).
      - a Tracked Slot that has already resolved is unaffected by a later, unrelated mutation
        (FR-008).
      - a thrown error inside the mutation-handling logic (simulated) is caught and does not
        propagate, and a subsequent mutation is still processed normally (Constitution Principle
        V).

**Checkpoint**: Foundation ready — every user story below is already functionally complete once
this lands; the phases below verify it against real and standalone pages rather than adding more
code.

---

## Phase 2: User Story 1 - An ad still appears on a page that redraws itself after load (Priority: P1) 🎯 MVP

**Goal**: The exact real-world bug this feature exists to fix — confirmed against the actual
environment that surfaced it, not just a synthetic test.

**Independent Test**: quickstart.md Scenario 1 — reload eventpulse's real homepage (React
hydration replaces the ad slot's container ~50ms after load) and confirm the seeded ad now
appears, where it previously silently failed to.

- [ ] T002 [US1] Run quickstart.md Scenario 1 against the real eventpulse full-circle environment:
      rebuild this repo, recopy `dist/ad-serve-client.js` into eventpulse's `public/`, reload the
      homepage with eventpulse + eventpulse-api + ad-serve-api all running. Confirm the ad appears
      inside the *current* slot element (inspect that it's connected, not a leftover detached
      node). Depends on T001.
      **Blocked, then partially resolved — two distinct findings surfaced by this task:**
      1. **Unrelated bug, fixed**: T001's build never actually got far enough to test the new
         tracking logic — `isAdCandidate` (from feature 001's PR #1 code-review fix) requires
         every `AdCreative` field to be present, but ad-serve-api's real response only includes
         fields a campaign actually set (`headline`/`ctaText`/`linkUrl`/`altText` — 4 of 13),
         omitting the rest entirely rather than backfilling defaults. This silently rejected a
         perfectly valid ad as malformed. Fixed by making `AdCreative`'s fields optional
         (types.ts) and moving per-field safety from the Client's validation (now just checks
         `creative` is a plausible object, matching the "genuinely opaque" contract) to the
         Renderer, which now coerces each field it actually uses to a safe string before escaping
         (`asSafeString`), fixing the *original* PR #1 crash risk at the point it actually
         matters rather than over-fitting the Client to an assumed-complete shape.
      2. **New, deeper finding — not yet resolved, see conversation**: with (1) fixed, the ad
         *does* render into the original slot element (confirmed via React's own hydration-
         mismatch console error, which names our injected `<iframe>` as the extraneous node) —
         but React then discards/regenerates that subtree to resolve the mismatch, *removing* the
         ad immediately after. This is the *inverse* timing case from the one this feature
         targets: our render happens fast enough (sub-ms local ad-serve-api) to *beat* hydration,
         and hydration's own mismatch-recovery is what removes it afterward — not a replacement
         *before* render, which is what T001 fixes. spec.md's Assumptions explicitly scope
         "removed/replaced after an ad already rendered" as a separate, out-of-scope concern; this
         is that exact case, now shown to be the actual dominant failure mode against a fast
         backend, not an edge case. Paused here pending a decision on how to proceed.

**Checkpoint**: User Story 1 partially verified — see the unresolved finding above.

---

## Phase 3: User Story 2 - A slot that's genuinely gone still stays safely empty (Priority: P2)

**Goal**: The safeguard that makes User Story 1 safe — a slot removed for good, with nothing ever
replacing it, still degrades to empty exactly as before this feature.

**Independent Test**: quickstart.md Scenario 2 — a standalone test page removes a slot's element
shortly after load with no replacement; confirm no ad ever appears and nothing errors.

- [ ] T003 [US2] Run quickstart.md Scenario 2 against the built bundle: confirm no ad appears, no
      console error occurs, and the rest of the page functions normally. Depends on T001.

**Checkpoint**: User Stories 1 and 2 both verified.

---

## Phase 4: User Story 3 - A slot never shows more than one ad (Priority: P3)

**Goal**: The fix holds under repetition — a slot's element replaced more than once before
resolution still ends up with exactly one ad, never zero (when one was available) and never more
than one.

**Independent Test**: quickstart.md Scenario 3 — a standalone test page replaces a slot's element
twice in quick succession before the ad result is ready; confirm exactly one ad appears, in the
final container.

- [ ] T004 [US3] Run quickstart.md Scenario 3 against the built bundle: confirm exactly one
      `<iframe>` ad appears, inside the final (third) container, with no duplicate ads and nothing
      rendered into an earlier, detached container. Depends on T001.

**Checkpoint**: All three user stories independently verified.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T005 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      feature (confirming zero regression to feature 001's existing behavior). Confirm
      `npm run build` still compiles `dist/ad-serve-client.js`.
- [ ] T006 [P] Run quickstart.md Scenario 4 (FR-007 — two identically-configured slots, only one
      replaced) against the built bundle: confirm each slot's ad ends up in its own correct
      current element, never crossed.
- [ ] T007 [P] Re-run feature 001's quickstart.md Scenarios 2, 3, and 5 (no ad available, invalid
      slot configuration, independent multi-slot resolution) against the built bundle to confirm
      this feature introduces no regression to behavior those scenarios already cover.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS every user story.
- **User Story 1 (Phase 2)**, **User Story 2 (Phase 3)**, **User Story 3 (Phase 4)**: Each depends
  on Foundational only; independent of each other (different verification scenarios, no shared
  state), can run in parallel.
- **Polish (Phase 5)**: Depends on all three user stories.

### Parallel Opportunities

- T002, T003, T004 (the three user-story verifications) can run in parallel once T001 is done.
- T005, T006, T007 (Polish) in parallel.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundational) → Phase 2 (User Story 1).
2. **STOP and VALIDATE**: run quickstart.md Scenario 1 against the real eventpulse environment —
   this is the exact bug report closing.
3. Phases 3–4 confirm the fix is correct under the edge cases (permanent removal, repeated
   replacement) that make it safe to ship, not just correct for the one observed case.

### Incremental Delivery

This feature is essentially one change (T001) verified from three angles (T002–T004) — there is
no meaningful incremental split beyond that; all three user stories become true the moment
Phase 1 lands.
