# Research: Originate and Attach a Visitor Session Identifier

## Decision 1: Originated once, at the Loader layer, not inside the Orchestrator

The session identifier is originated in `index.ts`'s `main()` — the same run-once-per-page-load
entry point that already constructs `baseUrl`, the API Client, the Renderer, and the tracking
client — and passed into `createAdOrchestrator({ ... })` as one new dependency, exactly like
`trackingClient` already is.

**Rationale**: `main()` runs exactly once per page load (module-evaluation time), which is the
same granularity User Story 1/FR-001 need ("once per page load, read back if already persisted").
The Orchestrator is instead created fresh inside that same run and has no narrower or wider
lifetime than `main()` itself, so there is no benefit to originating it deeper in the call chain —
doing so at the Loader layer keeps the Orchestrator itself simple (a plain string it receives,
not a thing it decides how to obtain), consistent with Constitution Principle II's Orchestrator
description ("decides what to request and when" — not "how to obtain cross-cutting identifiers").

**Alternatives considered**: Originating it inside `createAdOrchestrator` on first use — rejected;
it would make the Orchestrator responsible for both browser-storage access and business logic,
mixing concerns Principle II keeps separate, and would complicate testing the Orchestrator's
existing behavior (every existing orchestrator test would need session-storage fakes even though
none of them exercise this feature).

## Decision 2: A generic, injected storage interface — not `window.sessionStorage` directly

A new Utility, `src/utils/sessionId.ts`, exports `getOrCreateSessionId(storage, randomUUIDImpl)`,
where `storage` is a minimal `{ getItem(key): string | null; setItem(key, value): void }` shape
(structurally compatible with the real `Storage` interface, but not typed as it) and
`randomUUIDImpl` is `(() => string) | undefined`. `index.ts` passes `window.sessionStorage`
(guarded — see Decision 4) and a conditionally-present `window.crypto.randomUUID` binding.

**Rationale**: Matches this codebase's established pattern for every other browser API this SDK
touches (`IntersectionObserver` in `viewabilityDetector.ts`, `sendBeacon`/`fetch` in
`viewableImpressionClient.ts`/`adDecisionClient.ts`) — Constitution Principle III requires every
layer be testable via injected fakes, so tests use a plain in-memory object instead of jsdom's
real `sessionStorage`, and can simulate a throwing/unavailable storage without monkey-patching
browser globals.

**Alternatives considered**: Reading `window.sessionStorage` directly inside the utility —
rejected; it would make the utility untestable without a real or jsdom-provided `sessionStorage`,
and would prevent simulating the "storage throws" edge case (Safari's historical private-mode
behavior) cleanly.

## Decision 3: `crypto.randomUUID`, conditionally present, no polyfill

The session identifier is generated with `window.crypto.randomUUID()`, passed into the utility as
an optional injected function — `typeof window.crypto?.randomUUID === "function" ?
window.crypto.randomUUID.bind(window.crypto) : undefined` — mirroring `index.ts`'s existing
`typeof navigator.sendBeacon === "function" ? navigator.sendBeacon.bind(navigator) : undefined`
line for the exact same reason: a capability that not every embedding browser is guaranteed to
have.

**Rationale**: `crypto.randomUUID()` is broadly available in modern browsers but not universal
(some older browsers this SDK might still be embedded on lack it). Per FR-006/Constitution
Principle V, an unsupported browser must degrade to "no session identifier," never throw or block
ad serving. No polyfill/fallback ID scheme (e.g. `Math.random()`-based) is introduced — a fallback
identifier of lower quality is not worth the added surface area for what remains a best-effort,
optional enhancement (spec.md Assumptions: "no existing UI, configuration, or opt-out... follows
the same always-on, best-effort posture").

**Alternatives considered**: A hand-rolled fallback UUID generator for browsers without
`crypto.randomUUID` — rejected as unnecessary complexity for a purely best-effort value; the
degrade-to-absent path already fully satisfies User Story 3.

## Decision 4: One try/catch around the whole read-or-create-and-persist sequence

`getOrCreateSessionId` wraps its entire body — read, generate-if-missing, persist — in a single
`try/catch`, returning `undefined` on any exception rather than attempting to salvage a
locally-generated-but-unpersisted value.

**Rationale**: Matches this codebase's existing style (e.g. `viewableImpressionClient.ts`'s
`reportViewableImpression` wraps its whole body in one try/catch rather than guarding each step
independently). The spec's Edge Cases deliberately choose the simpler "degrade fully to absent"
behavior over a partially-successful, page-load-only value that couldn't be confirmed persisted —
avoiding a second, harder-to-reason-about tier of degradation for a capability that is already
optional end-to-end.

**Alternatives considered**: Returning a freshly-generated identifier for the current page load
even when persisting it fails (so at least User Story 2's same-page-load sharing still holds) —
rejected; the spec's own Edge Cases decision (research supports, not overrides, spec.md) treats a
persist failure as a full degrade, keeping the utility's contract simple: what it returns is
always exactly what a later page load would also read back, or nothing at all.

## Decision 5: Threaded as one plain value into existing request shapes, not re-read per request

`sessionId: string | undefined` is read once in `main()` and passed into
`createAdOrchestrator({ ..., sessionId })`. The Orchestrator forwards that same value into every
`client.requestAd(...)` call (via a new `sessionId?: string` field on `AdDecisionRequest`), every
`trackingClient.reportViewableImpression(...)` call (via a new field on `ViewableImpressionReport`),
and every `renderer.renderAd(...)` call (a new parameter, since click-URL construction happens
inside the Renderer via `resolveClickHref`/`buildTrackingUrl`).

**Rationale**: Reading storage once and passing the plain value down is simpler and cheaper than
re-invoking `getOrCreateSessionId` per request, and structurally guarantees User Story 2/FR-003–
005 (every request on one page load sharing the identical value) — there is exactly one value in
scope for the entire orchestrator run, so two requests can never observe different values.

**Alternatives considered**: Re-reading session storage at each call site — rejected; it would
re-run storage I/O (and its own try/catch) on every single request for no benefit, since the value
never changes within one page load once `main()` has run.

## Decision 6: `POST /ads/batch` is untouched — this SDK doesn't use it

No batch-decision client exists in this codebase (`adDecisionClient.ts` only calls `GET /ads`), so
there is no batch-request shape to extend. If a future feature adds batch support here, it would
pick up `sessionId` the same way this feature adds it to the single-decision path.

**Rationale**: Matches ad-serve-api's own 016 contract note that `POST /ads/batch` accepting
`sessionId` is currently a no-op there too (that endpoint records no events at all yet) — there is
no value in speculatively wiring a request path this SDK has never built.
