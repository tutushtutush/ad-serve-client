---

description: "Task list for Full Creative Rendering Fidelity"
---

# Tasks: Full Creative Rendering Fidelity

**Input**: Design documents from `/specs/003-full-creative-rendering/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Required for `src/renderer/adRenderer.ts`, per Constitution Principle III — every
change to it MUST ship with unit tests. No new collaborators to inject for this feature (the
Renderer already takes `documentImpl`), so tests exercise `buildCreativeMarkup`'s output directly
under jsdom.

**Organization**: Tasks are grouped by user story (spec.md priorities) to enable independent
verification of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Path Conventions

Single project (per plan.md, unchanged from 001–002): `src/`, `tests/unit/` at repository root.
No new setup, dependencies, or configuration — this feature modifies `src/types.ts` and
`src/renderer/adRenderer.ts` and their tests.

---

## Phase 1: Foundational (Core Implementation)

**Purpose**: The one change every user story depends on — matching this feature's two-file scope
(plan.md's Project Structure).

- [ ] T001 Add `ResolvedAdCreativeRender` to `src/types.ts` (data-model.md's exact field list,
      mirroring ad-serve-api's contract) and extend `AdCandidate` with an optional
      `resolvedRender?: ResolvedAdCreativeRender` field.

- [ ] T002 Rewrite `buildCreativeMarkup` (and `renderAd`) in `src/renderer/adRenderer.ts` to
      consume `ad.resolvedRender` instead of `ad.creative`, per data-model.md's Rendering Decision
      Table — every field independently defaulted if `resolvedRender` is missing or a field is the
      wrong type (FR-010), never assumed well-formed:
      - `headlineText`/`ctaText`: safe string (default `""`), still escaped before display
        (FR-009).
      - `headlineTextColor`/`ctaTextColor`: safe string or omitted (CSS `color` only set when a
        non-empty string; omitted otherwise so the default/inherited color applies).
      - `headlineFontFamily`/`ctaFontFamily`: safe string, default `"inherit"`.
      - `ctaBackgroundColor`: safe string, default `"#ffffff"` — always applied, no
        enable/disable flag (FR-004, US3).
      - `hasLogoImage` + `logoImageDataUrl`: render a logo `<img>` inside a pill only when
        `hasLogoImage` is strictly `true` and `logoImageDataUrl` is a non-empty string (US1);
        `logoBackgroundEnabled` (safe boolean, default `true`) + `logoBackgroundColor` (safe
        string, default `"#ffffff"`) control the pill's background.
      - `hasBackgroundImage` + `backgroundImageDataUrl`: render the background image only when
        both are valid (US4); otherwise render a gradient + inline-SVG icon placeholder sized
        from `iconSize` (safe number > 0; if invalid/absent, compute
        `Math.min(ad.width, ad.height) / 3` client-side per research.md).
      - `isLinked` + `linkUrl`: wrap in a clickable `<a>` only when `isLinked` is strictly `true`
        **and** `linkUrl` passes the existing safe-http(s)-only check (FR-007/FR-008, US5);
        otherwise render a non-interactive wrapper. The safe-URL check is never skipped, even
        when `isLinked` is `true`.
      - `ariaLabel`: safe string or omitted, applied as `aria-label` on the wrapper.
      - Layout order matches adconfig's own preview (research.md): background layer first, then
        a top row (logo pill, left) and a bottom block (headline, then CTA pill) — no disclosure
        icon (deliberately omitted, research.md).

      Unit tests in `tests/unit/renderer/adRenderer.test.ts`, extending the existing suite
      (feature 001/002's cases — sandbox attribute, dimensions, escaping, safe href, invalid
      `<button>` avoidance — must still pass, adapted to read from `resolvedRender` instead of
      `creative` where they exercise text/link fields):
      - a logo renders when `hasLogoImage`/`logoImageDataUrl` are set; no logo element when
        `hasLogoImage` is `false` (US1).
      - the logo's background pill reflects `logoBackgroundEnabled`/`logoBackgroundColor`, on
        and off (US1).
      - headline and CTA render with their resolved colors and fonts when set, and with
        defaults (`"inherit"`, no explicit color) when unset (US2).
      - the CTA always has a background color applied, even when `ctaBackgroundColor` is a
        default value (US3).
      - a background image renders when present; a placeholder renders (using `iconSize`, or the
        computed fallback) when absent, and never both at once (US4).
      - the wrapper is a clickable `<a>` only when `isLinked` is `true` and `linkUrl` is a safe
        http(s) URL; a non-http(s) `linkUrl` with `isLinked: true` still does not produce a
        clickable link (US5, FR-008).
      - all rendered text (headline, CTA, aria-label) is escaped — malicious-looking content
        never appears unescaped in the markup (FR-009).
      - a missing `resolvedRender` entirely, and a `resolvedRender` with wrong-typed fields
        (numbers/objects where strings/booleans are expected), both produce a complete, safe
        markup string without throwing (FR-010).
      Depends on T001.

**Checkpoint**: Foundation ready — every user story below is already functionally complete once
this lands; the phases below verify it against a real ad-serve-api instance rather than adding
more code.

---

## Phase 2: User Story 1 - An ad with a logo displays the logo (Priority: P1) 🎯 MVP

**Goal**: The exact real-world gap this feature exists to fix — a configured logo actually
appears.

**Independent Test**: quickstart.md Scenario 1 (logo portion) — an ad configured with a logo
displays it.

- [ ] T003 [US1] Run quickstart.md Scenario 1 against a real ad-serve-api instance and adconfig-
      created ad with a logo: confirm `resolvedRender.hasLogoImage`/`logoImageDataUrl` are
      present in the response, and confirm the rendered ad shows the logo. Depends on T002.

**Checkpoint**: User Story 1 verified against the real bug report.

---

## Phase 3: User Story 2 - An ad's text matches its configured colors and fonts (Priority: P1)

**Goal**: Headline and CTA text render in the advertiser's chosen colors/fonts, not generic
defaults.

**Independent Test**: quickstart.md Scenario 1 (colors/fonts portion).

- [ ] T004 [US2] Run quickstart.md Scenario 1 against an ad configured with explicit headline/CTA
      colors and fonts: confirm `resolvedRender` reflects them and the rendered ad's inline
      styles match. Depends on T002.

**Checkpoint**: User Stories 1 and 2 verified.

---

## Phase 4: User Story 3 - A button always has a visible background (Priority: P2)

**Goal**: The CTA button never blends invisibly into the ad, regardless of configuration.

**Independent Test**: quickstart.md Scenario 2 — an ad with no CTA background configured still
shows a background on the button.

- [ ] T005 [US3] Run quickstart.md Scenario 2: confirm `resolvedRender.ctaBackgroundColor` is a
      real value (server-applied default) even when unset by the advertiser, and the rendered
      button has a visible background. Depends on T002.

**Checkpoint**: User Stories 1–3 verified.

---

## Phase 5: User Story 4 - An ad without a background image shows a placeholder (Priority: P3)

**Goal**: No blank or broken-looking area where a background image would normally be.

**Independent Test**: quickstart.md Scenario 3.

- [ ] T006 [US4] Run quickstart.md Scenario 3: confirm `resolvedRender.hasBackgroundImage` is
      `false` for an ad with none configured, and the rendered ad shows a gradient+icon
      placeholder sized per `resolvedRender.iconSize`. Depends on T002.

**Checkpoint**: User Stories 1–4 verified.

---

## Phase 6: User Story 5 - An ad is only clickable when a destination is configured (Priority: P3)

**Goal**: No misleadingly-clickable ad with nowhere to go.

**Independent Test**: quickstart.md Scenario 4.

- [ ] T007 [US5] Run quickstart.md Scenario 4: confirm `resolvedRender.isLinked` is `false` for
      an ad with no destination, and the rendered ad's wrapper is non-interactive (not an `<a>`).
      Depends on T002.

**Checkpoint**: All five user stories independently verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T008 [P] Run `npm run lint`, `npm run typecheck`, and `npm test` clean across the whole
      feature (confirming zero regression to features 001/002's existing behavior). Confirm
      `npm run build` still compiles `dist/ad-serve-client.js`.
- [ ] T009 [P] Confirm quickstart.md Scenario 5 (missing/malformed `resolvedRender`) is fully
      covered by T002's unit tests (per quickstart.md's own note that this isn't practically
      walkable live against a correctly-functioning ad-serve-api) — no live scenario to run, just
      confirm the relevant unit tests exist and pass.
- [ ] T010 [P] Re-run feature 001/002's quickstart.md scenarios (no ad available, invalid slot
      configuration, independent multi-slot resolution, resilient discovery/redisplay) against
      the built bundle to confirm this feature introduces no regression to behavior those
      scenarios already cover.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — BLOCKS every user story.
- **User Stories (Phases 2–6)**: Each depends on Foundational only; independent of each other
  (different verification scenarios, no shared state), can run in parallel.
- **Polish (Phase 7)**: Depends on all five user stories.

### Parallel Opportunities

- T003–T007 (the five user-story verifications) can run in parallel once T001/T002 are done.
- T008, T009, T010 (Polish) in parallel.

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundational, T001 → T002) → Phase 2 (User Story 1).
2. **STOP and VALIDATE**: run quickstart.md Scenario 1's logo portion against a real ad-serve-api
   instance — this is the exact bug report closing.
3. Phases 3–6 confirm the remaining fidelity gaps (colors/fonts, CTA background, placeholder,
   clickability) that round out the fix.

### Incremental Delivery

This feature is essentially one change (T001 + T002) verified from five angles (T003–T007) —
there is no meaningful incremental split beyond that; all five user stories become true the
moment Phase 1 lands.
