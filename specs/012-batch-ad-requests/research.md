# Research: Batched ad requests

## Decision 1 — Batch per `run()` call, not per time window

**Decision**: Slots found in one `run()` (which every scan and `refresh` goes through) form the batches. No timers
or debouncing.

**Rationale**: `run()` already is "one scan of one page region", so it matches the server's "one page view" notion
without adding latency. Later scans (infinite scroll, navigation) naturally batch separately.

**Alternatives considered**: a short collection window across calls (rejected: adds delay and shared mutable
state); one global batch per page load (rejected: does not fit slots added later).

## Decision 2 — Group by resolved category, country, device type

**Decision**: Group key is `[resolveCategory(slot.category), country, deviceType]`, computed when the batch is
built. Platform id and ad type vary per placement in a batch and are not part of the key.

**Rationale**: ad-serve-api's batch carries one category, country and device type for the whole request, so mixing
them would mis-target. Using `resolveCategory` keeps targeting identical to single requests.

## Decision 3 — Groups of one use the single path

**Decision**: A group with one slot calls the existing `runSlot` unchanged.

**Rationale**: Nothing to deduplicate; avoids behaviour change and the batch overhead for the most common case.

## Decision 4 — Fallback granularity

**Decision**: Whole-batch failure (network error, timeout, non-OK, malformed or mismatched response) returns `null`
from the client, and every slot in the group runs `runSlot`. A per-entry `error` or `invalid` outcome makes only
that slot run `runSlot`. `no-ad` and `not-found` are final (slot resolves empty), like today's empty result.

**Rationale**: Matches the spec; a failing entry costs one extra request, never an empty slot.

## Decision 5 — Response validation

**Decision**: The client accepts a response only when `results` is an array of the same length as the request and
each entry echoes the requested `platformId` and `adTypeId` in order; otherwise it returns `null`.

**Rationale**: Applying results to the wrong slots would be worse than falling back.

## Decision 6 — Chunking

**Decision**: Groups are split into chunks of at most 50 placements (ad-serve-api's limit), in discovery order,
and each chunk is one batch.

## Decision 8 — Batch timeout

**Decision**: The batch call uses the same 3 s limit as a single request.

**Rationale**: Simple, and typical batches (3 to 10 slots) finish well inside it. Known limit: ad-serve-api resolves a
deduplicated batch's slots one at a time, so a very large batch could time out; the whole batch then falls back to
single requests, which costs extra requests but never an empty slot. A limit that scales with the number of
placements is the natural follow-up and is left for a later SDK change.

## Decision 7 — Optional client method

**Decision**: `requestAdBatch` is optional on the orchestrator's client interface; if absent, every slot uses the
single path.

**Rationale**: Existing tests and any custom client keep working unchanged.
