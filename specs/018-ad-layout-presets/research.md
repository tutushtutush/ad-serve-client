# Research: Ad layout presets (ad-serve-client)

## Decisions inherited from adconfig spec 101

- Five layouts, named and arranged by the shared contract ([contracts/resolved-render.md](contracts/resolved-render.md)), copied unchanged from adconfig `specs/101-ad-layout-presets/contracts/resolved-render.md`. Change it there first, then in all three repos.
- Drift protection is the shared table asserted in each repo's tests, not a shared package (adconfig 101 research P3).
- An unknown value draws classic so the staged release (this repo, then ad-serve-api, then adconfig) never breaks an ad.

## Open for planning

- How to build each arrangement in the SDK's string markup while keeping classic byte-identical (adconfig's preview renders the same rules as React).
- Version number (1.10.0 expected, a new capability).

## Plan-phase decisions

- **R1. Two builders, classic untouched.** Alternative: one builder with a "classic" geometry. Rejected: classic must stay byte-identical (FR-004) and a unified builder would reshuffle its markup; the golden test, captured before any edit, proves the choice.
- **R2. Own-property lookup** for the name table, so inherited keys (`constructor`, `__proto__`) are rejected as unknown. The existing background position table uses the same check.
- **R3. Line clamp and long words.** `-webkit-line-clamp` with `display:-webkit-box` and `overflow-wrap:anywhere` work in current Chrome, Safari and Firefox, in the iframe as anywhere else. A browser without `overflow-wrap:anywhere` shows the long word clipped by the box's own `overflow:hidden`, never outside the ad. No SDK support list exists in the README to check against.
- **R4. No console warning for a bad layout** (unlike `setViewerId`): the value is not something the platform controls, so a warning would only be noise on their page (FR-011).
- **R5. Version 1.10.0**, a new capability with no breaking change, as 1.7.0 (position) was.

## Approaches started and rejected

None yet.

## Implementation notes (2026-10-21)

- The golden file was captured from the unchanged source (T001) from 23 cases in `tests/unit/fixtures/classicCases.ts`: defaults, no resolved render, text variations, logo with and without background, colors and fonts, linked, unlinked, unsafe link, tracked click, wide and tall sizes, markup in text, and all nine background positions. The renderer's classic path was not edited, and every case still matches it, with `layout` absent, `classic` or any of eight bad values.
- `showPlaceholder` is part of the geometry (true for `image-left` and `image-top`) so the renderer does not repeat the layout names.
- A zero or invalid ad size cannot reach the renderer through the response check (`isAdCandidate` requires positive sizes) but the geometry still returns null for one, as a second guard.

## Browser check (T010, 2026-10-21)

Headless Chromium against the real built SDK (`dist/ad-serve-client.js`, version 1.10.0), served on a throwaway page with `page.route` standing in for ad-serve-api (the batch call answered with an error so each slot made its own request). 30 slots: five layouts at 300x250, 970x250 and 300x600, once with a full creative (two-colour image, logo, a very long headline with a very long word, button) and once with a bare one (headline only). Not run against a deployed environment.

- No page errors; the only console message was the deliberate batch 500.
- All five layouts at all three sizes match the adconfig preview: nothing overflows or overlaps; the headline clamps to three lines with an ellipsis at 300x250 and the long word breaks; `image-left` stacks on the tall size; `text-only` shows no image.
- Bare creative: the placeholder icon shows in the image area for `image-left` and `image-top`, and not for `overlay` or `text-only`.
- Fonts in the screenshots are the browser default because the stub sent `inherit`.

