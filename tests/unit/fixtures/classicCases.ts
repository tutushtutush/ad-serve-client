import type { AdCandidate } from "../../../src/types";
import { makeAdWithResolvedRender } from "./adCreative";

const BG = "data:image/png;base64,BG";
const LOGO = "data:image/png;base64,LOGO";
const POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

// Ads drawn with no layout. The golden file holds what the release before spec 018 produced for
// each, so classic markup stays byte-identical (spec 018 FR-004).
export const CLASSIC_CASES: Record<string, () => AdCandidate> = {
  defaults: () => makeAdWithResolvedRender(),
  "no resolved render": () => ({ creative: makeAdWithResolvedRender().creative, width: 300, height: 250 }),
  "headline only": () => makeAdWithResolvedRender({ ctaText: "" }),
  "empty text": () => makeAdWithResolvedRender({ headlineText: "", ctaText: "" }),
  logo: () => makeAdWithResolvedRender({ hasLogoImage: true, logoImageDataUrl: LOGO }),
  "logo without background": () =>
    makeAdWithResolvedRender({ hasLogoImage: true, logoImageDataUrl: LOGO, logoBackgroundEnabled: false }),
  background: () => makeAdWithResolvedRender({ hasBackgroundImage: true, backgroundImageDataUrl: BG }),
  "colors and fonts": () =>
    makeAdWithResolvedRender({
      headlineTextColor: "#112233",
      headlineFontFamily: "Georgia, serif",
      ctaTextColor: "rgb(1, 2, 3)",
      ctaFontFamily: "monospace",
      ctaBackgroundColor: "#ff0000",
    }),
  unlinked: () => makeAdWithResolvedRender({ isLinked: false }),
  "unsafe link": () => makeAdWithResolvedRender({ linkUrl: "javascript:alert(1)" }),
  "tracked click": () => ({
    ...makeAdWithResolvedRender({ hasBackgroundImage: true, backgroundImageDataUrl: BG }),
    adConfigId: "cfg-1",
    impressionId: "imp-1",
  }),
  "wide size": () => ({ ...makeAdWithResolvedRender(), width: 970, height: 250 }),
  "tall size": () => ({ ...makeAdWithResolvedRender(), width: 300, height: 600 }),
  // Sizes that are short but still hold the whole classic stack (spec 019): they must not move.
  "leaderboard size": () => ({ ...makeAdWithResolvedRender({ hasLogoImage: true, logoImageDataUrl: LOGO }), width: 728, height: 90 }),
  "large mobile banner size": () => ({ ...makeAdWithResolvedRender({ hasLogoImage: true, logoImageDataUrl: LOGO }), width: 320, height: 100 }),
  "markup in text": () => makeAdWithResolvedRender({ headlineText: `<b>"x"</b> & 'y'`, ariaLabel: `"><script>` }),
  ...Object.fromEntries(
    POSITIONS.map((position) => [
      `position ${position}`,
      () =>
        makeAdWithResolvedRender({
          hasBackgroundImage: true,
          backgroundImageDataUrl: BG,
          backgroundImagePosition: position,
        }),
    ]),
  ),
};
