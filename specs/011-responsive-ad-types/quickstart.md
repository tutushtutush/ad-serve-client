# Quickstart: validating responsive ad types

Prerequisites: `npm ci`. Run checks with `npm run typecheck && npm run lint && npm test`.
Contract details: [contracts/responsive-ad-types-api.md](contracts/responsive-ad-types-api.md).

## 1. Automated

`npm test` must pass, including the new breakpoint-list and responsive-orchestrator tests, with every existing
test unchanged.

## 2. Manual, plain HTML at two widths (User Stories 1, 3)

1. `npm run build`, then serve a plain HTML page with the loader snippet and one slot with
   `data-ad-types="0:mobile-leaderboard,768:leaderboard"` and no `data-ad-type-id`.
2. Open it at 390px wide and at 1280px wide (browser device emulation, or two window sizes), with the ad API
   stubbed so requests are visible.
3. Confirm the request carries `adTypeId=mobile-leaderboard` at 390px and `adTypeId=leaderboard` at 1280px, and
   exactly one request per load.

## 3. Resize and replacement (spec edge cases)

1. Load at 1280px, then shrink the window to 390px: no new request, the ad stays.
2. Replace the slot element in the page (as a framework would) after resizing: the ad is still shown once, with
   no second request.

## 4. Mistakes and fallbacks (User Story 4)

1. `data-ad-types="abc:x,768:leaderboard,-5:y"` at 1280px: no console error; `leaderboard` is used.
2. List with no usable entry plus `data-ad-type-id="banner"`: `banner` is used.
3. No usable entry and no `data-ad-type-id`: no request, no error.

## 5. Regression

A slot with only `data-ad-type-id` behaves exactly as in v1.3.0.
