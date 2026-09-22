# Quickstart: Echo the Per-Impression Idempotency Key on Tracking Reports

This is a field-forwarding change with a visible, checkable effect: the query string of the
click-tracking `href` and the viewable-impression network request. Each scenario below is
verifiable at the unit level with injected fakes (Constitution Principle III), matching how
`adConfigId`'s equivalent behavior is already tested in this codebase.

## Prerequisites

- This repo's existing unit test suite runnable (`npm test`), unchanged setup.
- No ad-serve-api instance needed — this feature only concerns what this SDK sends, not
  ad-serve-api's own dedup behavior (that's already verified in that repo, feature 014).

## Scenario 1: `impressionId` flows from decision response into the click URL (US1, Acceptance Scenario 1)

In `tests/unit/renderer/adRenderer.test.ts`: render an `AdCandidate` with both `adConfigId` and
`impressionId` set, an `apiBaseUrl`, and a linked/clickable `resolvedRender`.

**Expected**: the rendered markup's `href` is a `/click` URL whose query string includes
`impressionId=<the same value>`, alongside the existing `platformId`/`adTypeId`/`adConfigId`.

## Scenario 2: `impressionId` flows into the viewable-impression report (US2, Acceptance Scenario 1)

In `tests/unit/orchestrator/adOrchestrator.test.ts`: run a slot whose resolved `AdCandidate`
includes `impressionId`, with a fake `viewabilityDetector` that immediately reports viewable and a
fake `trackingClient`.

**Expected**: `trackingClient.reportViewableImpression` is called with an object that includes
`impressionId` matching the decision response's value.

## Scenario 3: A redisplay reuses the original `impressionId`, never mints a new one (US2, Acceptance Scenario 2)

Extend the existing redisplay test setup (feature 006's own tests, e.g. around a slot's element
being removed and reinserted within its redisplay budget): assert that the viewable-impression
report produced for the *redisplayed* instance carries the identical `impressionId` as the one
that would have been used for the original render — not a freshly generated value, since none is
ever minted client-side.

## Scenario 4: A decision response without `impressionId` behaves exactly as before (US3, Acceptance Scenario 1)

In `tests/unit/renderer/adRenderer.test.ts` and `viewableImpressionClient.test.ts`: use an
`AdCandidate`/report input with `impressionId` omitted (today's existing test fixtures, unchanged).

**Expected**: the built click URL and viewable-impression request are byte-identical to their
pre-feature output — no `impressionId` parameter appears at all (not even as an empty string).

## Scenario 5: A malformed `impressionId` on a schema-drifted response degrades safely (Edge Case)

In `tests/unit/utils/buildTrackingUrl.test.ts`: pass a non-string value where `impressionId` would
go (mirroring the existing `adConfigId`-as-non-string regression test in
`tests/unit/renderer/adRenderer.test.ts`, per `asSafeString`'s established use).

**Expected**: the parameter is omitted from the built URL — never stringified into a broken query
value (e.g. never `impressionId=%5Bobject+Object%5D`).

## Scenario 6: Missing `adConfigId` still means no tracking request at all, `impressionId` notwithstanding (US3, Acceptance Scenario 2)

Use an `AdCandidate` with `impressionId` present but `adConfigId` absent (existing test fixture
pattern for "no adConfigId").

**Expected**: unchanged from today — no `/click` tracking URL is built (falls back to the direct
`safeHref`, or no href at all if unlinked) and no viewable-impression report is sent.
Confirms `impressionId` never becomes an independent trigger for tracking.
