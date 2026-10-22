# Feature Specification: A very long headline stays inside a classic ad

**Feature Branch**: `020-classic-headline-clamp`

**Created**: 2026-10-22

**Status**: Draft

**Input**: adconfig spec 110 (`specs/110-classic-headline-clamp/` in the adconfig repo): the classic layout never clamps the headline or the button, so a very long headline or button label pushes the logo, headline and button out of the ad. This repo draws the served ad, so it needs the same change as adconfig's preview. The reasoning, the owner's decisions (no three-line cap; a one-line button) and the measurements are in adconfig's spec 110 `research.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A served classic ad keeps every part inside (Priority: P1)

On an ad 82px tall or more, a very long headline ends in an ellipsis after the lines that fit, and a long button label stays on one line with an ellipsis; the logo, headline and button all stay inside the ad.

**Independent Test**: Render a classic ad with a logo, a 40-line headline and a 150-character button label at 300x250, 970x250, 300x600, 728x90 and 320x100 in a real browser: no part is past the edge.

**Acceptance Scenarios**:

1. **Given** a classic ad at 320x100 with a long headline, **When** drawn, **Then** the headline is cut to the lines that fit and the button stays inside.
2. **Given** a long button label, **When** drawn, **Then** the button is one line ending in an ellipsis.
3. **Given** a headline that is one very long word, **When** drawn, **Then** it breaks inside the ad's width.

### User Story 2 - Ads that fit look the same (Priority: P1)

A classic ad whose headline and button already fit is drawn with the same geometry as before. Its markup gains two additions (a line clamp on the headline, a one-line limit on the button) and nothing else, shown by a test against the previous release's markup.

**Independent Test**: The pre-spec-020 golden is kept; a test removes only the added styles from the new markup and expects the old string.

### User Story 3 - Same rule as adconfig (Priority: P2)

The SDK asserts the shared table of adconfig's `contracts/classic-headline.md` (this repo's column is "Lines (SDK)").

## Requirements *(mandatory)*

- **FR-001**: At 82px tall and over, a classic ad's logo, headline and button MUST stay inside the ad whatever the length of the headline or button label.
- **FR-002**: The headline MUST be limited to `max(1, floor(room / 20))` lines with no cap at three, where `room` is the ad height minus 16, minus 18 when a logo is drawn, minus 4 plus 21 when a button is drawn (the SDK's line and button heights, rounded up to cover the default serif of Android and the Windows UI font), and a cut headline MUST end in an ellipsis.
- **FR-003**: The button MUST stay on one line and end in an ellipsis.
- **FR-004**: A single very long word MUST break inside the ad's width.
- **FR-005**: An ad that fits MUST have the same geometry as before; its markup differs from the previous release's only by the two added style strings.
- **FR-006**: A missing, zero or non-finite height, an unknown layout, and any ad under 82px MUST be drawn as before (the latter under spec 019).
- **FR-007**: No wire format, layout name or accepted value changes; a release in any order with adconfig and ad-serve-api breaks nothing.
- **FR-008**: The other four layouts and spec 019's short-ad rule MUST NOT change.

## Success Criteria *(mandatory)*

- **SC-001**: With a 40-line headline and a 150-character label, 0 of the five sizes draw a part past the edge (real browser, default and three other fonts).
- **SC-002**: For ordinary ads at the five sizes, the geometry of every part is identical before and after.
- **SC-003**: The five table rows pass.

## Assumptions

- The SDK's line (20) and button (21) are above the values measured on the Mac in the default, sans, serif and mono fonts (16 to 17 and 18 to 19) so that a platform default font with taller lines (Android's Noto Serif, Windows' UI font, about 19 and 21) stays inside the ad; the preview uses 21 and 22 (adconfig spec 110 research D3).
- The version moves to 1.12.0 in this PR; the tag goes on the merge commit; ad-serve-api then bumps its pin.
- Out of scope: right-to-left text, a headline length limit in the editor, new layouts.
