# Quickstart: Discover and Fill Dynamically Inserted Ad Slots

Like features 007/008, the Orchestrator-level behavior is verifiable entirely at the unit level
with injected fakes (Constitution Principle III) — no real browser or ad-serve-api instance needed.
`index.ts`'s queue-draining/`refresh` wiring has no unit test file (matching its existing untested
Loader status); verify it manually per Scenario 5 below.

## Prerequisites

- This repo's existing unit test suite runnable (`npm test`), unchanged setup.

## Scenario 1: A slot inserted after initial load gets filled on the next `run()` call (US1)

In `tests/unit/orchestrator/adOrchestrator.test.ts`: call `orchestrator.run(document)` against a DOM
with one slot element; let it fill. Then append a second, distinct slot element to `document` and
call `orchestrator.run(document)` again.

**Expected**: `client.requestAd` is called once for the first slot (during the first `run()` call)
and once for the second slot (during the second call); the second slot is filled and rendered.

## Scenario 2: A later `run()` call never re-requests or re-renders an already-claimed slot (US3)

Same file: call `orchestrator.run(document)` against a DOM with one slot; let it fill. Call
`orchestrator.run(document)` again with no new slots added (root overlaps the already-handled
element entirely).

**Expected**: `client.requestAd` and `renderer.renderAd` are each still called exactly once in
total — the second call makes zero additional calls for the already-claimed slot.

## Scenario 3: Two `run()` calls settle independently — one call's slots don't affect another's (US4)

Same file: call `orchestrator.run(containerA)` for a subtree with one slot; let it fill and its
`MutationObserver` run through enough quiet mutation batches to settle. Separately, call
`orchestrator.run(containerB)` for a different subtree with one slot, and drive *that* slot to
settle independently (regression test for the `notifySlotSettled` singleton bug — before this
feature's fix, the first call's slot settling would have triggered the second call's disconnect
check, or vice versa).

**Expected**: each call's own `MutationObserver` disconnects only once its own slot(s) resolve,
never as a side effect of the other call's slot settling.

## Scenario 4: A slot removed and replaced (redisplay) is still recognized as claimed by a later overlapping call (US3, Edge Cases)

Same file: call `orchestrator.run(document)` against a DOM with one slot; let it fill. Remove that
rendered element and insert a fresh replacement element at the same group position (triggering the
existing redisplay path via a mutation batch). Then call `orchestrator.run(document)` again.

**Expected**: the redisplay itself reuses the already-fetched ad (existing feature 006 behavior,
unchanged); the second `run(document)` call makes no additional `client.requestAd` call for that
slot, confirming the replacement element was also recorded as claimed, not just the original one.

## Scenario 5: A readiness signal sent before the SDK finishes starting up is still honored (US2) — manual verification

No unit test file for this (Loader code, matching `index.ts`'s existing untested status). Verify
manually:

1. Build the bundle (`npm run build`) and serve a test HTML page that includes `loader/snippet.js`
   inline, followed immediately by `window.adServe.q.push(function () { window.adServe.refresh(); })`
   — pushed *before* the async SDK `<script>` tag has had a chance to load.
2. Load the page.

**Expected**: once the SDK finishes starting up, the queued callback runs and any ad slots present
at that point are filled — no separate action needed from the test page. Confirm via the network
tab that `GET /ads` requests are made after the bundle loads, not dropped.

## Scenario 6: `refresh()` never throws, even when discovery/fill fails internally (Edge Cases, FR-009)

In `tests/unit/orchestrator/adOrchestrator.test.ts`: call `orchestrator.run(root)` with a fake
`client.requestAd` that rejects for a newly discovered slot.

**Expected**: `run()` itself does not throw; the failing slot simply stays unfilled (existing
`runSlot` catch-path behavior, unaffected by this feature — confirms the re-entrancy fix didn't
regress it).
