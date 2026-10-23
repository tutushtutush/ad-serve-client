# Contract: how the labels appear on ad requests

Matches ad-serve-api's `contracts/audience-labels-matching.md` (its spec 061, merged).

## Single request

`GET {apiBaseUrl}/ads?platformId=...&adTypeId=...[&country=...][&deviceType=...][&category=...][&sessionId=...][&viewerId=<uuid>][&audience=<label>,<label>]`

`audience` is added only when labels are set, after the existing parameters, comma-separated (labels cannot contain a comma; the comma is percent-encoded as `%2C` in the URL, which the server decodes). With none, the query string is exactly what it was before this feature. The query string can be recorded in a CDN's or host's access logs.

## Batch request

`POST {apiBaseUrl}/ads/batch` with the JSON body

```json
{ "placements": [ ... ], "country": "...", "deviceType": "...", "category": "...", "sessionId": "...", "viewerId": "<uuid>", "audience": ["follows-team-x", "age-25-34"], "dedupe": true }
```

`audience` appears once, with the shared fields, only when labels are set. With none, the body is exactly what it was before. A batch that falls back to single requests sends each with the labels as above.

## Never sent

Click redirects, viewable-impression reports and tracking URLs carry no labels.
