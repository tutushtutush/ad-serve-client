# Feature Specification: Wire Up Viewable Impression Tracking

**Feature Branch**: `005-wire-viewable-impression`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Wire up viewable impression tracking via IntersectionObserver in the loader"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An ad that's actually seen gets reported as a viewable impression (Priority: P1)

As an ad operator, when a rendered ad becomes genuinely visible to a viewer — not just inserted
into the page's DOM, but actually scrolled into view for long enough to plausibly be seen — I want
that reported to ad-serve-api's viewable-impression tracking, so viewability numbers reflect what
people actually saw rather than what was merely rendered somewhere on the page.

**Why this priority**: Without this, ad-serve-api's `POST /viewable-impression` endpoint (built in
ad-serve-api feature 009) has no real traffic — a rendered-but-never-scrolled-to ad currently looks
identical to a genuinely-seen one, which is exactly the gap this feature exists to close.

**Independent Test**: Render an ad into a slot positioned off-screen; scroll it into view and hold
it there past the viewability threshold; confirm a viewable-impression report is sent identifying
the correct ad, placement, and campaign.

**Acceptance Scenarios**:

1. **Given** a rendered ad slot that is off-screen, **When** it is scrolled into view and stays
   sufficiently visible for long enough, **Then** exactly one viewable-impression report is sent
   for that rendered instance.
2. **Given** a rendered ad slot that never becomes sufficiently visible (e.g. a sliver scrolls past
   without pausing, or it stays mostly off-screen), **When** the viewer never lingers on it long
   enough, **Then** no report is ever sent for that rendered instance.
3. **Given** a rendered ad slot that becomes visible, then scrolls away before staying visible long
   enough, **Then later** scrolls back into view and stays long enough this time, **When** the
   later viewing satisfies the threshold, **Then** a report is sent — a brief, interrupted glimpse
   does not "use up" or block a later, qualifying view of the same rendered instance.
4. **Given** the same ad slot is redisplayed (e.g. removed and reinserted by the host page, per
   this SDK's existing redisplay handling), **When** the redisplayed instance is later seen for
   long enough, **Then** it is independently eligible to be reported again — mirrors
   ad-serve-api's own design, where repeated reports for repeated genuine viewings are expected,
   not deduplicated.

---

### User Story 2 - Viewability tracking never disrupts the host page (Priority: P1)

As a viewer, I never want ad viewability tracking to slow down, break, or otherwise affect the
host page I'm on — not the page's own scripts, not its scrolling performance, not anything else —
regardless of whether tracking itself succeeds.

**Why this priority**: This SDK's governing rule (Constitution Principle V) is that nothing it
does may propagate a failure into the host page. Ranked equally P1 with User Story 1 because
correctly reporting viewability must never come at the cost of this guarantee — an SDK that
tracks viewability but occasionally breaks scrolling or throws an uncaught error is a worse
outcome than not tracking it at all.

**Independent Test**: Simulate the browser lacking `IntersectionObserver` support; confirm ad
rendering and every other existing SDK behavior proceeds normally, with no viewable-impression
report attempted and no error surfaced. Separately, simulate the viewable-impression report call
itself failing (network error); confirm nothing else on the page is affected.

**Acceptance Scenarios**:

1. **Given** a browser without `IntersectionObserver` support, **When** an ad renders, **Then**
   the ad still renders and behaves exactly as it does today — simply with no viewability
   reporting attempted for it.
2. **Given** the information needed to build a viewable-impression report is unavailable for a
   rendered ad (e.g. no ad identifier), **When** that ad would otherwise become viewable,
   **Then** no report is attempted for it and nothing else about the ad's behavior changes.
3. **Given** a viewable-impression report request fails or never resolves, **When** that happens,
   **Then** it has no visible effect on the ad, the slot, or any other part of the host page.

---

### Edge Cases

- What happens when a slot's element is removed from the page before it ever becomes viewable?
  Reporting for that rendered instance simply never happens — no error, no report.
- What happens when a slot's element is removed from the page while a qualifying view is already
  in progress but hasn't yet reached the threshold duration? The in-progress view does not count;
  no report is sent for it (matches Scenario 3 above — an interrupted view before threshold is
  reached is exactly this case).
- What happens when this SDK's own configured tracking-service address (`apiBaseUrl`) is missing
  or blank? No report is attempted — matches this SDK's existing fallback behavior when the same
  configuration is missing for click tracking.
- What happens on a page that never scrolls at all, where every ad slot is already visible in the
  initial viewport on load? A slot already satisfying the visibility condition on load is treated
  the same as one that scrolls into view — it becomes eligible to be reported once it has stayed
  visible for the required duration, counted from render time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect, for each rendered ad slot, when it becomes visible to the
  viewer per the industry-standard viewability definition (at least half of the ad's area visible
  within the browser viewport, continuously, for at least one second).
- **FR-002**: When a rendered ad slot satisfies FR-001's viewability condition, and the
  information needed to identify the ad (placement identity and the specific ad shown) is
  available, the system MUST report a viewable impression to ad-serve-api's viewable-impression
  tracking mechanism.
- **FR-003**: Each rendered instance of a slot (an initial render, and each subsequent redisplay
  per this SDK's existing redisplay handling) MUST be independently eligible to be reported at
  most once — reaching the viewability threshold for a given rendered instance MUST NOT be
  reported more than once for that same instance, but a later redisplay of the same slot MUST be
  eligible again.
- **FR-004**: If the information needed to identify the ad for reporting is unavailable, the
  system MUST NOT attempt a report for that rendered instance — matching this SDK's existing
  fallback posture (see feature 004) rather than erroring or blocking anything else.
- **FR-005**: If the browser does not support the detection mechanism this feature relies on, the
  system MUST skip viewability tracking entirely for the affected slot(s) without affecting ad
  rendering or any other existing behavior.
- **FR-006**: A failure of any kind in viewability detection or in sending a report (a thrown
  error, a rejected network call, a malformed response) MUST NOT propagate to the host page and
  MUST NOT affect the ad's rendering or any other slot's behavior.
- **FR-007**: Viewability detection MUST stop watching a rendered instance once it has either been
  reported or is no longer eligible to be reported (e.g. its element has been permanently removed
  per this SDK's existing settling rules) — it MUST NOT continue watching indefinitely.

### Key Entities

None — this feature introduces no new data of its own; it reports viewability of ads already
being decided and rendered by existing functionality, using identifiers ad-serve-api's decision
response already provides.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An ad that is rendered but never scrolled into sufficient view never produces a
  viewable-impression report — reported viewable impressions never overcount actual visibility.
- **SC-002**: An ad that is genuinely scrolled into view and held there past the threshold
  produces exactly one viewable-impression report per rendered instance.
- **SC-003**: No combination of missing tracking information, an unsupported browser, or a failed
  report ever produces a visible error, a broken ad, or any slowdown perceptible on the host page.

## Assumptions

- ad-serve-api's `POST /viewable-impression` endpoint already exists and is stable (built in
  ad-serve-api feature 009) — this feature only adds the client-side detection and call, not any
  change to that endpoint.
- The industry-standard viewability threshold (≥50% of the ad's area, continuously visible, for
  ≥1 second) is the correct definition to use, matching the IAB standard referenced when this
  endpoint was originally planned; no publisher-configurable threshold is in scope.
- No visual or interaction change for the viewer — this feature only adds a background
  measurement and a fire-and-forget report; the ad looks and behaves identically to before.
- Attribution or additional context beyond identifying the ad, its placement, and (when
  resolvable) its campaign is out of scope, matching the viewable-impression endpoint's own
  current scope.
