# Implementation Plan: Resilient Slot Discovery for Client-Rendered Host Pages

**Branch**: `002-resilient-slot-discovery` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-resilient-slot-discovery/spec.md`

## Summary

Replace the Orchestrator's one-shot `querySelectorAll` slot discovery with continuous discovery: a
`MutationObserver` watching the host page's DOM for as long as any slot's ad request is still
in flight. Each discovered slot becomes a **Tracked Slot** — a record kept independent of any
specific DOM node — whose "current element" is re-resolved on every relevant mutation by matching
new elements to tracked slots positionally within same-configuration groups (so two slots sharing
identical placement/targeting stay correctly distinguished, FR-007). When a slot's ad result
resolves, it renders into whatever element is *currently* mapped to that Tracked Slot, not the
element captured at request time; if no element is currently mapped (the slot was removed for
good), it resolves to empty exactly as before. No new timeout is introduced — "removed for good"
is determined by the same per-request timeout bound already in place from the foundational
feature. Once a slot's outcome is determined, its record is dropped and the observer stops
watching for it (FR-008), so a fully-resolved page's observer eventually disconnects entirely.

## Technical Context

**Language/Version**: TypeScript 5.x targeting evergreen browsers (ES2020), unchanged from the
foundational feature.

**Primary Dependencies**: None beyond the native `MutationObserver` API (universally supported in
evergreen browsers; jsdom implements it too, so it needs no special test-environment handling).

**Storage**: N/A — unchanged.

**Testing**: Jest + `ts-jest` + `jsdom`, unchanged. `MutationObserver` is real (not mocked) under
jsdom, so tests exercise the actual observation/matching logic, not a fake.

**Target Platform**: Web browsers, unchanged.

**Project Type**: Client-side embed library, unchanged — this feature only modifies internal
Orchestrator logic.

**Performance Goals**: The observer MUST add no meaningful, ongoing overhead to the host page —
satisfied by FR-008's teardown (once every tracked slot has resolved, observation stops entirely;
a page with no further in-flight slots pays nothing).

**Constraints**: FR-001–FR-008 from spec.md. In particular: no new cooperation/signal from the
host page (FR-006); no more than one ad rendered per slot regardless of how many times its element
is replaced before resolution (FR-005); two slots sharing identical configuration must not be
cross-matched (FR-007).

**Scale/Scope**: One feature slice, touching only `src/orchestrator/adOrchestrator.ts`. The public
contract — the `data-ad-serve-slot` markup and the two loader `<script>` tags
([contracts/slot-markup-contract.md](../001-loader-and-first/contracts/slot-markup-contract.md),
unchanged) — is untouched, so `src/index.ts`, `src/client/adDecisionClient.ts`, and
`src/renderer/adRenderer.ts` all keep their existing public shape from feature 001. No new
contracts are introduced by this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean, Readable Code**: ESLint + `tsc --noEmit` gate every change, unchanged. PASS.
- **II. Layered Architecture**: Continuous discovery and Tracked Slot bookkeeping stay entirely
  within the Orchestrator — it already owns "discover slots" and "decide what to request and
  when" per Principle II; watching for a slot's element to reappear is a direct extension of that
  responsibility, not a new layer. The Client and Renderer are untouched: the Orchestrator still
  calls the Client exactly once per slot (FR-002 — a replacement never triggers a second request)
  and still calls the Renderer exactly once per slot when it resolves filled (FR-005). PASS.
- **III. Testable Layers via Dependency Injection**: `run(root)` already takes its DOM root as an
  injected parameter (feature 001); this feature adds no new global reached for directly —
  `MutationObserver` is constructed against that same injected `root`, the same way `adRenderer`
  already calls `documentImpl.createElement` against its injected document. Unit tests under jsdom
  exercise the real observation/matching logic (no fake needed, since jsdom's MutationObserver is
  a real, spec-compliant implementation) alongside the existing fake Client/Renderer collaborators.
  PASS.
- **IV. Dedicated Utility & Client Modules**: No changes to `src/client/` or `src/utils/` are
  anticipated — the config-group/positional matching logic is specific enough to slot-tracking
  that it belongs in the Orchestrator rather than being extracted as a speculative, unproven
  utility (YAGNI). PASS.
- **V. Fail-Silent, Never Break the Host Page**: The `MutationObserver` callback runs on every
  relevant DOM mutation on the host page — it MUST be wrapped the same way the existing per-slot
  pipeline is (Constitution Principle V, feature 001's T015), so a bug in the matching logic
  degrades to "this slot may end up empty" rather than throwing inside a mutation callback, which
  would be far more visible/damaging (mutation observer callbacks that throw can surface as
  unhandled errors tied to the host page's own render cycle). PASS, with this explicitly called
  out as a design requirement below rather than assumed.

No violations requiring justification — Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-resilient-slot-discovery/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `contracts/` directory for this feature — the public contract is unchanged (FR-006); feature
001's `contracts/` remain the sole, still-authoritative source for the publisher-facing markup and
the ad-serve-api integration.

### Source Code (repository root)

```text
src/
├── index.ts                      # unchanged
├── orchestrator/
│   └── adOrchestrator.ts         # MODIFIED: continuous discovery via MutationObserver, Tracked
│                                  # Slot bookkeeping, position-within-config-group matching
├── client/
│   └── adDecisionClient.ts       # unchanged
├── renderer/
│   └── adRenderer.ts             # unchanged
└── utils/                        # unchanged

tests/
└── unit/
    └── orchestrator/
        └── adOrchestrator.test.ts  # EXTENDED: covers element replacement, repeated
                                     # replacement, permanent removal, and duplicate-config
                                     # disambiguation, alongside feature 001's existing cases
```

**Structure Decision**: Single project, unchanged from feature 001. This feature is scoped
entirely to `src/orchestrator/adOrchestrator.ts` and its test file — no new modules, no new
public entry points.

## Complexity Tracking

*No Constitution Check violations — this section is not applicable.*
