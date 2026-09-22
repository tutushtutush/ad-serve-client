# Implementation Plan: Echo the Per-Impression Idempotency Key on Tracking Reports

**Branch**: `007-echo-the-per-impression` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-echo-the-per-impression/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

ad-serve-api's decision response (`GET /ads`) now returns an optional `impressionId` on the `ad`
object (its already-shipped feature 014). This client must retain that value alongside the rest
of the served ad's data — through redisplay, exactly like `adConfigId` already is — and echo it
back as an additional, always-optional query parameter on the two tracking calls it already
makes: the click-tracking URL built into a rendered ad's `href` (API Client layer's
`buildTrackingUrl`, used by the Renderer's `resolveClickHref`) and the viewable-impression report
fired from the Orchestrator's viewability watch (`viewableImpressionClient.ts`). No new endpoint,
no new call, no new dependency — purely a field addition threaded through the existing decision
→ render → track pipeline, following the same "coerce untrusted/optional field, degrade silently
if absent" pattern this codebase already uses for `adConfigId`.

## Technical Context

**Language/Version**: TypeScript 5.9 (compiled via `tsc --noEmit` for type-checking; bundled with esbuild)

**Primary Dependencies**: None new. Existing: Jest 30 + jest-environment-jsdom (unit tests), ESLint 10 + typescript-eslint (lint), esbuild (bundling)

**Storage**: N/A — no persistence; `impressionId` is held only in the Orchestrator's in-memory `TrackedSlot.ad` for the lifetime of a page view

**Testing**: Jest with jsdom, following Constitution Principle III (injected fakes for `fetch`/`document`/`sendBeacon`, no real network/DOM globals)

**Target Platform**: Browser (arbitrary host pages), via the existing loader-snippet + async bundle distribution model

**Project Type**: Browser embed SDK (single project, no frontend/backend split — see Constitution's Layered Architecture)

**Performance Goals**: N/A — no new work per request beyond reading and forwarding one already-present string field; no measurable overhead

**Constraints**: Must never change *whether* a click is trackable/clickable or a viewable-impression report fires — `impressionId` is additive-only (FR-006). Must never throw or reject on a missing/malformed value (Constitution Principle V, Fail-Silent).

**Scale/Scope**: Touches 4 existing files (`types.ts`, `adDecisionClient.ts` implicitly via type, `buildTrackingUrl.ts`, `adRenderer.ts`, `viewableImpressionClient.ts`, `adOrchestrator.ts`) plus their unit tests. No new files, no new modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: PASS. `impressionId` follows the exact naming/shape ad-serve-api's
  own contract uses; no new abstraction is introduced — it rides the same optional-field,
  coerce-and-degrade pattern already established for `adConfigId` (`asSafeString`), so a reader
  familiar with that pattern needs no new mental model.
- **II. Layered Architecture**: PASS. The API Client layer (`adDecisionClient.ts`) is where the
  field is first recognized (its type, `AdCandidate`, gains the field — no new parsing logic
  needed since untyped JSON already passes extra fields through structurally). The
  Orchestrator retains it on `TrackedSlot.ad` (already its job — it already retains the whole ad
  object). The Renderer and the Viewable-Impression Client are where it's *sent*, via the shared
  Utility `buildTrackingUrl`. No layer reaches past an adjacent one.
- **III. Testable Layers via Dependency Injection**: PASS. No new collaborators are introduced;
  existing injected fakes (`fetchImpl`, `sendBeaconImpl`, `documentImpl`) are reused. New
  assertions are added to each layer's existing unit test file.
- **IV. Dedicated Utility & Client Modules**: PASS. `buildTrackingUrl` (Utility) gains one
  optional parameter and stays generic/stateless (it still only assembles a query string — no
  decision logic). No business logic is added to the API Client.
- **V. Fail-Silent, Never Break the Host Page**: PASS by construction — `impressionId` is only
  ever read and forwarded; every existing fallback path (`safeHref` when unclickable, no report
  when `adConfigId`/`trackingClient`/`viewabilityDetector` absent) is preserved untouched. Adding
  the field can only ever add a query parameter to a request that was already going to be sent —
  it can never newly cause a report/click to be blocked, delayed, or throw.

No violations. Nothing to record in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-echo-the-per-impression/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── types.ts                            # AdCandidate gains `impressionId?: string`
├── client/
│   └── adDecisionClient.ts             # No parsing change needed — impressionId passes through
│                                        # structurally once AdCandidate declares it (isAdCandidate
│                                        # only validates required fields)
├── orchestrator/
│   └── adOrchestrator.ts               # Retains impressionId on TrackedSlot.ad (already retains
│                                        # the whole ad); forwards it in the
│                                        # reportViewableImpression() call
├── renderer/
│   └── adRenderer.ts                   # resolveClickHref forwards ad.impressionId to
│                                        # buildTrackingUrl
├── client/
│   └── viewableImpressionClient.ts     # ViewableImpressionReport gains optional impressionId;
│                                        # forwarded to buildTrackingUrl
└── utils/
    └── buildTrackingUrl.ts             # Gains an optional impressionId param, appended to the
                                         # query string only when present

tests/unit/
├── client/adDecisionClient.test.ts
├── client/viewableImpressionClient.test.ts
├── renderer/adRenderer.test.ts
├── orchestrator/adOrchestrator.test.ts
└── utils/buildTrackingUrl.test.ts
```

**Structure Decision**: Single project (this SDK has no frontend/backend split — see
Constitution's Layered Architecture). This feature adds no new files or modules; it extends five
existing files, one per architectural layer already involved in decision → render → track, plus
their existing unit test files.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
