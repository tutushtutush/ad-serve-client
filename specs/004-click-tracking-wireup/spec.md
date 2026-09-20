# Feature Specification: Route Clicks Through Click Tracking

**Feature Branch**: `004-wire-the-rendered`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Wire the rendered creative's click-through link to ad-serve-api's click endpoint so clicks get tracked"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A clicked ad gets recorded, and the viewer still reaches the advertiser (Priority: P1)

As an ad operator, when a viewer clicks a rendered ad, I want that click routed through
ad-serve-api's click-tracking mechanism so it's recorded, while the viewer still ends up on the
advertiser's page exactly as before.

**Why this priority**: Without this, ad-serve-api's click-tracking endpoint has no real traffic —
all the value of recording clicks depends on rendered ads actually linking through it.

**Independent Test**: Render a clickable ad with a valid destination; click it; confirm the click
is routed through the tracking mechanism and the viewer still reaches the advertiser's page.

**Acceptance Scenarios**:

1. **Given** a rendered, clickable ad with a valid destination, **When** a viewer clicks it,
   **Then** the click is routed through the tracking mechanism and the viewer still reaches the
   advertiser's page.
2. **Given** the same ad slot is redisplayed (e.g. after being removed and reinserted by the host
   page), **When** clicked after redisplay, **Then** the click is still correctly trackable — no
   stale or missing tracking information from having rendered more than once.

---

### User Story 2 - A viewer always reaches the advertiser, even if tracking can't be set up (Priority: P1)

As a viewer, if the information needed to route a click through tracking is ever unavailable, I
still want a clickable ad to take me straight to the advertiser's page, so a tracking limitation
never breaks my ability to click through an ad.

**Why this priority**: This SDK's governing rule is that it must never make things worse for a
viewer than not having tracking at all (see this project's Fail-Silent principle) — ranked equally
P1 with User Story 1, since routing clicks through tracking must never come at the cost of the
click actually working.

**Independent Test**: Simulate the information needed to build a tracked link being unavailable;
confirm clicking the ad still reaches the advertiser's page directly.

**Acceptance Scenarios**:

1. **Given** the information needed to build a tracked link is unavailable, **When** a viewer
   clicks the ad, **Then** they are still taken directly to the advertiser's page — exactly the
   behavior this SDK already has today, without tracking.
2. **Given** an ad's destination is itself invalid or unsafe (already-established safety rule),
   **When** the ad renders, **Then** it remains non-interactive, exactly as today — this feature
   does not loosen that existing rule to make more things clickable than before.

---

### Edge Cases

- What happens when an ad has no destination at all (non-clickable by design)? No change —
  remains non-interactive; no tracked link is attempted for it either.
- What happens when this SDK's own configured tracking-service address is missing or blank (a
  publisher setup issue)? Falls back to direct-link behavior (User Story 2) rather than producing
  a broken link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a rendered ad is genuinely clickable (the existing, unchanged safety rule) and
  the information needed to build a tracked link is available, the system MUST route the click
  through ad-serve-api's click-tracking mechanism instead of linking directly to the advertiser.
- **FR-002**: A tracked click MUST still result in the viewer reaching the exact same advertiser
  destination they would have reached without tracking.
- **FR-003**: If the information needed to build a tracked link is unavailable for any reason, the
  system MUST fall back to linking directly to the advertiser's destination — matching this SDK's
  existing behavior — rather than making the ad non-clickable.
- **FR-004**: This feature MUST NOT change which ads are considered clickable in the first place —
  only how an already-clickable ad's click gets routed.

### Key Entities

None — this feature changes existing rendering behavior; it introduces no new data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rendered, clickable ad's click reaches the advertiser's page 100% of the time,
  matching this SDK's behavior before this feature.
- **SC-002**: When the needed information is available, 100% of clicks on a clickable ad are
  routed through the tracking mechanism first.
- **SC-003**: When the needed information is unavailable, clicking still reaches the advertiser's
  page with zero increase in broken/non-functional links compared to before this feature.

## Assumptions

- ad-serve-api's click-tracking endpoint already exists and is stable — this feature only changes
  what a rendered ad's link points to, not the endpoint itself.
- No visual or interaction change for the viewer — the ad looks and behaves identically; only the
  underlying link target changes.
- Attribution parameters beyond identifying the ad and where it was shown are out of scope, matching
  the click-tracking endpoint's own current scope.
