# Contract Delta: `GET /ads` request

Documents what this client now sends to ad-serve-api's `GET /ads`. Authoritative upstream
contract: ad-serve-api's
`specs/016-add-session-level-tracking/contracts/ad-decision-endpoints-delta.md`.

## `GET /ads` (built by `adDecisionClient.ts`'s `buildQueryString`)

| Query param  | Required | Source                                                                 |
|--------------|----------|---------------------------------------------------------------------------|
| `platformId` | yes      | unchanged                                                                  |
| `adTypeId`   | yes      | unchanged                                                                  |
| `country`    | no       | unchanged                                                                  |
| `deviceType` | no       | unchanged                                                                  |
| `sessionId`  | no       | `AdOrchestratorDeps.sessionId`, originated once per page load; omitted from the query string entirely when absent (research.md Decision 4) |

`sessionId` is never read from the decision response — unlike `impressionId` (feature 007, minted
by ad-serve-api), it is client-originated and this SDK already has it before the request is sent.

## What never happens

- A request being withheld, delayed, or altered because a session identifier could not be
  originated (FR-006).
- `sessionId` being read from, or expected in, the decision response.
