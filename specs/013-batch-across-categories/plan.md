# Implementation Plan: One batch per scan across categories

**Branch**: `013-per-slot-category-in` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-batch-across-categories/spec.md`

## Summary

Group a scan's slots only by country and device type, send each slot's resolved category on its own placement, and send
the category for the whole request too only when every placement shares it. Give a batch a time limit that grows with
its size. Everything else from spec 012 (applying results, per-slot and per-entry fallback, chunking, groups of one,
claimed slots) is unchanged.

By layer: the **client** writes a `category` on each placement and keeps the whole-request fields (country, device
type, session, and a category only when shared), and scales the batch time limit; the **orchestrator** changes its
grouping key and passes each slot's resolved category on its request.

## Technical Context

**Language/Version**: TypeScript bundled for browsers (`scripts/build.mjs`)

**Primary Dependencies**: none added

**Testing**: Jest with injected fakes (Constitution III); `npm run typecheck`, `npm run lint`, `npm run build`

**Constraints**: never throw to the host page (Constitution V); slot markup, page context and public commands unchanged;
a client without the batch method keeps single requests

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Clean, Readable Code | Pass. Small changes to existing functions; the timeout rule is one named helper. |
| II. Layered Architecture | Pass. HTTP shape in the client; grouping and fallback in the orchestrator. |
| III. Testable via DI | Pass. Fake clients and fetch, as in spec 012's tests. |
| IV. Dedicated Utility & Client Modules | Pass. Reuses `groupSlotsForBatch`; the timeout helper lives in the client module. |
| V. Fail-Silent | Pass. Same fallback paths; no new throwing path. |

Post-design re-check: still passes.

## Project Structure

```text
specs/013-batch-across-categories/
├── plan.md  research.md  data-model.md  quickstart.md  tasks.md
└── contracts/batch-request.md

src/
├── client/adDecisionClient.ts          # per-placement category, shared-category rule, scaled timeout
└── orchestrator/adOrchestrator.ts      # group by country + device type, per-slot resolved category

tests/unit/
├── client/adDecisionClient.test.ts
└── orchestrator/adOrchestrator.batch.test.ts
```

**Structure Decision**: single existing project; edits stay in the client and orchestrator.

## Complexity Tracking

No constitution violations to justify.
