# Quickstart: Wire Up Viewable Impression Tracking

## Prerequisites

- This repo built (`npm run build`) so `dist/ad-serve-client.js` reflects this feature.
- ad-serve-api running locally with its viewable-impression endpoint (009) live,
  `EVENTS_DATABASE_URL` pointed at a real events database.
- A host page embedding the built bundle via the loader snippet, `data-api-base-url` pointing at
  the running ad-serve-api instance, with an ad slot for a real, seeded ad (e.g. the `EventPulse`
  platform's `medium-rectangle` placement used throughout this stack's prior quickstarts) —
  positioned far enough down the page that it starts outside the initial viewport, so scrolling it
  into view is an observable action.

## Scenario 1: Scrolling an ad into view and holding it there produces exactly one report (US1)

Load the host page with the ad slot scrolled out of view. Open the browser's Network tab, filter
for `viewable-impression`. Scroll the slot into view (at least half its area) and hold the scroll
position for at least 1–2 seconds.

**Expected**: exactly one request to `{apiBaseUrl}/viewable-impression?platformId=...&adTypeId=...
&adConfigId=...` fires, roughly 1 second after the slot crossed 50% visible — not immediately on
first becoming partially visible, and not more than once for continuing to hold the scroll
position afterward.

```bash
psql "$EVENTS_DATABASE_URL" -c \
  "SELECT event_type, platform_id, ad_type_id, ad_config_id, campaign_id FROM ad_events WHERE event_type = 'viewable_impression' ORDER BY occurred_at DESC LIMIT 1;"
```

**Expected**: one row matching the slot's placement and the ad actually rendered, `campaign_id`
resolved.

## Scenario 2: A quick scroll-past never produces a report (US1, Acceptance Scenario 2)

Reload the host page with the slot out of view. Scroll quickly past it — fast enough that it's
never continuously visible for a full second — without pausing.

**Expected**: no `viewable-impression` request fires in the Network tab for that pass.

## Scenario 3: An interrupted view doesn't block a later qualifying view (US1, Acceptance Scenario 3)

Reload the host page. Scroll the slot partially into view for under a second, then scroll away
again (interrupting it before the threshold), then scroll back and hold it fully in view for over
a second.

**Expected**: no report from the first, interrupted pass; exactly one report from the second,
completed pass.

## Scenario 4: A redisplayed slot is independently eligible to be reported again (US1, Acceptance Scenario 4)

Using a host page that removes and reinserts the ad slot's element shortly after first render
(matching this SDK's existing redisplay test setup from feature 001/004), scroll the slot into
view and hold it past the threshold before the redisplay, then again after the redisplay happens.

**Expected**: two separate `viewable-impression` requests — one for the pre-redisplay rendered
instance, one for the post-redisplay one — confirming FR-003's "each rendered instance
independently eligible" holds through a redisplay, not just across separate slots.

## Scenario 5: An unsupported browser and a missing `adConfigId` — verified at the unit level (US2, FR-004/FR-005)

**Actual finding**: neither case is practically reachable live — every evergreen browser this SDK
targets supports `IntersectionObserver`, and `adConfigId` is populated by ad-serve-api's real
`/ads` response for every seeded ad in this stack's local dev setup. Both are instead verified at
the unit level:

- `tests/unit/utils/viewabilityDetector.test.ts`: `createViewabilityDetector(undefined)`'s
  `watch()` returns a no-op `stop` and never calls `onViewable`, regardless of what the caller
  does afterward.
- `tests/unit/orchestrator/adOrchestrator.test.ts`: a rendered ad with no `adConfigId` never calls
  `viewabilityDetector.watch(...)` at all — confirming FR-004 skips the watch itself, not just the
  eventual report.

**Expected** (unit-level): both cases behave exactly as described above, with no error thrown and
no effect on the ad's own rendering.

## Scenario 6: A failing report never affects the ad or the page (US2, FR-006)

Using a fake `trackingClient` whose `reportViewableImpression` throws synchronously (unit-level,
`tests/unit/orchestrator/adOrchestrator.test.ts`):

**Expected**: the throw is caught within the viewability watch's own callback; the slot's
`resolved`/redisplay bookkeeping and every other slot's processing continue unaffected.
