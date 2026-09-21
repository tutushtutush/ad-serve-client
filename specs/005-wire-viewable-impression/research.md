# Phase 0 Research: Wire Up Viewable Impression Tracking

## Decision: Viewability = `IntersectionObserver` at `threshold: 0.5`, gated by a continuous 1-second timer

**Rationale**: FR-001 requires the IAB-standard definition — at least 50% of the ad's area visible,
continuously, for at least one second. `IntersectionObserver({ threshold: 0.5 })` reports exactly
when an element crosses the 50%-visible boundary in either direction, without any polling or manual
geometry math. The "continuously, for at least one second" half isn't something `IntersectionObserver`
expresses on its own (it only reports crossing events, not duration), so a `setTimeout(1000)` is
armed the moment an entry reports `isIntersecting && intersectionRatio >= 0.5`, and cleared the
moment a later entry reports it's dropped back below that — so a view that's interrupted before the
full second elapses never fires (spec's Edge Cases / Acceptance Scenario 3), and a *later* period of
sufficient visibility re-arms its own fresh timer rather than being blocked by the earlier,
non-qualifying attempt.

**Alternatives considered**:
- *Polling `getBoundingClientRect()` on a scroll/resize listener* — the pre-`IntersectionObserver`
  approach. Rejected: more code, worse performance (runs on every scroll frame instead of only on
  actual visibility-crossing events), and exactly the kind of main-thread work this SDK should
  avoid imposing on a host page it doesn't own (Constitution Principle V's spirit, even though
  that principle is about errors specifically).
- *Cumulative (non-continuous) 1 second of visible time* — e.g. summing up multiple short glimpses
  that individually never reach 1s. Rejected: doesn't match the IAB standard's "continuously" wording,
  and contradicts spec Acceptance Scenario 3 directly (a scroll-away-then-back sequence must not
  short-circuit past a fresh qualifying view by crediting the earlier partial one).

## Decision: Viewability is watched on the actual rendered host-page element, never from inside the ad's iframe

**Rationale**: The rendered creative lives inside a sandboxed `<iframe>` with
`sandbox="allow-popups allow-popups-to-escape-sandbox"` (`adRenderer.ts`) — deliberately no
`allow-scripts`, so no script of any kind (this SDK's own or otherwise) can execute inside that
frame. `IntersectionObserver` therefore could never run from inside the ad's own content even in
principle; the only place it can run is the host page's own execution context, observing the
`<iframe>` element (or its containing slot element) exactly as any other host-page script would
observe any other DOM node. This also happens to be the *correct* place to measure from: viewability
is a question about whether the ad's occupied screen area is visible within the host page's
viewport, which is a property of the iframe element as seen from the outside, not of anything
happening inside it.

## Decision: A new Utility module (`viewabilityDetector.ts`) and a new Client module (`viewableImpressionClient.ts`); the Orchestrator wires them together

**Rationale**: The Constitution's Layered Architecture principle explicitly lists "viewability
detection" as a Utility concern (generic, stateless, no business meaning of its own — it doesn't
know what an "ad" or a "campaign" is, only "watch this element, call this callback once it's been
sufficiently visible for long enough"). Sending the actual report is a call to ad-serve-api, which
is squarely the API Client layer's job (Principle IV) — structurally the same kind of thing
`adDecisionClient.ts` already does for `GET /ads`, just fire-and-forget instead of awaited-and-parsed,
so it gets its own dedicated client module rather than overloading `adDecisionClient.ts` with an
unrelated response shape and call style. Deciding *when* a report should be attempted, and *with
what identifiers*, is squarely Orchestrator business logic (it already holds each `TrackedSlot`'s
resolved ad and placement identity) — so the Orchestrator gains two new injected dependencies
(`viewabilityDetector`, `trackingClient`), matching how it already receives `client` and `renderer`,
and calls `viewabilityDetector.watch(element, onViewable)` right after each successful
`renderer.renderAd(...)` call (both the initial render in `runSlot` and the redisplay branch in
`processMutationBatch`). Nothing is added to the Renderer — it stays exactly as free of decision
logic as Principle II requires.

**Alternatives considered**:
- *Fold viewability watching into `adRenderer.ts`, matching how feature 004 added click-URL logic
  there* — rejected. 004's addition was itself still zero business-logic-in-Renderer: it stayed a
  synchronous, presentation-adjacent decision (what should this markup's `href` be?) made once at
  render time. Viewability tracking is fundamentally different in shape: it's an ongoing,
  asynchronous *process* against a DOM node the Renderer's job (building `<iframe>` markup) has no
  other reason to hold a reference to after `renderAd` returns, and it culminates in *deciding to
  make a network call* — exactly the kind of "decision logic of its own" Principle II reserves for
  the Orchestrator.

## Decision: `navigator.sendBeacon()` as the primary transport, `fetch(..., { keepalive: true })` as the fallback

**Rationale**: ad-serve-api's `POST /viewable-impression` contract says it was "Designed for
`navigator.sendBeacon()`: always POST, no body required, response never read by the caller" — using
it here is simply honoring that contract on the calling side. `sendBeacon` is also specifically
built for exactly this situation (a fire-and-forget report that must survive the page unloading,
e.g. a viewer navigating away right as a report is about to fire) in a way a plain `fetch` call
without `keepalive` is not guaranteed to. `fetch(..., { keepalive: true })` is kept as a fallback
for the (now rare, but still real per FR-005's spirit of graceful degradation) case where
`navigator.sendBeacon` isn't available, or where a test/host environment's fake doesn't provide it —
matching the two-tier fallback shape this codebase already uses elsewhere (e.g. `resolveClickHref`
falling back to a direct link).

**Alternatives considered**:
- *`fetch` only, no `sendBeacon`* — rejected: `sendBeacon` is the more correct primitive for this
  exact use case (report-and-forget, must survive unload) and ad-serve-api's own contract was
  explicitly written with it in mind; not using it when available would be needless regression from
  the intended calling pattern.

## Decision: One viewability watch per rendered instance; explicitly stopped on redisplay and on final settlement

**Rationale**: FR-003 requires each rendered instance (initial render, and each redisplay per the
existing `INITIAL_REDISPLAYS_REMAINING` mechanism) to be independently eligible for exactly one
report. Starting a fresh `viewabilityDetector.watch(...)` call at every successful `renderAd` call
naturally gives "one watch per instance"; explicitly calling the previous watch's returned `stop()`
whenever a slot is redisplayed (a new element replaces the old one) or whenever the Orchestrator's
existing settling logic marks a slot `resolved` (FR-007: no longer eligible, e.g. redisplay budget
exhausted) prevents an ad instance that will never render again from leaving behind a live, forever-
idle `IntersectionObserver` — a small but real form of the exact kind of host-page side effect
Constitution Principle V exists to prevent, even though it isn't an error.

## Decision: No report attempted, and no watch even started, when `adConfigId` is unavailable

**Rationale**: FR-004 requires skipping the report entirely when identifying information is
missing — matching feature 004's precedent (`resolveClickHref` falling back rather than producing
a broken call). The check happens *before* calling `viewabilityDetector.watch(...)` rather than
inside the `onViewable` callback: there's no reason to pay for an `IntersectionObserver` and a
1-second timer's worth of bookkeeping for an ad instance that could never be reported once viewable
anyway.
