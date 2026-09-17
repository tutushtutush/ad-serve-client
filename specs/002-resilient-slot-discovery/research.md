# Phase 0 Research: Resilient Slot Discovery for Client-Rendered Host Pages

The constitution and feature 001's existing design already settled the layering (Orchestrator
owns discovery) and the fail-silent requirement. The research below covers the concrete
mechanism for continuous discovery and cross-replacement slot identity.

## Decision: `MutationObserver` watching the injected root, not polling

**Rationale**: The bug this feature fixes (research from the real eventpulse test) is a DOM
replacement happening once, early (~50ms after load), with no signal the host page offers for
"I just replaced that node." `MutationObserver` is the standard browser primitive for reacting to
exactly this class of change — it fires synchronously-scheduled microtask callbacks batched per
DOM update, is implemented by jsdom (so it's exercised for real in unit tests, not mocked), and
requires no cooperation from the host page. It observes the same `root: ParentNode` already
injected into `run(root)` (feature 001), so it introduces no new global dependency to inject.

**Alternatives considered**: Polling `document.querySelectorAll` on an interval — rejected: it
either checks too infrequently (missing the ~50ms window that motivated this feature) or too
frequently (wasted work on pages with no relevant mutations), and either way keeps running for the
life of the page unless separately torn down. `MutationObserver` gives event-driven, immediate
notification and a natural place to `disconnect()` once done (FR-008).

## Decision: Tracked Slot identity = (configuration, position within same-configuration group)

**Rationale**: FR-007 requires that two slots sharing identical `platformId`/`adTypeId`/
`country`/`deviceType` never get cross-matched when their elements are replaced. A DOM element has
no identity that survives a full removal-and-replacement (the new node is not `===` the old one,
and nothing in a plain `data-*`-attribute contract lets a publisher's markup carry a stable ID
across a framework's own re-render). The one signal that *does* survive — because React and
similar frameworks replace nodes in place within the same tree structure, not reorder them — is
document position. So: at the moment each slot is first discovered, group the full ordered list of
discovered elements by their `(platformId, adTypeId, country, deviceType)` tuple, preserving
document order within each group; a Tracked Slot's identity is "the Nth element in this
configuration's group." On every subsequent mutation, the same grouping is recomputed over the
*current* set of matching elements, and each Tracked Slot's "current element" is updated to
whatever now occupies its (configuration, position) slot in that grouping — or cleared if that
position no longer exists.

**Alternatives considered**: Matching by configuration alone (ignoring position) — rejected,
directly fails FR-007's two-identical-slots case (a replacement of slot A could get matched to
slot B's Tracked Slot). Requiring publishers to add a unique `data-*` id — rejected, violates
FR-006 (no change to the public contract) and this feature's explicit "no host-page cooperation"
constraint. Matching by absolute DOM tree path (e.g., array of child indices from `root`) —
rejected as more fragile than configuration-group position: an unrelated sibling insertion
elsewhere on the page would shift tree-path indices without the slot itself moving, producing
false negatives that pure slot-relative-order matching avoids.

## Decision: No new timeout — "removed for good" reuses the existing per-request bound

**Rationale**: FR-004 requires a slot with no replacement to resolve to empty, same as today.
Rather than introduce a second, independent "how long do we wait for a replacement" timer, the
existing per-request timeout (`withTimeout`, feature 001 FR-008) already bounds how long a slot's
pipeline runs end to end. The Tracked Slot's current-element mapping is simply read at the moment
the ad result is ready to render — if it's unset at that moment (the configuration-group position
has had no matching element since some point before resolution), that slot resolves to empty. No
separate clock is needed, and the existing bound is already proven (feature 001's tests and
quickstart scenario 4).

**Alternatives considered**: A dedicated "grace period" timeout for waiting on a replacement,
independent of the request timeout — rejected as unnecessary complexity; nothing in the spec asks
for a slot to wait *longer* for a replacement than it already waits for an ad response, and the
observed real-world case (React hydration) resolves in tens of milliseconds, far inside the
existing multi-second request bound.

## Decision: Tracked Slots are dropped (and the observer eventually disconnects) once resolved

**Rationale**: FR-008 requires the system to stop tracking a slot once its outcome is determined.
Beyond correctness, this bounds the observer's own cost (Technical Context's performance goal):
once every Tracked Slot for a page has resolved (filled-and-rendered, or empty), there is nothing
left to re-map on future mutations, so the observer calls `disconnect()` and the page pays zero
ongoing cost from this feature for the rest of its lifetime.

**Alternatives considered**: Leaving the observer permanently attached "just in case" (e.g., to
support a slot reappearing long after resolving) — rejected, out of scope per spec.md's
Assumptions (a slot's element changing *after* its ad already rendered is explicitly a separate
concern), and it would leave a live observer running for the entire page lifetime for no
benefit this feature asks for.

## Decision: Wrap the `MutationObserver` callback the same way the per-slot pipeline is wrapped

**Rationale**: Constitution Principle V requires nothing in this SDK to throw uncaught into the
host page. A `MutationObserver` callback that throws is a new surface this feature introduces —
feature 001's existing `runSlot(...).catch(() => {})` pattern only covers each slot's async
pipeline, not a synchronous DOM-mutation callback. The matching/re-mapping logic run on each
mutation batch must be wrapped in its own `try/catch` so a defect there degrades to "this
mutation's re-mapping was skipped" (the next mutation gets another chance) rather than an
exception surfacing from inside the host page's own render/commit cycle.

**Alternatives considered**: Relying on the existing per-slot `.catch()` alone — rejected, that
only guards each slot's `requestAd`/`renderAd` promise chain, not the separate, synchronous
mutation-callback code path this feature adds.
