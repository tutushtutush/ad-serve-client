# Tasks: Pass audience labels with each ad request

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/audience-embed.md](contracts/audience-embed.md), [contracts/audience-requests.md](contracts/audience-requests.md), [quickstart.md](quickstart.md). Merge only when the owner says "merge".

**Tests**: included (Constitution III). The receiving end is ad-serve-api spec 061 (merged); this SDK has no deploy order of its own, and nothing changes for a page that never calls `setAudience`.

Format: `- [ ] [ID] [P?] [Story] Description with file path`. `[P]` = different files, no dependency on an incomplete task.

## Phase 1: Setup

- [ ] T001 Confirm the branch `021-pass-audience-labels` is up to date with `main` (`git fetch origin main`, rebase if behind) and read how `setViewerId` is wired (`src/index.ts`, `src/orchestrator/adOrchestrator.ts`, `tests/unit/index.viewerId.test.ts`, `tests/unit/orchestrator/adOrchestrator.viewerId.test.ts`) before writing code.

## Phase 2: Foundational (blocks all stories)

- [ ] T002 [P] Create `src/utils/normalizeAudienceLabels.ts`, pure and generic (no knowledge of the SDK): constants `MAX_AUDIENCE_LABELS = 20`, `MAX_AUDIENCE_LABEL_LENGTH = 40`; `normalizeAudienceLabels(value: unknown): string[]` returning the cleaned list of the string entries of an array (trim, lowercase, keep entries matching `^[a-z0-9][a-z0-9_:.-]*$` of 1 to 40 characters, remove repeats keeping the first, then keep the first 20; invalid and repeated entries are removed before the cap, per [research.md](research.md) D3); `[]` for anything that is not an array. Model the shape on `src/utils/normalizeCategories.ts`.
- [ ] T003 [P] Create `tests/unit/utils/normalizeAudienceLabels.test.ts`: trims and lowercases; drops non-strings, blanks, entries with spaces or symbols, a leading `-` or `_`, over 40 characters (and keeps exactly 40); repeats after normalizing count once, first kept; invalid and repeated entries never use up a slot; exactly 20 kept, 25 gives the first 20; non-arrays give `[]`.
- [ ] T004 Add `audience?: string[]` to `AdDecisionRequest` and `BatchSharedFields` in `src/types.ts`, with a comment that it is page-level and present only when labels are set. `AdSlotConfig` is unchanged.
- [ ] T005 Extend `src/client/adDecisionClient.ts` per [contracts/audience-requests.md](contracts/audience-requests.md): in `buildQueryString` add `audience` (labels joined with commas) after `viewerId`, only when the list is non-empty; in `requestAdBatch` add `...(shared.audience && shared.audience.length > 0 && { audience: shared.audience })` with the other shared fields, before `dedupe`. Extend `tests/unit/client/adDecisionClient.test.ts`: the single query has `audience=a,b` after the existing parameters; the batch body has the list once; with none (absent or `[]`) the query string and body are exactly what they were (compare against the pre-change expectations already in the file); the per-placement entries carry no `audience`.

**Checkpoint**: the cleaner and the request formatting exist; nothing sets labels yet.

## Phase 3: User Story 1 - The host page tells the SDK the viewer's labels (Priority: P1)

**Goal**: labels set through the orchestrator reach single requests, batches and batch fallbacks.
**Independent Test**: set labels, run two slots with and without a batch client; every request carries them; without a call none does.

- [ ] T006 [US1] In `src/orchestrator/adOrchestrator.ts` add `let pageAudience: string[] = []` beside `pageCategories`, an `audienceField(): { audience?: string[] }` helper that returns `{}` when the list is empty (so a request without labels is the object it always was), and use it in `runSlot` (next to `...viewerIdField()`) and in `runBatch` (in the shared fields next to `...viewerIdField()`). Read at request time; do not touch `SlotDeclaration`, `makeGroupKey` or `groupDiscoveredSlots` ([research.md](research.md) D4). Export `setAudience` from the returned object after T008 defines it.
- [ ] T007 [US1] Create `tests/unit/orchestrator/adOrchestrator.audience.test.ts`, modelled on `adOrchestrator.viewerId.test.ts` (same `setup` and `slot` helpers): a single slot request carries the labels; a batch of two slots carries them once in the shared fields and the per-slot requests carry none of their own; a batch the client refuses (`null`) sends each fallback single request with the labels; with the batch client absent each slot's single request carries them; with no call, `requestAd` and `requestAdBatch` receive objects with no `audience` key at all; a call after the first run applies to a `run` of newly added slots and leaves the earlier requests as they were; slots that differ in country, device or category still batch exactly as without labels (the group key is unchanged).

## Phase 4: User Story 2 - Labels queued before the SDK has loaded apply to the first requests (Priority: P1)

**Goal**: `["setAudience", labels]` on `window.adServe.q` takes effect before the first requests, and the method exists once started.
**Independent Test**: queue the command, load the SDK, and see the first request carry the label.

- [ ] T008 [US2] Add `setAudience(value: unknown): void` to `src/orchestrator/adOrchestrator.ts` per [contracts/audience-embed.md](contracts/audience-embed.md): wrapped in try/catch (Principle V); `null` or an empty array clears; an array with at least one usable entry replaces (via `normalizeAudienceLabels`); an array with entries but none usable, and any other value, change nothing and call `warn` once with a message starting `[ad-serve] setAudience ignored:` that says what was expected. Return it from `createAdOrchestrator` with `setContext` and `setViewerId`.
- [ ] T009 [US2] In `src/index.ts` add `setAudience?: (...args: unknown[]) => void` to the `adServe` type, add `setAudience: orchestrator.setAudience` to `commandHandlers` (so queued entries are applied ahead of `run`), and define `adServe.setAudience = (...args) => applyQueuedCommand(["setAudience", args.length === 1 ? args[0] : MALFORMED_AUDIENCE_CALL], commandHandlers)` with a `MALFORMED_AUDIENCE_CALL` symbol next to the viewer-id one (it is neither an array nor null, so the orchestrator refuses it with the warning). Do not change the existing commands.
- [ ] T010 [US2] Create `tests/unit/index.audience.test.ts` in the style of `index.viewerId.test.ts` (fresh module per test, stubbed `fetch`): a queued `["setAudience", ["follows-team-x"]]` is on the very first request (single, and batch for two slots); the last of several queued entries wins; `window.adServe.setAudience([...])` exists after start and applies to later requests; `window.adServe.setAudience()` and `setAudience(["a"], ["b"])` warn and change nothing; a page that never calls it sends requests with no `audience` (query and body).

## Phase 5: User Story 3 - The labels can be changed or withdrawn (Priority: P1)

**Goal**: replace, clear and refuse behave as the contract says.
**Independent Test**: set, replace, clear and send bad values; each request shows the state.

- [ ] T011 [US3] Extend `tests/unit/orchestrator/adOrchestrator.audience.test.ts`: a second valid list replaces the first (not merged); `null` and `[]` clear; clearing then setting works; a string, a number, an object, `undefined` and a Symbol change nothing and warn once each; an array of only invalid entries changes nothing and warns once, while an empty array clears without a warning; a `warn` that throws, or no `warn`, never lets an error out of `setAudience` (Principle V).

## Phase 6: User Story 4 - A bad label list can never break the page or the request (Priority: P2)

**Goal**: cleaning and failure handling are as specified.
**Independent Test**: odd input cleans to the expected request and no error escapes.

- [ ] T012 [US4] Extend `tests/unit/orchestrator/adOrchestrator.audience.test.ts`: `[" Follows-Team-X ", "AGE-25-34"]` is sent as `follows-team-x`, `age-25-34`; invalid entries among valid ones are dropped and the rest sent; repeats once; 25 valid labels send the first 20; a label list given by reference and mutated afterwards does not change what is sent (the orchestrator keeps its own copy).
- [ ] T013 [P] [US4] Add to `tests/unit/index.audience.test.ts` a storage and report check ([research.md](research.md) D6, SC-005): after a run with labels set, `localStorage`, `sessionStorage` and `document.cookie` hold no label, the click URL in the rendered markup and the viewable-impression report (`tests/unit/client/viewableImpressionClient.test.ts` shape) carry none, and the page markup does not contain the label. Use a filled ad fixture from `tests/unit/fixtures/adCreative.ts`.

## Phase 7: Polish & cross-cutting

- [ ] T014 Add a README section after "Capping how often one viewer sees a campaign" (FR-011): what `setAudience` is for, the call and the queued form, when to call it (every page view, before or after load, and on sign-in, sign-out or consent withdrawal), what is cleaned, that nothing is stored or sent on reports, the single-request query-string exposure, that labels must not identify a person, that the platform is responsible for consent, and a link to [contracts/audience-embed.md](contracts/audience-embed.md) and [contracts/audience-requests.md](contracts/audience-requests.md).
- [ ] T015 Run the quickstart ([quickstart.md](quickstart.md)) steps 1 to 8 in a real browser against a built bundle (`npm run build`, then a local page with the bundle and a stub or the local ad-serve-api used for spec 061); record each outcome in [research.md](research.md). Step 9 is the test-environment check.
- [ ] T016 Raise `package.json` and `package-lock.json` to `1.13.0` (both places in the lock); run `npx tsc --noEmit`, `npx eslint .`, `npx jest` and `npm run build`; open the pull request, noting in the description that nothing changes for a page that never calls `setAudience`. Do not merge until the owner says "merge".
- [ ] T017 After merge (owner's word): tag `v1.13.0` on the merge commit and push the tag; then ad-serve-api bumps its pin in its own change and the test environment check (quickstart step 9) is run. Record the release in [research.md](research.md).

## Dependencies

- T002 before T006 and T008; T004 before T005 and T006; T006 and T008 are one orchestrator change (T006 needs `setAudience` to export), so do them together.
- T009 needs T008. T010 needs T009. T011 and T012 need T008. T013 needs T009.
- Parallel: T002 with T003 and T004; T014 with T015.

## Implementation strategy

MVP is Phases 2 to 4: the cleaner, the request formatting, the orchestrator command and the page wiring; that makes labelled campaigns reachable. Phases 5 and 6 pin replace, clear, refusal and cleaning; Phase 7 documents, verifies and releases. A page that never calls `setAudience` is unaffected at every step.
