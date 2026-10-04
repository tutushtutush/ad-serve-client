# Quickstart: validating batched requests

Prerequisites: `npm ci`. Checks: `npm run typecheck && npm run lint && npm test`.
Details: [contracts/batch-request.md](contracts/batch-request.md).

## 1. Automated

`npm test` passes: new client, grouping and orchestrator batch tests, plus every existing test unchanged.

## 2. Slots on one page get different ads (Story 1)

With a fake or real server returning different ads per entry: three same-type, same-category slots in one scan
send one `POST /ads/batch` with `dedupe: true` and three placements, and each slot shows its own entry's ad.

## 3. Grouping (Story 2)

Two music slots and two comedy slots in one scan send two batches, each carrying only its own category.

## 4. Fallback (Story 3)

Make the batch call fail: each slot then makes its own `GET /ads`. Make one entry `error`: only that slot makes a
`GET /ads`; the others keep their batch results.

## 5. Unchanged behaviour (Story 4)

A single slot in a scan makes a `GET /ads` as before; a later refresh with new slots makes its own batch and never
re-requests claimed slots.
