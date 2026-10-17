# Implementation Plan: Viewer identifier for frequency caps

**Branch**: `017-viewer-identifier-for` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-viewer-identifier-for/spec.md`

## Summary

Send ad-serve-api's optional `viewerId` with every ad request, under the platform's control. Nothing is sent or stored by default. A platform supplies its own UUID with `adServe.setViewerId(id)` (also queueable as `["setViewerId", id]`, applied before the first requests, exactly like `setContext`), or opts in with `data-viewer-id-storage="local"` on the loader tag so the SDK creates a random UUID once and keeps it in local storage. `setViewerId(null)` withdraws: sending stops and the stored value is removed. The orchestrator owns the state (platform id, withdrawn flag, the stored-id store it was handed) and adds `viewerId` to each single request and to the batch's shared fields; the API client turns it into the `viewerId` query parameter or body field. A small utility module holds the UUID check and the local-storage read, create and remove, shaped like `sessionId.ts`. Everything is fail-silent.

## Technical Context

**Language/Version**: TypeScript, bundled with esbuild into one IIFE

**Primary Dependencies**: none at runtime

**Storage**: the browser's local storage, one key, only on opt-in; nothing otherwise

**Testing**: Jest + jsdom (`tests/unit/**`), ESLint, `tsc`

**Target Platform**: browsers, embedded in third-party pages

**Project Type**: embeddable browser SDK (library)

**Performance Goals**: no change; one attribute read at load and, on opt-in, one storage read at the first request

**Constraints**: fail-silent (Principle V): a warning is allowed, a throw never reaches the host page. `document.currentScript` is only valid synchronously at module evaluation (the attribute is read there). Requests without an identifier stay byte-identical (SC-003).

**Scale/Scope**: one utility, one loader-config field, two client request builders, the orchestrator, `index.ts`, the README and the version

## Constitution Check

| Principle | Result |
|---|---|
| I Clean code | Pass. One small utility; comments only for the consent rationale and the withdrawal rule. |
| II Layering | Pass. Loader (`index.ts`) reads the tag attribute and builds the store; the Orchestrator decides what identifier is current; the API Client only formats it; Renderer untouched; no layer skipped. |
| III DI | Pass. The orchestrator receives a `viewerIdStore` and `warn` as dependencies (no direct `localStorage` use); the utility takes the storage and the UUID generator as parameters; tests use fakes. |
| IV Utility/Client modules | Pass. The UUID shape check and storage access are generic helpers in `src/utils/`; the API Client holds no decision about when to send. |
| V Fail-silent | Pass. Every new entry point (`setViewerId`, queued form, attribute read, storage access) catches and degrades; an invalid value is a warning, never a throw. |

Re-check after design: unchanged. Complexity Tracking: none.

## Project Structure

### Documentation (this feature)

```text
specs/017-viewer-identifier-for/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── viewer-id-embed.md        # the attribute, setViewerId, the queued form, withdrawal (publisher-facing)
│   └── viewer-id-requests.md     # how it appears on GET /ads and POST /ads/batch
└── tasks.md                      # /speckit-tasks
```

### Source Code (repository root)

```text
src/utils/viewerId.ts                       # isViewerId (UUID shape), createViewerIdStore(storage, randomUUID) -> { getOrCreate, remove }
src/utils/readLoaderTagConfig.ts            # + viewerIdStorage: boolean (data-viewer-id-storage="local")
src/types.ts                                # viewerId on AdDecisionRequest and BatchSharedFields
src/client/adDecisionClient.ts              # viewerId query parameter (single) and body field (batch), only when present
src/orchestrator/adOrchestrator.ts          # viewerIdStore dep, setViewerId handler, currentViewerId(), passed on every request
src/index.ts                                # read the attribute, build the store, register setViewerId (command + window.adServe.setViewerId), type declaration
README.md                                   # publisher docs (FR-012)
package.json (and lockfile)                 # version 1.9.0 (FR-013)
tests/unit/utils/viewerId.test.ts
tests/unit/utils/readLoaderTagConfig.test.ts
tests/unit/client/adDecisionClient.test.ts
tests/unit/orchestrator/adOrchestrator.viewerId.test.ts
tests/unit/orchestrator/queuedCommands.test.ts      # only if a case for the new name is useful
```

**Structure Decision**: mirror features 008 (`sessionId.ts`) and 010 (`setContext`, queued command) so a reviewer sees the same shape: a storage utility that takes its collaborators as parameters, state held by the orchestrator, one command registered the same way.

## Phases

- **Phase 0** research: [research.md](research.md), including rejected alternatives.
- **Phase 1** design: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Deploy order**: independent. An ad-serve-api without spec 051 ignores the extra parameter; with it, caps start to apply once a platform opts in and an advertiser sets a cap.
