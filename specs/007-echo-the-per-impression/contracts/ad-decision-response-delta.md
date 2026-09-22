# Contract Delta: `GET /ads` response → `AdCandidate`

Extends `specs/001-loader-and-first/contracts/ad-decision-client-contract.md`'s "Response
handling" section — only the new field is documented here; every other response-handling row is
unchanged. Authoritative upstream contract:
ad-serve-api's `specs/014-per-impression-idempotency-key/contracts/ad-decision-endpoints-delta.md`.

## `200 { ad: { ..., impressionId } }` → `AdCandidate.impressionId`

```json
{ "ad": { "creative": {}, "width": 300, "height": 250, "impressionId": "9c858f5e-..." } }
```

maps to:

```ts
{ status: "filled", ad: { creative: {}, width: 300, height: 250, impressionId: "9c858f5e-..." } }
```

`impressionId` is carried through onto the `AdCandidate` the Client returns, unvalidated beyond
the existing `isAdCandidate()` structural guard (research.md Decision 2) — the same treatment
`adConfigId` already receives.

## `200 { ad: { ... } }` with no `impressionId`

An older, unpatched ad-serve-api (or any response that simply omits the field) produces an
`AdCandidate` with `impressionId: undefined` — `{ status: "filled", ... }` exactly as before this
feature. This is not an error case; it is the expected shape whenever ad-serve-api's own feature
014 hasn't been deployed to whatever instance this client is pointed at.

## What never happens

- A response missing `impressionId` never becomes `{ status: "empty" }` — the field's absence has
  no bearing on whether an ad was served (FR-005/User Story 3).
- `impressionId`'s presence or shape is never used to decide whether the response is treated as
  filled — only `creative`/`width`/`height` are (unchanged from `isAdCandidate()`'s existing
  checks).
