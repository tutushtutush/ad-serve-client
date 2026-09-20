---

description: "Task list for Route Clicks Through Click Tracking"
---

# Tasks: Route Clicks Through Click Tracking

**Input**: Design documents from `/specs/004-click-tracking-wireup/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Required for every Orchestrator/API Client/Renderer change, per Constitution
Principle III.

**Organization**: US1 (click routed & recorded) and US2 (graceful fallback) are not code-independent
— both outcomes come from the same `resolveClickHref` decision built in US1's own task (T003), just
its two different return branches. US2's phase adds the dedicated tests proving the fallback branch,
not new production code — same pattern already established in ad-serve-api's 007/008.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US2)

## Path Conventions

Single project (unchanged): `src/` and `tests/unit/` at repository root, mirroring existing layer
directories (`client/`, `renderer/`, `orchestrator/`).

No Setup phase — no new dependency, only new fields/parameters threaded through the existing chain.

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The shared types every layer's change depends on. **No user story work can begin
until this phase is complete.**

- [X] T001 [P] Extend `src/types.ts`: add `adConfigId?: string` to `AdCandidate` (data-model.md —
      already present in ad-serve-api's `/ads` response, just untyped until now); add
      `PlacementIdentity { platformId: string; adTypeId: string }`.
      **Verified**: typechecks clean; no production behavior change (structural typing already
      passed the field through).
- [X] T002 [P] Add a regression test to `tests/unit/client/adDecisionClient.test.ts`: `adConfigId`
      present in a mocked `/ads` response flows through to the parsed `AdDecisionResult` unchanged
      (no production code change expected — `isAdCandidate`'s type predicate already passes
      unrecognized-but-present fields through structurally; this test proves that assumption
      research.md relies on, rather than leaving it implicit). Also confirm a response *missing*
      `adConfigId` still parses successfully (not rejected — research.md's "optional, not
      required" decision). Depends on T001 (imports the now-typed field).
      **Verified**: 15/15 tests pass (2 new), confirming the pass-through assumption held with no
      production code change.

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 2: User Story 1 - A clicked ad gets recorded, and the viewer still reaches the advertiser (Priority: P1) 🎯 MVP

**Goal**: A rendered, clickable ad's `href` routes through ad-serve-api's `/click` endpoint when
enough information is available, and following it still reaches the advertiser's real page.

**Independent Test**: Render a clickable ad with a known `adConfigId`; confirm the rendered `<a
href>` points at `{apiBaseUrl}/click?platformId=&adTypeId=&adConfigId=`, and that following it
redirects to the advertiser's actual `linkUrl`.

- [X] T003 [US1] Rewrite `src/renderer/adRenderer.ts`'s click-href logic per data-model.md's
      `resolveClickHref`: `createAdRenderer(documentImpl, apiBaseUrl)` gains a second parameter;
      `renderAd(slotElement, ad, placement: PlacementIdentity)` gains a third; `buildCreativeMarkup`
      takes `apiBaseUrl`/`placement` too. When the existing `safeHref` (unchanged `toSafeHref`
      logic) is non-null *and* `ad.adConfigId` *and* `apiBaseUrl` are both present, the wrapper's
      `href` is `${apiBaseUrl}/click?${new URLSearchParams({platformId, adTypeId, adConfigId})}`
      (`URLSearchParams`, not manual concatenation — research.md) instead of `safeHref` directly.
      Unit tests in `tests/unit/renderer/adRenderer.test.ts`: click URL is built with the correct
      three query params when everything is available; the produced URL is well-formed (parseable,
      correct path/params); the wrapper is still an `<a>` (existing clickability behavior, just a
      different `href` target).
      **Verified**: 9 new tests pass. `makeAdWithResolvedRender()`'s fixture never sets
      `adConfigId`, so all 28 pre-existing tests kept passing completely unchanged (they naturally
      exercise the fallback path) — no retrofitting needed.
- [X] T004 [US1] Extend `src/orchestrator/adOrchestrator.ts`: `AdRendererLike.renderAd`'s signature
      gains `placement: PlacementIdentity` (data-model.md); both existing call sites (`runSlot`'s
      initial render, `processMutationBatch`'s redisplay) pass
      `{ platformId: slot.config.platformId, adTypeId: slot.config.adTypeId }`. Extend
      `tests/unit/orchestrator/adOrchestrator.test.ts`: both call sites' fake renderer records
      being called with the correct placement identity, including on redisplay (US1 Scenario 2 —
      no stale/missing identity across multiple renders of the same slot). Depends on T001.
      **Verified**: TypeScript did not catch the signature change (untyped `jest.fn()` satisfies
      any interface structurally) — 2 existing tests with exact-match `toHaveBeenCalledWith(el,
      ad)` assertions failed at runtime and needed updating; caught by actually running the suite,
      not by typecheck alone. Added a dedicated redisplay test. 21/21 tests pass.
- [X] T005 [US1] Update `src/index.ts`: pass the already-computed `baseUrl` into
      `createAdRenderer(document, baseUrl)`. No dedicated test file for `index.ts` (composition
      root, matching this repo's existing convention of verifying it live rather than unit-testing
      wiring) — verified in T006. Depends on T003.
      **Verified**: live in T006.

**Checkpoint**: User Story 1 is functional and independently testable (quickstart.md Scenarios 1–3).

- [X] T006 [US1] `npm run build`, load a real host page against a running ad-serve-api with a real
      clickable seeded ad, and walk through quickstart.md Scenarios 1–3: rendered `href` points at
      `/click?...`, following it `302`s to the advertiser's real page, and a click event is
      recorded. Fix T003–T005 if any check fails, then re-verify. Depends on T005.
      **Verified against real local ad-serve-api + Postgres**, using a minimal standalone test
      page (eventpulse's own homepage depends on an unrelated backend service that collided on the
      same port during testing — not something to route around by touching eventpulse itself).
      Rendered `href` was exactly `{apiBaseUrl}/click?platformId=...&adTypeId=...&adConfigId=...`;
      following it via `curl` returned `302` to the real advertiser URL with a matching event
      recorded. Went further than the plan: used Playwright to actually **click the rendered ad
      inside its sandboxed iframe** in a real browser and confirmed the resulting popup navigated
      to `https://ztrucking.com/` (the real advertiser page) — proving the full user-facing flow,
      not just the constructed URL.

---

## Phase 3: User Story 2 - A viewer always reaches the advertiser, even if tracking can't be set up (Priority: P1)

**Goal**: Prove, not just assert, that a clickable ad never regresses to broken or non-interactive
when the information needed to build a tracked link is unavailable.

**Independent Test**: Render an ad with `adConfigId` or `apiBaseUrl` missing; confirm the `href`
falls back to the advertiser's direct `linkUrl`, unchanged from this SDK's pre-feature behavior.

**Note**: Like ad-serve-api's 007/008 US-N stories, this story's production code already exists —
`resolveClickHref`'s fallback branch (T003) already implements it. This phase's job is dedicated,
explicit test coverage proving it, not new behavior.

- [X] T007 [US2] Extend `tests/unit/renderer/adRenderer.test.ts` if not already covered by T003:
      `adConfigId` absent → `href` is the direct `safeHref`, not a `/click` URL; `apiBaseUrl` blank
      or absent → same fallback; both missing → same fallback. Depends on T003.
      **Verified**: 4 dedicated tests, including an `undefined`-typed `apiBaseUrl` degrading safely
      without throwing (matches the codebase's existing FR-010 pattern).
- [X] T008 [US2] Extend `tests/unit/renderer/adRenderer.test.ts`: confirm FR-004 explicitly — an ad
      with `isLinked: false`, or an unsafe `linkUrl` (e.g. `javascript:...`), still produces the
      non-interactive `<div role="group">` wrapper exactly as before this feature, regardless of
      whether `adConfigId`/`apiBaseUrl` are available. This feature must never make something
      clickable that wasn't already. Depends on T003.
      **Verified**: 2 dedicated tests, both with `adConfigId`/`apiBaseUrl` deliberately present to
      prove the clickability gate — not just the click-URL construction — is what's actually
      unchanged.

**Checkpoint**: Both user stories verified (quickstart.md Scenarios 1–5).

- [X] T009 [US2] Walk through quickstart.md Scenarios 4–5 against a real host page (a loader
      snippet with no `data-api-base-url`; an ad config with no/unsafe `linkUrl`). Fix T003 if any
      check fails, then re-verify. Depends on T007, T008.
      **Verified, with a real finding**: Scenario 5 (unsafe `linkUrl`) confirmed live exactly as
      specified — no `<a>`, `role="group"` present, no `/click` URL. Scenario 4 (missing
      `apiBaseUrl`) does **not** reach the click-fallback code path live, because `apiBaseUrl` also
      gates the `/ads` decision request itself (`getApiBaseUrl()`'s `""` fallback becomes a
      *relative* URL, resolving against the host page's own origin, not ad-serve-api) — so with no
      `data-api-base-url`, no ad is ever fetched or rendered at all, and there's nothing to click.
      Confirmed the host page doesn't crash (Principle V holds — empty slot, zero console errors),
      but the specific "click falls back to direct link" fallback this scenario meant to exercise
      is only reachable at the unit-test level (T007), not via a real host page — mirrors
      ad-serve-api 007's discovery that a designed-for degrade path can be unreachable end-to-end
      for reasons outside the fix itself. quickstart.md updated to document this rather than leave
      the discrepancy implicit.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T010 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      feature, and confirm the full existing suite (features 001–003) still passes unmodified.
      Confirm `npm run build` compiles and `dist/ad-serve-client.js` reflects the new click-URL
      logic (grep the built bundle for the `/click` string construction).
      **Verified**: 84/84 tests, lint, and typecheck all clean; `npm run build` compiles; built
      bundle contains the click-URL construction logic.
- [X] T011 [P] Walk through any remaining quickstart.md scenarios not already covered by T006/T009.
      **Verified**: all 5 scenarios covered across T006/T009 (Scenario 4 covered with the caveat
      noted in T009). Test artifacts (standalone HTML pages, temporary vendored bundle in
      eventpulse) cleaned up; `ad_events` truncated; eventpulse's `git status` confirmed clean.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS all user stories.
- **User Story 1 (Phase 2)**: Depends on Foundational (T001). No dependency on US2.
- **User Story 2 (Phase 3)**: Depends on T003 (US1) existing to test against — its production code
  already exists by the time this phase starts.
- **Polish (Phase 4)**: Depends on both user stories.

### Parallel Opportunities

- T001, T002 [P] — different files, no shared dependency.
- T010, T011 (Polish) in parallel.
- Real cross-story parallelism is limited — US2 extends the same file US1 creates.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundational).
2. Phase 2 (User Story 1) — clicks route through tracking and still reach the advertiser.
3. **STOP and VALIDATE**: run quickstart.md Scenarios 1–3 against a real host page + ad-serve-api.
4. This is the smallest deployable slice: click data starts flowing for real traffic. User Story
   2's explicit fallback proof can follow independently.

### Incremental Delivery

1. Foundational → Foundation ready.
2. User Story 1 → validate → this alone unblocks real click data (SC-001/SC-002).
3. User Story 2 → validate → confirms SC-003 (never a broken link) explicitly, though the
   guarantee it proves was already load-bearing in Story 1's own design.
