# Phase 0 Research: Route Clicks Through Click Tracking

## Decision: Extend `renderAd`'s signature with placement identity, rather than attaching it to `AdCandidate`

**Rationale**: `platformId`/`adTypeId` describe the *request* (which placement was asked about),
not the ad itself — `AdCandidate` mirrors ad-serve-api's `/ads` response shape (research.md,
feature 003), and that response never includes the request's own identity back. The Orchestrator
already holds `slot.config.platformId`/`adTypeId` at both call sites that invoke `renderer.renderAd`
(`adOrchestrator.ts`'s initial render and its redisplay path) — passing it through as a parameter,
rather than bolting request-side data onto a type meant to describe only the response, keeps
`AdCandidate`'s meaning honest and matches Constitution Principle II's separation between
"what to request" (Orchestrator) and "how to paint" (Renderer): the Orchestrator hands the Renderer
everything it needs, the Renderer doesn't reach back into request state on its own.

**Alternatives considered**:
- *Add `platformId`/`adTypeId` to `AdCandidate`* — rejected: conflates response shape with request
  context; every future consumer of `AdCandidate` would have to know these two fields don't
  actually come from ad-serve-api's response.
- *Have the Renderer re-derive placement identity from the slot element's own `data-*` attributes*
  — rejected: `adRenderer.ts` doesn't currently parse slot attributes (that's `adOrchestrator.ts`'s
  job via `parseSlotConfig`), and duplicating that parsing in a second place risks the two drifting
  on validation rules over time.

## Decision: `adConfigId` is optional on `AdCandidate`, not validated as required by the Client

**Rationale**: `isAdCandidate`'s existing validation is intentionally minimal — it only checks the
"can't be rendered at all without this" structural fields (`creative` is an object, `width`/
`height` are positive numbers). Every other field (`resolvedRender` and everything inside it) is
individually optional/defaultable, handled by the Renderer's own `asSafe*` coercions
(FR-010, feature 003). `adConfigId` fits that same category: it's needed only for the click-URL
decision, not for rendering the ad at all, so treating it as required would reject (and fail to
render) an otherwise-perfectly-good ad over a field that's only relevant to click tracking.

**Alternatives considered**:
- *Reject the whole ad (`{status: "empty"}`) if `adConfigId` is missing* — rejected: this SDK's
  Fail-Silent principle (Principle V) explicitly favors "still show something" over rejecting on a
  non-essential field; there is no scenario where withholding a whole ad because tracking can't be
  wired serves the publisher or the advertiser.

## Decision: Missing tracking info falls back to the *pre-existing* direct-link behavior, not to a non-interactive ad

**Rationale**: FR-003/User Story 2 requires the click to keep working even when tracking can't be
set up. The existing `toSafeHref(linkUrl)` check already determines *whether* an ad is clickable at
all — this feature adds a second, independent condition only for *where the click goes*, not for
whether it's clickable. So the fallback path when `adConfigId`/placement identity/`apiBaseUrl` is
unavailable is exactly what `adRenderer.ts` already does today: link straight to `safeHref`.

**Alternatives considered**:
- *Make the ad non-interactive when tracking info is unavailable* — rejected outright: this would
  regress a previously-working, clickable ad into a broken one purely because of a tracking
  limitation, the exact failure mode Principle V and FR-003 exist to prevent.

## Decision: `apiBaseUrl` is trusted as configuration, not validated with the same strictness as `linkUrl`

**Rationale**: `linkUrl` originates from a third-party advertiser via ad-serve-api and must be
strictly validated (`toSafeHref`'s http(s)-only allowlist) because it's untrusted, adversarial
input. `apiBaseUrl` originates from the *publisher's own* `<script data-api-base-url="...">`
attribute — the same publisher who chose to embed this SDK on their own page, a trust boundary
this codebase already treats differently (`index.ts`'s `getApiBaseUrl()` reads it directly with no
validation at all, since it's already used unvalidated to build the `/ads` request URL today).
Extending the same "trust the publisher's own configuration, validate third-party data" boundary
to the click URL is consistent with existing precedent, not a new decision. Only checked for being
a non-blank string, matching FR-003's "unavailable" case — an empty string was already the
existing fallback value from `getApiBaseUrl()` when the attribute is absent.

**Alternatives considered**:
- *Apply `toSafeHref`-style validation to `apiBaseUrl` too* — rejected: inconsistent with how
  `apiBaseUrl` is already used elsewhere in this codebase (unvalidated, in `adDecisionClient.ts`'s
  request URL), and it's not adversarial input in the same sense `linkUrl` is.

## Decision: Build the click URL's query string with `URLSearchParams`, not manual concatenation

**Rationale**: `adDecisionClient.ts`'s `buildQueryString` already does this for the `/ads` request,
for correct percent-encoding of arbitrary `platformId`/`adTypeId`/`adConfigId` values without
hand-rolling `encodeURIComponent` calls at each interpolation site. Matches existing, established
convention rather than introducing a second way to build a query string in the same codebase.

**Alternatives considered**: none seriously — this is the codebase's existing pattern for exactly
this problem.
