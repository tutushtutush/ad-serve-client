# Feature Specification: Background image position

**Feature Branch**: `014-background-image-position`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Render the background image position. adconfig spec 074 lets a member choose where a background image is anchored when it is trimmed to fill the ad (nine positions, default center). ad-serve-api (companion spec) passes the chosen name in the resolved render as `backgroundImagePosition`. The SDK must draw the image anchored at that position, and keep centering it when the field is missing or not one of the nine." Findings are in [research.md](research.md).

## Why this exists

An ad's background image fills the ad and is trimmed to cover it, always around the center. adconfig now lets a member keep the left, right, top, bottom or a corner instead, so a subject stays visible and the other side is free for the headline. The preview already does this; the served ad must show the same part of the image or the member is shown something the page never displays.

## User Scenarios & Testing *(mandatory)*

Users here are **publishers** embedding the loader and the **advertisers** whose ads it shows.

### User Story 1 - The served ad keeps the part of the image the member chose (Priority: P1)

An ad whose resolved render names a position is drawn with the background image anchored there.

**Why this priority**: This is the feature.

**Independent Test**: Render an ad with a wide image on a tall slot for each of the nine names and check the image is anchored at the matching edge(s).

**Acceptance Scenarios**:

1. **Given** a resolved render with `backgroundImagePosition` "left", **When** the ad is drawn, **Then** the image keeps its left edge and is trimmed on the right.
2. **Given** each of the nine names, **When** the ad is drawn, **Then** the anchor is the one in the shared table in the contract.

---

### User Story 2 - Nothing changes without a valid position (Priority: P1)

Ads whose response has no position, or an unknown or malformed one, look exactly as they do today.

**Why this priority**: The server and SDK are deployed separately; live ads must not shift or break.

**Independent Test**: Render with the field missing, empty, wrongly cased, a number and a hostile string; every result is centered and no markup changes other than as today.

**Acceptance Scenarios**:

1. **Given** no `backgroundImagePosition`, **When** the ad is drawn, **Then** the image is centered, as before.
2. **Given** a value that is not one of the nine names, **When** the ad is drawn, **Then** the image is centered and the value appears nowhere in the markup.

### Edge Cases

- An ad with no background image shows the placeholder as before; the field is ignored.
- The field is present on an older server's response: ignored by an older SDK, honored by this one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the resolved render names one of the nine positions, the background image MUST be anchored at it, still filling and covering the ad.
- **FR-002**: When the field is missing or not exactly one of the nine names, the image MUST be centered, as today.
- **FR-003**: The received value MUST NOT be copied into the markup; only a fixed, known anchor may be written (the response is untrusted).
- **FR-004**: The logo, headline, call to action, click handling and placeholder MUST be unchanged.
- **FR-005**: The field MUST be optional on the wire type; an ad without it is valid.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of the nine names the drawn ad anchors the image as in the shared table (checked by tests).
- **SC-002**: With the field missing or invalid, the drawn markup is identical to today's.
- **SC-003**: No test input can place text of its own into the drawn style.

## Assumptions

- The nine names and their anchors are the shared table in adconfig spec 074 (`contracts/resolved-render.md`), repeated in each repo's tests.
- Deploy order: this SDK first, then ad-serve-api, then adconfig, so any partial state shows the image centered.
- Out of scope: other layout changes, headline positioning.
