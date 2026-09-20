# Quickstart: Route Clicks Through Click Tracking

## Prerequisites

- This repo built (`npm run build`) so `dist/ad-serve-client.js` reflects this feature.
- ad-serve-api running locally with its click endpoint (008) live, `EVENTS_DATABASE_URL` pointed
  at a real events database.
- A host page embedding the built bundle via the loader snippet, `data-api-base-url` pointing at
  the running ad-serve-api instance, with an ad slot for a real, clickable seeded ad (e.g. the
  `EventPulse` platform's `medium-rectangle` placement used throughout this stack's prior
  quickstarts).

## Scenario 1: A clickable ad's href routes through the click endpoint, not the advertiser directly (US1)

Load the host page, let the slot render, then inspect the iframe's `srcdoc`:

```js
document.querySelector('[data-ad-serve-slot] iframe').getAttribute('srcdoc')
```

**Expected**: the wrapper `<a href="...">` points at
`{apiBaseUrl}/click?platformId=...&adTypeId=...&adConfigId=...` — **not** the advertiser's raw
`linkUrl` directly.

## Scenario 2: Clicking still reaches the advertiser's real page (US1, FR-002)

Click the rendered ad (or, in a headless check, follow the `href` above with a real request):

```bash
curl -sD - -o /dev/null "<the href from Scenario 1>"
```

**Expected**: `302 Found` with a `Location` header equal to the advertiser's actual `linkUrl`
(cross-check against the same ad's `GET /ads` response) — matching this stack's own 008 quickstart
Scenario 1, now reached by actually clicking a rendered ad instead of hand-building the URL.

## Scenario 3: A recorded click appears in ad-serve-api's events data (US1)

```bash
psql "$EVENTS_DATABASE_URL" -c \
  "SELECT event_type, platform_id, ad_type_id, ad_config_id FROM ad_events WHERE event_type = 'click' ORDER BY occurred_at DESC LIMIT 1;"
```

**Expected**: one row matching the slot's placement and the ad actually rendered.

## Scenario 4: Missing `apiBaseUrl` falls back to a direct advertiser link (US2, FR-003)

Load a host page whose loader snippet's `<script>` tag has **no** `data-api-base-url` attribute
(or an empty one). Inspect the rendered iframe's `srcdoc` the same way as Scenario 1.

**Expected**: the `<a href="...">` points directly at the advertiser's `linkUrl`, exactly as this
SDK behaved before this feature — no broken or malformed URL, no thrown error, ad still renders
and remains clickable.

## Scenario 5: An ad with no destination remains non-interactive, unaffected by this feature (US2, FR-004)

Using an ad config with `isLinked: false` (or an unsafe `linkUrl`, e.g. `javascript:...`), confirm
the rendered wrapper is still a plain `<div role="group">`, not an `<a>` — this feature does not
make anything clickable that wasn't already.
