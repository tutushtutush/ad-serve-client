# Implementation Plan: Pass audience labels with each ad request

**Branch**: `021-pass-audience-labels` | **Date**: 2026-10-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-pass-audience-labels/spec.md`

## Summary

Let the host page hand the SDK the current viewer's audience labels and send them with every ad request. A `setAudience` command, shaped like `setViewerId` (a method once the SDK has started, a `["setAudience", labels]` queue entry before, applied before the first requests), replaces or clears a page-level list held in memory. A pure utility cleans the list to ad-serve-api's label form (trim, lowercase, pattern, 1 to 40 characters, de-duplicate, first 20). The orchestrator reads the list when each request is built and adds it to the single request, to the shared fields of a batch, and to the single-request fallback of a failed batch; the API client formats it (`audience` comma-separated in the query, a list in the batch body). With no labels, the requests are exactly what they were. Nothing is stored and nothing is sent on click or viewable-impression reports. README and a contract file document it; the version becomes 1.13.0 and is tagged after merge so ad-serve-api can bump its pin.

## Technical Context

**Language/Version**: TypeScript, bundled with esbuild into one IIFE

**Primary Dependencies**: none at runtime

**Storage**: none (labels are held in memory for the page view)

**Testing**: Jest + jsdom (`tests/unit/**`), ESLint, `tsc`

**Target Platform**: browsers, embedded in third-party pages

**Project Type**: embeddable browser SDK (library)

**Performance Goals**: no change; one small array cleaned per call, a join or a spread per request

**Constraints**: fail-silent (Principle V): a warning is allowed, a throw never reaches the host page; requests without labels stay byte-identical; labels never take part in slot identity, grouping or batching

**Scale/Scope**: one utility, one orchestrator command and field, two client request builders, `index.ts` wiring, types, README, contract and version

## Constitution Check

| Principle | Result |
|---|---|
| I Clean code | Pass. One small utility; comments only for the stale-label rule and why labels are not part of slot identity. |
| II Layering | Pass. `index.ts` wires the command; the orchestrator decides which labels are current; the API client only formats them; the renderer is untouched. |
| III DI | Pass. The orchestrator already takes `warn`; the utility is pure; tests use fakes. |
| IV Utility/Client modules | Pass. Cleaning is a generic helper in `src/utils/`; the client holds no decision about when to send. |
| V Fail-silent | Pass. `setAudience` and the queued form catch everything; a bad value is one warning, never a throw. |

Re-check after design: unchanged, no violations. Complexity Tracking: none.

## Project Structure

### Documentation (this feature)

```text
specs/021-pass-audience-labels/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── audience-embed.md       # how the host page calls it
│   └── audience-requests.md    # how the labels appear on ad requests
└── tasks.md                    # /speckit-tasks
```

### Source Code (repository root)

```text
src/utils/normalizeAudienceLabels.ts      # pure: clean a list to the serving API's label form
src/types.ts                              # audience on AdDecisionRequest and BatchSharedFields
src/client/adDecisionClient.ts            # `audience` in the query (comma-joined) and in the batch body (a list)
src/orchestrator/adOrchestrator.ts        # page labels, setAudience, add to runSlot and runBatch
src/index.ts                              # window.adServe.setAudience, queued command, type
README.md                                 # a section after the frequency-cap one
package.json, package-lock.json           # 1.13.0
tests/unit/utils/normalizeAudienceLabels.test.ts
tests/unit/client/adDecisionClient.test.ts                 # query and body shapes
tests/unit/orchestrator/adOrchestrator.audience.test.ts    # single, batch, fallback, replace, clear, bad input, not in grouping
tests/unit/index.audience.test.ts                          # queued before start, method after start, first request carries it
```

**Structure Decision**: follow spec 017 (the `setViewerId` path through `index.ts`, the orchestrator and the client) and spec 010 (a page-level value read at request time and kept out of slot identity).

## Phases

- **Phase 0** research: [research.md](research.md), with rejected alternatives.
- **Phase 1** design: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- **Release**: version 1.13.0 in the PR, tag `v1.13.0` on the merge commit, then ad-serve-api's pin is bumped (as for specs 019 and 020). Until a platform calls `setAudience`, no request changes.
