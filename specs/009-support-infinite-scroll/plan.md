# Implementation Plan: Discover and Fill Dynamically Inserted Ad Slots

**Branch**: `009-support-infinite-scroll` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-support-infinite-scroll/spec.md`

## Summary

`adOrchestrator.ts`'s `run(root)` is made safely callable more than once per page load — today it
assumes exactly one call (`notifySlotSettled` is a single module-level pointer the most recent call
overwrites, leaking earlier calls' `MutationObserver`s or firing their disconnect on the wrong
condition). Each `TrackedSlot` gets its own settle callback instead of sharing one outer variable,
and a `WeakSet<Element>` held at the orchestrator-instance level records every element any call has
already claimed (at discovery and at each redisplay), so a later `run(root)` call — however its root
overlaps earlier-processed content — never re-requests or re-renders an already-claimed slot.
`index.ts` exposes `window.adServe.refresh(root?)` as a thin call into `orchestrator.run(root ??
document)`, and drains `window.adServe.q` (the already-scaffolded, currently-unused command queue
from `loader/snippet.js`) the same way Google Publisher Tag's `cmd` queue works: existing queued
callbacks run once `refresh` is defined, and `q.push` is then redefined to run future callbacks
immediately — so a readiness signal sent before this SDK finishes starting up is never lost. No new
network request shape, no new endpoint — purely making the existing discovery/fill pipeline
re-entrant and exposing a public entry point to it.

## Technical Context

**Language/Version**: TypeScript 5.9 (compiled via `tsc --noEmit` for type-checking; bundled with esbuild), unchanged

**Primary Dependencies**: None new. Existing: Jest 30 + jest-environment-jsdom, ESLint 10 + typescript-eslint, esbuild

**Storage**: N/A — no new storage. Reuses the existing per-page-load `sessionId` (feature 008)
unchanged; nothing about this feature reads or writes browser storage.

**Testing**: Jest with jsdom, following Constitution Principle III — extended assertions in the
existing `tests/unit/orchestrator/adOrchestrator.test.ts` (multiple `run()` calls, dedup across
overlapping roots, per-slot settle independence). `index.ts`'s queue-draining/`refresh`-exposure
wiring is Loader code (outside Principle III's unit-test mandate, and `index.ts` has no existing
test file); verified instead via `quickstart.md`'s manual scenarios, matching how `index.ts`'s
existing wiring has always been verified.

**Target Platform**: Browser (arbitrary host pages), via the existing loader-snippet + async-bundle
+ command-queue distribution model (Constitution's Technology & Architecture Constraints) — this
feature is the first to actually make use of the command-queue half of that model, which has existed
unused since the initial loader snippet was scaffolded.

**Project Type**: Browser embed SDK (single project, no frontend/backend split), unchanged.

**Performance Goals**: N/A — one additional discovery scan and one additional `MutationObserver`
per readiness signal, the same per-call cost `run()` already has today; bounded entirely by how many
readiness signals a host page chooses to send.

**Constraints**: A later `run()`/`refresh()` call MUST NOT re-request or re-render any element an
earlier call already claimed, even when their roots overlap (FR-003). A readiness signal sent before
this SDK finishes starting up MUST NOT be lost (FR-004). One call's slots MUST NOT affect another
call's outcome or timing (FR-006/FR-007). Every new entry point MUST degrade silently on failure,
never reaching the host page (FR-009, Constitution Principle V).

**Scale/Scope**: One existing file gets its re-entrancy bug fixed and gains a dedup mechanism
(`src/orchestrator/adOrchestrator.ts`); one existing file gains queue-draining and a public method
exposure (`src/index.ts`). No new source files — the fix is a targeted correction to existing state
management, not new architecture.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: PASS. The `notifySlotSettled` fix removes a documented footgun
  (`adOrchestrator.ts`'s own comment already flags it as needing rework for multi-call use) rather
  than adding one. `claimedElements` is a single, clearly-named `WeakSet<Element>` with one job; no
  new abstraction beyond what FR-003 requires.
- **II. Layered Architecture**: PASS. `index.ts` (Loader) performs only the mechanical parts of
  owning `window.adServe` it already owns today — iterating queued callbacks, redefining `push` —
  identical in kind to how it already wires `window.fetch`/`window.sessionStorage`/etc. into
  injected dependencies. `window.adServe.refresh` is a one-line pass-through with no branching
  logic of its own. Every actual decision — what counts as a new vs. already-claimed slot, what to
  request, when — stays inside the Orchestrator's `run()`, matching Principle II's own description
  of the Orchestrator's role ("drains the command queue" is satisfied in spirit: the Orchestrator is
  what processes each drained command's payload into a decision, while the Loader performs only the
  iteration inherent to owning the global it already owns).
- **III. Testable Layers via Dependency Injection**: PASS. The re-entrancy fix and dedup logic live
  entirely inside `createAdOrchestrator`'s closure, exercised in `adOrchestrator.test.ts` with the
  same injected fakes (`client`, `renderer`, jsdom `Element`/`MutationObserver`) every existing test
  in that file already uses — no new global or real-browser dependency introduced.
- **IV. Dedicated Utility & Client Modules**: N/A. No new Utility or API Client module — no business
  logic is being added to either layer.
- **V. Fail-Silent, Never Break the Host Page**: PASS. `window.adServe.refresh` and each drained
  queue callback are wrapped in the same try/catch pattern `main()` already uses for its own
  bootstrap; a failure while discovering/filling new slots degrades to "those slots stay unfilled,"
  per FR-009, with nothing propagating to the host page's own script execution.

No violations. Nothing to record in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-support-infinite-scroll/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   └── public-api-delta.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── index.ts                     # + window.adServe.refresh(root?) exposure; + q-queue draining
│                                 #   (existing-callback drain, then push redefined to run-immediately)
└── orchestrator/
    └── adOrchestrator.ts        # run() re-entrancy fix:
                                  #   - per-TrackedSlot settle callback replaces the single
                                  #     module-level notifySlotSettled pointer
                                  #   - orchestrator-instance-scoped claimedElements: WeakSet<Element>,
                                  #     checked at discovery and updated at discovery + each redisplay

tests/unit/
└── orchestrator/adOrchestrator.test.ts   # + multi-run independence, + overlapping-root dedup,
                                            #   + per-slot settle correctness across two run() calls
```

**Structure Decision**: Single project (unchanged). No new files — this feature corrects existing
state-management assumptions in `adOrchestrator.ts` and adds a thin public-surface wrapper in
`index.ts`, rather than introducing new architecture.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify.
