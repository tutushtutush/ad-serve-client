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
- What happens when a slot's element is replaced after its ad has already been successfully
  displayed? Out of scope for this feature — see Assumptions.
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
- **FR-008**: Once a slot's outcome is determined (an ad was displayed, or it resolved to empty),
  the system MUST stop tracking that slot for further page changes — it does not keep watching a
  resolved slot indefinitely.

### Key Entities

- **Tracked Slot**: The ongoing record of one ad slot's in-progress request, kept independent of
  which specific page element currently represents it, so a resolved ad result can be reconnected
  to whatever element currently exists for that slot once the request completes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a page built with a framework that redraws its own content shortly after load, a
  visitor sees a correctly configured slot's ad appear just as reliably as on a page that does not
  redraw itself — 100% of such cases display the ad when one is available, compared to the ad
  never appearing before this feature.
- **SC-002**: A slot that is genuinely and permanently removed from the page never displays an ad
  and never produces an error, in 100% of observed cases — unchanged from existing behavior.
- **SC-003**: No slot ever displays more than one ad, regardless of how many times its page element
  changes before the ad is ready, in 100% of observed cases.
- **SC-004**: A publisher with an existing ad-serve-client integration gains this improvement
  automatically after adopting the update, with zero changes required on their side.

## Assumptions

- This feature covers a slot's element being replaced only before that slot's ad result has been
  displayed. A slot's element being removed or replaced *after* an ad has already been
  successfully displayed in it is a separate concern and is out of scope here.
- "A framework that redraws its own content shortly after load" refers to ordinary client-side
  rendering behavior (such as a UI framework attaching interactivity to already-visible content),
  not to a publisher deliberately and repeatedly rebuilding their entire page on a timer or in
  response to unrelated user actions — sustained, ongoing page rebuilding well after load is not
  a scenario this feature is scoped to handle.
- This feature changes only how ad-serve-client discovers and tracks slots internally; it does not
  change the ad-decision request/response behavior, the rendering behavior, or the fail-silent
  guarantees established by the foundational request/render flow feature.
