# Contract: SDK to ad-serve-api batch request

Uses ad-serve-api's `POST /ads/batch` (specs 003 and 030 in that repo). The SDK adds no new server behaviour.

## Request

```json
{
  "placements": [
    { "platformId": "…", "adTypeId": "leaderboard" },
    { "platformId": "…", "adTypeId": "leaderboard" }
  ],
  "country": "US",
  "deviceType": "mobile",
  "category": "comedy",
  "sessionId": "…",
  "dedupe": true
}
```

`country`, `deviceType`, `category` and `sessionId` are omitted when absent. `dedupeFallback` is not sent, so the
server default (repeat) applies. Sent as `Content-Type: application/json`.

## Response handling

| Server response | SDK behaviour |
|---|---|
| `200`, `results` same length and order as requested | apply each entry (below) |
| any other status, network error, timeout, malformed body, wrong length or echoed ids differ | whole batch fails, each slot uses a single request |

| Entry `outcome` | SDK behaviour |
|---|---|
| `found` with a usable ad | fill the slot like a single result |
| `no-ad`, `not-found` | slot resolves empty |
| `error`, `invalid` | that slot alone makes a single request |
