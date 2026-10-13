# Implementation Plan: Platform id on the loader script tag

**Branch**: `015-platform-id-on` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-platform-id-on/spec.md`

## Summary

Move the platform id from every slot to one `data-platform-id` attribute on the loader's own `<script>` tag, read synchronously through `document.currentScript` next to `data-api-base-url`. `index.ts` reads it and hands it to the orchestrator as a dependency; slot parsing stops reading `data-platform-id`. When the id is missing or blank the orchestrator logs one warning (through an injected `warn`) and every `run()` is a no-op. Request shape, batching, rendering and tracking are untouched. Docs: slot-markup contract rewritten, plus a new publisher-facing README.

## Technical Context

**Language/Version**: TypeScript, bundled with esbuild into one IIFE

**Primary Dependencies**: none at runtime (no UI framework)

**Storage**: N/A

**Testing**: Jest + jsdom (`tests/unit/**`), ESLint, `tsc`

**Target Platform**: Browsers, embedded in third-party pages

**Project Type**: Embeddable browser SDK (library)

**Performance Goals**: No change; one extra attribute read at load

**Constraints**: Fail-silent (Principle V): a warning is allowed, a throw is not. `document.currentScript` is only valid synchronously at module evaluation.

**Scale/Scope**: ~4 source files, ~14 test call sites, 2 docs

## Constitution Check

| Principle | Status |
|---|---|
| I. Clean code | Pass. Smaller slot parsing; comments only for the currentScript constraint. |
| II. Layering | Pass. Loader (`index.ts`) reads the tag; Orchestrator decides to serve or not; no layer skipping. |
| III. DI | Pass. Platform id and `warn` are injected; tests use fakes, never the global console. |
| IV. Utility/Client modules | Pass. No change to API Client; the request shape is unchanged. |
| V. Fail-silent | Pass. The missing id logs one warning and degrades to empty slots; no throw. |

Re-check after design: unchanged, all pass.

## Project Structure

### Documentation (this feature)

```text
specs/015-platform-id-on/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── script-tag-platform-id.md
└── tasks.md        # /speckit-tasks
```

### Source Code (repository root)

```text
src/index.ts                         # read data-platform-id off the script tag; pass to orchestrator
src/orchestrator/adOrchestrator.ts   # platformId + warn deps; slots no longer read data-platform-id
tests/unit/orchestrator/*.test.ts    # slot fixtures drop data-platform-id; new missing-id tests
tests/unit/index*.test.ts (if any)   # script-tag read
README.md                            # new: publisher embed guide
specs/001-loader-and-first/contracts/slot-markup-contract.md   # updated in place (the living contract)
```

**Structure Decision**: Existing single-project layout. Older specs, quickstarts and contracts are historical records and are left as written; only the living slot-markup contract is edited (the user asked for it explicitly).
