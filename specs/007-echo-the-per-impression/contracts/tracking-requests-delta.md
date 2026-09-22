# Contract Delta: Click and Viewable-Impression Tracking Requests

Documents what this client now sends to ad-serve-api's `GET /click` and `POST /viewable-impression`
endpoints. Authoritative upstream contracts: ad-serve-api's
`specs/014-per-impression-idempotency-key/contracts/click-endpoint-delta.md` and
`viewable-impression-endpoint-delta.md`.

## `GET /click` (built by `resolveClickHref` / `buildTrackingUrl`)

| Query param    | Required | Source                                                              |
|----------------|----------|----------------------------------------------------------------------|
| `platformId`   | yes      | unchanged                                                             |
| `adTypeId`     | yes      | unchanged                                                             |
| `adConfigId`   | yes*     | unchanged (*click URL isn't built at all without it, per existing behavior) |
| `impressionId` | no       | `AdCandidate.impressionId`, coerced via `asSafeString()`; omitted from the URL entirely when absent or not a non-empty string |

## `POST /viewable-impression` (built by `reportViewableImpression` / `buildTrackingUrl`)

| Query param    | Required | Source                                                              |
|----------------|----------|----------------------------------------------------------------------|
| `platformId`   | yes      | unchanged                                                             |
| `adTypeId`     | yes      | unchanged                                                             |
| `adConfigId`   | yes*     | unchanged (*report isn't sent at all without it, per existing behavior) |
| `impressionId` | no       | `AdCandidate.impressionId`, coerced via `asSafeString()`; omitted from the URL entirely when absent or not a non-empty string |

## What never happens

- `impressionId`'s absence never prevents a click-tracking URL from being built, nor a
  viewable-impression report from being sent — that remains governed entirely by
  `adConfigId`/`apiBaseUrl` availability, unchanged (FR-006).
- A malformed `impressionId` (wrong type on a schema-drifted response) is never sent as a
  stringified garbage value — `asSafeString()` degrades it to "omit the parameter," the same
  treatment `adConfigId` already receives (research.md Decision 4).
- A redisplayed ad's tracking requests never carry a different `impressionId` than the original
  serving's (research.md Decision 3) — both draw from the same retained `slot.ad`.
- Neither request is ever delayed, retried, or altered in response to whether ad-serve-api's own
  dedup (server-side, ad-serve-api feature 014) accepts or ignores the `impressionId` — this
  client never reads the dedup outcome from either response.
