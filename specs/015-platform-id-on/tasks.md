# Tasks: Platform id on the loader script tag

**Input**: Design documents in `/specs/015-platform-id-on/` ([plan](plan.md), [spec](spec.md), [research](research.md), [data-model](data-model.md), [contract](contracts/script-tag-platform-id.md), [quickstart](quickstart.md))

**Tests**: Included. The constitution (Principle III) requires unit tests for orchestrator changes.

**Format**: `- [ ] ID [P?] [Story] Description with file path`. `[P]` means a different file with no dependency on an unfinished task.

## Phase 1: Foundational (blocks all stories)

**Purpose**: Make the orchestrator take the platform id as a dependency instead of reading it from slots. Stories 1 to 3 all build on this.

- [X] T001 In `src/orchestrator/adOrchestrator.ts`, add optional `platformId?: string` and `warn?: (message: string) => void` to `AdOrchestratorDeps`. Remove the `data-platform-id` read and the `platformId` requirement from `readSlotDeclaration`/`SlotDeclaration`, and drop it from `makeGroupKey`. Thread the page-level id through `buildSlotConfig`, `groupDiscoveredSlots`, `mapSlotsByGroupPosition` and `parseSlotConfig` (new signature `parseSlotConfig(element, platformId, viewportWidth = 0)`), so every `AdSlotConfig`/`AdDecisionRequest` still carries `platformId` and the wire shape is unchanged.
- [X] T002 Update the existing tests so they compile and pass under the new shape: drop `data-platform-id` from slot fixtures and pass `platformId: "p1"` (or the id each test needs) to `createAdOrchestrator`/`parseSlotConfig` in `tests/unit/orchestrator/adOrchestrator.test.ts`, `adOrchestrator.batch.test.ts`, `adOrchestrator.pageContext.test.ts` and `adOrchestrator.responsive.test.ts`. In the batch test that mixes `p-a`/`p-b` slots (around line 322), replace it with a case that proves one page id is used for every slot, since mixed platforms are out of scope. Run `npm test`.

**Checkpoint**: Orchestrator takes the id as a dependency; all existing behavior green.

## Phase 2: User Story 1 - Set the platform once on the loader tag (P1) 🎯 MVP

**Goal**: A platform id on the script tag serves every slot, which carries only its ad type.

**Independent Test**: Loader tag with an id, slots with only `data-ad-type-id` or `data-ad-types`: requests carry the tag's id.

- [X] T003 [P] [US1] In `src/index.ts`, replace `getApiBaseUrl()` with a single synchronous read of `document.currentScript` returning both `data-api-base-url` and a trimmed `data-platform-id` (empty string when absent or blank). Keep the comment about `currentScript` only being valid at module evaluation. Call it first in `main()` and pass `platformId` and `warn: (message) => console.warn(message)` into `createAdOrchestrator`.
- [X] T004 [P] [US1] Add tests in `tests/unit/orchestrator/adOrchestrator.platformId.test.ts`: single-type slot, `data-ad-types` slot, a batched scan and a later `run()` on a new root all send the orchestrator's `platformId` unchanged on every request, and the request object shape matches today's.

**Checkpoint**: US1 works end to end.

## Phase 3: User Story 2 - A missing platform id is loudly reported (P1)

**Goal**: A missing, empty or blank id logs one warning and serves nothing.

**Independent Test**: Orchestrator built with no, `""` and `"   "` platform id: one warning, no client calls, slots untouched.

- [X] T005 [US2] In `src/orchestrator/adOrchestrator.ts`, at the top of `run()`: when `platformId` is missing or blank (after trim), call `warn` once per orchestrator lifetime with `[ad-serve] Platform id missing: add data-platform-id="<your platform id>" to the ad-serve-client <script> tag. No ads will be served.` and return without discovering or claiming slots. Wrap the `warn` call so a throwing logger cannot escape (Principle V).
- [X] T006 [US2] Add tests to `tests/unit/orchestrator/adOrchestrator.platformId.test.ts`: absent, empty and whitespace-only ids each give exactly one `warn` call naming the platform id and the script tag; zero client requests; many slots and repeated `run()`/refresh calls still warn only once; slot elements are unchanged; a throwing `warn` does not throw out of `run()`.
- [X] T007 [P] [US2] Add a small test for the script-tag read in `tests/unit/index.platformId.test.ts` (or the nearest existing home for `index.ts` tests): extract the read into an exported helper if needed so it can be tested with a fake script element for present, absent, empty and blank attributes, and a null `currentScript`.

**Checkpoint**: A missing id is visible and harmless.

## Phase 4: User Story 3 - The slot-level platform id is gone (P2)

**Goal**: A slot's `data-platform-id` has no effect; docs show only the script-tag form.

**Independent Test**: Slot attribute differs from or replaces the tag value, and requests use only the tag's.

- [X] T008 [US3] Add tests to `tests/unit/orchestrator/adOrchestrator.platformId.test.ts`: slot with `data-platform-id="B"` and orchestrator id `A` sends `A`; slot with `data-platform-id` and no orchestrator id serves nothing and warns; `parseSlotConfig` output has the passed id regardless of the slot attribute.
- [X] T009 [P] [US3] Update `specs/001-loader-and-first/contracts/slot-markup-contract.md` in place: slots without `data-platform-id` in every example, `data-ad-type-id` (or `data-ad-types`) as the only required slot attribute, the loader snippet with `data-platform-id`, the missing-id warning, and a note that a slot-level `data-platform-id` is ignored. Match [contracts/script-tag-platform-id.md](contracts/script-tag-platform-id.md).
- [X] T010 [P] [US3] Create `README.md` at the repo root: what the SDK is, the loader snippet (with `data-api-base-url` and `data-platform-id`), slot markup (`data-ad-type-id`, `data-ad-types`, optional targeting), the missing-id warning, the build/test commands from `package.json`, and a link to the slot-markup contract. Also update `specs/001-loader-and-first/contracts/ad-decision-client-contract.md`'s `platformId` source line ("slot's `data-platform-id`") to "the loader script tag's `data-platform-id`".

**Checkpoint**: One way to set the platform id, in code and docs.

## Phase 5: Polish

- [X] T011 Run `npm run lint`, `npm run typecheck` and `npm test`; fix anything raised. Then confirm with `grep -rn "data-platform-id" src tests` that the only hits are the script-tag read and the tests that prove a slot's attribute is ignored.
- [X] T012 Build with `npm run build`, then walk the manual steps in [quickstart.md](quickstart.md) against the built bundle if an API is available (otherwise check the warning and the request URL only). (Done against the built bundle in jsdom with a stubbed fetch: tag id used over a conflicting slot id; absent and blank ids each gave one warning and no request. No real API was run.)
- [X] T013 Release task: bump the version to `1.8.0` in `package.json` and `package-lock.json` (breaking-in-dev change, as in the previous feature's release commit). Note in the PR that adconfig's snippet follow-up must land only after this is deployed.

## Dependencies

- T001 → T002 → everything else.
- US1 (T003, T004) needs Phase 1. US2 (T005 to T007) needs T001; T005 comes before T006, and T007 needs T003. US3 tests (T008) need T005. T009 and T010 are independent of code once the contract is settled.
- Polish (T011 to T013) last.

## Parallel opportunities

- After T002: T003 and T004 together (different files).
- T007, T009 and T010 can run alongside the story work (different files).

## Implementation strategy

MVP is Phase 1 plus US1 (T001 to T004). US2 must ship with it, since it replaces silent skipping. Do not ship US1 alone. Order: T001, T002, T003, T005, then tests, docs, polish. One PR for the whole feature, opened and reviewed before merge.
