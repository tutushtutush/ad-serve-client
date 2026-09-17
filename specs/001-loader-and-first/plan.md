# Implementation Plan: Ad Slot Request & Render Flow

**Branch**: `001-loader-and-first` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-loader-and-first/spec.md`

## Summary

Build the foundational client-side flow: a publisher marks an element on their page as an ad
slot with `data-*` attributes; a tiny hand-authored loader snippet (outside the build) sets up a
global command queue and async-loads the bundled script; once loaded, the Orchestrator drains the
queue, discovers each slot, and — independently per slot — asks the API Client to fetch a
decision from ad-serve-api's `GET /ads` endpoint and hands a winning result to the Renderer to
paint into a sandboxed `<iframe>`. Every step of a slot's pipeline is wrapped so failure of any
kind (no ad, invalid config, network error, timeout, stale/removed slot) degrades to "leave the
slot empty" without ever throwing an uncaught error into the host page, per Constitution
Principle V.

## Technical Context

**Language/Version**: TypeScript 5.x targeting evergreen browsers (ES2017+), bundled to a single
vanilla-JS IIFE with esbuild — no runtime framework (per the constitution's Technology &
Architecture Constraints; the SDK runs inside arbitrary, unknown host pages).

**Primary Dependencies**: None at runtime — esbuild is a dev-time build dependency only. The
browser's native `fetch`/`AbortController` are used directly; no HTTP client library is added.

**Storage**: N/A. No persistent storage; slot configuration lives in the host page's DOM
(`data-*` attributes) and is read fresh on each page load.

**Testing**: Jest + `ts-jest` + `jsdom`, matching ad-serve-api's testing stack for consistency
across the two repos (see research.md).

**Target Platform**: Web browsers, embedded in arbitrary third-party publisher pages; distributed
as a script served from a CDN plus a small inline loader snippet publishers paste directly into
their HTML.

**Project Type**: Client-side embed library (single project; no backend/frontend split — this
repo has no server component of its own and calls the separate ad-serve-api service over HTTP).

**Performance Goals**: Ad visible within 2s of page load when a match exists (SC-001); presence
of one or more slots must add zero measurable delay to the host page's own load (SC-004) — no
other throughput/latency target applies to a browser-side library.

**Constraints**: Each slot's ad request MUST be bounded by a timeout so an unresponsive
ad-serve-api cannot hold a slot open indefinitely (FR-008); a stale response for a slot that has
left the page MUST be discarded rather than rendered (FR-009); one slot's failure or delay MUST
NOT affect any other slot on the same page (FR-006/FR-007); no failure mode may surface a visible
error, placeholder, or thrown exception to the host page (FR-005, Constitution Principle V).

**Scale/Scope**: One feature slice — one loader snippet, one Orchestrator, one API Client bound
to ad-serve-api's single-ad `GET /ads` endpoint (not its batch endpoint — see research.md), one
Renderer, supporting any number of independently-resolving slots per page. Reporting, analytics,
viewability tracking, and multiple/fallback ad sources are explicitly out of scope (spec.md
Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: ESLint + `tsc --noEmit` gate every change; modules named for what
  they do (`adOrchestrator`, `adDecisionClient`, `adRenderer`). PASS.
- **II. Layered Architecture**: Loader (`loader/snippet.js`, hand-authored, never passed through
  esbuild — sets up `window.adServe = window.adServe || { q: [] }` and async-loads the bundle) →
  `src/index.ts` (entry point, drains the queue) → `src/orchestrator/adOrchestrator.ts` (finds
  slot elements, validates their config, decides what to request) → `src/client/adDecisionClient.ts`
  (thin `GET /ads` wrapper, no business logic) and `src/renderer/adRenderer.ts` (paints a winning
  result into a sandboxed iframe, no decision logic) → `src/utils/` (generic helpers, depends on
  nothing above it). The Orchestrator never calls `fetch` or touches the DOM to render directly.
  PASS.
- **III. Testable Layers via Dependency Injection**: `adOrchestrator`, `adDecisionClient`, and
  `adRenderer` each take their collaborators (a `fetch` implementation, `document`/`window`
  references) as constructor/factory parameters. Jest + jsdom unit tests exercise each with fakes
  in place of real network calls and real DOM globals. PASS (enforced per task during
  implementation).
- **IV. Dedicated Utility & Client Modules**: `src/client/adDecisionClient.ts` only builds the
  `GET /ads` query string from an `AdDecisionRequest` and parses the documented response shape —
  no decision logic. `src/utils/` holds `withTimeout` (generic promise-timeout wrapper) and
  `escapeForMarkup` (generic string escaping) — both added because the Renderer/Client need them,
  not speculatively. PASS.
- **V. Fail-Silent, Never Break the Host Page**: `src/index.ts`'s queue-drain loop wraps each
  slot's pipeline in try/catch; `adDecisionClient` ties every request to a bounded `AbortController`
  timeout and treats network errors, unexpected/malformed responses, and the documented
  `{ ad: null }` case identically as "no ad"; `adOrchestrator` checks `slotElement.isConnected`
  before invoking the Renderer to satisfy FR-009. No promise created in the queue-drain path is
  left unhandled. PASS.

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-loader-and-first/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── slot-markup-contract.md
│   └── ad-decision-client-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
loader/
└── snippet.js                    # hand-authored, NOT run through esbuild; publishers paste
                                   # this (or its contents) directly into their page HTML

src/
├── index.ts                      # bundle entry point: drains window.adServe.q, wires
│                                  # orchestrator -> client/renderer
├── orchestrator/
│   └── adOrchestrator.ts         # discovers slot elements, parses/validates their data-*
│                                  # config, decides what to request, checks isConnected
│                                  # before rendering (FR-009)
├── client/
│   └── adDecisionClient.ts       # thin GET /ads wrapper (ad-serve-api), no business logic
├── renderer/
│   └── adRenderer.ts             # paints a winning AdDecisionResult into a sandboxed iframe
└── utils/
    ├── withTimeout.ts            # generic promise-timeout wrapper (used for FR-008)
    └── escapeForMarkup.ts        # generic string escaping for untrusted creative text

tests/
└── unit/
    ├── orchestrator/
    ├── client/
    ├── renderer/
    └── utils/

dist/                              # esbuild output (gitignored)
```

**Structure Decision**: Single project (Option 1), adapted for a browser-only embed library —
there is no backend/frontend split because this repo has no server of its own. `src/`'s folders
map directly onto Constitution Principle II's Loader → Orchestrator → (API Client, Renderer)
chain, with `client/` and `utils/` as the two non-chained categories from Principle IV. `loader/`
sits outside `src/` specifically because it is never bundled — Principle II requires it stay
small enough to inline directly in a publisher's HTML.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
