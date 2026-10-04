# Feature Specification: Responsive ad types per breakpoint

**Feature Branch**: `011-responsive-ad-types`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Responsive ad types per breakpoint. A publisher can give one ad slot a list of ad types, each with a minimum screen width, so the right ad size is requested for the visitor's screen (a mobile banner on phones, a leaderboard on desktop; the same idea as Google Publisher Tag size mapping and Prebid sizeConfig). The SDK picks one type from the viewport width when the slot makes its request and sends it as the ad type of that single request; ad-serve-api is unchanged. The existing single ad type attribute keeps working unchanged. The decision is made once per request. Invalid entries are ignored and never break the host page. Framework-agnostic." Motivation: EventPulse placements need different sizes on phone and desktop (see the EventPulse 034 notes).

## User Scenarios & Testing *(mandatory)*

Users here are **publishers**: developers embedding the ad loader. Their visitors benefit indirectly: the ad they
see is sized for their screen.

### User Story 1 - One slot, the right size for each screen (Priority: P1)

A publisher places one slot on a page and lists an ad type for phones and another for desktop. A visitor on a phone
gets the phone-sized ad; a visitor on a desktop gets the desktop-sized one. The publisher does not write two slots
or hide one with styling.

**Why this priority**: This is the whole feature. Without it, a slot is stuck with one size on every screen.

**Independent Test**: Open the same page at a phone width and at a desktop width; confirm the ad request names the
phone type in the first case and the desktop type in the second.

**Acceptance Scenarios**:

1. **Given** a slot listing a phone type from 0px and a desktop type from 768px, **When** the page loads at 390px
   wide, **Then** the request names the phone type.
2. **Given** the same slot, **When** the page loads at 1280px wide, **Then** the request names the desktop type.
3. **Given** a width exactly at a boundary (768px), **When** the slot requests, **Then** the type whose minimum
   width is 768 is chosen (a minimum width is inclusive).
4. **Given** three listed types at 0, 768 and 1024, **When** the page loads at 900px, **Then** the type for 768 is
   chosen (the largest minimum width that fits).

---

### User Story 2 - Existing single-type slots keep working (Priority: P1)

A publisher with slots that name one ad type changes nothing and sees identical behavior.

**Why this priority**: The SDK runs on live third-party pages; an upgrade must never alter existing placements.

**Independent Test**: Run the existing slot scenarios unchanged; all requests and renders are identical to before.

**Acceptance Scenarios**:

1. **Given** a slot with only the single ad type, **When** it loads at any width, **Then** that type is requested.
2. **Given** a slot with both the single type and a breakpoint list, **When** the list yields a type, **Then** the
   list wins; **When** the list yields none, **Then** the single type is used.

---

### User Story 3 - Click and view reporting match the ad that was shown (Priority: P1)

When the visitor clicks, or the ad is viewed, the report identifies the ad type that was actually requested and
shown, so reporting by ad type stays correct.

**Why this priority**: A mismatch would silently corrupt advertiser reporting.

**Independent Test**: Load at phone width, view and click; confirm the click and view reports carry the phone type.
Repeat at desktop width.

**Acceptance Scenarios**:

1. **Given** a responsive slot filled with the phone type, **When** the ad is clicked, **Then** the click carries
   the phone type.
2. **Given** a responsive slot filled with the desktop type, **When** the ad becomes viewable, **Then** the view
   report carries the desktop type.

---

### User Story 4 - Mistakes never break the page (Priority: P2)

A publisher makes a typo in the list. The page is unaffected; valid entries still work and a fully unusable list
simply produces no ad for that slot (or falls back to the single type if given).

**Why this priority**: Fail-silent is a hard requirement for code running on others' pages, but it only matters
once the main flow exists.

**Independent Test**: Provide lists with bad widths, empty names and duplicates; confirm no errors and sensible
behavior.

**Acceptance Scenarios**:

1. **Given** a list with one malformed entry and one valid entry, **When** the slot requests, **Then** the valid
   entry is used.
2. **Given** a list with no usable entry and no single type, **When** the slot loads, **Then** no request is made
   and nothing breaks.
3. **Given** a screen narrower than every listed minimum width and no single type, **When** the slot loads,
   **Then** no request is made.

---

### Edge Cases

- Two entries with the same minimum width: the first one listed wins.
- Entries listed out of order: order does not matter; the largest fitting minimum width wins.
- Width is not a whole non-negative number, or the type name is blank: that entry is ignored.
- The window is resized or the phone is rotated after the ad is shown: nothing is re-requested and the shown ad
  stays; a slot keeps the type it was first given for the life of the page view.
- A slot whose element is replaced by the host page (framework re-render) keeps its original type and does not
  re-request.
- A slot discovered later (infinite scroll, client-side navigation) is sized by the screen at that moment.
- The page embeds the SDK inside a small frame: the frame's own width is what counts.
- A listed type the ad platform has not enabled: the request simply returns no ad, as for any unknown type today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A slot MUST be able to declare an ordered-or-unordered list of ad types, each paired with a minimum
  screen width, through a plain HTML attribute on the slot element.
- **FR-002**: When a slot makes its ad request, the SDK MUST choose the listed type with the largest minimum width
  that is less than or equal to the current screen width, and use it as the ad type of that request.
- **FR-003**: A minimum width MUST be inclusive; ties on width resolve to the first listed entry.
- **FR-004**: A slot that names only the single existing ad type MUST behave exactly as before.
- **FR-005**: When both are present, a usable breakpoint list MUST take precedence; if the list yields no type, the
  single ad type MUST be used; if neither yields a type the slot MUST make no request.
- **FR-006**: Malformed entries (non-numeric or negative width, blank type) MUST be ignored without error and MUST
  NOT affect the remaining entries or any other slot.
- **FR-007**: The chosen type MUST be the type used consistently for the ad request, rendering, click tracking and
  viewable-impression reporting of that slot.
- **FR-008**: The choice MUST be made once per slot and kept for the life of that slot on the page; resizing or
  rotating MUST NOT trigger a new request or change the shown ad.
- **FR-009**: Slot identity used to keep a slot's ad when the host page replaces its element MUST remain stable
  regardless of screen width changes.
- **FR-010**: The request format to ad-serve-api MUST be unchanged: exactly one ad type per request.
- **FR-011**: The feature MUST NOT require or reference any particular front-end framework.
- **FR-012**: Pages that never use the breakpoint list MUST see no change in behavior.

### Key Entities

- **Responsive type list**: the slot's list of (minimum width, ad type) pairs.
- **Resolved ad type**: the single ad type chosen for a slot, fixed for its lifetime on the page.
- **Screen width**: the width of the window the SDK runs in, measured when the slot first requests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With one slot and two listed types, 100% of page loads at phone width request the phone type and
  100% at desktop width request the desktop type.
- **SC-002**: Slots using only the single ad type produce requests and renders identical to the previous release
  (no existing test changes meaning).
- **SC-003**: Click and view reports carry the ad type that was requested in 100% of responsive slot loads.
- **SC-004**: No malformed list can cause an error visible to the host page.
- **SC-005**: Resizing or rotating after load causes zero additional ad requests.
- **SC-006**: The feature works on a plain HTML page with no framework, verified end to end at two widths.

## Assumptions

- Screen width means the width of the browser window (or frame) the SDK runs in, the same quantity responsive
  styling breakpoints use.
- A publisher lists entries as minimum width and ad type pairs in one attribute; the exact notation is a design
  detail for planning.
- Choosing once at first request is acceptable: a visitor resizing the window mid-visit is rare, and re-requesting
  would double-count ad requests.
- ad-serve-api and the ad configuration platform need no change: each request still carries one ad type, and a
  publisher enables every listed type on the platform.
- Out of scope: sending several candidate sizes in one request, fluid or flexible creatives, orientation-specific
  rules, and re-evaluating on resize.
