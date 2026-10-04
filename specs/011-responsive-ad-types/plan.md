# Implementation Plan: Responsive ad types per breakpoint

**Branch**: `011-responsive-ad-types` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-responsive-ad-types/spec.md`

## Summary

Let a slot declare `data-ad-types="0:mobile-leaderboard,768:leaderboard"`. When the slot is first discovered,
the Orchestrator picks the entry with the largest minimum width not above the current viewport width and uses
that single type for the request, rendering and all tracking, freezing it on the tracked slot. Slot identity
(the group key used to survive host-page element replacement) is built from the raw attributes, not the
resolved type, so a resize never breaks it. The viewport width is injected into the Orchestrator. ad-serve-api,
the API Client and the Renderer are unchanged. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9, no UI framework

**Primary Dependencies**: none new

**Storage**: N/A

**Testing**: Jest 30 with jsdom and injected fakes (`npm test`), `npm run lint`, `npm run typecheck`

**Target Platform**: Browsers, embedded in arbitrary third-party pages

**Project Type**: Library (single-file IIFE bundle)

**Performance Goals**: no extra network requests; one width read per discovered slot

**Constraints**: fail-silent on any input (Constitution V); request format to ad-serve-api unchanged; existing
single-type slots byte-for-byte unchanged in behavior

**Scale/Scope**: a handful of entries per slot

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design, still passes.*

| Principle | Status | How |
|---|---|---|
| I. Clean, readable code | Pass | Small named functions; lint and typecheck required |
| II. Layered architecture | Pass | Precedence and freezing in the Orchestrator; list parsing and picking in a generic Utility; Client and Renderer untouched |
| III. Testable via DI | Pass | Viewport width is injected (`getViewportWidth`); no direct `window` reads in the Orchestrator |
| IV. Dedicated utility/client modules | Pass | `breakpointList.ts` is stateless and knows nothing about ads |
| V. Fail-silent | Pass | Bad entries dropped, a throwing width getter treated as width 0, no error reaches the host |
| Feature branch provenance | Pass | Cut from `origin/main` at 8e23665 |

No violations; Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/011-responsive-ad-types/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── responsive-ad-types-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── index.ts                          # pass getViewportWidth (guarded window.innerWidth)
├── types.ts                          # AdSlotConfig gains the raw declared fields used for identity
├── orchestrator/
│   └── adOrchestrator.ts             # parseSlotConfig resolves the type; group key from raw attributes
└── utils/
    └── breakpointList.ts             # NEW: parse "minWidth:value" list, pick by width

tests/unit/
├── orchestrator/
│   └── adOrchestrator.responsive.test.ts   # NEW
└── utils/
    └── breakpointList.test.ts              # NEW
```

**Structure Decision**: Single project, extending existing layers. No renderer or client change (research
Decisions 1 and 6).

## Follow-up

Scale-to-fit for ads wider than their container, and re-requesting when a breakpoint is crossed, are deliberately
out of scope (see research.md). Host pages handle overflow with CSS; the contract documents a recommended rule.

## Complexity Tracking

None.
