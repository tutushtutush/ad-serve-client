# Implementation Plan: Wire Up Viewable Impression Tracking

**Branch**: `005-wire-viewable-impression` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-wire-viewable-impression/spec.md`

## Summary

Two new modules, wired together by the Orchestrator: `src/utils/viewabilityDetector.ts` (a
generic, stateless `IntersectionObserver`-plus-timer helper implementing the IAB viewability
definition — ≥50% visible, continuously, for ≥1s) and `src/client/viewableImpressionClient.ts` (a
thin, fire-and-forget wrapper around ad-serve-api's `POST /viewable-impression`, preferring
`navigator.sendBeacon()` with a `fetch(..., {keepalive: true})` fallback). `adOrchestrator.ts`
gains two new injected dependencies and starts a fresh viewability watch immediately after each
successful `renderer.renderAd(...)` call (both the initial render and any redisplay), reporting
once the watch's callback fires with the slot's placement identity and `adConfigId` — skipping the
watch entirely when `adConfigId` is unavailable (FR-004). No changes to the Renderer or the
existing `/ads` decision Client.

## Technical Context

**Language/Version**: TypeScript 5.x targeting evergreen browsers (ES2020), unchanged.

**Primary Dependencies**: None new at the package level — `IntersectionObserver`,
`navigator.sendBeacon`, and `fetch` are all browser platform APIs, consistent with this SDK's
existing "no UI framework, minimal dependencies" constraint.

**Storage**: N/A — unchanged.

**Testing**: Jest + `ts-jest` + `jsdom`, unchanged. jsdom does not implement
`IntersectionObserver`, which is exactly why it's injected rather than read from the global
(`createViewabilityDetector(IntersectionObserverImpl)`) — tests supply a fake constructor to
exercise the watch/timer logic, and separately supply `undefined` to exercise the FR-005
unsupported-browser path.

**Target Platform**: Web browsers, unchanged.

**Project Type**: Client-side embed library, unchanged.

**Performance Goals**: Viewability detection must impose no continuous main-thread cost —
`IntersectionObserver` is event-driven (fires only on visibility-crossing), not a scroll/resize
poll loop (research.md).

**Constraints**: FR-003 (each rendered instance independently eligible for at most one report);
FR-004 (missing `adConfigId` skips the watch entirely, not just the report); FR-005 (no
`IntersectionObserver` support degrades to no-op, not an error); FR-006 (no failure anywhere in
this feature may propagate to the host page); FR-007 (a watch must be explicitly stopped once its
rendered instance is no longer eligible, to avoid an indefinitely-live observer).

**Scale/Scope**: `src/utils/viewabilityDetector.ts` (new), `src/client/viewableImpressionClient.ts`
(new), `src/orchestrator/adOrchestrator.ts` (`AdOrchestratorDeps` gains `viewabilityDetector` and
`trackingClient`; `TrackedSlot` gains `stopViewabilityWatch`; both `renderAd` call sites start a
watch afterward; slot-resolution paths stop any pending watch), `src/index.ts` (constructs and
injects both new dependencies).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: ESLint + `tsc --noEmit` gate every change, unchanged. PASS.
- **II. Layered Architecture**: Viewability detection is explicitly named as a Utility concern in
  the constitution itself ("DOM queries, debounce, viewability detection"); the report call is a
  new, dedicated API Client module, structurally parallel to the existing `adDecisionClient.ts`;
  the decision of *when* to watch and *what* to report is Orchestrator business logic, exactly
  where the existing render-decision logic already lives. The Renderer gains no new
  responsibility. Dependencies still flow Loader → Orchestrator → (API Client, Renderer, Utility);
  Utility is used by the Orchestrator only, per Principle II's "MAY be used by any of them". PASS.
- **III. Testable Layers via Dependency Injection**: `viewabilityDetector` and `trackingClient`
  are both injected into `createAdOrchestrator(...)`, exactly like `client`/`renderer` already
  are — no global `IntersectionObserver`/`navigator`/`fetch` read inside the Orchestrator itself.
  `createViewabilityDetector` and `createViewableImpressionClient` each take their own browser-API
  dependency as a constructor parameter (mirrors `createAdDecisionClient(fetchImpl, ...)`), so
  each is independently unit-testable with fakes. PASS.
- **IV. Dedicated Utility & Client Modules**: `viewabilityDetector.ts` (Utility, no business
  meaning — has no idea what an "ad" is) and `viewableImpressionClient.ts` (Client, no logic
  beyond request shaping — never decides *whether* to call, only *how*) each live in this
  project's existing `utils/`/`client/` directories, matching Principle IV directly rather than
  needing a justified exception. PASS.
- **V. Fail-Silent, Never Break the Host Page**: FR-005/FR-006 apply this principle directly to a
  genuinely new failure surface (a browser-triggered `IntersectionObserver` callback the SDK
  itself doesn't control the timing of). `viewabilityDetector.ts`'s observer callback and
  `viewableImpressionClient.ts`'s report call are each independently wrapped so neither can
  propagate — called out explicitly as a Phase 1/implementation requirement, not left implicit.
  PASS.

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/005-wire-viewable-impression/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory: this feature adds no new externally-facing interface of
ad-serve-client's own — it calls an existing external interface (ad-serve-api's `POST
/viewable-impression`), whose contract already lives in that repo
(`ad-serve-api/specs/009-viewable-impressions/contracts/viewable-impression-endpoint.md`).

### Source Code (repository root)

```text
src/
├── utils/
│   └── viewabilityDetector.ts       # NEW — IntersectionObserver + continuous-duration timer
├── client/
│   └── viewableImpressionClient.ts  # NEW — POST /viewable-impression, sendBeacon/fetch fallback
├── orchestrator/
│   └── adOrchestrator.ts            # AdOrchestratorDeps + TrackedSlot extended; watch started
│                                      # after each renderAd call; stopped on redisplay/settle
└── index.ts                         # constructs + injects both new dependencies

tests/unit/ (mirrors src/)
├── utils/viewabilityDetector.test.ts        # NEW
├── client/viewableImpressionClient.test.ts  # NEW
└── orchestrator/adOrchestrator.test.ts      # extended — watch lifecycle, report call, FR-004/007
```

**Structure Decision**: Single project (unchanged) — this feature adds one new Utility module and
one new Client module, both fitting this SDK's existing four-layer-plus-utility structure without
introducing a new layer or module category.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations to justify.
