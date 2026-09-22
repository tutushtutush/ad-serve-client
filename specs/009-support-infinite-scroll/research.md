# Research: Discover and Fill Dynamically Inserted Ad Slots

## Decision 1: Fix re-entrancy by scoping the settle callback per `TrackedSlot`, not per orchestrator instance

`notifySlotSettled` (`adOrchestrator.ts`) is currently a single `let` in `createAdOrchestrator`'s
closure, reassigned by every `run()` call to that call's own `disconnectIfAllResolved`. `resolveSlot`
and `settleRedisplayTracking` — shared across all calls — invoke it via `safeNotifySlotSettled()`.
A second `run()` call today overwrites the first's pointer, so the first call's slots settling would
incorrectly trigger the *second* call's disconnect check (and vice versa). The fix: give each
`TrackedSlot` its own `notifySettled: () => void` field, assigned to that slot's own `run()`
invocation's `disconnectIfAllResolved` at creation time. `resolveSlot(slot)`/
`settleRedisplayTracking(slot)` call `slot.notifySettled()` (wrapped exactly as
`safeNotifySlotSettled` already wraps the call today) instead of a shared outer reference.

**Rationale**: This is the minimal change that removes the documented single-call assumption — no
new coordination structure, no registry of active runs, just moving an existing pointer from
instance-scope to slot-scope, where it always logically belonged (each slot only ever needs to
notify *its own* run's disconnect check).

**Alternatives considered**: A list/`Set` of active `disconnectIfAllResolved` callbacks, notified on
every slot settle — rejected; it would notify every in-flight run whenever any one slot in any run
settles, which is unnecessary work and unnecessary coupling between otherwise-independent `run()`
calls (violates FR-006/FR-007's independence requirement more than it serves it). Reworking `run()`
to accept and merge into one shared `trackedSlots` array across calls — rejected; more invasive, and
loses the clean "each call owns one `MutationObserver` over its own root" model that already makes
`disconnectIfAllResolved` correct within a single call.

## Decision 2: Cross-call dedup via an orchestrator-instance-scoped `WeakSet<Element>`, not a DOM attribute

A `claimedElements = new WeakSet<Element>()` is created once per `createAdOrchestrator(...)` call
(alongside the existing `notifySlotSettled`-turned-per-slot state), scoped to that one orchestrator
instance — matching `sessionId`'s existing instance-level scoping. `run(root)`'s discovery loop
skips any element already in `claimedElements` before it's turned into a `TrackedSlot`, and adds an
element to it at two points: when a `TrackedSlot` is first created for it (initial discovery), and
whenever `processMutationBatch`'s redisplay branch assigns a new `current` element to an existing
slot (`slot.renderedElement = current`) — so a later `run()` call whose root happens to include a
redisplayed replacement element also correctly recognizes it as already-claimed, not just the
original element found at initial discovery.

**Rationale**: FR-003 requires this regardless of *which* element within an already-tracked slot's
lifetime a later, overlapping scan happens to encounter. A `WeakSet` needs no manual cleanup (an
element that's garbage-collected after removal from the DOM simply drops out), unlike a DOM
attribute, which would need active removal to avoid leaking marker state onto elements a host page's
own code might inspect or select against. It also avoids any visible mutation of host-page-owned DOM
— this SDK already renders into a sandboxed `<iframe>` rather than touching host markup beyond the
slot element itself (Constitution's Technology & Architecture Constraints); adding a marker attribute
would be a new, unnecessary touchpoint on markup this SDK doesn't own.

**Alternatives considered**: A `data-ad-serve-tracked` attribute set on each claimed element —
rejected; requires no cleanup only because it's never removed, which risks colliding with a host
page's own attribute-based logic (a CSS selector, another script's `MutationObserver`) reacting to an
attribute change on markup this SDK doesn't own. Deduping only by requiring callers to pass strictly
non-overlapping roots — rejected; FR-003's acceptance scenarios explicitly require correctness even
when a signal's scanned region overlaps already-handled content, so correctness can't depend on
caller discipline alone.

## Decision 3: One `run()` method serves both initial load and every later readiness signal — no separate `refresh()` method on the Orchestrator

Once Decisions 1–2 make `run(root)` safely re-entrant, `index.ts`'s public
`window.adServe.refresh(root)` calls `orchestrator.run(root ?? document)` directly — the exact same
method `main()` already calls once for the initial load. No new Orchestrator-level method name is
introduced.

**Rationale**: The behavior a "readiness signal" needs (discover slots under a root, skip
already-claimed ones, fill/render/track the rest, run independently of other calls) is now exactly
what `run()` already does. Adding a second, identically-behaved method would be a naming-only
abstraction with no behavioral difference to justify it — the public-facing name `refresh` belongs
at the `index.ts`/`window.adServe` boundary (where it communicates intent to host-page authors), not
duplicated one layer down.

**Alternatives considered**: Renaming `run` to something covering both cases (e.g. `discover`) —
rejected as unnecessary churn to every existing call site and test for a rename with no behavioral
motivation. Adding `refresh(root)` as a separate Orchestrator method that just calls `run(root)`
internally — rejected as a pass-through with no logic of its own, adding a second name for the exact
same operation.

## Decision 4: Queue draining lives in `index.ts`, using the standard ad-industry command-queue technique

`main()`, after constructing the Orchestrator and calling `orchestrator.run(document)` for the
initial load, defines `window.adServe.refresh = (root) => { try { orchestrator.run(root ?? document);
} catch { /* Principle V */ } }`, then drains whatever is already in `window.adServe.q` (each queued
entry invoked as a plain callback inside its own try/catch), then replaces `q.push` so any callback
pushed afterward executes immediately instead of merely being appended — the same technique Google
Publisher Tag's `googletag.cmd`, Google Analytics' `ga.q`, and Prebid.js's command queue all use, and
which the Constitution's Technology & Architecture Constraints section already names as this SDK's
intended distribution pattern. `refresh` is defined *before* draining, so an already-queued callback
that itself calls `window.adServe.refresh(...)` succeeds during drain.

**Rationale**: `window.adServe.q` (from `loader/snippet.js`) exists today purely as scaffolding — set
up by the loader snippet, never read by `main()`. This feature is the first to give it a function,
and reusing the exact pattern the constitution already commits this SDK to (rather than inventing a
different queuing scheme) means host-page authors already familiar with GPT/Prebid-style integration
need to learn nothing new. Draining in `index.ts` (not the Orchestrator) keeps `window` access
confined to the Loader layer, per Principle III — the Orchestrator never touches `window.adServe`
itself, it only exposes `run`, which `index.ts` calls.

**Alternatives considered**: Having the Orchestrator itself accept and drain an injected queue array
(`orchestrator.drainQueue(window.adServe.q)`) — considered, since Constitution Principle II literally
credits the Orchestrator with "drains the command queue." Rejected in favor of the simpler split
above: the mechanical iterate-and-redefine-push logic has no business meaning of its own (it's
identical regardless of what a callback happens to do), so keeping it in `index.ts` alongside every
other "wire a concrete browser global into this SDK" line `main()` already contains is more
consistent with Principle IV's spirit (no business logic leaking into a non-Orchestrator layer) than
it would be to give the Orchestrator a queue-shaped parameter it has no other use for.

## Decision 5: No new request/response shape — this feature is discovery-only

Filling a newly discovered slot reuses `runSlot(slot)` exactly as it exists today: the same
`client.requestAd({...slot.config, sessionId})` call, the same `renderer.renderAd(...)` call, the
same `startViewabilityWatch`/`scheduleSettleTimer` calls. Nothing about what's sent to ad-serve-api,
or how a response is parsed, changes.

**Rationale**: The spec's own Assumptions section is explicit that a newly discovered slot must be
filled, rendered, and tracked identically to an initial-load slot (FR-005) — there is no new
capability to build here beyond making discovery re-entrant and reachable after initial load.

**Alternatives considered**: None — this was never in question; recorded here only because Phase 1's
data model would otherwise look suspiciously empty of any new request shape, and it's worth being
explicit that this is a deliberate outcome of the feature's scope, not an oversight.

## Decision 6: `POST /ads/batch` remains out of scope

Consistent with feature 008's Decision 6 and this feature's own spec Assumptions: this SDK still
only calls `GET /ads` per slot. A readiness signal covering several newly discovered slots still
issues one `requestAd` call per slot, run independently (FR-007) — no batching is introduced by this
feature.

**Rationale**: Batching ad-decision requests across slots discovered by one readiness signal is a
different, independently-valuable feature (discussed separately) with its own tradeoffs around
waiting for the slowest slot in a batch; folding it into this feature would couple two independently
motivated changes and make either harder to review or revert on its own.

**Alternatives considered**: Batching all slots found by one readiness signal into a single
`POST /ads/batch` call — rejected for this feature's scope; left as a clearly separable future
enhancement that this feature's design doesn't foreclose (each slot's `runSlot` call is already
independent and could be regrouped into a batch call later without changing the discovery/dedup
mechanics this feature adds).
