# Contract: API Client → ad-serve-api

This documents what `src/client/adDecisionClient.ts` sends to and expects from ad-serve-api's
existing `GET /ads` endpoint (authoritative contract lives in the ad-serve-api repo,
`specs/002-ad-decision-endpoint/contracts/ad-decision-api.md`; reproduced here only to the extent
this feature depends on it, per research.md's decision to reuse that contract's field names
directly).

## Request: `GET /ads`

Built one-to-one from a validated `AdSlotConfig` (data-model.md):

| Query param  | Required | Source                          |
|--------------|----------|----------------------------------|
| `platformId` | yes      | slot's `data-platform-id`        |
| `adTypeId`   | yes      | slot's `data-ad-type-id`         |
| `country`    | no       | slot's `data-country`, if present |
| `deviceType` | no       | slot's `data-device-type`, if present |

Every request is sent with its own `AbortController`, aborted once the bounded timeout (FR-008)
elapses.

## Response handling → `AdDecisionResult`

| ad-serve-api response                         | This feature's `AdDecisionResult`        |
|------------------------------------------------|--------------------------------------------|
| `200 { ad: { creative, width, height } }`      | `{ status: "filled", ad: {...} }`          |
| `200 { ad: null }`                              | `{ status: "empty" }`                      |
| `404 { error }` (unknown placement)             | `{ status: "empty" }`                      |
| `400 { error }` (malformed request)             | `{ status: "empty" }`                      |
| Network error / request aborted (timeout)       | `{ status: "empty" }`                      |
| Response body doesn't match the expected shape  | `{ status: "empty" }`                      |

Per research.md's normalization decision, the Client never surfaces which of the "empty" cases
occurred to its caller (the Orchestrator) — all are functionally identical outcomes for this
feature (FR-005). This keeps the Orchestrator's contract with the Client to exactly two possible
outcomes, not five.

## What the Client does NOT do

- No retries. One request, one bounded attempt, per slot per page load.
- No caching of results across slots or across page loads.
- No interpretation of `creative`'s fields — those are handed to the Renderer unmodified.
- No batching multiple slots into one call (research.md's per-slot-independence decision).
