# Phase 0 Research: Ad Slot Request & Render Flow

The constitution had already settled the language, bundler, framework-free approach, and
distribution pattern (Loader-snippet + command-queue, sandboxed-iframe rendering). The research
below resolves the remaining open questions needed to turn those decisions into a concrete design.

## Decision: Jest + `ts-jest` + `jsdom`, not Vitest

**Rationale**: The constitution's Principle III names "Jest or Vitest with jsdom" without
settling between them. Choosing Jest matches ad-serve-api's existing testing stack exactly, which
avoids a second test-runner configuration/mental-model for anyone working across both repos, and
Jest's `jsdom` environment is a first-class, well-documented option for exercising DOM-manipulating
code (the Renderer/Orchestrator layers) without a real browser.

**Alternatives considered**: Vitest — faster and pairs naturally with an esbuild-based build, but
introduces a second test-runner convention into the organization for no functional benefit this
feature needs; revisit only if Jest's cold-start time becomes a real friction point.

## Decision: One `GET /ads` request per slot, never ad-serve-api's batch endpoint

**Rationale**: ad-serve-api exposes both a single ad-decision endpoint (`GET /ads`) and a batch
endpoint (`POST` batch decision, per ad-serve-api's spec 003). FR-006/FR-007 require that one
slot's failure or delay never affects another slot on the same page. A batch request couples
every slot in the call together — a single slow or malformed candidate in the batch response, or
a single network failure, risks the whole batch, which works against that independence
requirement. Firing one independent `GET /ads` request per slot, each with its own timeout and
its own AbortController, keeps every slot's outcome fully isolated at the transport level, not
just in application logic.

**Alternatives considered**: The batch endpoint, to reduce request count for pages with many
slots — rejected for this foundational feature since it directly conflicts with FR-006/FR-007;
worth revisiting as a later, opt-in optimization once per-slot independence can be preserved
client-side (e.g., by still surfacing partial-batch failures per slot).

## Decision: `GET /ads` query parameters sourced directly from ad-serve-api's existing contract

**Rationale**: ad-serve-api's `GET /ads` endpoint (specs/002-ad-decision-endpoint in that repo)
already defines the exact request/response shape this feature must produce and consume:
`platformId` (required, UUID) and `adTypeId` (required) identify the placement; `country` and
`deviceType` are optional and passed through opaquely. Reusing these exact field names for the
slot's `data-*` attributes (`data-platform-id`, `data-ad-type-id`, `data-country`,
`data-device-type`) avoids inventing a second naming scheme or a translation layer between what a
publisher writes and what ad-serve-api expects.

**Alternatives considered**: A translated/renamed attribute vocabulary (e.g., `data-slot-id`) —
rejected as an unnecessary indirection; there is no requirement driving a different public name,
and matching ad-serve-api's own field names makes the two repos easier to reason about together.

## Decision: Sandboxed `<iframe>` via `srcdoc`, not direct DOM injection

**Rationale**: The constitution requires iframe-sandboxed rendering for style/security isolation
from the host page. Populating the iframe via its `srcdoc` attribute (rather than writing to
`contentDocument` after creation) lets the Renderer build the creative's markup as a single
string and hand it to the browser atomically, with `sandbox="allow-popups"` only (no
`allow-scripts`, no `allow-same-origin`) — the creative payload (per ad-serve-api's `AdCreative`
shape) is images, text, and a link, never script, so the narrowest possible sandbox is sufficient
and safest.

**Alternatives considered**: Injecting the creative's fields directly into the host page's own
DOM — rejected outright, violates the constitution's isolation requirement and risks host-page
CSS/script conflicts. `allow-scripts` on the iframe — rejected as unnecessary privilege for a
payload that is documented as static text/image/link data (see ad-serve-api's `AdCreative` in
data-model.md); the narrowest sandbox that satisfies the current creative shape is preferred.

## Decision: Treat every non-success outcome identically as "no ad" at the Client boundary

**Rationale**: FR-005 requires a slot to simply stay empty regardless of *why* an ad didn't
render — no match, invalid config, network failure, timeout, or an unreadable response. ad-serve-api
itself already distinguishes a real "no ad currently eligible" (`200 { ad: null }`) from an
invalid placement (`404`) and a malformed request (`400`), but from this feature's perspective
none of those differences change the outcome visible to the site visitor — all of them mean "this
slot renders nothing." The Client normalizes all of these (plus network-level failures and
timeouts) into a single `AdDecisionResult` shape the Orchestrator can treat uniformly, keeping
FR-005's "no visible difference between failure kinds" guarantee in one place rather than
scattered across call sites.

**Alternatives considered**: Surfacing ad-serve-api's distinct status codes up to the Orchestrator
for different handling per case — rejected; nothing in the spec calls for the Orchestrator to
behave differently across these cases, and collapsing them at the Client boundary is simpler and
keeps the Orchestrator's contract narrow (see Constitution Principle IV).

## Decision: Bounded per-slot timeout via `AbortController`, not a manual `setTimeout` race

**Rationale**: FR-008 requires bounding how long a slot waits for its ad request. Native
`AbortController`, passed to `fetch`'s `signal` option, is the standard browser mechanism for
this — it actually cancels the underlying network request when the bound is hit (freeing the
connection) rather than merely ignoring a late response, which a `Promise.race` against a
`setTimeout` would do while leaving the real request still in flight.

**Alternatives considered**: `Promise.race([fetch(...), timeoutPromise])` — rejected; it produces
the same observable timeout behavior but leaves the original request running in the background,
which is wasted work and could still (rarely) trigger a late DOM write if not also guarded by the
`isConnected` check in FR-009.
