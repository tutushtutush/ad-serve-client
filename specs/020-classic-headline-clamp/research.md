# Research: A very long headline stays inside a classic ad

Decisions and measurements are in adconfig `specs/110-classic-headline-clamp/research.md`. Specific to this repo:

- **R1 - Pre-110 reference first.** The golden file was copied to `classicMarkup.pre110.golden.json` in a commit of its own before any code change (this branch's first commit).
- **R3 - Constants raised on review (option A).** The first version used 17 and 19, the Mac measurements. Review pointed out that other platforms' default font has taller lines (about 19px headline and 21px button), so a headline at the limit could run a few pixels out. The constants are now 20 and 21; the cost is that an extreme headline (10 or more lines at 300x250) in a font with shorter lines is cut a line or two earlier than it needed to be.
- **R2 - Reference geometry.** Saved from the unchanged renderer before the change (`ref110-sdk-before.json`, scratchpad): at 300x250 headline 202 to 219, button 223 to 242, logo 8 to 26.

## Real-browser check (T007, 2026-10-22)

The served markup (`srcdoc`) in an iframe of the ad's own size in headless Chromium. **Ads that fit:** 35 ordinary cases (one-line, three-line, no-logo and no-button ads, and one-line ads in the sans, serif and mono fonts, at 300x250, 970x250, 300x600, 728x90 and 320x100) compared part by part (top, bottom, left and right of the logo, headline and button) against the geometry saved from the unchanged renderer: all 35 identical. **Very long text:** a 40-line headline with a 150-character button label in four fonts, a headline of one 300-character word, and a long headline with no logo and no button, at the five sizes: 0 of 30 draw a part past the edge. With the first constants (17 and 19) the long headline took 11 lines at 300x250; the constants were then raised (R3).

## Golden file (T006)

All 25 entries of `classicMarkup.golden.json` were regenerated; each gains the same two additions and nothing else, which the "differs from the release before spec 020 only by the added styles" test proves by removing the added text and comparing with `classicMarkup.pre110.golden.json` (committed first). The test that asserted the classic button keeps wrapping was changed on purpose (FR-003).

## Re-check after raising the constants to 20 and 21 (2026-10-22)

Same harness and the same saved geometry. The 35 ordinary cases are still identical to the geometry of the unchanged renderer. The 30 very-long-text cases have no part past the edge. To stand in for a platform whose default font has taller lines, the same markup was also drawn with the iframe body at a line height of 1.362 (14px Noto Serif's "normal" is about 19px): the 30 long cases have no part past the edge and none reaches the bottom padding, and the 35 ordinary cases are inside. At 300x250 the long headline now takes 9 lines (66 to 219) with the button at 223 to 242; with the taller font 45 to 217 and 221 to 242. The golden file was regenerated again (clamp counts only) and the pre-110 test still proves the additions are the only change.

## Release (T009, 2026-10-22)

Merged #35 (version 1.12.0 inside the PR) and tagged `v1.12.0` on its merge commit `44f721f`. ad-serve-api #102 bumped its pin to that tag; after its deploy the served `/ad-serve-client.js` on ad-serve-api-test grew from 21,499 to 21,715 bytes, and the Classic ads on EventPulse's test site at 300x250 and 728x90 carry the clamp and the one-line button with nothing past the edge (see adconfig spec 110 research).
