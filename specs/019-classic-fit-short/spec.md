# Feature Specification: Classic layout fits very short ads

**Feature Branch**: `019-classic-fit-short`

**Created**: 2026-10-22

**Status**: Draft

**Input**: adconfig spec 109 (`specs/109-fix-the-classic/` in the adconfig repo): the classic layout is cut off at the bottom on ads that are too short for its whole stack (468x60 and 320x50). This repo draws the served ad, so it needs the same fix as adconfig's preview.

## Background

Spec 018 gave the four preset layouts rules that drop the logo and button when there is no room and clamp the headline. Classic was kept byte-identical, so at 468x60 and 320x50 a served Classic ad is cut off. adconfig spec 109 fixes the preview and fixes the rule and the shared table; this spec makes the SDK draw the same thing. The full reasoning, alternatives and measurements are in adconfig's spec 109 `research.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A served Classic ad on a short size shows nothing cut off (Priority: P1)

A visitor sees a Classic ad at 468x60 or 320x50 with every part wholly visible: the logo is left out, the button is left out when there is no room, and a long headline ends in an ellipsis.

**Independent Test**: Render a Classic ad with logo, headline and button at 468x60 and 320x50 in a real browser; nothing is cut off at the edge.

**Acceptance Scenarios**:

1. **Given** a Classic ad at 468x60, **When** drawn, **Then** there is no logo, the button and one line of headline are shown, and nothing is cut off.
2. **Given** a Classic ad at 320x50, **When** drawn, **Then** only one line of headline is shown, and nothing is cut off.

### User Story 2 - Ads that already fit do not change (Priority: P1)

Any Classic ad at 300x250, 970x250, 300x600, 728x90 or 320x100, and any ad with an unknown or missing layout, is drawn exactly as before, character for character.

**Independent Test**: The golden markup of the previous release (spec 018) matches, including new cases at 728x90 and 320x100 captured before this change.

**Acceptance Scenarios**:

1. **Given** the golden cases, **When** rendered, **Then** every one matches the previous release byte for byte.
2. **Given** a missing, empty or unknown layout, **When** rendered, **Then** the result equals the classic result for that size.

### User Story 3 - Same rule as adconfig (Priority: P2)

The SDK and adconfig's preview agree on every standard size, pinned by the shared table in adconfig's `specs/109-fix-the-classic/contracts/classic-fit.md`.

## Requirements *(mandatory)*

- **FR-001**: At every standard size a Classic ad with a headline of ordinary length MUST NOT be cut off by the edge of the ad.
- **FR-002**: When the ad's inner height (height minus 16) is under 66, Classic MUST leave out the logo, show the button only when the inner height is at least 44, and clamp the headline to the lines left (at least 1, at most 3) with an ellipsis, using the same arithmetic as the layouts.
- **FR-003**: When the inner height is 66 or more, Classic MUST be drawn exactly as in the previous release.
- **FR-004**: Nothing about the wire format, the layout names or what the SDK accepts changes; an unknown layout is still drawn as Classic.
- **FR-005**: The other four layouts MUST NOT change.
- **FR-006**: The decision MUST use the ad's height only, and the SDK's tests MUST assert the seven rows of the shared Classic table.
- **FR-007**: Release is safe in any order with adconfig and ad-serve-api: an older SDK keeps drawing Classic as before.

## Success Criteria *(mandatory)*

- **SC-001**: At all seven standard sizes no part of a sampled Classic ad is cut off (real browser).
- **SC-002**: The golden cases, including 728x90 and 320x100, are byte-identical to the previous release.
- **SC-003**: The seven shared table rows pass.

## Assumptions

- The rule and its threshold are decided in adconfig spec 109; this spec does not re-derive them.
- ad-serve-api serves this SDK from a pinned tag, so after the release it needs a pin bump (a one-line PR, no spec).
- Out of scope: right-to-left text, clamping Classic on tall ads, new layouts.
