# Implementation Plan: Page-level ad category context

**Branch**: `010-support-page-level-ad` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-support-page-level-ad/spec.md`

## Summary

Let a host page declare its categories once (`["setContext", {categories}]` on the existing
command queue, or `window.adServe.setContext(...)`), and have every later ad request from a slot
without its own `data-category` carry them in the existing comma-joined `category` parameter. The
Orchestrator owns the context and resolves the category at request time; a small pure Utility
normalizes the list; the bootstrap applies queued array commands before the first `run()` and
dispatches live ones. No API Client or wire-format change. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, no UI framework

**Primary Dependencies**: none new (esbuild for the bundle)

**Storage**: N/A (in-memory context for the page's lifetime)

**Testing**: Jest 30 with jsdom, injected fakes (`npm test`), plus `npm run lint` and
`npm run typecheck`

**Target Platform**: Browsers, embedded in arbitrary third-party pages

**Project Type**: Library (single-file IIFE bundle)

**Performance Goals**: no added network requests; negligible per-request overhead

**Constraints**: fail-silent on any input (Constitution V); bundle stays dependency-free;
ad-serve-api request format unchanged

**Scale/Scope**: one context per page, at most 10 categories

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design — still passes.*

| Principle | Status | How |
|---|---|---|
| I. Clean, readable code | Pass | Small named functions; lint and typecheck required |
| II. Layered architecture | Pass | Context state and precedence in Orchestrator; command parsing in bootstrap; API Client untouched |
| III. Testable via DI | Pass | No new global access in Orchestrator; unit tests for orchestrator, command dispatch, utility |
| IV. Dedicated utility/client modules | Pass | Normalizer is a stateless Utility with no domain logic |
| V. Fail-silent | Pass | Malformed input ignored; every command wrapped; previous context kept |
| Feature branch provenance | Pass | Cut from `main` at 5c1cb51 (`origin/main`) |

No violations; Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/010-support-page-level-ad/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── page-context-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── index.ts                         # apply queued commands before run(); live dispatch; expose setContext
├── types.ts                         # command and context types
├── orchestrator/
│   ├── adOrchestrator.ts            # holds context; setContext(); effective category at request time
│   └── queuedCommands.ts            # NEW: pure dispatch of ["name", payload] entries
└── utils/
    └── normalizeCategories.ts       # NEW: trim / dedupe / cap

tests/unit/
├── orchestrator/
│   ├── adOrchestrator.pageContext.test.ts   # NEW
│   └── queuedCommands.test.ts               # NEW
└── utils/
    └── normalizeCategories.test.ts          # NEW
```

**Structure Decision**: Single project, extending the existing layers. `makeGroupKey` is
deliberately left unchanged (research Decision 4).

## Follow-up

Batched requests (`POST /ads/batch`) are a separate future feature; see the last section of
[research.md](research.md). Category resolution stays in one Orchestrator function so a batch
builder can reuse it.

## Complexity Tracking

None.
