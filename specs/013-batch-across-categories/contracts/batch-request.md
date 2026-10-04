# Contract: SDK to ad-serve-api batch request (feature 013)

Supersedes the request shape in [spec 012's contract](../../012-batch-ad-requests/contracts/batch-request.md) for the
category fields. Uses ad-serve-api's per-placement category (its spec 031).

```json
{
  "placements": [
    { "platformId": "…", "adTypeId": "leaderboard", "category": "music" },
    { "platformId": "…", "adTypeId": "leaderboard", "category": "comedy" },
    { "platformId": "…", "adTypeId": "leaderboard", "category": "sports" }
  ],
  "country": "US",
  "deviceType": "desktop",
  "sessionId": "…",
  "dedupe": true
}
```

- `placements[].category` is present when the slot resolves to a category and omitted otherwise.
- The top-level `category` is sent only when every placement resolves to the same one.
- `country`, `deviceType` and `sessionId` are omitted when absent; `dedupeFallback` is never sent.
- Response handling and fallback are unchanged from spec 012.
- Time limit: a single request keeps its limit; a batch of n >= 2 gets `base + 250 ms * (n - 1)`, capped at the larger of
  10 s and `base`.
