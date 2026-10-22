# Tasks: Classic layout fits very short ads

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md); the shared contract is adconfig `specs/109-fix-the-classic/contracts/classic-fit.md`. Merge only when the owner says "merge".

## Phase 1: Setup

- [x] T001 Add `leaderboard size` (728x90) and `large mobile banner size` (320x100) cases to `tests/unit/fixtures/classicCases.ts` and capture their markup from the UNCHANGED renderer into `classicMarkup.golden.json`, in a commit of their own (162fb48)

## Phase 2: User Story 1 + 2 - short classic fits, the rest unchanged (P1)

- [x] T002 [US1] `src/utils/adLayout.ts`: add `classicFit(adHeight)` (null when `adHeight - 16 >= 66`, else `{ showLogo: false, showCta, headlineLines }`) and factor the arithmetic of `layoutGeometry` into one private `fitText(inner)` used by both; keep every existing export and result unchanged
- [x] T003 [US1] `src/renderer/adRenderer.ts`: after the `geometry` branch, call `classicFit(ad.height)`; when non-null return the classic wrapper with `justify-content:flex-end`, the background layer, and the text group (headline with `line-height:18px` and `clampedTextStyle(lines)`, button only when `showCta` with `FIXED_HEIGHT_CTA_STYLE`); the existing classic template string stays as is
- [x] T004 [P] [US1] `tests/unit/utils/adLayout.test.ts`: `classicFit` at heights 250, 600, 100, 90, 82 (null), 81, 60, 50, and agreement with `layoutGeometry("text-only", 468, 60)`
- [x] T005 [US1] `tests/unit/renderer/adRenderer.test.ts`: at 468x60 no logo, the button present with the fixed-height styles, one-line headline clamp; at 320x50 no logo, no button; text at the bottom; an ad with no logo, headline or button renders; the other four layouts at 320x50 unchanged; the golden test passes with the two new cases
- [x] T006 [US3] `tests/unit/utils/adLayout.test.ts`: read the Classic table from the adconfig contract if the sibling checkout exists (skip otherwise, as spec 018's table test does) or copy the seven rows in the test with a comment naming the source, and assert each
- [x] T007 [US1] Real-browser check in headless Chromium: the served markup (`srcdoc`) at all seven sizes, short and long text: nothing cut off at 468x60 and 320x50; the five other sizes identical; note the result in `research.md`

## Phase 3: Polish

- [x] T008 `npx tsc --noEmit`, lint, the whole Jest suite, and the build (`dist`, as the repo's scripts require); update the README layout section with one line about short Classic ads
- [ ] T009 After merge: tag the next minor after `v1.10.0`; then ad-serve-api bumps its pin (one-line PR) and the test-site check runs (adconfig spec 109 T017)
