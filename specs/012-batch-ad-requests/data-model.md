# Data Model: Batched ad requests

No persistent data.

## Batch group (internal)

Slots from one `run()` that share `[resolved category, country, deviceType]`, in discovery order, split into chunks
of at most 50.

## Batch entry result (client output)

`AdDecisionResult` (`filled` with the ad, or `empty`) plus one new status, `failed`, for an entry the server
reported as `error` or `invalid`. The client returns `BatchEntryResult[]` in request order, or `null` when the whole
call or its response is unusable.

## Request/response wire shapes

See [contracts/batch-request.md](contracts/batch-request.md).
