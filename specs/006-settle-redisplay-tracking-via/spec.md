# Feature Specification: Settle Redisplay Tracking via Wall-Clock Timeout

**Feature Branch**: `006-settle-redisplay-tracking-via`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Settle redisplay-tracking via a wall-clock timeout, not just mutation-batch count, so a slot's viewability watch and top-level MutationObserver can eventually stop being retained even on a page that never mutates again after the initial ad render (ad-serve-client issue #9). Currently quietBatchesRemaining only decrements when a mutation batch fires; on a page that mutates once (the initial render) and never again, it permanently stalls just short of settling, so slot.resolved never becomes true and the document-level MutationObserver (plus the trackedSlots array holding every ad's creative data) is retained for the page's entire lifetime. Add a wall-clock fallback so redisplay-tracking settles after enough real time has passed with no further mutation, mirroring the existing MAX_WATCH_DURATION_MS pattern in viewabilityDetector.ts, without weakening the existing FR-008/FR-009/FR-010 redisplay-resilience guarantees or the SC-002 viewability accuracy guarantee."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A quiet page's ad tracking eventually releases its resources (Priority: P1)

As a publisher embedding this SDK, when a page renders an ad slot and then never mutates the DOM
near it again — a static page, not a carousel or hydrating framework — I want this SDK's per-page
tracking state (the document-level mutation watch, and the retained ad creative data for that
slot, including base64 image fields) to eventually release, so a long-lived browser tab doesn't
hold onto full ad creative data for its entire lifetime just because the ad happened to render on
an otherwise-static page.

**Why this priority**: Directly fixes ad-serve-client#9. Today, redisplay-tracking only settles
after 10 consecutive "quiet" mutation batches are observed — but the counter only moves when a
mutation batch actually fires. A page that mutates once (the initial ad render itself) and never
again leaves the counter permanently one step short of settling, so the slot is never marked
resolved and the top-level tracking state is retained for the page's entire lifetime — likely the
common case, not an edge case, since most pages don't keep mutating near their ad slots after
render.

**Independent Test**: Render an ad slot on a page that produces no further DOM mutations after the
initial render; wait past the new wall-clock threshold with no additional mutation batches;
confirm the slot settles (redisplay tracking stops, matching today's quiet-batch settling outcome)
without ever needing the 10 mutation batches that would otherwise never come.

**Acceptance Scenarios**:

1. **Given** a rendered ad slot whose element stays connected and the page produces no further DOM
   mutations, **When** enough real time passes with no new mutation batch for that slot, **Then**
   the slot's redisplay tracking settles, the same outcome today's quiet-batch settling produces.
2. **Given** a rendered ad slot that does keep receiving mutation batches, **When** 10 consecutive
   quiet batches occur before the wall-clock threshold elapses, **Then** settling happens via the
   existing mutation-count path exactly as today — the wall-clock path is a fallback, not a
   replacement.
3. **Given** a slot whose redisplay budget is genuinely exhausted by real removals before the
   wall-clock threshold elapses, **When** that happens, **Then** today's existing bounded-redisplay
   behavior takes precedence exactly as today — this feature does not change that path.

---

### User Story 2 - Legitimate redisplay recovery still works within the window (Priority: P1)

As a publisher whose own page script briefly and legitimately churns the DOM near an ad slot (a
hydration mismatch, a carousel re-render), I want the ad to still be correctly redisplayed and
remain eligible for redisplay throughout that churn, so that adding a wall-clock settle timeout
never cuts off recovery that would otherwise have succeeded.

**Why this priority**: Equal priority to Story 1 — a timeout that fixes the resource-retention gap
by prematurely cutting off genuine redisplay churn would trade one real bug for another, undoing
the redisplay-resilience guarantees this SDK was built around.

**Independent Test**: Simulate a page that produces some (but fewer than 10) mutation batches near
an ad slot within the wall-clock window, including at least one genuine removal-and-reinsertion;
confirm the ad is still redisplayed and the slot does not settle prematurely while real churn is
still happening.

**Acceptance Scenarios**:

1. **Given** a page that continues producing mutation batches (even sparsely) within the wall-clock
   window, **When** those batches include a genuine removal-and-redisplay, **Then** the ad is
   redisplayed exactly as today, and the wall-clock timer does not preempt it.
2. **Given** the wall-clock threshold is generous enough for realistic hydration/redraw timing,
   **When** a legitimate redisplay would have happened within that window, **Then** it still
   succeeds exactly as it does today without this feature.

---

### Edge Cases

- What happens when the wall-clock timer fires for a slot that already settled via the
  mutation-count path (10 quiet batches happened well before the wall-clock threshold)? The
  wall-clock timer firing is a no-op — the slot is already settled.
- What happens to a slot that resolves for good (e.g., redisplay budget exhausted) before the
  wall-clock threshold elapses? Its pending wall-clock timer MUST be cancelled — it must not fire
  after the slot has already fully resolved.
- What happens to the top-level document mutation watch once every currently-tracked slot has
  settled via the wall-clock path rather than the mutation-count path? It MUST still correctly
  detect "every slot settled" and release itself exactly as it does today — this feature changes
  only how quickly a quiet slot reaches that settled state, not how the top-level release decision
  is made.
- What happens on a page with multiple ad slots, some quiet and some actively churning? Each
  slot's wall-clock timer and mutation-count settling MUST be independent — a quiet slot settling
  via timeout must not be affected by another slot's ongoing mutation batches, and vice versa
  (mirrors today's existing per-slot independence).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST settle a slot's redisplay tracking — the same outcome as today's
  quiet-batch settling — after a bounded amount of real elapsed time with no new mutation batch
  affecting that slot, not only after a bounded count of mutation batches.
- **FR-002**: The wall-clock settle path MUST produce exactly the same outcome as the existing
  quiet-batch settle path: it MUST NOT stop a slot's viewability watch (the round-2 fix already
  established that redisplay-tracking settlement and viewability eligibility are independent
  questions — this feature must not blur that distinction).
- **FR-003**: The wall-clock fallback MUST be a no-op for a slot that has already settled or
  resolved through any other path before its threshold elapses.
- **FR-004**: The wall-clock fallback MUST NOT weaken the existing bounded-redisplay guarantees —
  a slot still within its redisplay budget and still receiving genuine mutation activity MUST
  continue to be redisplayed exactly as today, unaffected by the new timeout.
- **FR-005**: The wall-clock timer's own resources MUST be released once no longer needed (the
  slot has settled or resolved via any path) — it MUST NOT itself become a new, unbounded
  per-slot resource retained for the page's lifetime.
- **FR-006**: Any failure in this fallback's own logic MUST NOT propagate to the host page and
  MUST NOT prevent the slot's ad from continuing to render or redisplay via existing paths.

### Key Entities

None new — this feature extends the internal per-slot tracking state already introduced by
002-resilient-slot-discovery and 005-wire-viewable-impression; it introduces no new domain
entities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rendered ad slot on a page that produces no further DOM mutations after the
  initial render has its redisplay-tracking state and top-level per-page tracking resources
  released within a bounded, fixed amount of time after render, instead of being retained for the
  tab's entire lifetime.
- **SC-002**: No regression to existing redisplay resilience — ads on pages with legitimate DOM
  churn continue to be correctly redisplayed and to settle exactly as they do today.
- **SC-003**: This change introduces no new failure mode visible to the host page — no errors, no
  broken ads — under any combination of quiet and churning pages.

## Assumptions

- The wall-clock threshold value mirrors the precedent already set by `MAX_WATCH_DURATION_MS` in
  the viewability-watch fix for ad-serve-client#8 (2 minutes) — generous enough for realistic
  page hydration/redraw timing without being effectively unbounded. No publisher-configurable
  value is in scope, matching that same precedent.
- This feature changes only *when* redisplay-tracking settling is triggered (adding a time-based
  trigger alongside the existing mutation-count-based one) — it does not change what settling
  itself does or means.
- **Correction during planning**: the top-level "are all slots done" release check is only ever
  invoked from specific call sites today (after a mutation batch is processed, and after a slot's
  initial decision request settles) — it is not automatically re-evaluated just because a slot
  becomes settled/resolved through some other, later-firing path. A wall-clock settle that fires
  with no mutation batch around it to trigger that check would mark the slot settled internally
  without ever prompting the top-level release check to run — meaning SC-001 would not actually be
  achieved for the single-quiet-slot case this feature exists to fix. This feature's scope
  therefore includes making that release check reachable from the new wall-clock path too (see
  plan.md/data-model.md) — without that, the fix would be incomplete.
