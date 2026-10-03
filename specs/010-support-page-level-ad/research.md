# Research: Page-level ad category context

## Decision 1 — Command form: support `["setContext", payload]` alongside existing callbacks

**Decision**: The command queue keeps accepting zero-argument callbacks (existing behavior,
`src/index.ts` drain loop) and additionally accepts array commands `["name", payload]`. Only
`"setContext"` is defined; unknown names are ignored. A direct method
`window.adServe.setContext(payload)` is also exposed once the bundle is up, mirroring the existing
`window.adServe.refresh`.

**Rationale**: Today `queued()` is invoked blindly, so an array entry would throw (caught, but
silently dropped). The array form is what the publisher-facing contract in the spec uses, and it
is pure data, so it works from inline HTML before the bundle loads with no wrapper function.

**Alternatives**: Callback-only (`q.push(() => adServe.setContext(...))`) — works only after
`setContext` exists, which is exactly the pre-load case the queue is for. Rejected as the only form.

## Decision 2 — Apply queued commands before the first `run()`

**Decision**: In bootstrap, apply every array command in the queue, in order, before
`orchestrator.run(document)`; function callbacks keep their current post-run drain.

**Rationale**: `main()` runs the orchestrator, then drains the queue. A `setContext` queued before
load would otherwise take effect only after the first requests had already gone out, breaking
spec User Story 1, scenario 3.

**Alternatives**: Drain everything before `run()` — changes the timing existing callbacks rely on
(a callback may call `refresh`, which needs `refresh` defined and the initial run done). Rejected.

## Decision 3 — Context state lives in the Orchestrator, read at request time

**Decision**: The Orchestrator holds the current context (a normalized list) and resolves the
category when it builds each request: slot's own category if present, else the context joined with
commas. It exposes `setContext(payload)`.

**Rationale**: "What to request" is Orchestrator business logic (Constitution II). Reading at
request time satisfies FR-003 with no re-scan or re-registration.

## Decision 4 — Slot identity key stays based on the slot's own category only

**Decision**: `makeGroupKey` / `groupDiscoveredSlots` keep using the category parsed from the
slot's `data-category`, not the effective category.

**Rationale**: Group keys re-resolve a slot's element after host-page DOM replacement
(`mapSlotsByGroupPosition`). If the key included the page context, changing the context mid-page
would make every tracked slot's stored key stop matching, silently breaking redisplay tracking
(FR-007). The context affects only the outgoing request.

## Decision 5 — Normalization and malformed input

**Decision**: A pure Utility normalizes a list: keep string entries, trim, drop empty, dedupe
case-insensitively (first occurrence wins, original casing kept), cap at 10. Payload handling:
`{}` or `categories` absent/`[]` clears; `categories` that is a non-array, or a payload that is
not an object, is malformed and ignored (previous context kept, per spec clarification). An array
with some bad entries keeps its good entries.

**Rationale**: Utility is generic and stateless (Constitution IV). Cap of 10 bounds query-string
length; ad-serve-api ignores unmapped words so no vocabulary check belongs here.

## Decision 6 — Wire format unchanged

**Decision**: Categories are joined with `,` into the existing single `category` query parameter.
`adDecisionClient.ts` is not modified.

**Rationale**: ad-serve-api (spec 029) already accepts the comma list; FR-011.

## Decision 7 — SPA navigation

**Decision**: Navigation support is `setContext` followed by the existing
`window.adServe.refresh(root)` for newly inserted slots. `setContext` itself never triggers
requests (FR-008); slots already filled stay as they are.

**Rationale**: Keeps one responsibility per call and reuses the infinite-scroll entry point
(feature 009). Re-requesting on-screen ads is explicitly out of scope.

## Decision 8 — Release

**Decision**: Ship as v1.3.0 (minor, additive). Then bump the ad-serve-api pin.

## Follow-up (not in this feature) — batched requests

The SDK currently makes one `GET /ads` per slot; ad-serve-api's `POST /ads/batch` exists but is
unused (verified: neither EventPulse nor the deployed bundle calls it). A later feature may group a
page's slots into one request. Whether `/ads/batch` avoids duplicate ads across slots is
unverified and should be checked first. Any batch request builder MUST reuse the Orchestrator's
single effective-category resolution (Decision 3) rather than re-implementing it.
