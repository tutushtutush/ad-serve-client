# Phase 0 Research: Resilient Slot Discovery for Client-Rendered Host Pages

The constitution and feature 001's existing design already settled the layering (Orchestrator
owns discovery) and the fail-silent requirement. The research below covers the concrete
mechanism for continuous discovery and cross-replacement slot identity.

**Amendment (post-implementation)**: real-world verification against eventpulse revealed a
second failure mode beyond the original replace-before-render case — see the "Bounded
post-render watch" decisions near the end of this document, added once that verification
surfaced it (spec.md's Assumptions has the full account).

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

**Rationale**: FR-008 requires the system to stop tracking a slot once its outcome is *finally*
determined — which, after the amendment below, includes surviving the bounded post-render watch
window (FR-009/FR-010), not just the original request settling. Beyond correctness, this bounds
the observer's own cost (Technical Context's performance goal): once every Tracked Slot for a
page is done, there is nothing left to re-map on future mutations, so the observer calls
`disconnect()` and the page pays zero ongoing cost from this feature for the rest of its
lifetime.

**Alternatives considered**: Leaving the observer permanently attached for the life of the page
"just in case" — rejected even after the amendment below extended watching past the first
successful render: an *unbounded* watch is still unnecessary cost once the bounded window
(designed specifically to cover one-time hydration settling) has passed, per the new decisions
below.

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

## Decision: Redisplay is triggered by the rendered element becoming disconnected, not by a generic "something changed" signal

**Rationale**: Real-world verification (spec.md's Assumptions) showed our render can land inside
a React-hydrated subtree *before* hydration reconciles it, and hydration's own mismatch-recovery
then discards/regenerates that subtree — removing our `<iframe>` along with it. The precise,
correct signal that this happened (as opposed to some unrelated mutation elsewhere on the page)
is that the *specific element we rendered into* (`renderedElement`, a new Tracked Slot field) is
no longer connected to the document. Checking this on every mutation batch, rather than
re-running the full request/render pipeline speculatively, keeps the redisplay path cheap and
precisely scoped to the one condition FR-009 describes.

**Alternatives considered**: Treating *any* mutation after a successful render as a reason to
double-check — unnecessary; `renderedElement.isConnected` is a direct, O(1) check that already
answers the only question that matters ("is my ad still there?"), without needing to re-run the
group-position re-mapping unless that check actually fails.

## Decision: Redisplay uses the already-fetched ad, never a second request

**Rationale**: FR-002/FR-005 (feature 001 and this feature's original scope) already establish
that a slot gets exactly one `client.requestAd` call, regardless of how many times its element
changes. Redisplay per FR-009 is a continuation of that same rule: the Tracked Slot keeps the
`AdCandidate` it already received and simply calls `renderer.renderAd` again with the current
element — no new network request, no new ad decision. This also sidesteps a real correctness
trap: a second request could return a *different* winning ad (campaigns are ranked dynamically),
which would mean the visitor briefly saw one ad, then a different one — confusing and not what
FR-005 ("never more than one ad... rendered") is protecting against in spirit, even though its
literal wording was written for the pre-render case.

**Alternatives considered**: Re-requesting on redisplay — rejected for the reasons above.

## Decision: Bounded redisplay attempts and a bounded post-render observation window, both counted in discrete events, not wall-clock time

**Rationale**: FR-010 requires a bounded number of redisplay attempts, and FR-008 requires
watching to eventually stop even if the ad is never removed at all (otherwise a slot whose ad
survives cleanly would be watched for the rest of the page's life). Two small counters, both
reset on the *first* successful render, cover both:
- `redisplaysRemaining` (starts at 3, allowing up to 4 total displays — original + 3 retries):
  decremented only when a redisplay actually happens (`renderedElement` was found disconnected
  and a current element exists to redisplay into). When it reaches 0 and another removal is
  detected, the slot is done (left empty, per FR-010's "leave the slot in whatever state it last
  reached").
- `quietBatchesRemaining` (starts at 10, reset to 10 every time a (re)display happens):
  decremented on every mutation batch observed where the rendered element was found *still
  connected* (no redisplay needed). When it reaches 0, the slot is considered settled and
  watching stops — this is the "stop even if never removed" bound FR-008 needs.

**Values tuned against the real eventpulse environment, not guessed once and left**: an initial,
smaller pair (2 redisplays / 3 quiet batches) was tried first and settled the *wrong* way in
roughly 1 of every 3 real reloads (production build) and every reload in dev mode — the settle
window closed before a later hydration-related mutation arrived, so the ad's disappearance went
undetected. Tracing it live (temporary logging, since removed) showed dev mode in particular
produces more DOM churn around hydration than production does (React DevTools hooks, Fast
Refresh setup) — consistent with a small fixed batch count being too tight a margin. The current
values (3 / 10) were re-verified: 5/5 clean reloads in dev mode and 5/5 in a production build
(`next build && next start`) all displayed the ad with no disappearance.

Both bounds are counted in discrete units (attempts, batches) rather than milliseconds,
consistent with spec.md's Assumptions: hydration timing varies by page complexity and device
performance, but the *number* of mutation batches and redisplay attempts a one-time hydration
event plausibly produces is far more stable — the retuned values comfortably cover what was
empirically observed, with headroom, without guessing a duration.

**Alternatives considered**: A single combined counter instead of two — rejected; conflating
"how many times did we retry" with "how long have we watched without incident" would either cut
off legitimate retries too early (if a quiet batch also consumed retry budget) or let a
never-removed slot get watched far longer than necessary (if only retries consumed budget). A
wall-clock timeout instead of batch counting — rejected per spec.md's Assumptions: duration is
unpredictable across page complexity/device performance in a way that discrete event counts
aren't.
