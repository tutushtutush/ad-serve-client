# Research: One batch per scan across categories

## Decision 1 — Group key becomes [country, deviceType]

**Decision**: `groupSlotsForBatch` is called with a key of country and device type only. Category moves from the key to
each placement.

**Rationale**: ad-serve-api (spec 031) now takes a category per placement and deduplicates across the batch, so the
category no longer needs to be shared. Country and device type are still request-level on the server.

## Decision 2 — Whole-request category only when shared

**Decision**: The whole-request `category` is sent only when every placement in the batch resolves to the same
category; otherwise only per-placement categories go.

**Rationale**: For a batch of slots in one category, an older server that reads only the whole-request category still
targets correctly. A mixed batch cannot be expressed to an older server at all, so it relies on the server change being
live first. This also keeps spec 012's wire format for the homogeneous case.

**Alternatives considered**: always send both (rejected: a whole-request category would apply to placements whose own
category was blank); never send the whole-request category (rejected: loses the older-server safety net).

## Decision 3 — Release ordering

**Decision**: The SDK is released only after the server change (ad-serve-api spec 031) is live. Because the SDK is served
by that same server and pinned in it, a deployed SDK is always paired with a server that supports it.

## Decision 4 — Batch time limit

**Decision**: A batch of n >= 2 placements uses `base + 250 ms * (n - 1)`, capped at the larger of 10 s and the base,
where `base` is the single-request limit (3 s by default). A single request keeps `base`.

**Rationale**: The server resolves a deduplicated batch's slots one after another, so time grows with size. 250 ms per
extra placement is generous against typical per-slot decision times, and the cap bounds how long a slot waits before
falling back.

**Alternatives considered**: a fixed longer limit for every batch (rejected: delays fallback for small batches);
no change (rejected: spec 012 recorded this as a known limit).
