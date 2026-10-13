# Quickstart: validating the platform id on the script tag

## Automated

```bash
npm run lint && npm run typecheck && npm test
```

Expect: tests for the script-tag read, the one-time missing-id warning (absent, empty, blank), unchanged request shape, ignored slot-level `data-platform-id`, and rescans/batches using the page id. (Use the script names in `package.json` if these differ.)

## Manual

Build (`npm run build`), then on a test page with the API running:

1. Loader tag with `data-api-base-url` and `data-platform-id`, slots with only `data-ad-type-id`: ads fill; network requests carry `platformId=<id>`.
2. Remove `data-platform-id` from the tag: console shows the single `[ad-serve] Platform id missing...` warning, no ad requests, slots stay empty.
3. Same with `data-platform-id=""` and `data-platform-id="  "`: same result.
4. Tag without the attribute, slot still carrying `data-platform-id`: still nothing served.
5. Tag id A, slot id B: requests use A.

See [contract](contracts/script-tag-platform-id.md).
