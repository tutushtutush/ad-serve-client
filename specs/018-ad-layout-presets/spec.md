# Feature Specification: Ad layout presets

**Feature Branch**: `018-draw-ad-layout`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Draw ad layout presets in ad-serve-client (companion to adconfig spec 101, branch 101-ad-layout-presets). The ad decision response's `resolvedRender` gains an optional `layout` field: one of classic, image-left, image-top, overlay, text-only. The renderer arranges the image, logo, headline and call to action per the shared contract (adconfig `specs/101-ad-layout-presets/contracts/resolved-render.md`, copied into [contracts/resolved-render.md](contracts/resolved-render.md)). A missing, non-string or unknown value draws classic, exactly as today. The value is looked up in a fixed table and never copied into markup. Release as a new SDK version; deploy order is ad-serve-client first, then ad-serve-api, then adconfig." Findings are recorded in [research.md](research.md).

## Why this exists

Every ad this SDK draws has one fixed look: logo at the top, headline and button at the bottom, image filling the ad. Advertisers using adconfig will soon be able to choose another look for an ad (a product photo beside the text, text only, text over the image). That choice reaches this SDK as one extra value in the ad decision response, and the SDK must draw it the same way adconfig's preview does, or what an advertiser approves is not what visitors see.

This SDK is released first, before the serving API or adconfig send anything. So it has to be safe to ship on its own: with no layout in the response it must draw exactly what it draws today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A served ad uses the layout the advertiser chose (Priority: P1)

An ad whose decision response carries a layout is drawn in that layout: the image, logo, headline and button sit where the layout puts them, at the ad's size.

**Why this priority**: This is the whole feature.

**Independent Test**: Feed the renderer one ad with an image, logo, headline and button, once per layout, and check the drawn ad against the shared table in the contract.

**Acceptance Scenarios**:

1. **Given** a response with layout "image-left", **When** the ad is drawn, **Then** the image fills the left half of the ad and the logo, headline and button sit in the right half.
2. **Given** layout "image-top", **When** drawn, **Then** the image fills the top 60% and the text sits in the bottom 40%.
3. **Given** layout "overlay", **When** drawn, **Then** the image fills the ad and the text is centered on a dark layer over it.
4. **Given** layout "text-only", **When** drawn, **Then** no image is shown and the text is centered on the ad's background.
5. **Given** layout "image-left" on a tall ad (taller than wide), **When** drawn, **Then** it is arranged like "image-top".
6. **Given** a background image position in the same response, **When** an image is shown, **Then** that position still decides which part of the image is kept, inside the image's area.

---

### User Story 2 - Ads without a layout look exactly as before (Priority: P1)

A response with no layout, an empty one, one that is not text, or one this SDK does not know, is drawn exactly as it is today.

**Why this priority**: This SDK ships first and runs on live pages. Until the serving API sends layouts, every ad it draws has none, and a later layout name this version does not know must not break an ad.

**Independent Test**: Draw a set of ads with the field missing and with bad values, and compare the markup with what the previous release produced.

**Acceptance Scenarios**:

1. **Given** a response with no layout, **When** drawn, **Then** the markup is identical to the previous release's.
2. **Given** a layout that is empty, a number, an object, a different case ("IMAGE-LEFT") or an unknown name, **When** drawn, **Then** it is drawn as classic, identical to the previous release's markup.
3. **Given** layout "classic", **When** drawn, **Then** the markup is identical to the previous release's.

---

### User Story 3 - Every layout stays readable (Priority: P2)

Each layout holds up at every ad size, with a long headline, and with parts missing.

**Why this priority**: A layout that overflows or leaves a hole on a publisher's page reflects on the publisher, not just the advertiser.

**Independent Test**: Draw each layout at a wide, a tall and a medium size with a very long headline (including one very long word), then with no image, logo or button.

**Acceptance Scenarios**:

1. **Given** any layout and a long headline, **When** drawn, **Then** the headline stops at the lines its text area has room for (one to three) with an ellipsis and a word longer than the text area breaks instead of overflowing.
2. **Given** a text area too short to hold the logo, the headline and the button, **When** drawn, **Then** the logo is left out first, then the button, and one line of headline is always kept; **Given** an ad shorter than 100px, **Then** "image-top" is drawn side by side so the text has room. The heights are in the contract.
3. **Given** no image in the response, **When** a layout with an image area beside the text ("image-left", "image-top") is drawn, **Then** the usual placeholder icon shows in the image area; for "overlay" and "text-only" no icon is drawn.
4. **Given** no logo, headline or button, **When** drawn, **Then** nothing is drawn for the missing part and nothing overlaps.

---

### User Story 4 - A layout can never break a page (Priority: P1)

The layout value comes from a response the SDK does not control. Whatever it holds, the ad is drawn safely or not at all, and the host page is not affected.

**Why this priority**: The SDK runs inside third-party pages and must never break them, and must never let a response write its own markup.

**Independent Test**: Draw ads whose layout is a long string, markup, a quote-and-bracket string, an object and an array; check the output is the classic markup and contains none of the value.

**Acceptance Scenarios**:

1. **Given** a layout containing markup or quotes, **When** drawn, **Then** none of that text appears in the drawn ad, which is the classic one.
2. **Given** a response in which every other field is also bad, **When** drawn, **Then** the SDK behaves as it does today for those fields and does not throw.

---

### Edge Cases

- An older SDK on a page that meets a response with a layout: it ignores the field and draws classic; this is the other side of the staged release and needs no change here.
- A layout with the ad size missing or zero: drawn as classic.
- Layout "text-only" with an image in the response: the image is not shown.
- A very short ad (for example a 728x90 leaderboard) in "image-top": the logo is left out and the button stays.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST accept an optional `layout` in the resolved render of an ad, one of `classic`, `image-left`, `image-top`, `overlay`, `text-only`.
- **FR-002**: The SDK MUST draw each layout as the shared contract's table says, for the ad's own width and height.
- **FR-003**: A missing, empty, non-text or unknown `layout`, or one in a different case, MUST be drawn as `classic`.
- **FR-004**: Drawing `classic`, or an ad with no `layout`, MUST produce markup identical to the previous release's for the same input.
- **FR-005**: The `layout` value MUST be looked up in a fixed list of names and MUST NOT itself appear in the drawn markup.
- **FR-006**: "image-left" on an ad taller than it is wide MUST be drawn as "image-top".
- **FR-007**: The background image position MUST keep deciding which part of the image is shown, inside the image's area, for every layout that shows an image.
- **FR-008**: The headline MUST stop after three lines with an ellipsis, and a word longer than its area MUST break; the logo MUST be left out first and then the button when the text area cannot hold them, using the heights in the contract (fixed line heights make them exact), the headline taking the lines that are left (one to three); an ad shorter than 100px MUST draw "image-top" side by side.
- **FR-009**: When there is no image, "image-left" and "image-top" MUST show the placeholder icon in the image area; "overlay" and "text-only" MUST NOT draw it.
- **FR-010**: "text-only" MUST NOT show the image even when the response has one.
- **FR-011**: A bad `layout` MUST NOT cause an error, a warning to the host page, or any visible difference from `classic`.
- **FR-012**: The shared contract's table and rules MUST be tested in this repo against the drawn markup, so a change here that is not made in adconfig and ad-serve-api is caught.
- **FR-013**: The release MUST be a new SDK version with no change to how a platform embeds or configures it.

### Key Entities

- **Resolved render**: The existing description of how to draw one ad, sent in the ad decision response. Gains one optional text value, `layout`.
- **Layout**: One of five named arrangements; see the contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For ads with no layout, 100% of drawn ads are identical to the previous release's in a comparison over a representative set of inputs, including missing and bad values.
- **SC-002**: For each of the five layouts, at a wide, a tall and a medium size, the drawn ad matches the shared contract table with nothing overlapping or overflowing, including with a very long headline.
- **SC-003**: A layout value that is not on the list never appears in the drawn ad and never raises an error, across a set of at least ten hostile or malformed values.
- **SC-004**: With this release live and nothing else changed, no ad on any page looks different from before.

## Assumptions

- The five layout names and the arrangement rules are decided in adconfig spec 101 and are copied here as given; changing them is done there first.
- Ad sizes come with each ad in the response; this repo does not know a fixed list of sizes.
- The serving API will pass the field through in its own release after this one; until then no response carries it.
- The SDK's existing safe-value handling (a fixed table for anything that reaches the markup) is the pattern to follow.
- Out of scope: choosing a layout, previews, the serving API, and any change to how a platform embeds the SDK.
