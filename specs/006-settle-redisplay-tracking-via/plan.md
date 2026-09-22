# Implementation Plan: Settle Redisplay Tracking via Wall-Clock Timeout

**Branch**: `006-settle-redisplay-tracking-via` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-settle-redisplay-tracking-via/spec.md`

## Summary

`adOrchestrator.ts`'s `TrackedSlot` gains a per-slot wall-clock timer, started (and restarted)
alongside `quietBatchesRemaining` every time a slot is (re)rendered, that calls
`settleRedisplayTracking(slot)` if the slot hasn't already settled or resolved by the time it
fires — a fallback trigger alongside the existing mutation-count-based one, not a replacement for
it. Whichever trigger reaches the slot first wins; the other becomes a no-op. The timer is
cleared whenever the slot settles or resolves through any path, so it never fires late and never
itself becomes a new unbounded per-slot resource.

**Scope correction found during planning**: `resolveSlot()`/`settleRedisplayTracking()` live in
`createAdOrchestrator`'s outer scope, while the function that actually releases the top-level
`MutationObserver` (`disconnectIfAllResolved()`) is private to `run()`'s closure and today is only
invoked from specific call sites (end of `processMutationBatch`, and `runSlot(...).finally(...)`)
— never automatically just because `slot.resolved` flips true. A wall-clock timer firing on a page
with no further mutations would mark the slot settled without ever prompting that release check to
run, so this feature also adds a small notify hook: `run()` assigns a module-scope
`notifySlotSettled` reference to its own `disconnectIfAllResolved` at the start of each call, and
`resolveSlot()`/`settleRedisplayTracking()` invoke it after marking a slot settled/resolved. This
is the minimum wiring needed for this feature to actually achieve SC-001.

This also fully resolves ad-serve-client#9's broader "top-level `MutationObserver` never releases"
framing, including the specific sub-case its own review called out (the pre-existing
`onViewable`/`onGiveUp` viewability callbacks having no path to `disconnectIfAllResolved` either)
— not because those callbacks themselves change, but because redisplay-tracking settling is now
*always* bounded (within `REDISPLAY_SETTLE_TIMEOUT_MS` of the last render, regardless of mutation
activity) and, once wired, always triggers the top-level release check. Every slot's `resolved`
flag therefore becomes `true` within a bounded time no matter what viewability is separately doing
— a still-pending viewability watch keeps its own `IntersectionObserver` alive for up to its own
already-bounded `MAX_WATCH_DURATION_MS` (ad-serve-client#8), but the top-level `MutationObserver`
and the `trackedSlots` array it closes over are released on the redisplay-tracking timeline, not
gated on viewability concluding first.

## Technical Context

**Language/Version**: TypeScript 5.x targeting evergreen browsers (ES2020), unchanged.

**Primary Dependencies**: None new — `setTimeout`/`clearTimeout`, already used by
`viewabilityDetector.ts` for the same style of wall-clock cap this feature mirrors.

**Storage**: N/A — unchanged.

**Testing**: Jest + `ts-jest` + `jsdom` with `jest.useFakeTimers()`, unchanged — the existing
quiet-batch settle test (`adOrchestrator.test.ts`, FR-008) already exercises
`settleRedisplayTracking` via mutation batches; this feature adds the equivalent wall-clock-driven
path using `jest.advanceTimersByTime`, mirroring `viewabilityDetector.test.ts`'s existing
`MAX_WATCH_DURATION_MS` tests.

**Target Platform**: Web browsers, unchanged.

**Project Type**: Client-side embed library, unchanged.

**Performance Goals**: One `setTimeout`/`clearTimeout` pair per slot per (re)display — negligible,
same order of magnitude as the existing per-slot viewability watch timer.

**Constraints**: FR-002 (must not stop a slot's viewability watch — that remains
`settleRedisplayTracking`'s existing behavior, untouched); FR-003 (no-op if the slot already
settled/resolved by another path); FR-004 (must not preempt a slot still receiving genuine
mutation activity within its redisplay budget); FR-005 (the timer itself must be released once no
longer needed); FR-006 (no failure in this path may propagate to the host page, per Constitution
Principle V).

**Scale/Scope**: `src/orchestrator/adOrchestrator.ts` only — `TrackedSlot` gains a timer handle
field; a new constant sized like `viewabilityDetector.ts`'s `MAX_WATCH_DURATION_MS`; the timer is
started in `runSlot()`'s successful-render path and in `processMutationBatch`'s redisplay branch
(the two places `quietBatchesRemaining` is reset today), and cleared in `resolveSlot()` and
`settleRedisplayTracking()` (the two places a slot's tracked lifetime ends or settles today). Plus
the `notifySlotSettled` hook described above, assigned once per `run()` call and invoked from
`resolveSlot()`/`settleRedisplayTracking()`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: ESLint + `tsc --noEmit` gate every change, unchanged. The new timer
  reuses the exact naming/lifecycle pattern already established by `quietBatchesRemaining`
  (reset on every render/redisplay, checked/cleared on settle) so a reader who already understands
  today's quiet-batch logic recognizes the wall-clock fallback as the same idea on a different
  clock, not a new concept. PASS.
- **II. Layered Architecture**: This is entirely Orchestrator business logic — deciding *when* a
  slot's redisplay tracking has waited long enough to give up is exactly the kind of decision this
  constitution assigns to the Orchestrator, not a Utility or the Renderer. No new module, no
  change to Renderer/API Client/Loader. PASS.
- **III. Testable Layers via Dependency Injection**: No new external dependency to inject —
  `setTimeout`/`clearTimeout` are already used directly inside `adOrchestrator.ts`'s existing
  `startViewabilityWatch`-adjacent code path indirectly via `viewabilityDetector.ts`, but
  `adOrchestrator.ts` itself has no prior direct timer usage; this introduces its first. Consistent
  with `viewabilityDetector.ts`'s own choice not to inject `setTimeout` (a stable global, not a
  test-hostile one — `jest.useFakeTimers()` intercepts it directly, exactly as the existing
  `viewabilityDetector.test.ts` suite already relies on). PASS — no DI gap introduced.
- **IV. Dedicated Utility & Client Modules**: No new Utility or Client module — this is
  orchestration timing logic, which per Principle II belongs in the Orchestrator itself, not
  extracted into `utils/`. PASS.
- **V. Fail-Silent, Never Break the Host Page**: The timer callback is a new entry point invoked on
  a schedule this SDK doesn't control the timing of, exactly the category Principle V governs —
  it MUST be wrapped so a defect here degrades to "this slot's redisplay tracking doesn't settle
  early," never an uncaught throw into host-page execution. Implementation phase must wrap it the
  same way `processMutationBatch` already wraps its own body. PASS, contingent on that wrapping
  being present (tracked as a task, not a plan-level gate failure).

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-settle-redisplay-tracking-via/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature adds no externally-facing interface of its own — it's an
internal timing fix to existing orchestrator behavior, with no new API surface for host pages,
ad-serve-api, or any other consumer.

### Source Code (repository root)

```text
src/
└── orchestrator/
    └── adOrchestrator.ts   # TrackedSlot gains a settle-timer field + new wall-clock constant;
                             # started in runSlot()'s render path and the redisplay branch of
                             # processMutationBatch; cleared in resolveSlot() and
                             # settleRedisplayTracking()

tests/unit/
└── orchestrator/
    └── adOrchestrator.test.ts   # extended — wall-clock settle path, no-op-when-already-settled,
                                  # no-preemption-of-genuine-churn, timer cleanup on resolve
```

**Structure Decision**: Single project (unchanged) — this feature is a self-contained change to
one existing file (`adOrchestrator.ts`) and its test file; no new module, layer, or directory.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify.
