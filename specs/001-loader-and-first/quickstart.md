# Quickstart: Ad Slot Request & Render Flow

Validates this feature end-to-end in a real browser against a running ad-serve-api instance.

## Prerequisites

- ad-serve-api running locally and reachable (see that repo's own quickstart docs), seeded with
  at least one placement that has an eligible ad and one that does not (reuse ad-serve-api's own
  `specs/002-ad-decision-endpoint/quickstart.md` seed data directly — same `platformId`/`adTypeId`
  values apply here unchanged).
- This repo built (`npm run build`, or equivalent) so `dist/ad-serve-client.js` exists.
- A static file server for a local test HTML page (any simple static server is sufficient — this
  feature has no server component of its own).

## Test page

Create a local HTML file with the loader snippet and one slot, pointed at ad-serve-api's seeded
"eligible ad" placement (`platformId=11111111-1111-1111-1111-111111111111`,
`adTypeId=medium-rectangle` from ad-serve-api's own quickstart seed):

```html
<!DOCTYPE html>
<html>
  <body>
    <h1>Ad Serve Client Quickstart</h1>

    <div
      data-ad-serve-slot
      data-platform-id="11111111-1111-1111-1111-111111111111"
      data-ad-type-id="medium-rectangle"
    ></div>

    <script>
      window.adServe = window.adServe || { q: [] };
    </script>
    <script src="./dist/ad-serve-client.js" data-api-base-url="http://localhost:4000"></script>
  </body>
</html>
```

## Scenario 1: Slot displays the eligible ad (US1)

Open the test page in a browser with ad-serve-api running and the seed data's eligible ad in
place.

**Expected**: within 2 seconds, an iframe appears inside the slot `<div>` showing the seeded ad's
headline/CTA (SC-001). The rest of the page (the `<h1>`) is visible immediately and is never
delayed by the slot (SC-004).

## Scenario 2: No ad available — slot stays empty, page still works (US2)

Using ad-serve-api's Scenario 2 setup (archive the eligible ad config so the placement has
nothing eligible), reload the test page.

**Expected**: the slot `<div>` remains empty (no iframe, no error text, no broken layout); the
rest of the page renders and behaves normally; no error is visible anywhere on the page or in a
way a site visitor would notice (SC-002).

## Scenario 3: Invalid slot configuration — no request made (US2, FR-005)

Change the test page's slot to omit `data-ad-type-id`:

```html
<div data-ad-serve-slot data-platform-id="11111111-1111-1111-1111-111111111111"></div>
```

**Expected**: no network request to ad-serve-api is made for this slot (observable via the
browser's network inspector); the slot stays empty; the rest of the page is unaffected.

## Scenario 4: ad-serve-api unreachable or slow — slot stays empty within the timeout (US2, FR-008)

Stop ad-serve-api (or otherwise make it unreachable/slow), reload the test page from Scenario 1.

**Expected**: the slot resolves to empty within the bounded per-slot timeout (does not hang
indefinitely); the rest of the page is unaffected and finishes loading normally.

## Scenario 5: Two slots resolve independently (US3)

Add a second slot to the test page pointing at ad-serve-api's Scenario 2 (no-ad) setup, alongside
the first slot pointing at the eligible-ad setup:

```html
<div
  data-ad-serve-slot
  data-platform-id="11111111-1111-1111-1111-111111111111"
  data-ad-type-id="medium-rectangle"
></div>

<div
  data-ad-serve-slot
  data-platform-id="11111111-1111-1111-1111-111111111111"
  data-ad-type-id="leaderboard"
></div>
```

(The second slot's `adTypeId` — `leaderboard` — is not enabled on this platform in ad-serve-api's
seed data, per that repo's own Scenario 3, so it resolves to empty via a `404`.)

**Expected**: the first slot displays the eligible ad; the second slot stays empty; neither
slot's outcome is affected by the other, and both resolve independently of each other's timing.

## Cleanup

Restore ad-serve-api's seed data to its original state per that repo's own quickstart cleanup
steps.
