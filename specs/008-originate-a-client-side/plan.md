# Implementation Plan: Originate and Attach a Visitor Session Identifier

**Branch**: `008-originate-a-client-side` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-originate-a-client-side/spec.md`

## Summary

A new Utility, `src/utils/sessionId.ts`, originates a session identifier via injected
`sessionStorage`-like storage and an injected `crypto.randomUUID`-like generator, reading back an
already-persisted value when one exists and degrading to `undefined` on any failure (research.md
Decisions 1–4). `index.ts`'s `main()` calls it once per page load and passes the result into
`createAdOrchestrator({ ..., sessionId })` as a new dependency, which forwards that single value
into every `client.requestAd(...)` call (`AdDecisionRequest.sessionId`), every
`trackingClient.reportViewableImpression(...)` call (`ViewableImpressionReport.sessionId`), and
every `renderer.renderAd(...)` call (a new 4th parameter, forwarded through `resolveClickHref` into
`buildTrackingUrl`, which gains one more optional query param exactly like `impressionId` did in
feature 007). No new endpoint, no new network call — purely originating one value and threading it
through the existing decision → render → track pipeline.

## Technical Context

**Language/Version**: TypeScript 5.9 (compiled via `tsc --noEmit` for type-checking; bundled with esbuild), unchanged

**Primary Dependencies**: None new. Existing: Jest 30 + jest-environment-jsdom, ESLint 10 + typescript-eslint, esbuild

**Storage**: Browser `sessionStorage` (accessed only through the injected `SessionStorageLike`
interface — data-model.md), one well-known key, one string value. No server-side storage; this
feature is entirely client-side.

**Testing**: Jest with jsdom, following Constitution Principle III — a new
`tests/unit/utils/sessionId.test.ts`, plus extended assertions in the existing orchestrator,
renderer, and tracking-client test files.

**Target Platform**: Browser (arbitrary host pages), via the existing loader-snippet + async
bundle distribution model, unchanged.

**Project Type**: Browser embed SDK (single project, no frontend/backend split), unchanged.

**Performance Goals**: N/A — one `sessionStorage.getItem`/`setItem` pair at most once per page
load (never per-request), plus forwarding one already-in-scope string field on each existing
request; no measurable overhead.

**Constraints**: Must never change *whether* an ad is requested, rendered, clickable, or tracked —
session identifier availability is additive-only (FR-006/FR-007). Must never throw or block on
unavailable/throwing storage or a missing `crypto.randomUUID` (Constitution Principle V,
Fail-Silent).

**Scale/Scope**: One new file (`src/utils/sessionId.ts`) plus its test. Six existing files
extended: `index.ts` (origination + dependency wiring), `types.ts` (`AdDecisionRequest.sessionId`),
`orchestrator/adOrchestrator.ts` (`AdOrchestratorDeps.sessionId`, forwarded at three call sites),
`renderer/adRenderer.ts` (`renderAd`'s new 4th parameter, forwarded into `resolveClickHref`),
`client/viewableImpressionClient.ts` (`ViewableImpressionReport.sessionId`), and
`utils/buildTrackingUrl.ts` (one more optional param). No change to `adDecisionClient.ts` itself —
`sessionId` passes through structurally once `AdDecisionRequest` declares it, the same way feature
007 needed no parsing change in that file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: PASS. `sessionId` follows the exact naming/optional-field pattern
  `impressionId` already established; the new utility mirrors `buildTrackingUrl.ts`'s existing
  size and style — no new abstraction beyond what's already normal in this codebase.
- **II. Layered Architecture**: PASS. Origination (browser-storage access) lives in a Utility, not
  the Orchestrator or Loader directly — the Loader (`index.ts`) only calls it once and hands the
  Orchestrator a plain value (research.md Decision 1). The Orchestrator forwards that value to the
  API Client and Renderer without inspecting or transforming it — no business logic added to
  either. No layer reaches past an adjacent one.
- **III. Testable Layers via Dependency Injection**: PASS. `getOrCreateSessionId` takes both its
  collaborators (storage, id generator) as parameters, exactly like every other browser-API
  touchpoint in this codebase (`IntersectionObserver`, `sendBeacon`, `fetch`) — testable with plain
  fakes, no real `window.sessionStorage`/`window.crypto` needed.
- **IV. Dedicated Utility & Client Modules**: PASS. `sessionId.ts` is generic and stateless in the
  sense this Principle requires (no business meaning of its own beyond "read or create a stored
  value") and has no dependency on any of the other four layers — it may be used by any of them,
  here used by the Loader.
- **V. Fail-Silent, Never Break the Host Page**: PASS by construction — every failure mode
  (storage throws, `crypto.randomUUID` absent, malformed stored value) degrades to `undefined`,
  which every downstream call site already treats identically to "field not provided" (the same
  optional-field contract `impressionId`/`adConfigId` already use). Nothing here can newly block,
  delay, or error an ad request, render, click, or tracking report.

No violations. Nothing to record in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/008-originate-a-client-side/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── ad-decision-request-delta.md
│   └── tracking-requests-delta.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── index.ts                            # + getOrCreateSessionId() call; + sessionId dep wiring
├── types.ts                             # AdDecisionRequest gains sessionId?: string
├── orchestrator/
│   └── adOrchestrator.ts                # AdOrchestratorDeps.sessionId; forwarded into
│                                         # requestAd/reportViewableImpression/renderAd calls
├── renderer/
│   └── adRenderer.ts                    # renderAd gains 4th param, forwarded to resolveClickHref
├── client/
│   └── viewableImpressionClient.ts      # ViewableImpressionReport gains sessionId?: string
└── utils/
    ├── sessionId.ts                     # NEW — getOrCreateSessionId()
    └── buildTrackingUrl.ts              # gains one more optional param

tests/unit/
├── utils/sessionId.test.ts              # NEW
├── utils/buildTrackingUrl.test.ts
├── client/viewableImpressionClient.test.ts
├── renderer/adRenderer.test.ts
└── orchestrator/adOrchestrator.test.ts
```

**Structure Decision**: Single project (unchanged — this SDK has no frontend/backend split). One
new Utility file plus its test; six existing files extended, one per architectural layer already
involved in decision → render → track, matching how feature 007 landed as small extensions to the
same files rather than new architecture.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify.
