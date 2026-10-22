# Tasks: Ad layout presets

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/resolved-render.md](contracts/resolved-render.md), [quickstart.md](quickstart.md)

Tests are included: the success criteria are checkable and the contract has a shared table.

This is the first of three releases: ad-serve-client, then ad-serve-api, then adconfig (adconfig spec 101). Merge only when the owner says "merge".

## Phase 1: Setup

- [X] T001 Before changing any source, capture the previous release's classic markup into `tests/unit/fixtures/classicMarkup.golden.json`: render a set of ads (empty resolved render; headline and button only; full creative with logo, background image and every background position; linked and unlinked; an ad with the click-tracking fields) through `createAdRenderer` and store each `srcdoc` string keyed by a case name. Use a small throwaway script run with the current code, not committed.

## Phase 2: Foundational

- [X] T002 Add `layout?: string` with a comment naming the five values and saying anything else is drawn as classic to `ResolvedAdCreativeRender` in `src/types.ts`.
- [X] T003 Create `src/utils/adLayout.ts`: `AD_LAYOUTS` (five names), `normalizeLayout(value: unknown)` using an own-property check, and `layoutGeometry(layout, width, height)` returning `null` for classic or a non-positive/non-finite size, else `{ image, text, centered, scrim, showLogo, showCta }` per [contracts/resolved-render.md](contracts/resolved-render.md) (`image-left` becomes `image-top` when height > width; logo needs a text box of at least 80px, button at least 24px).
- [X] T004 [P] Add `tests/unit/utils/adLayout.test.ts`: every name kept; `""`, `"IMAGE-LEFT"`, `5`, `null`, `undefined`, `{}`, `[]`, `"constructor"`, `"__proto__"`, markup and a 10 KB string give classic; the geometry table for each layout; the tall-ad rule; the logo and button thresholds; a zero, negative or NaN size gives `null`.

## Phase 3: User Story 2 + 4 - Existing ads unchanged, hostile values safe (P1)

**Independent Test**: [quickstart.md](quickstart.md) steps 2 and 4.

- [X] T005 [US2] Add a golden test in `tests/unit/renderer/adRenderer.test.ts` that renders every case in `classicMarkup.golden.json` and expects the stored `srcdoc` exactly; add the same cases with `layout: "classic"` and with each bad value expecting the same string.
- [X] T006 [US4] Add hostile-value tests: `layout` as markup, quotes and brackets, an object, an array, a number, a 10 KB string and `__proto__` give the classic markup, none of the value appears in it, and nothing throws.

## Phase 4: User Story 1 - Draw each layout (P1)

**Independent Test**: [quickstart.md](quickstart.md) steps 3 and 5.

- [X] T007 [US1] In `src/renderer/adRenderer.ts`, compute `layoutGeometry(normalizeLayout(r.layout), ad.width, ad.height)` in `buildCreativeMarkup`; when `null` run the existing code unchanged; otherwise call a new `buildLayoutMarkup` that draws the wrapper (same gradient and link/role handling), the image box (the existing background `<img>` with its `object-position`, or the placeholder icon sized from the box for the two layouts with an image box beside the text), and the text box (column flex, centered or start-aligned, padding 8px, `rgba(0,0,0,0.45)` background for the scrim) holding the logo, the headline clamped to 3 lines with `overflow-wrap:anywhere`, and the button, under the thresholds. Reuse the existing escaping helpers for every response-sourced value.
- [X] T008 [US1] Add renderer tests for each layout at 300x250 against the contract table (box percentages, centered, scrim, parts present), `image-left` on a tall size arranged like `image-top`, `text-only` with an image in the response showing none, and the background position still set inside the image box.

## Phase 5: User Story 3 - Readable at every size (P2)

**Independent Test**: [quickstart.md](quickstart.md) step 5.

- [X] T009 [US3] Add tests at 970x250, 300x600 and 728x90 with a very long headline and a very long word: the clamp and wrap styles are present, the logo is left out below an 80px text box and the button below 24px; with no image, logo, headline or button nothing is drawn for the missing part; the placeholder icon appears for `image-left` and `image-top` only.
- [X] T010 [US3] Real-browser check: build the SDK (`npm run build`), serve a throwaway page with one ad per layout from a stub response at the three sizes, with a long headline and with missing parts; look at it in a real browser (Playwright/Chromium works on this machine); record the results in `research.md`; delete the throwaway page.

## Phase 6: Polish and release

- [X] T011 Bump `package.json` to 1.10.0 and add a short "Ad layouts" note to `README.md`: nothing changes for a platform, the layout is chosen in adconfig and served by ad-serve-api.
- [ ] T012 Run `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build`; confirm [contracts/resolved-render.md](contracts/resolved-render.md) is byte-identical to adconfig's copy and to ad-serve-api's when that exists.
- [ ] T013 Open the PR (description ends with the Claude Code line from the project's attribution rule); merge only on the owner's word; after release confirm on the test site that served ads are unchanged (SC-004).

## Dependencies

T001 first, before any source change. T002 and T003 then T004. T005 and T006 after T003 (they fail-safe against the unchanged renderer, which is the point). T007 after T003; T008 after T007. T009 and T010 after T007. T011 to T013 last.

## Implementation strategy

MVP is Phases 1 to 4. Because the release changes nothing visible until ad-serve-api passes the field through, it can merge and ship alone.
