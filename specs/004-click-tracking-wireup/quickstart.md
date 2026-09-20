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

## Scenario 4: Missing `apiBaseUrl` — verified at the unit level, not reachable live (US2, FR-003)

Load a host page whose loader snippet's `<script>` tag has **no** `data-api-base-url` attribute
(or an empty one).

**Actual finding**: this does *not* exercise the click-fallback path live. `apiBaseUrl` also gates
the `/ads` decision request itself — `getApiBaseUrl()`'s `""` fallback becomes a relative URL,
resolving against the host page's own origin rather than ad-serve-api, so the request never
reaches ad-serve-api at all and no ad is ever fetched or rendered. What *is* confirmed live: the
host page does not crash and the slot stays silently empty (Constitution Principle V holds) — but
there's no rendered ad to inspect an `href` on. The actual "click falls back to `safeHref` when
`apiBaseUrl` is unavailable" behavior is verified at the unit level instead
(`tests/unit/renderer/adRenderer.test.ts`'s "click tracking fallback" describe block), where
`buildCreativeMarkup` is exercised directly, independent of the fetch layer that gates it live.

**Expected** (unit-level): with `apiBaseUrl` blank/absent but `adConfigId` present, `resolveClickHref`
returns the direct `safeHref`, not a `/click` URL.

## Scenario 5: An ad with no destination remains non-interactive, unaffected by this feature (US2, FR-004)

Using an ad config with `isLinked: false` (or an unsafe `linkUrl`, e.g. `javascript:...`), confirm
the rendered wrapper is still a plain `<div role="group">`, not an `<a>` — this feature does not
make anything clickable that wasn't already.
