# Research: A very long headline stays inside a classic ad

Decisions and measurements are in adconfig `specs/110-classic-headline-clamp/research.md`. Specific to this repo:

- **R1 - Pre-110 reference first.** The golden file was copied to `classicMarkup.pre110.golden.json` in a commit of its own before any code change (this branch's first commit).
- **R3 - Constants raised on review (option A).** The first version used 17 and 19, the Mac measurements. Review pointed out that other platforms' default font has taller lines (about 19px headline and 21px button), so a headline at the limit could run a few pixels out. The constants are now 20 and 21; the cost is that an extreme headline (10 or more lines at 300x250) in a font with shorter lines is cut a line or two earlier than it needed to be.
- **R2 - Reference geometry.** Saved from the unchanged renderer before the change (`ref110-sdk-before.json`, scratchpad): at 300x250 headline 202 to 219, button 223 to 242, logo 8 to 26.

## Real-browser check (T007, 2026-10-22)

The served markup (`srcdoc`) in an iframe of the ad's own size in headless Chromium. **Ads that fit:** 35 ordinary cases (one-line, three-line, no-logo and no-button ads, and one-line ads in the sans, serif and mono fonts, at 300x250, 970x250, 300x600, 728x90 and 320x100) compared part by part (top, bottom, left and right of the logo, headline and button) against the geometry saved from the unchanged renderer: all 35 identical. **Very long text:** a 40-line headline with a 150-character button label in four fonts, a headline of one 300-character word, and a long headline with no logo and no button, at the five sizes: 0 of 30 draw a part past the edge. At 300x250 the headline takes 11 lines (32 to 219) with the button at 223 to 242 and the logo at 8 to 26; at 320x100 it takes two lines and at 728x90 one.

## Golden file (T006)

All 25 entries of `classicMarkup.golden.json` were regenerated; each gains the same two additions and nothing else, which the "differs from the release before spec 020 only by the added styles" test proves by removing the added text and comparing with `classicMarkup.pre110.golden.json` (committed first). The test that asserted the classic button keeps wrapping was changed on purpose (FR-003).
