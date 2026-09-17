# Feature Specification: Resilient Slot Discovery for Client-Rendered Host Pages

**Feature Branch**: `002-resilient-slot-discovery`

**Created**: 2026-09-17

**Status**: Draft

**Input**: User description: "Resilient slot discovery for client-rendered host pages: today, ad-serve-client scans the page for ad slots exactly once, right when its script executes, and holds onto the DOM element it found for the rest of that slot's request/render pipeline. On a host page that renders and mutates its own DOM after our script runs — most notably a React (or similar) app hydrating shortly after initial page load — the slot element we captured can be removed and replaced with a new, distinct DOM node before our ad request finishes. When that happens, our existing safeguard correctly refuses to render into the now-disconnected old node (treating it as if the visitor navigated away), but the ad is lost entirely: we never notice the replacement node, so the slot simply stays empty forever even though a perfectly valid ad was returned. This was discovered via a real end-to-end test embedding ad-serve-client in eventpulse (a React/Next.js app) — the ad request succeeded but never rendered, traced to React's hydration replacing the slot's container div about 50ms after page load, well before the ad-serve-api request resolved. The fix must work without requiring any cooperation, signal, or change from the host page/publisher. It needs to correctly handle a slot's DOM node being replaced by a structurally-equivalent new node after we've already started that slot's request, and still get the ad rendered into whichever node currently represents that slot once the request resolves. It also must continue to respect the existing behavior for a slot that's genuinely removed for good — that should still resolve to empty, not error. This is purely an internal change to how ad-serve-client discovers and tracks slots; the public contract does not change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An ad still appears on a page that redraws itself after load (Priority: P1)

A publisher's page is built with a JavaScript framework that redraws part of its own content
shortly after the page first loads (for example, to attach interactivity to content that was
already visible). A site visitor loading that page still sees a correctly configured ad slot
display its ad, even though the specific piece of the page holding that slot was rebuilt after
ad-serve-client started working.

**Why this priority**: This is the entire point of the feature — restoring the core "a slot
displays an ad" outcome for an entire class of real-world host pages where it currently silently
fails. Without this, ad-serve-client is unreliable on a large share of modern websites.

**Independent Test**: Can be fully tested by loading a page, built with a framework known to
redraw its own content shortly after load, that contains one correctly configured ad slot with a
matching ad available, and confirming the ad still appears in the slot.

**Acceptance Scenarios**:

1. **Given** a page whose framework replaces the section containing an ad slot shortly after the
   page loads, **When** the replacement happens before the ad result is ready, **Then** the ad is
   still displayed in the slot once it is ready.
2. **Given** the same situation, **When** the ad is displayed, **Then** it appears in the section
   of the page currently shown to the visitor, not in a piece of the page that is no longer
   present.
3. **Given** the ad decision arrives quickly enough that the ad is displayed *before* the page's
   framework finishes redrawing that section, **When** the framework's own redraw then removes
   the just-displayed ad as a side effect of settling that section, **Then** the ad is displayed
   again in whichever element currently represents the slot, so the visitor still ends up seeing
   it.

---

### User Story 2 - A slot that's genuinely gone still stays safely empty (Priority: P2)

When an ad slot is removed from the page for good — the visitor navigated away, or the publisher's
page intentionally removed that slot — no ad is ever displayed for it, and nothing about that
removal produces an error or unexpected behavior elsewhere on the page.

**Why this priority**: This is the safeguard that makes User Story 1 safe to ship. Making
ad-serve-client keep looking for a slot's current element must not turn into looking forever, or
into ads appearing in the wrong place once a slot is truly gone.

**Independent Test**: Can be fully tested by loading a page with an ad slot, removing that slot's
element from the page for good (without a replacement appearing), and confirming no ad ever
appears anywhere on the page and no error occurs, exactly as before this feature.

**Acceptance Scenarios**:

1. **Given** a page with a correctly configured ad slot, **When** that slot's element is removed
   from the page and nothing replaces it, **Then** no ad is ever displayed and the rest of the
   page continues to function normally.
2. **Given** a page with two ad slots, **When** one slot is removed for good and the other slot's
   element is replaced (not removed), **Then** the removed slot stays empty and the replaced
   slot's outcome is unaffected by the other slot's removal.

---

### User Story 3 - A slot never shows more than one ad (Priority: P3)

If a page's framework redraws the section holding an ad slot more than once before the ad result
is ready, the slot still ends up showing exactly one ad, in whichever version of the page section
the visitor is currently looking at — never zero when an ad was available, and never more than
one.

**Why this priority**: A visible page redraw happening more than once before an ad is ready is a
plausible variation of User Story 1's scenario, not a separate feature — this closes the gap so
the fix is correct under repetition, not just under a single replacement.

**Independent Test**: Can be fully tested by loading a page where an ad slot's section is redrawn
more than once shortly after load, before the ad result is ready, and confirming exactly one ad
appears once it is ready.

**Acceptance Scenarios**:

1. **Given** a page where an ad slot's section is replaced twice before the ad result is ready,
   **When** the ad becomes ready, **Then** exactly one ad is displayed, in the section currently
   present on the page.

### Edge Cases

- What happens when two ad slots on the same page share identical configuration (same placement
  and targeting) and both are replaced around the same time? Each slot's ad result MUST still end
  up in the correct one of the two current elements — never displayed in the other slot's element
  instead.
- What happens when a slot's already-displayed ad is removed by the page's own redraw activity
  shortly after being displayed? It MUST be displayed again, per User Story 1's third acceptance
  scenario — this is no longer out of scope (see Assumptions).
- What happens when a slot's already-displayed ad keeps being removed, over and over, well beyond
  what a one-time page redraw would ever cause? The system MUST eventually stop trying again
  (FR-010) rather than retry forever — see Assumptions for why a retry limit, not a time limit, is
  the right bound here.
- What happens when a slot's element is removed and never replaced, but only after a long delay
  (not immediately)? It MUST still resolve to empty with no error, the same as an immediate
  removal — timing of the removal does not change the outcome.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST continue to be able to find the page element currently representing
  an ad slot for as long as that slot's ad request has not yet resolved, not only once at the
  moment the slot was first found.
- **FR-002**: When a slot's original page element is removed and replaced by a new element
  representing that same slot, the system MUST recognize the new element as the current one for
  that slot, without making an additional ad request for it.
- **FR-003**: When a slot's ad result becomes available, the system MUST display it in whichever
  element currently represents that slot at that moment, not necessarily the element that existed
  when the request was made.
- **FR-004**: When a slot's element is removed and never replaced, the system MUST resolve that
  slot to empty — no ad displayed, no error — exactly as before this feature.
- **FR-005**: The system MUST NOT display more than one ad for a given slot, even if that slot's
  element is replaced more than once before the ad result is available.
- **FR-006**: This feature MUST NOT require any change to how a publisher marks up an ad slot or
  loads ad-serve-client — an existing integration continues to work unmodified.
- **FR-007**: The system MUST correctly distinguish between two different slots that happen to
  share identical placement/targeting configuration — a replacement for one such slot MUST NOT be
  mistaken for a replacement of the other.
- **FR-008**: Once a slot's outcome is finally determined (its displayed ad has survived the
  page's own redraw activity per FR-009/FR-010, or it resolved to empty), the system MUST stop
  tracking that slot for further page changes — it does not keep watching a finished slot
  indefinitely.
- **FR-009**: If a slot's already-displayed ad is removed shortly after being displayed — as a
  side effect of the page's own framework redrawing that section, not a genuine, lasting removal
  of the slot — the system MUST display the ad again in whichever element currently represents
  that slot.
- **FR-010**: The system MUST NOT attempt to redisplay a slot's ad an unlimited number of times —
  after a bounded number of attempts, the system MUST stop and leave the slot in whatever state it
  last reached, rather than retry indefinitely.

### Key Entities

- **Tracked Slot**: The ongoing record of one ad slot, kept independent of which specific page
  element currently represents it, so a resolved ad result can be reconnected to whatever element
  currently exists for that slot — both when the ad decision first arrives (FR-003) and, if
  needed, again afterward if the displayed ad is removed by the page's own activity (FR-009).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a page built with a framework that redraws its own content shortly after load, a
  visitor sees a correctly configured slot's ad appear just as reliably as on a page that does not
  redraw itself — 100% of such cases display the ad when one is available, compared to the ad
  never appearing before this feature. This holds regardless of which happens first, the page's
  redraw or the ad becoming ready.
- **SC-002**: A slot that is genuinely and permanently removed from the page never displays an ad
  and never produces an error, in 100% of observed cases — unchanged from existing behavior.
- **SC-003**: No slot ever displays more than one ad, regardless of how many times its page element
  changes before the ad is ready, in 100% of observed cases.
- **SC-004**: A publisher with an existing ad-serve-client integration gains this improvement
  automatically after adopting the update, with zero changes required on their side.

## Assumptions

- **Amended** (originally this feature covered only replacement *before* an ad displayed,
  treating post-display removal as separate/out of scope — see Functional Requirements' FR-009/
  FR-010 for the amendment and User Story 1's third acceptance scenario). Real-world verification
  against an actual React/Next.js page (eventpulse) showed the *reverse* timing case is not a rare
  edge case but the dominant one against a fast ad-decision backend: the ad can be displayed
  *before* the page's own framework finishes reconciling that section, and the framework's own
  mismatch-recovery behavior then removes it as a side effect of settling. Since shipping this
  feature without covering that case would not actually achieve its own stated purpose (a slot's
  ad reliably appearing despite the host page's own rendering activity, User Story 1), both
  directions of the same underlying race are now in scope: replacement before display (original
  scope) and removal shortly after display (this amendment).
- The redisplay bound (FR-010) is a limited number of attempts, not a time limit. A framework's
  own initial-hydration redraw is a one-time, bounded event per page load, not an ongoing process
  — a small, fixed number of redisplay attempts comfortably covers it without needing to guess a
  duration that would vary by page complexity and device performance. An indefinitely-growing
  attempt count would instead suggest something other than one-time hydration is repeatedly
  removing the ad, at which point continuing to retry stops being useful.
- "A framework that redraws its own content shortly after load" refers to ordinary client-side
  rendering behavior (such as a UI framework attaching interactivity to already-visible content,
  or reconciling content it rendered against what was already server-rendered), not to a publisher
  deliberately and repeatedly rebuilding their entire page on a timer or in response to unrelated
  user actions — sustained, ongoing page rebuilding well after load is not a scenario this feature
  is scoped to handle, and is exactly the case the redisplay bound above is meant to stop reacting
  to.
- This feature changes only how ad-serve-client discovers, tracks, and (when needed) redisplays
  ads for slots internally; it does not change the ad-decision request/response behavior, the
  actual rendering mechanism, or the fail-silent guarantees established by the foundational
  request/render flow feature.
