# Feature Specification: Echo the Per-Impression Idempotency Key on Tracking Reports

**Feature Branch**: `007-echo-the-per-impression`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Echo the per-impression idempotency key on click and viewable-impression reports: ad-serve-api (feature 014, already shipped) now mints a unique impressionId at ad-decision time (GET /ads) and returns it as a new optional field on the ad object in the decision response. It accepts that same impressionId back as an optional query parameter on GET /click and POST /viewable-impression, and deduplicates at write time so a duplicate click/viewable-impression report for the same impressionId is silently ignored rather than counted again. ad-serve-client must read impressionId from the decision response and echo it back on both the click-tracking URL and the viewable-impression report, so that duplicate click and viewable-impression reports this client already knows it can produce (e.g. a visitor double-clicking, or the existing redisplay/retry paths) are deduplicated server-side. impressionId is always optional end-to-end: a decision response without it (an older/unpatched ad-serve-api), or an ad missing adConfigId already, must continue to degrade exactly as today. A redisplay of the same already-fetched ad reuses that same impressionId, since it's the same underlying ad serving, not a new decision request."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A double-clicked ad only counts one click for its operator (Priority: P1)

As an ad operator, when a visitor's browser reports the same click twice for the same ad
serving — a double-click, a slow redirect retried by the browser — I want ad-serve-api's own
dedup to actually kick in, which requires this client to hand it the serving identifier it
already received at decision time.

**Why this priority**: ad-serve-api already deduplicates click reports that carry a matching
`impressionId` (its feature 014); until this client sends one, every click report from this SDK
is invisible to that protection and continues to risk inflating click counts exactly as before.

**Independent Test**: Serve an ad through this SDK, capture the click-tracking URL it builds for
that ad, and confirm the URL carries the same `impressionId` the decision response returned for
that ad.

**Acceptance Scenarios**:

1. **Given** a decision response includes an `impressionId` for the served ad, **When** this SDK
   builds the click-tracking URL for that ad, **Then** the URL includes that same `impressionId`.
2. **Given** the same rendered ad is clicked more than once, **When** each click fires its
   tracking request, **Then** every request carries the identical `impressionId` (so
   ad-serve-api's own dedup, not this client, is what collapses them to one count).

---

### User Story 2 - A duplicate viewable-impression report only counts once for its operator (Priority: P1)

As an ad operator, when this SDK's own viewability tracking reports the same ad becoming viewable
more than once — the redisplay/retry churn this SDK already tolerates by design — I want
ad-serve-api's dedup to collapse those into one count, which requires this client to attach the
serving identifier to that report too.

**Why this priority**: Mirrors User Story 1 for the other reported event type; this SDK's own
redisplay handling (feature 006) already accepts that the same ad may be re-rendered and
re-watched for viewability more than once for a single serving, so without this feature every
redisplay path remains a live source of inflated viewable-impression counts on ad-serve-api's
side.

**Independent Test**: Serve an ad through this SDK, trigger its viewable-impression report, and
confirm the report carries the same `impressionId` the decision response returned for that ad.

**Acceptance Scenarios**:

1. **Given** a decision response includes an `impressionId` for the served ad, **When** this SDK
   reports a viewable impression for that ad, **Then** the report includes that same
   `impressionId`.
2. **Given** the same ad instance is redisplayed and re-renders within this SDK's existing
   redisplay budget, **When** a viewable-impression report is produced for the redisplayed
   instance, **Then** it carries the same `impressionId` as the original serving, not a new one —
   because it is the same serving being redisplayed, not a new one being decided.

---

### User Story 3 - Tracking keeps working exactly as before when no identifier is available (Priority: P2)

As a visitor, I want my ad experience and this SDK's tracking behavior to be completely
unaffected on a page served by an older ad-serve-api (or in any other case where no serving
identifier is available), so that adopting this capability can never itself become a source of
breakage.

**Why this priority**: This SDK's standing guarantee is that a tracking enhancement never
degrades the underlying feature it's attached to (Constitution Principle V, Fail-Silent). This
capability is additive to click/viewable-impression tracking, which must continue to function
exactly as today whenever the new identifier isn't available.

**Independent Test**: Serve an ad through a decision response that omits `impressionId`, then
confirm the click and viewable-impression tracking requests are still built and fire exactly as
they did before this feature, just without an `impressionId` in the request.

**Acceptance Scenarios**:

1. **Given** a decision response has no `impressionId` (e.g. an older ad-serve-api), **When**
   this SDK builds a click-tracking URL or a viewable-impression report for that ad, **Then** it
   is built and sent exactly as it would have been before this feature, with no `impressionId`
   included and no error or blocked interaction.
2. **Given** an ad's decision response is otherwise missing enrichment this SDK already treats as
   optional (e.g. `adConfigId`), **When** tracking is attempted, **Then** the outcome is
   unchanged from today's behavior — this feature never introduces a new way for tracking to be
   blocked or for the ad to become unclickable.

### Edge Cases

- What happens when a decision response includes `impressionId` but not `adConfigId`? Today, a
  missing `adConfigId` already means no click-tracking URL or viewable-impression report is built
  at all (tracking falls back to a direct link, or isn't sent) — `impressionId` alone changes
  nothing about that; it is only ever attached to a report that was already going to be built and
  sent.
- What happens on a redisplay of the same already-fetched ad? The same `impressionId` already
  associated with that ad is reused for every tracking report produced for that redisplay — it
  identifies one ad serving, and a redisplay within this SDK's existing budget (feature 006) is
  that same serving being shown again, not a new one.
- What happens when `impressionId` is present but this SDK cannot tell it's well-formed? This SDK
  treats it as opaque, already-trusted data straight from ad-serve-api's own response (the same
  trust level as `adConfigId` today) and passes it through as-is; ad-serve-api is solely
  responsible for deciding whether a value it receives back is usable for dedup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST read an `impressionId`, when present, from a filled ad-decision
  response and retain it alongside the rest of that response's ad data for as long as that ad
  data itself is retained (including across a redisplay of the same ad).
- **FR-002**: System MUST include the retained `impressionId` on a click-tracking request built
  for that ad, whenever both a tracking request is already being built and an `impressionId` is
  available for that ad.
- **FR-003**: System MUST include the retained `impressionId` on a viewable-impression report
  produced for that ad, whenever both a report is already being produced and an `impressionId` is
  available for that ad.
- **FR-004**: A redisplay of an already-rendered ad MUST reuse that ad's original `impressionId`
  on any tracking it produces, never mint or fabricate a new one client-side.
- **FR-005**: System MUST continue to build and send click-tracking requests and
  viewable-impression reports exactly as it does today when no `impressionId` is available for an
  ad, with no error, delay, or change to whether/how tracking happens.
- **FR-006**: Whether an ad is clickable, whether a click-tracking request is built at all, and
  whether a viewable-impression report is produced at all MUST remain governed entirely by this
  SDK's existing rules (e.g. `adConfigId`/base-URL availability) — `impressionId` MUST NOT become
  a new condition that gates any of those outcomes.

### Key Entities

- **Ad Serving Identifier**: The opaque `impressionId` value ad-serve-api mints and returns for
  one specific ad serving. This SDK treats it purely as pass-through data — received once at
  decision time, retained with that serving's ad data, and echoed back unchanged on later
  tracking reports for that same serving.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every ad serving whose decision response included an `impressionId`, every
  click-tracking request and viewable-impression report this SDK produces for that serving
  carries that same `impressionId`.
- **SC-002**: Two separate ad servings (including two separate slots, or the same ad served again
  on a later decision request) never share the `impressionId` used on their respective tracking
  reports.
- **SC-003**: 100% of click-tracking requests and viewable-impression reports that would have
  been built and sent before this feature continue to be built and sent identically when no
  `impressionId` is available, with only the identifier itself absent.

## Assumptions

- This feature is the ad-serve-client counterpart to ad-serve-api's already-shipped feature 014
  ("per-impression idempotency key for event dedup"), which mints `impressionId` at decision time
  and deduplicates click/viewable-impression writes that carry a matching one. This feature does
  not change ad-serve-api itself — it only changes what this SDK sends.
- `impressionId` is treated as opaque string data passed through unchanged, the same trust level
  this SDK already gives `adConfigId` and every other server-resolved field on the decision
  response — this SDK does not validate its shape.
- Only the single-ad decision path (`GET /ads`) currently exists in this SDK; there is no batch
  decision call today, so this feature only concerns itself with the response shape that path
  already handles.
- A host page running an older, cached copy of this SDK's bundle continues to omit
  `impressionId` on its tracking requests until it picks up this update — no forced-upgrade or
  compatibility shim is in scope.
