# Implementation Plan: Full Creative Rendering Fidelity

**Branch**: `003-full-creative-rendering` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-full-creative-rendering/spec.md`

## Summary

Rewrite `src/renderer/adRenderer.ts` to consume the `resolvedRender` field ad-serve-api now
includes on a found ad (its own feature 006, already merged — see
`../../../ad-serve-api/specs/006-resolved-ad-creative/contracts/resolved-render-addendum.md` for
the authoritative shape) instead of interpreting raw `creative` fields itself. The Renderer gains
logo rendering (with its own optional background pill), resolved headline/CTA colors and fonts, a
CTA that always has a background, a background-image-or-placeholder decision, and
clickable-vs-static wrapper selection — all driven by already-resolved values, with defensive
per-field fallbacks so a missing or malformed `resolvedRender` still degrades to a safe display
(FR-010) rather than a broken or empty one. No other layer changes: discovery, tracking,
redisplay, and the Client's opaque pass-through of `creative` are all unaffected.

## Technical Context

**Language/Version**: TypeScript 5.x targeting evergreen browsers (ES2020), unchanged.

**Primary Dependencies**: None new — still no runtime dependencies. `resolvedRender`'s optional
logo/background image data URLs are consumed the same way `creative.backgroundImageDataUrl`
already was.

**Storage**: N/A — unchanged.

**Testing**: Jest + `ts-jest` + `jsdom`, unchanged.

**Target Platform**: Web browsers, unchanged.

**Project Type**: Client-side embed library, unchanged. This feature is scoped entirely to the
Renderer layer and the shared type definitions it consumes.

**Performance Goals**: None new — building the creative markup remains a synchronous, cheap
string-assembly operation, same cost class as today.

**Constraints**: FR-001–FR-011 from spec.md. In particular: every field consumed from
`resolvedRender` must have a safe fallback if absent or the wrong type (FR-010); the existing
safe-URL restriction on clickability is never loosened by `isLinked` (FR-008); all
advertiser-configured text is still escaped before display (FR-009); no change to when a slot
requests, discovers, or redisplays an ad (FR-011).

**Scale/Scope**: One feature slice, touching `src/types.ts` (new `ResolvedAdCreativeRender` type,
extending `AdCandidate`) and `src/renderer/adRenderer.ts` (rewrite). `src/client/adDecisionClient.ts`
is unchanged — it already treats a found ad's payload as a plausible object and passes it through;
`resolvedRender` rides along as just another field on that object, matching the Client's existing
"stay opaque" boundary (Constitution Principle IV).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: ESLint + `tsc --noEmit` gate every change, unchanged. PASS.
- **II. Layered Architecture**: All new logic lives in the Renderer, exactly where "how to paint
  the result" belongs per Principle II — the Client stays a thin, opaque pass-through (no new
  parsing/validation of `resolvedRender`'s shape added there), and the Orchestrator is untouched
  (it still just calls `renderer.renderAd(element, ad)`, unaware `ad.resolvedRender` exists).
  PASS.
- **III. Testable Layers via Dependency Injection**: No new collaborators to inject — the Renderer
  already takes `documentImpl` as its one injected dependency; the new logic is pure
  value-in/markup-out, trivially unit-testable under jsdom with a range of `resolvedRender` shapes
  (complete, partial, absent). PASS.
- **IV. Dedicated Utility & Client Modules**: The per-field defensive coercion (safe string/
  boolean/number fallbacks) stays local to `adRenderer.ts`, following the same pattern the
  existing `asSafeString` helper already established there — not extracted to `src/utils/` since
  it has no other caller yet (YAGNI, per feature 001's own reasoning for not adding speculative
  utilities). `src/client/adDecisionClient.ts` gains no new logic. PASS.
- **V. Fail-Silent, Never Break the Host Page**: `buildCreativeMarkup` must default every
  `resolvedRender` field independently rather than assuming the whole object is well-formed, so a
  missing or partially-malformed `resolvedRender` (FR-010) still produces a safe, complete markup
  string on its own — not merely relying on the Orchestrator's outer `try/catch` to hide a broken
  partial render. PASS, called out explicitly as a design requirement below.

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-full-creative-rendering/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory for this feature — the contract this feature consumes is owned and
already published by ad-serve-api
(`../../../ad-serve-api/specs/006-resolved-ad-creative/contracts/resolved-render-addendum.md`);
this feature doesn't define a new contract of its own, it implements against an existing one.

### Source Code (repository root)

```text
src/
├── types.ts                       # MODIFIED: new ResolvedAdCreativeRender type;
│                                   # AdCandidate gains an optional resolvedRender field
├── renderer/
│   └── adRenderer.ts               # MODIFIED: consumes ad.resolvedRender; logo, resolved
│                                    # colors/fonts, CTA-always-has-background, background-
│                                    # image-or-placeholder, clickable-vs-static wrapper
├── client/
│   └── adDecisionClient.ts         # unchanged (opaque pass-through, Principle IV)
├── orchestrator/
│   └── adOrchestrator.ts           # unchanged
└── utils/                          # unchanged

tests/
└── unit/
    └── renderer/
        └── adRenderer.test.ts      # EXTENDED: logo present/absent/background-toggled,
                                     # resolved colors/fonts applied vs. defaulted, CTA
                                     # background always present, background-image vs.
                                     # placeholder, linked vs. static wrapper, safe-URL
                                     # override, missing/partial resolvedRender degrades safely
```

**Structure Decision**: Single project, unchanged from features 001–002. This feature is scoped
to `src/types.ts` and `src/renderer/adRenderer.ts` plus their tests — no new modules, no new
public entry points, no change to the Client or Orchestrator.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
