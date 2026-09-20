# Implementation Plan: Route Clicks Through Click Tracking

**Branch**: `004-wire-the-rendered` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-click-tracking-wireup/spec.md`

## Summary

`AdCandidate` gains `adConfigId?: string`, passed through opaquely from ad-serve-api's `/ads`
response exactly like every other field (the Client's `isAdCandidate` guard already lets it
through today without knowing it — it's just untyped currently). `adRenderer.ts`'s
`buildCreativeMarkup` builds the clickable wrapper's `href` as `${apiBaseUrl}/click?platformId=
&adTypeId=&adConfigId=` instead of the advertiser's raw `linkUrl` directly, whenever all three of
`adConfigId`, the placement identity, and a non-blank `apiBaseUrl` are available — falling back to
today's direct-link behavior otherwise (FR-003). `createAdRenderer` and `renderAd` both gain a
small amount of new context (the API base URL, and the requesting placement's `platformId`/
`adTypeId`) threaded through from `index.ts` (already holds the base URL) and the Orchestrator
(already holds each slot's placement identity) — no new dependency, no new layer.

## Technical Context

**Language/Version**: TypeScript 5.x targeting evergreen browsers (ES2020), unchanged.

**Primary Dependencies**: None new. `URLSearchParams` (already used in
`adDecisionClient.ts`'s `buildQueryString`) builds the click URL's query string too, for the same
correct-encoding reason and to match existing convention rather than hand-concatenating strings.

**Storage**: N/A — unchanged.

**Testing**: Jest + `ts-jest` + `jsdom`, unchanged.

**Target Platform**: Web browsers, unchanged.

**Project Type**: Client-side embed library, unchanged.

**Performance Goals**: None new — building the click URL is a synchronous, cheap string operation,
same cost class as the existing markup assembly.

**Constraints**: FR-002 (tracked click reaches the exact same destination); FR-003 (missing
tracking info falls back to direct-link, never to non-clickable); FR-004 (the existing
`toSafeHref`-gated clickability decision is completely unchanged — this feature only changes
*where* an already-safe link points, never *whether* something is linkable).

**Scale/Scope**: `src/types.ts` (`AdCandidate` +`adConfigId?`), `src/client/adDecisionClient.ts`
(`isAdCandidate` reads it through, still optional — no new rejection case), `src/renderer/
adRenderer.ts` (new click-URL construction, `createAdRenderer`/`renderAd` signatures gain the API
base URL and per-render placement identity), `src/orchestrator/adOrchestrator.ts`
(`AdRendererLike.renderAd`'s signature updated to match, both call sites pass the slot's
`platformId`/`adTypeId`), `src/index.ts` (passes the already-available `baseUrl` into
`createAdRenderer`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: ESLint + `tsc --noEmit` gate every change, unchanged. PASS.
- **II. Layered Architecture**: The click-URL decision (safe-to-redirect? tracking info
  available?) is business/rendering logic and stays in the Renderer, same layer as the existing
  `toSafeHref` decision it builds on. The Orchestrator's only change is passing along data it
  already holds (`slot.config.platformId`/`adTypeId`) to `renderer.renderAd(...)` — still no DOM
  building or decision logic of its own, matching Principle II's "Orchestrator must go through the
  Renderer" rule. The Client gains no new logic — `adConfigId` rides through the same opaque
  pass-through as every other response field. PASS.
- **III. Testable Layers via Dependency Injection**: `apiBaseUrl` is injected into
  `createAdRenderer(documentImpl, apiBaseUrl)` exactly like `documentImpl` already is — no global
  read inside the Renderer. Unit tests cover the click-URL-vs-direct-link branch with fakes, no
  real DOM/network needed beyond the existing jsdom setup. PASS.
- **IV. Dedicated Utility & Client Modules**: Click-URL construction is rendering logic tied
  directly to the wrapper-href decision it replaces — stays local to `adRenderer.ts`, same
  reasoning 003's plan already gave for not extracting per-field coercion helpers (no second
  caller yet). PASS.
- **V. Fail-Silent, Never Break the Host Page**: FR-003 is this principle applied directly —
  missing `adConfigId`, missing placement identity, or a blank `apiBaseUrl` must each
  independently fall back to the pre-existing direct-link behavior, never to a broken link or a
  thrown error. Called out explicitly as a design requirement in Phase 1 below, not left implicit.
  PASS.

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-click-tracking-wireup/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature adds no new externally-facing interface of
ad-serve-client's own — it changes what an existing, internal rendering decision points to. The
interface it now depends on (ad-serve-api's `GET /click`) already has its own contract, in that
repo (`ad-serve-api/specs/008-log-ad-clicks/contracts/click-endpoint.md`).

### Source Code (repository root)

```text
src/
├── types.ts                        # AdCandidate + adConfigId?: string
├── client/
│   └── adDecisionClient.ts         # unchanged behavior; adConfigId now typed, still optional
├── renderer/
│   └── adRenderer.ts               # click-URL construction; createAdRenderer/renderAd gain context
├── orchestrator/
│   └── adOrchestrator.ts           # AdRendererLike.renderAd signature + both call sites updated
└── index.ts                        # passes baseUrl into createAdRenderer

tests/unit/ (mirrors src/)
├── renderer/adRenderer.test.ts     # extended — click-URL vs. direct-link branch, all fallbacks
├── orchestrator/adOrchestrator.test.ts  # extended — renderAd called with placement identity
└── client/adDecisionClient.test.ts # extended — adConfigId passed through when present
```

**Structure Decision**: Single project (unchanged) — this feature threads one new piece of context
(API base URL) and one new opaque field (`adConfigId`) through the existing four-layer chain,
rather than adding a new layer or module category.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify.
