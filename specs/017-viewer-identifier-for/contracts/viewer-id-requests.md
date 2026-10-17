# Contract: how the identifier appears on ad requests

Matches ad-serve-api's `contracts/viewer-id-api.md` (spec 051).

## Single request

`GET {apiBaseUrl}/ads?platformId=...&adTypeId=...[&country=...][&deviceType=...][&category=...][&sessionId=...][&viewerId=<uuid>]`

`viewerId` is added only when an identifier is in effect, after the existing parameters. With none, the query string is exactly what it was before this feature.

## Batch request

`POST {apiBaseUrl}/ads/batch` with the JSON body

```json
{ "placements": [ ... ], "country": "...", "deviceType": "...", "category": "...", "sessionId": "...", "viewerId": "<uuid>", "dedupe": true }
```

`viewerId` appears once, with the shared fields, only when an identifier is in effect. With none, the body is exactly what it was before. A batch that falls back to single requests sends each with the identifier as above.

## Never sent

Click redirects, viewable-impression reports and tracking URLs carry no viewer identifier.
