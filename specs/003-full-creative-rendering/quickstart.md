# Quickstart: Full Creative Rendering Fidelity

Validates against a real ad-serve-api instance already returning `resolvedRender` (its feature
006, merged) and a real adconfig-created ad, reusing the same platform/API-driven setup pattern
from the original full-circle test.

## Prerequisites

- This repo built (`npm run build`) so `dist/ad-serve-client.js` reflects this feature.
- ad-serve-api running locally, on a version that includes `ad.resolvedRender` (feature 006).
- adconfig reachable to create/update a test ad via its real API (same pattern as the original
  full-circle setup).

## Scenario 1: A logo, custom colors/fonts, and a background image all render (US1, US2)

Create (or update) an ad config via adconfig's API with a logo, a background image, and explicit
headline/CTA colors and fonts, then confirm via `GET /ads` that `resolvedRender` reflects them:

```bash
curl -s "http://localhost:4010/ads?platformId=<platformId>&adTypeId=medium-rectangle" | jq .ad.resolvedRender
```

**Expected**: `hasLogoImage: true` with a `logoImageDataUrl`, `hasBackgroundImage: true` with a
`backgroundImageDataUrl`, and the configured `headlineTextColor`/`headlineFontFamily`/
`ctaTextColor`/`ctaFontFamily` values present.

Then load a test page with this ad's slot and confirm in the browser: the logo appears, the
background image appears (no placeholder), and the headline/CTA are rendered in the configured
colors/fonts (inspect the iframe's `srcdoc` for the corresponding inline styles).

## Scenario 2: No CTA background configured — button still has a background (US3)

Using an ad config where `ctaBackgroundColor` was never explicitly set, confirm
`resolvedRender.ctaBackgroundColor` is still a real color value (the server-applied default, not
empty/missing), and that the rendered button has a visible background in the browser.

## Scenario 3: No background image configured — placeholder appears (US4)

Using an ad config with no background image, confirm `resolvedRender.hasBackgroundImage` is
`false` and `backgroundImageDataUrl` is absent, then confirm the rendered ad shows a
gradient-and-icon placeholder rather than a blank area, sized per `resolvedRender.iconSize`.

## Scenario 4: No link configured — ad is not clickable (US5)

Using an ad config with no destination link, confirm `resolvedRender.isLinked` is `false`, then
confirm the rendered ad's wrapper is a non-interactive element (not an `<a>`), even though earlier
scenarios' linked ads use a real `<a href>`.

## Scenario 5: Missing/malformed `resolvedRender` still degrades safely (FR-010)

Using a fake `AdDecisionClientLike` in a unit test (not achievable live against a real
feature-006 ad-serve-api, since it always includes the field) — or, if available, a deliberately
older/stubbed response with `resolvedRender` omitted entirely — confirm the ad still renders with
safe defaults (blank/default text, no logo, placeholder background, non-clickable) rather than
throwing or leaving the slot in a broken state. This scenario is primarily covered by unit tests
(see tasks.md) rather than a live walkthrough, since forcing a real malformed server response
isn't practical against a real, correctly-functioning ad-serve-api instance.

## Cleanup

Restore/remove any test-specific ad configs created for this quickstart via adconfig's API, same
pattern as the original full-circle test's cleanup.
