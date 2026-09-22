# Feature Specification: Discover and Fill Dynamically Inserted Ad Slots

**Feature Branch**: `009-support-infinite-scroll`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Support infinite scroll / dynamically inserted ad slots. Add a public re-discovery entry point that a host page's infinite-scroll code can call after inserting new slot elements into the DOM, to discover and fill just those new slots — reusing the same already-constructed dependencies and session identifier from initial load, not re-fetching or re-originating any of them. Wire this through the existing command-queue stub so calls made before the async SDK script finishes initializing are queued and drained once init completes. A slot already claimed by an earlier discovery pass must never be tracked or filled a second time, even if a later request's scanned region overlaps earlier-processed content. Fix the orchestrator's current single-run assumption that blocks requesting discovery more than once, so any number of discovery requests can coexist independently. Explicitly decided: no special handling is needed for a slot that scrolls off-screen and later back into view — a fresh ad is acceptable in that case; no persistent 'remember what an off-screen slot was filled with' cache is needed, and reporting-side dedup is already handled by ad-serve-api."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Newly loaded content gets ads, not just what was on the page at first load (Priority: P1)

As a publisher whose page loads additional content after the initial page load (infinite scroll,
"load more", pagination-without-navigation), I want the new ad slots that content brings with it to
get filled with ads, exactly as if they'd been on the page from the start, so my ad inventory below
the fold or beyond the first screenful of content isn't silently wasted.

**Why this priority**: This is the entire gap this feature exists to close. Today, any ad slot
inserted after the page's initial load never gets discovered or filled at all — a page relying on
infinite scroll for most of its content only ever monetizes its first screenful.

**Independent Test**: Load a page, then insert additional ad-slot markup into the page (simulating
a scroll-triggered content load) and signal that new content is ready. Confirm the newly inserted
slots get filled with ads, the same way the page's initial slots were.

**Acceptance Scenarios**:

1. **Given** a page has already loaded and filled its initial ad slots, **When** new content
   containing additional, validly-configured ad slots is inserted and the page signals that new
   content is ready, **Then** those new slots are filled with ads.
2. **Given** newly inserted content contains more than one new ad slot, **When** the page signals
   readiness, **Then** every new slot is filled independently, matching how multiple slots on the
   initial page already fill independently of one another.

---

### User Story 2 - A signal sent before the ad SDK has finished starting up still gets honored (Priority: P1)

As a publisher, when my infinite-scroll code inserts new content and signals readiness for new ads
very early — possibly before the ad SDK's own script has finished loading and starting up — I want
that signal to still be honored once the SDK is ready, so a fast scroller or a slow-loading SDK
never causes new content's ads to be silently skipped.

**Why this priority**: The SDK loads asynchronously and independently of a host page's own
scripts; a signal that only works once the SDK happens to already be running would be unreliable in
practice and would fail unpredictably depending on load timing — undermining User Story 1's value
whenever timing doesn't line up.

**Independent Test**: Signal that new ad-slot content is ready before the ad SDK has finished
starting up, then let the SDK finish starting up. Confirm the new slots are still discovered and
filled, with no separate retry needed from the host page.

**Acceptance Scenarios**:

1. **Given** the ad SDK has not yet finished starting up, **When** the host page signals that new
   ad-slot content is ready, **Then** that signal is preserved and acted on once the SDK finishes
   starting up.
2. **Given** the ad SDK has already finished starting up, **When** the host page signals that new
   ad-slot content is ready, **Then** the new slots are discovered and filled without delay.

---

### User Story 3 - Signaling new content twice, or over a region that overlaps earlier content, never double-fills anything (Priority: P1)

As a publisher, when my infinite-scroll integration signals readiness for new content in a way that
happens to re-cover some already-handled content (e.g. signaling over a broad container rather than
only the newly added piece), I want already-filled ad slots to be left alone — never requested or
rendered a second time — so a slightly imprecise integration never wastes ad inventory or shows a
visibly flickering duplicate ad.

**Why this priority**: Ranked alongside User Stories 1/2 rather than below them — filling new
content is only safe to rely on if it can't also accidentally re-fill old content. Without this
guarantee, every integration of this capability would need to track precisely what's "new" itself,
which defeats the purpose of a simple re-discovery signal.

**Independent Test**: Signal readiness twice in a way that scans overlapping content, including at
least one already-filled slot. Confirm that slot is neither requested nor rendered again, while any
genuinely new slot in the same signal is still filled normally.

**Acceptance Scenarios**:

1. **Given** an ad slot has already been filled, **When** a later readiness signal's scanned region
   includes that same slot, **Then** no new ad request is made and nothing about that slot's
   rendering changes.
2. **Given** a readiness signal's scanned region includes both an already-filled slot and a
   genuinely new, unfilled slot, **When** the signal is processed, **Then** only the new slot is
   filled.

---

### User Story 4 - A page can keep loading more content indefinitely, and each new batch fills independently (Priority: P2)

As a publisher whose page supports continuous scrolling (not just one "load more" click), I want to
be able to signal new-content readiness repeatedly, as many times as my page keeps loading more
content, with each batch of new slots filling independently of every other batch and of the page's
original slots, so a long scrolling session keeps monetizing new content for as long as the visitor
keeps scrolling.

**Why this priority**: A secondary but necessary guarantee beyond User Story 1 — true infinite
scroll isn't a single follow-up load, it's an unbounded sequence of them. Ranked below User Stories
1-3 because a page that only ever loads one additional batch already gets full value from those;
this extends that value to the general case.

**Independent Test**: Signal new-content readiness several times in sequence, each time inserting a
distinct new batch of ad slots beforehand. Confirm every batch's new slots are filled, and that no
batch's outcome or timing depends on, or interferes with, any other batch's.

**Acceptance Scenarios**:

1. **Given** three separate batches of new content are inserted one after another, each followed by
   its own readiness signal, **When** each signal is processed, **Then** each batch's new slots are
   filled independently of the others.
2. **Given** one batch's ad slot fails to fill for any reason, **When** later batches are signaled,
   **Then** those later batches' slots are unaffected and still fill normally.

### Edge Cases

- What happens when a readiness signal is sent but the scanned region contains no ad slots at all
  (e.g. content without any ads, or signaled too early before the new content finished inserting)?
  Nothing is filled and nothing errors — there is simply nothing new to discover.
- What happens when newly inserted content contains an invalidly-configured ad slot (missing
  required identifying information)? It is skipped and never filled, exactly matching how an
  invalidly-configured slot present at initial page load is already skipped today.
- What happens when a slot that was already filled is later removed from the page and a new slot
  reappears in the same visual position (e.g. a scroll position revisited after content was
  virtualized away)? It is treated as a new, unfilled slot and a fresh ad is requested for it — this
  feature does not attempt to recognize it as "the same slot returning" or remember what it was
  previously filled with.
- What happens if discovering or filling newly signaled content fails unexpectedly for any reason?
  It degrades silently — the affected slot(s) simply stay unfilled, with no error reaching or
  affecting the host page's own script execution, matching this SDK's existing failure handling for
  every other capability.
- What happens if the host page's own script is itself removed, replaced, or navigates away before
  a queued readiness signal is processed? The signal is simply never processed — there is no page
  left for it to matter to.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a way for a host page to signal that new, ad-slot-bearing content
  has been inserted and should be discovered and filled, at any point after the page's initial ad
  slots have already been processed.
- **FR-002**: System MUST support this signal being sent any number of times over the life of one
  page view, each covering whatever new content has been inserted since the page loaded or since
  the previous signal.
- **FR-003**: System MUST discover and fill only ad slots not already discovered by an earlier
  signal or by the page's initial load — an already-discovered slot, whether currently filled,
  in progress, or already determined to have no ad available, MUST NOT be requested or rendered
  again, even when a later signal's scanned region overlaps content that was already covered.
- **FR-004**: A readiness signal sent before this SDK has finished starting up MUST NOT be lost —
  it MUST be honored once startup completes, with no additional action required from the host page.
- **FR-005**: Every newly discovered ad slot MUST be filled, rendered, and tracked (click and
  viewable-impression tracking) using the exact same rules and behavior already applied to slots
  discovered at initial page load, with no reduced capability for slots discovered later.
- **FR-006**: Every newly discovered ad slot MUST carry the same visitor session identifier already
  established for the current page view, identical to every other ad request that page view
  produces.
- **FR-007**: The outcome and timing of filling one newly discovered ad slot MUST NOT depend on, or
  affect, any other slot — whether from the same readiness signal, an earlier one, or the page's
  initial load.
- **FR-008**: A slot that this SDK previously filled and that is later replaced by a new,
  unrecognized slot occupying a similar position MAY be treated as an entirely new, unfilled slot;
  the system is not required to recall or reuse anything about what previously occupied that
  position.
- **FR-009**: Any failure encountered while discovering or filling newly signaled content MUST
  degrade silently — the affected slot(s) simply remain unfilled, with no error, delay, or other
  effect reaching the host page's own script execution.

### Key Entities

- **Readiness Signal**: A request, originated by the host page, indicating that new content
  possibly containing additional ad slots has been inserted and is ready to be scanned. Scoped to
  whatever region of the page the host page specifies (or the whole page, by default); may be sent
  any number of times over one page view, including before this SDK has finished starting up.
- **Newly Discovered Ad Slot**: An ad slot found by a Readiness Signal's scan that was not already
  discovered by an earlier scan (initial load or a prior signal). Once discovered, it is filled,
  rendered, and tracked exactly like any ad slot found at initial page load.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of validly-configured ad slots inserted into a page after initial load are
  filled following a readiness signal covering them, matching the fill outcome already achieved for
  slots present at initial load.
- **SC-002**: A readiness signal sent before this SDK finishes starting up still results in its
  covered slots being filled, with zero additional signals needed from the host page.
- **SC-003**: A readiness signal whose scanned region overlaps previously-handled content produces
  zero duplicate ad requests or duplicate renders for the slots already handled.
- **SC-004**: A page can send an unbounded number of readiness signals over one page view, with
  each new batch of slots filling as reliably as the first.
- **SC-005**: Filling slots discovered by a readiness signal has no observable effect on the
  rendering, tracking, or timing of any slot discovered earlier on the same page.

## Assumptions

- This feature adds a re-discovery/readiness-signal capability for content inserted after initial
  page load; it does not change how an individual ad slot is configured, requested, rendered, or
  tracked once discovered — those rules (features 001-008) are reused unchanged for slots
  discovered this way.
- A slot that scrolls out of view and back is out of this feature's special handling: an element
  that stays connected to the page the whole time needs nothing (ordinary DOM persistence already
  covers it), and an element removed and reinserted within this SDK's existing bounded
  redisplay/settle window (feature 006) is already covered by that existing behavior, unaffected by
  this feature. Outside that window, or when a new element is created for a previously-seen
  position (e.g. a virtualized/windowed list), a fresh ad is requested — no long-lived cache of what
  an since-removed slot was filled with is introduced by this feature.
- Any counting or duplicate-prevention concerns at the reporting level (e.g. the same visitor
  session producing multiple servings over one page view) remain ad-serve-api's existing
  responsibility and are unaffected by this feature.
- This capability is always available with no configuration or opt-out, matching this SDK's
  existing always-on tracking behavior.
- `POST /ads/batch` remains out of scope, consistent with feature 008's assumption — this feature
  does not change how many requests are made per slot, only when and how many slots get discovered.
