# Quickstart: Originate and Attach a Visitor Session Identifier

Like feature 007, this is verifiable entirely at the unit level with injected fakes (Constitution
Principle III) — no real browser or ad-serve-api instance needed.

## Prerequisites

- This repo's existing unit test suite runnable (`npm test`), unchanged setup.

## Scenario 1: A fresh page load with no persisted value originates and persists one (US1, Acceptance Scenario 2)

In `tests/unit/utils/sessionId.test.ts`: call `getOrCreateSessionId(fakeStorage, fakeRandomUUID)`
where `fakeStorage.getItem` returns `null` and `fakeRandomUUID` returns a fixed value.

**Expected**: the function returns that fixed value, and `fakeStorage.setItem` was called once
with the well-known key and that same value.

## Scenario 2: A second call with a value already persisted reads it back, never re-generates (US1, Acceptance Scenario 1)

Same test file: call `getOrCreateSessionId` again with `fakeStorage.getItem` now returning a
previously-stored value.

**Expected**: the function returns that stored value; `fakeRandomUUID` is never called and
`fakeStorage.setItem` is never called.

## Scenario 3: Every request in one page load shares the same session identifier (US2, both Acceptance Scenarios)

In `tests/unit/orchestrator/adOrchestrator.test.ts`: run two tracked slots (two ad-decision
requests) with `sessionId: "s-1"` supplied to `createAdOrchestrator`, one slot's ad becoming
viewable and its ad clicked (via the renderer's click-URL construction).

**Expected**: both `client.requestAd(...)` calls, the `trackingClient.reportViewableImpression(...)`
call, and the rendered click URL all carry `sessionId: "s-1"` / `sessionId=s-1` — the identical
value throughout.

## Scenario 4: Storage throwing degrades to no session identifier, nothing else breaks (US3, both Acceptance Scenarios)

In `tests/unit/utils/sessionId.test.ts`: call `getOrCreateSessionId` with a `fakeStorage` whose
`getItem` (and separately, in another case, `setItem`) throws.

**Expected**: the function returns `undefined` in both cases, and does not itself throw.

Then in `tests/unit/orchestrator/adOrchestrator.test.ts`: run the orchestrator with
`sessionId: undefined` (simulating that outcome).

**Expected**: ad requests, rendering, click-URL construction, and viewable-impression reporting
all proceed exactly as they did before this feature — the only difference is `sessionId` is
absent from every one of them, never an empty string or an error.

## Scenario 5: `crypto.randomUUID` unavailable degrades the same way (US3, Edge Cases)

In `tests/unit/utils/sessionId.test.ts`: call `getOrCreateSessionId(fakeStorage, undefined)` (no
`randomUUIDImpl` supplied) with `fakeStorage.getItem` returning `null`.

**Expected**: returns `undefined`; `fakeStorage.setItem` is never called (nothing was generated to
persist).

## Scenario 6: A malformed/empty persisted value is treated as absent (Edge Case)

In `tests/unit/utils/sessionId.test.ts`: call `getOrCreateSessionId` with `fakeStorage.getItem`
returning `""`.

**Expected**: behaves identically to Scenario 1 — a fresh value is originated and persisted, not
reused as-is.
