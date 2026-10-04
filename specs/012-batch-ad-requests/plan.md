# Implementation Plan: Batched ad requests with same-page deduplication

**Branch**: `012-batch-ad-requests` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/012-batch-ad-requests/spec.md`

## Summary

When one `run()` finds several slots, group them by the request details a batch can carry (resolved category,
country, device type), and send each group of two or more as one `POST /ads/batch` with `dedupe: true`. Apply
each entry's result exactly as a single result is applied today. If the batch call fails, or an entry is an
error, the affected slots fall back to today's single `GET /ads` path. Groups of one keep using the single path
unchanged.

By layer: the **client** gains `requestAdBatch` (one HTTP call, normalised result, never throws); the
**orchestrator** gains grouping, chunking to the server's 50-placement limit, and per-entry application, reusing
the existing slot pipeline; **index.ts** needs no change because the client factory already returns both
methods.

## Technical Context

**Language/Version**: TypeScript, bundled to a browser script (see `scripts/build.mjs`)

**Primary Dependencies**: none added

**Testing**: Jest with injected fakes (Constitution III); `npm run typecheck`, `npm run lint`

**Target Platform**: browsers, embedded on host pages

**Project Type**: browser SDK (library)

**Constraints**: never throw to the host page (Constitution V); no change to slot markup or public commands;
fake clients that lack the new method keep working (the orchestrator treats it as optional)

**Scale/Scope**: typical pages have 3-10 slots; a batch holds at most 50 placements (ad-serve-api limit)

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Clean, Readable Code | Pass. `runSlot` is split into "request" and "apply a result" so the batch and single paths share the apply step. |
| II. Layered Architecture | Pass. HTTP stays in the client layer; grouping and fallback in the orchestrator; no layer is skipped. |
| III. Testable via DI | Pass. The batch call is on the injected client; orchestrator tests use a fake client. |
| IV. Dedicated Utility & Client Modules | Pass. Grouping/chunking helpers go in `src/utils`; HTTP in `src/client`. |
| V. Fail-Silent | Pass. Every batch failure maps to the per-slot fallback; nothing throws or leaves a slot pending. |

Post-design re-check: still passes.

## Project Structure

### Documentation (this feature)

```text
specs/012-batch-ad-requests/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/batch-request.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── client/adDecisionClient.ts          # + requestAdBatch, wider FetchLike init
├── orchestrator/adOrchestrator.ts      # group, chunk, apply results, fall back
├── utils/groupSlotsForBatch.ts         # new: pure grouping + chunking
└── types.ts                            # + batch result type

tests/unit/
├── client/adDecisionClient.test.ts
├── orchestrator/adOrchestrator.batch.test.ts   # new
└── utils/groupSlotsForBatch.test.ts            # new
```

**Structure Decision**: single existing project; additions follow the existing client / orchestrator / utils split.

## Complexity Tracking

No constitution violations to justify.
