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

**Purpose**: The two changes every user story depends on — there is no separate per-story
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
      still pass unmodified): element replaced once/twice before resolution, element removed with
      no replacement, duplicate-config disambiguation, resolved slot ignores later mutations, a
      thrown error inside mutation-handling is caught and recovers.
      **Amended during T002's real-environment verification**: also fixed an unrelated bug —
      `isAdCandidate` (feature 001's PR #1 code-review fix) required every `AdCreative` field
      present, but ad-serve-api's real responses only include fields a campaign actually set.
      Made `AdCreative`'s fields optional (types.ts), simplified the Client's validation to match
      the genuinely-opaque contract, and moved per-field safety into the Renderer (`asSafeString`)
      where the actual crash risk lives. See f79d0c6.

- [X] T002 Extend `src/orchestrator/adOrchestrator.ts` for bounded post-render redisplay
      (spec.md amendment, FR-009/FR-010/data-model.md): a Tracked Slot gains `ad` (the already-
      fetched `AdCandidate`, remembered for reuse), `renderedElement` (the specific element last
      rendered into), `redisplaysRemaining` (starts at 3), and `quietBatchesRemaining` (starts at
      10, reset on each (re)display). After a successful render, the slot is *not* marked
      `resolved` — the `MutationObserver` callback now also checks, for every rendered-but-not-
      yet-settled slot, whether `renderedElement` is still connected: if yes, decrement
      `quietBatchesRemaining` (settle and mark `resolved` at 0); if no, look up a current element
      for the slot and, if `redisplaysRemaining > 0`, call `renderer.renderAd` again with the
      *same* remembered `ad` (never a second `client.requestAd` call — research.md), decrement
      `redisplaysRemaining`, reset `quietBatchesRemaining` to 10, and update `renderedElement`;
      otherwise (no current element, or attempts exhausted) mark `resolved` (empty — FR-010's
      "leave it in whatever state it last reached"). The mutation-callback try/catch from T001
      covers this new logic too — no separate wrapping needed.

      Unit tests added to `tests/unit/orchestrator/adOrchestrator.test.ts`:
      - the rendered element is removed and replaced once → the same ad is redisplayed into the
        new element, with no second `client.requestAd` call (US1 scenario 3, FR-009).
      - the rendered element is removed and replaced repeatedly, well beyond the redisplay bound
        → redisplay stops after the bounded number of attempts even though replacements keep
        happening, and the slot ends up empty with no error and no further attempts (FR-010,
        "never retry indefinitely").
      - the rendered element stays connected for enough consecutive mutation batches to exceed
        `quietBatchesRemaining` → the slot settles (`resolved`) and a further, later removal has
        no effect (FR-008).
      Depends on T001.
      **Amended after real-environment verification (T003)**: the values above (3 / 10) were
      tuned up from an initial, smaller pair (2 / 3) that settled the *wrong* way — the watch
      window closed before a later hydration-related mutation arrived — in roughly 1 of 3 real
      reloads in a production build and in every reload against the dev server (which produces
      more DOM churn around hydration than production: React DevTools hooks, Fast Refresh setup).
      Re-verified at 3 / 10: 5/5 clean reloads in dev mode and 5/5 in `next build && next start`
      all displayed the ad with no disappearance. See research.md's amended decision for the full
      account (temporary debug logging used to trace this, since removed from the shipped code).

**Checkpoint**: Foundation ready — every user story below is already functionally complete once
this lands; the phases below verify it against real and standalone pages rather than adding more
code.

---

## Phase 2: User Story 1 - An ad still appears on a page that redraws itself after load (Priority: P1) 🎯 MVP

**Goal**: The exact real-world bug this feature exists to fix — confirmed against the actual
environment that surfaced it, not just a synthetic test. Covers both timing directions of the
same underlying race (spec.md amendment).

**Independent Test**: quickstart.md Scenario 1 — reload eventpulse's real homepage repeatedly and
confirm the seeded ad appears and *stays* displayed (a hydration-mismatch console warning may
still appear — that's React's own diagnostic, not itself a failure; see quickstart.md).

- [X] T003 [US1] Run quickstart.md Scenario 1 against the real eventpulse full-circle environment:
      rebuild this repo, recopy `dist/ad-serve-client.js` into eventpulse's `public/`, reload the
      homepage several times with eventpulse + eventpulse-api + ad-serve-api all running. Confirm
      the ad appears inside the *current* slot element and stays there (no flicker/disappearance).
      Depends on T002.
      **Verified**: this task is what surfaced T002's constant-tuning need (see T002's amendment
      note) — initial values failed roughly 1/3 of the time in production and consistently in dev
      mode. After tuning, re-verified clean: 5/5 in dev mode (`npm run dev`) and 5/5 in a real
      production build (`npm run build && npm run start`), driven headlessly via Playwright
      (`playwright-core`, no project dependency added — installed ad hoc in the scratch directory
      for this verification only). Confirmed via DOM inspection that the rendered `<iframe>` is
      always inside the connected, current `[data-ad-serve-slot]` element.

**Checkpoint**: User Story 1 verified against the real bug report, including the deeper finding
T002 addresses.

---

## Phase 3: User Story 2 - A slot that's genuinely gone still stays safely empty (Priority: P2)

**Goal**: The safeguard that makes User Story 1 safe — a slot removed for good, with nothing ever
replacing it, still degrades to empty exactly as before this feature.

**Independent Test**: quickstart.md Scenario 2 — a standalone test page removes a slot's element
shortly after load with no replacement; confirm no ad ever appears and nothing errors.

- [ ] T004 [US2] Run quickstart.md Scenario 2 against the built bundle: confirm no ad appears, no
      console error occurs, and the rest of the page functions normally. Depends on T001.

**Checkpoint**: User Stories 1 and 2 both verified.

---

## Phase 4: User Story 3 - A slot never shows more than one ad (Priority: P3)

**Goal**: The fix holds under repetition — a slot's element replaced more than once before *or
after* resolution still ends up with exactly one ad displayed at a time, never zero (when one was
available) and never more than one simultaneously.

**Independent Test**: quickstart.md Scenario 3 — a standalone test page replaces a slot's element
twice in quick succession before the ad result is ready; confirm exactly one ad appears, in the
final container.

- [ ] T005 [US3] Run quickstart.md Scenario 3 against the built bundle: confirm exactly one
      `<iframe>` ad appears, inside the final (third) container, with no duplicate ads and nothing
      rendered into an earlier, detached container. Depends on T001.

**Checkpoint**: All three user stories independently verified.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T006 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      feature (confirming zero regression to feature 001's existing behavior). Confirm
      `npm run build` still compiles `dist/ad-serve-client.js`.
- [ ] T007 [P] Run quickstart.md Scenario 4 (FR-007 — two identically-configured slots, only one
      replaced) against the built bundle: confirm each slot's ad ends up in its own correct
      current element, never crossed.
- [ ] T008 [P] Run quickstart.md Scenarios 5 and 6 (FR-009/FR-010 — redisplay after post-render
      removal, and the bounded-attempts cutoff) against the built bundle.
- [ ] T009 [P] Re-run feature 001's quickstart.md Scenarios 2, 3, and 5 (no ad available, invalid
      slot configuration, independent multi-slot resolution) against the built bundle to confirm
      this feature introduces no regression to behavior those scenarios already cover.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: T002 depends on T001 — BLOCKS every user story.
- **User Story 1 (Phase 2)**: Depends on T002 (needs the redisplay fix, not just T001, to fully
  pass — see T003's amendment history above).
- **User Story 2 (Phase 3)**, **User Story 3 (Phase 4)**: Each depends on T001 only; independent
  of each other and of Phase 2.
- **Polish (Phase 5)**: Depends on all three user stories.

### Parallel Opportunities

- T004, T005 can run in parallel with each other and with T003 once their respective
  dependencies (T001 for T004/T005, T002 for T003) are done.
- T006, T007, T008, T009 (Polish) in parallel.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundational, T001 → T002) → Phase 2 (User Story 1).
2. **STOP and VALIDATE**: run quickstart.md Scenario 1 against the real eventpulse environment,
   reloading several times — this is the exact bug report closing, for both timing directions.
3. Phases 3–4 confirm the fix is correct under the edge cases (permanent removal, repeated
   replacement) that make it safe to ship, not just correct for the one observed case.

### Incremental Delivery

This feature is essentially two changes (T001, T002) verified from several angles (T003–T005,
T008) — there is no meaningful incremental split beyond that; all three user stories become true
once Phase 1 lands.
