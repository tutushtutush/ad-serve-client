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


## Review fixes (2026-10-21, after the review of the adconfig PR)

The first version hid the logo and button by fixed text-box heights (80px and 24px) that ignored the padding, the headline and the gap, so on short ad types (728x90, 468x60, 320x50) the headline was clipped or missing; the earlier browser checks only covered 300x250, 970x250 and 300x600. Reversed and replaced by thresholds computed from the content heights, a per-box headline line clamp (1 to 3 lines), `overflow:hidden` on the text box, and a rule that an ad shorter than 100px draws `image-top` side by side. The contract now carries a 28-row table (every layout at seven sizes, including those three) that each repo's tests parse and assert. Re-checked in a real browser at 728x90, 468x60 and 320x50 and again at the standard sizes: headlines end in an ellipsis and nothing is clipped. The classic layout is unchanged by design, so it still clips at 320x50 as it did before this feature.

## Second review (2026-10-21)

Applied: the button and headline now have fixed line heights in a layout (button one line of 16px plus 3px padding, cut with an ellipsis; headline 18px), so the fit heights are exact instead of an estimate of each font's own line height, and a long button no longer wraps and pushes the logo and headline out of the box. The classic path is untouched (a test checks its button still wraps as before). The contract now says a height of exactly 100px is not short, notes that a specs-only change runs no checks in adconfig, and the committed `.specify/feature.json` is back to the pretty-printed format.

Also applied: the layout path and the classic path now share the one gradient constant (the golden test pins the classic string).

Not changed, with reasons: the overlay scrim with no image (a recorded decision in adconfig spec 101); a very small portrait ad such as 50x90 (not a standard ad size); the cross-repo copies of the numbers (the accepted trade-off of plan R3, held together by the contract table that each repo's tests parse).

## Release and test-environment check (2026-10-22)

Merged as `0ff5dfb` and tagged `v1.10.0` (annotated, like the earlier tags). **Releasing this SDK needs a second step:** ad-serve-api serves it from a pin in its `package.json`, so a pin-bump PR there (#98, as #71 did for v1.7.0) is what puts it in front of pages. After that deployed, the test service's `/ad-serve-client.js` held the layout code, ads without a layout drew as before, and a test ad set to Image left was drawn by the deployed SDK on the EventPulse test site (image box and text box each 50% wide, as in the contract), then set back to Classic. Details in adconfig `specs/101-ad-layout-presets/research.md`.

## Convergence (2026-10-22)

Checked the code against spec, plan and tasks. Everything the spec requires is built and verified; the one gap was the spec's own text: US3 acceptance 2 and FR-008 still described the first draft's fixed 80px and 24px thresholds, while the contract and code use content-based heights (see "Review fixes"). The spec was updated to match (T014). No code change.
