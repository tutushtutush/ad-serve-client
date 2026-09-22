# Contract Delta: Click and Viewable-Impression Tracking Requests

Extends `specs/007-echo-the-per-impression/contracts/tracking-requests-delta.md` — only the new
param is documented here. Authoritative upstream contracts: ad-serve-api's
`specs/016-add-session-level-tracking/contracts/click-endpoint-delta.md` and
`viewable-impression-endpoint-delta.md`.

## `GET /click` (built by `resolveClickHref` / `buildTrackingUrl`)

| Query param | Required | Source                                                                 |
|-------------|----------|---------------------------------------------------------------------------|
| `sessionId` | no       | `AdOrchestratorDeps.sessionId`, forwarded into `renderer.renderAd(...)`'s new 4th parameter; omitted from the URL entirely when absent |

## `POST /viewable-impression` (built by `reportViewableImpression` / `buildTrackingUrl`)

| Query param | Required | Source                                                                 |
|-------------|----------|---------------------------------------------------------------------------|
| `sessionId` | no       | `AdOrchestratorDeps.sessionId`, forwarded into every `trackingClient.reportViewableImpression(...)` call; omitted from the URL entirely when absent |

Both use the identical `sessionId` value for the entire page load — never re-derived per request,
never per-slot (spec.md User Story 2/FR-004/FR-005).

## What never happens

- A click-tracking URL or viewable-impression report being withheld, delayed, or altered because a
  session identifier could not be originated (FR-006).
- Two requests on the same page load carrying different `sessionId` values (SC-002).
