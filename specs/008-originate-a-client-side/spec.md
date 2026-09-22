# Feature Specification: Originate and Attach a Visitor Session Identifier

**Feature Branch**: `008-originate-a-client-side`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Originate a client-side visitor session id (sessionStorage-backed UUID) and attach it to ad-decision, click, and viewable-impression requests, so ad-serve-api's session-level tracking (feature 016) receives a real sessionId in production."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor's activity across separate page loads in one visit is attributed to the same session (Priority: P1)

As an ad operator, when the same visitor loads more than one page during a single visit and each
page independently requests, and possibly interacts with, an ad, I want ad-serve-api to be able to
tell those requests came from the same visit, so that its own session-level dedup (feature 016)
actually has a real, persistent identifier to key off — not a fresh one invented every time this
SDK's script re-runs.

**Why this priority**: This is the entire reason this feature exists — ad-serve-api's
session-level tracking was built already but has never received a real `sessionId` from any
client, so today it silently falls back to its "no session identifier" behavior on every request.
Without this, feature 016 has no effect in production.

**Independent Test**: Run this SDK's bootstrap twice against the same underlying session storage
(simulating two separate page loads in one browser tab), and confirm both runs read back the
identical session identifier rather than each minting its own.

**Acceptance Scenarios**:

1. **Given** this SDK has already originated a session identifier and persisted it, **When** this
   SDK's bootstrap runs again (a new page load in the same tab), **Then** it reads back that same
   identifier instead of creating a new one.
2. **Given** no session identifier has been persisted yet (a visitor's first page load in a new
   tab), **When** this SDK's bootstrap runs, **Then** it originates one and persists it so a later
   page load in the same tab can read it back.

---

### User Story 2 - Every ad request on one page load shares the same session identifier (Priority: P1)

As an ad operator, when a single page shows more than one ad slot, I want every decision, click,
and viewable-impression request that page produces to carry the same session identifier, so that
ad-serve-api's session-level counting correctly attributes all of that page's engagement to one
visit rather than fragmenting it.

**Why this priority**: A page with multiple slots is common; if each slot's requests carried a
different session identifier, session-level dedup would never actually collapse same-visit
engagement the way feature 016 intends, defeating the point even after User Story 1 is satisfied.

**Independent Test**: Configure a page with two or more ad slots and confirm every ad-decision
request, and every click/viewable-impression report produced for either slot, carries the
identical session identifier.

**Acceptance Scenarios**:

1. **Given** a page with two ad slots, **When** this SDK requests an ad for each, **Then** both
   decision requests carry the same session identifier.
2. **Given** an ad in either slot is clicked or becomes viewable, **When** the corresponding
   tracking request is built, **Then** it carries that same session identifier too.

---

### User Story 3 - Ad serving and tracking keep working exactly as before when no session identifier is available (Priority: P2)

As a visitor, I want my ad experience and this SDK's existing tracking behavior to be completely
unaffected when a session identifier cannot be originated or persisted — private browsing modes,
disabled storage, or any other environment where session storage misbehaves — so that adopting
this capability can never itself become a source of breakage.

**Why this priority**: This SDK's standing guarantee (Constitution Principle V, Fail-Silent) is
that a tracking enhancement never degrades the feature it's attached to. Session storage is
outside this SDK's control and known to be unreliable in some browser privacy modes, so this
capability must degrade to today's exact behavior whenever it can't be used.

**Independent Test**: Simulate session storage being unavailable or throwing on every access, then
confirm ad decision, rendering, click tracking, and viewable-impression tracking all still happen
exactly as they did before this feature, simply without a session identifier attached.

**Acceptance Scenarios**:

1. **Given** session storage is unavailable or throws on access, **When** this SDK runs, **Then**
   ad requests are still made, ads still render, and clicks/viewable-impressions are still
   tracked — all without a session identifier, and without any error reaching the host page.
2. **Given** a session identifier could not be originated for this page load, **When** any
   tracking report is built, **Then** it is built and sent exactly as it would have been before
   this feature existed, just without that one field.

### Edge Cases

- What happens when session storage's stored value is present but empty or otherwise unusable?
  Treated the same as absent — a fresh identifier is originated and persisted, exactly as if
  nothing had been stored yet.
- What happens if originating a session identifier succeeds but persisting it fails (or vice
  versa)? The whole operation degrades to "no session identifier for this page load" rather than
  using a value that couldn't actually be saved for a later page load to read back — this feature
  never uses a session identifier it can't also confirm was stored.
- What happens on a redisplay of an already-rendered ad, or a retried tracking report? It carries
  the same session identifier as every other request on that page load, exactly like every other
  shared, page-load-scoped value this SDK already threads through (e.g. the API base URL) — a
  session identifier is not per-serving like `impressionId` (feature 007), so redisplay raises no
  special case at all.
- What happens the next time the same visitor opens a brand new tab or returns after closing the
  browser? A new session identifier is originated — session storage is deliberately scoped to one
  tab's lifetime, matching ad-serve-api's own definition of a visitor session (016 spec.md
  Assumptions: "the lifetime of one browser tab or window").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST originate a session identifier once per page load when none has already
  been persisted for the current browsing session, and persist it so a later page load in the
  same browsing session can read the identical value back.
- **FR-002**: System MUST read back an already-persisted session identifier, when one exists,
  rather than originating a new one.
- **FR-003**: System MUST attach the same session identifier to every ad-decision request this
  SDK makes during one page load, regardless of how many ad slots are on that page.
- **FR-004**: System MUST attach the same session identifier to every click-tracking request this
  SDK builds during one page load.
- **FR-005**: System MUST attach the same session identifier to every viewable-impression report
  this SDK produces during one page load.
- **FR-006**: System MUST continue to make ad-decision requests, render ads, build click-tracking
  requests, and produce viewable-impression reports exactly as it does today when no session
  identifier is available, with no error, delay, or change to whether/how any of those happen.
- **FR-007**: Whether an ad is requested, rendered, clickable, or tracked MUST remain governed
  entirely by this SDK's existing rules — a session identifier MUST NOT become a new condition
  that gates any of those outcomes.
- **FR-008**: System MUST NOT persist or reuse a session identifier across separate browsing
  sessions (e.g. after the browser tab is closed and reopened) — each new browsing session gets
  its own.

### Key Entities

- **Visitor Session Identifier**: An opaque value this SDK originates once per browsing session
  (not per page load, not per ad serving) and persists so every page load within that same
  browsing session reads back the identical value. Attached to every ad-decision, click, and
  viewable-impression request this SDK makes, alongside their existing fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across two separate page loads within the same browsing session, every ad-decision,
  click, and viewable-impression request this SDK produces carries the identical session
  identifier.
- **SC-002**: Within a single page load, every ad-decision, click, and viewable-impression request
  this SDK produces — regardless of how many ad slots are on the page — carries the identical
  session identifier.
- **SC-003**: 100% of ad-decision requests, click-tracking requests, and viewable-impression
  reports that would have been made before this feature continue to be made identically when no
  session identifier is available, with only that one field absent.
- **SC-004**: Two separate browsing sessions (e.g. before and after closing and reopening the
  browser) never share a session identifier.

## Assumptions

- This feature is the ad-serve-client counterpart to ad-serve-api's already-shipped feature 016
  ("session-level tracking for lead attribution"), which accepts an optional, client-originated
  `sessionId` on `GET /ads`, `GET /click`, and `POST /viewable-impression` and counts
  click/viewable-impression activity by distinct session. This feature does not change
  ad-serve-api itself — it only changes what this SDK sends. `POST /ads/batch` is out of scope:
  this SDK does not use it today (research.md).
- A "browsing session" is scoped to one browser tab/window's lifetime, using the browser's
  `sessionStorage` (or an equivalent mechanism with the same lifetime semantics) — matching
  ad-serve-api's own definition of a visitor session (016 spec.md Assumptions). This feature does
  not attempt any cross-tab or cross-device session concept.
- The session identifier is treated as opaque, client-generated data; ad-serve-api is solely
  responsible for validating whether a value it receives is usable (016 already degrades a
  missing/malformed `sessionId` to "not provided" without ever rejecting the request).
- No existing UI, configuration, or opt-out is introduced for this capability — it follows the
  same always-on, best-effort posture as this SDK's existing tracking (impressionId, viewable
  impressions).
