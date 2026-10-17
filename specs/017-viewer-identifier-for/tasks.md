# Tasks: Viewer identifier for frequency caps

**Input**: Design documents in `/specs/017-viewer-identifier-for/` ([plan](plan.md), [spec](spec.md), [research](research.md), [data-model](data-model.md), [embed contract](contracts/viewer-id-embed.md), [request contract](contracts/viewer-id-requests.md), [quickstart](quickstart.md))

**Tests**: Included. The constitution (Principle III) requires unit tests for orchestrator and API Client changes. Mirror features 008 (`src/utils/sessionId.ts`, `tests/unit/utils/sessionId.test.ts`) and 010 (`setContext`, `tests/unit/orchestrator/adOrchestrator.pageContext.test.ts`). Merge only when the owner says "merge".

**Format**: `- [ ] ID [P?] [Story] Description with file path`. `[P]` means a different file with no dependency on an unfinished task.

## Phase 1: Setup

- [X] T001 Confirm the branch `017-viewer-identifier-for` is up to date with `main` (`git fetch origin main`, rebase if behind). No dependency changes are needed.

## Phase 2: Foundational (blocks all stories)

- [X] T002 [P] Create `src/utils/viewerId.ts` per [data-model.md](data-model.md): `isViewerId(value: unknown): value is string` (the UUID shape in either case, strings only), `VIEWER_ID_STORAGE_KEY = "adServeViewerId"`, the `ViewerIdStorageLike` interface (`getItem`, `setItem`, `removeItem`), and `createViewerIdStore(storage: ViewerIdStorageLike | undefined, randomUUIDImpl: (() => string) | undefined): { getOrCreate(): string | undefined; remove(): void }`. `getOrCreate` reads the stored value, returns it when it is a valid UUID, otherwise creates one (when a generator exists), stores it and returns it; every step is inside one try/catch and any failure, an absent storage or an absent generator gives `undefined`. A stored value that is not a UUID is replaced. `remove` removes the key and never throws. Shape it like `src/utils/sessionId.ts`, with a comment only for why a created-but-unpersisted id is never returned.
- [X] T003 [P] Create `tests/unit/utils/viewerId.test.ts` in the style of `sessionId.test.ts`: `isViewerId` accepts lower and upper case UUIDs and refuses other strings, empty, numbers, null, undefined, objects, arrays; `getOrCreate` creates and stores when empty, reads back an existing valid value without regenerating or writing, replaces an invalid stored value, returns undefined with no storage, with no generator, when `getItem` throws, when `setItem` throws (and returns no unpersisted id), and when a generator throws; `remove` removes the key and swallows a throwing `removeItem`.
- [X] T004 [P] Extend `src/utils/readLoaderTagConfig.ts` with `viewerIdStorage: boolean`, true only when `data-viewer-id-storage` equals `local` (compared exactly after trimming; any other value or no attribute is false). Extend `tests/unit/utils/readLoaderTagConfig.test.ts`, first updating its two existing `toEqual` expectations (the two-field read and the null-script case) to include `viewerIdStorage: false`, then adding: `local` is true, ` local ` is true, `LOCAL`, `session`, `true`, empty and absent are false, null script element is false, and the two existing fields keep their values.
- [X] T005 [P] Add `viewerId?: string` to `AdDecisionRequest` and `BatchSharedFields` in `src/types.ts`, with a comment that it is the opaque identifier for ad-serve-api's frequency caps, supplied through the orchestrator and absent unless the platform allowed one.
- [X] T006 Extend `src/client/adDecisionClient.ts`: `buildQueryString` appends `viewerId` after `sessionId` only when present; `requestAdBatch` adds `viewerId` to the body with the shared fields (after `sessionId`, before `dedupe`) only when present. Extend `tests/unit/client/adDecisionClient.test.ts`: with an identifier the single URL carries `viewerId=<uuid>` and the batch body carries it once; without one both are exactly as before (assert the full URL and the full body, so any drift fails); a batch that returns null still leaves the single-request path able to send it.

**Checkpoint**: the utility, the loader attribute, the types and the request formatting exist; nothing is wired yet.

## Phase 3: User Story 1 - The platform supplies its own viewer identifier (P1)

**Goal**: `setViewerId(uuid)` makes every later ad request carry the identifier.
**Independent Test**: [quickstart.md](quickstart.md) steps 3 to 5.

- [X] T007 [US1] In `src/orchestrator/adOrchestrator.ts` add the state from [data-model.md](data-model.md) (`platformViewerId`, `viewerIdWithdrawn`, and the cached stored identifier), an optional dependency `viewerIdStore?: ViewerIdStoreLike` (type exported from `src/utils/viewerId.ts`), a function `currentViewerId()` (platform's, else undefined when withdrawn or no store, else the cached or lazily resolved stored one, resolving at most once per page and caching a failure), and a `setViewerId(value: unknown)` handler: a valid UUID sets `platformViewerId`; anything else that is not `null` or `""` calls `warn` once with a message naming the UUID requirement and changes nothing; the withdrawal case is added in T016. Pass `viewerId: currentViewerId()` in `runSlot`'s `client.requestAd` call and in `runBatch`'s shared fields, omitting the key when undefined so request objects without an identifier are unchanged. Return `setViewerId` from the orchestrator beside `run` and `setContext`. Every path is wrapped so nothing reaches the host page.
- [X] T008 [US1] In `src/index.ts` register the handler: add `setViewerId: orchestrator.setViewerId` to `commandHandlers` (so a queued `["setViewerId", value]` is applied before `orchestrator.run`), set `adServe.setViewerId = (value) => applyQueuedCommand(["setViewerId", value], commandHandlers)` beside `setContext`, and add `setViewerId?: (value: unknown) => void` to the `Window.adServe` declaration with a comment pointing at feature 017. Inject `warn` as it already is.
- [X] T009 [US1] Create `tests/unit/orchestrator/adOrchestrator.viewerId.test.ts` in the style of `adOrchestrator.pageContext.test.ts` (fake client and renderer, flush helper): with `setViewerId(uuid)` a single slot's `requestAd` receives `viewerId`; two slots served by a batch receive it once in the shared fields; a later call replaces the earlier one for later requests while earlier requests are untouched; a call made after the first requests applies to a refresh run; a slot whose batch fails and falls back to single requests carries it; an invalid value (a non-UUID string, a number, an object, an array, an extra argument) calls the injected `warn` once, changes nothing and never throws; without any call no request contains a `viewerId` key at all.
- [X] T010 [US1] Extend `tests/unit/orchestrator/queuedCommands.test.ts` (or add a case to the new orchestrator test) so a queued `["setViewerId", uuid]` applied through `applyQueuedCommand` before `run` reaches the first request, an unknown command name stays ignored, and a handler that throws is swallowed.

**Checkpoint**: US1 works end to end with a platform-supplied identifier.

## Phase 4: User Story 4 - Without opt-in, nothing changes (P1)

**Goal**: no identifier is created, stored or sent unless the platform asks.
**Independent Test**: [quickstart.md](quickstart.md) step 2 and the unchanged existing suite.

- [X] T011 [US4] Add to `tests/unit/orchestrator/adOrchestrator.viewerId.test.ts`: with no `viewerIdStore` and no call, no request object (single or batch) has a `viewerId` property, and the fake store's methods are never called; with a `viewerIdStore` supplied but never opted into by anything else, it is only consulted when a request is built. Create `tests/unit/index.viewerId.test.ts` with the loading helper described in T015 (this task creates the file and the helper; T015 extends the file), and add a test with a jsdom page that has the loader tag and no attribute: no `localStorage` write happens during load and `window.adServe.setViewerId` exists.
- [X] T012 [US4] Run the whole existing suite (`npm test`) with no edits to existing expectations except fixtures; list any test that needed more than a fixture field. Confirm `sessionId`, click and viewable-impression behaviour are unchanged by their existing tests passing.

## Phase 5: User Story 2 - The SDK keeps its own random identifier on opt-in (P2)

**Goal**: with `data-viewer-id-storage="local"` the SDK creates, keeps and sends one UUID.
**Independent Test**: [quickstart.md](quickstart.md) steps 6, 7 and 9.

- [X] T013 [US2] In `src/index.ts` read `viewerIdStorage` from the loader tag config (synchronously, with `platformId`), and when true build `createViewerIdStore(getLocalStorageSafely(), randomUUID)` and pass it to the orchestrator as `viewerIdStore`; add `getLocalStorageSafely()` next to `getSessionStorageSafely()` (a bare `window.localStorage` read can throw, so it is guarded on its own, with the same comment's reasoning). When the attribute is absent, pass nothing.
- [X] T014 [US2] Extend `tests/unit/orchestrator/adOrchestrator.viewerId.test.ts` with a fake store: the first request resolves it once (`getOrCreate` called once however many requests follow) and sends the value; a platform identifier takes precedence and the store is not consulted for the request that uses it; a store that returns undefined sends no identifier and warns nothing; a store whose `getOrCreate` throws is swallowed; a page with no slots never calls it.
- [X] T015 [US2] Extend `tests/unit/index.viewerId.test.ts` (created in T011; no test imported `src/index.ts` before, because `main()` runs on import and reads `document.currentScript`). Its helper loads the module the way a browser would: create a `<script data-api-base-url=... data-platform-id=...>` element (with `data-viewer-id-storage="local"` where needed), define it as `document.currentScript` with `Object.defineProperty(document, "currentScript", { value, configurable: true })`, make sure `document.readyState` is not `loading`, stub `window.fetch`, then `jest.isolateModules(() => require("../../src/index"))` and flush; reset `window.adServe`, storage and the property in `afterEach`. Use it to test the real storage path: with the attribute, one UUID is written under `adServeViewerId`, a second load reads the same value, and two loads in "tabs" (the same `localStorage`) send the same value; with `localStorage` access throwing, ads still request and no identifier is sent.

## Phase 6: User Story 3 - The platform can withdraw the identifier (P2)

**Goal**: one call stops sending and removes what was stored.
**Independent Test**: [quickstart.md](quickstart.md) step 8.

- [X] T016 [US3] Complete `setViewerId` in `src/orchestrator/adOrchestrator.ts`: `null` or `""` clears `platformViewerId`, sets `viewerIdWithdrawn`, clears the cached stored identifier, and calls `viewerIdStore?.remove()` inside a try/catch; a later valid `setViewerId` works again; the opt-in does not create a new identifier while withdrawn.
- [X] T017 [US3] Extend `tests/unit/orchestrator/adOrchestrator.viewerId.test.ts`: after withdrawal later requests carry no identifier (platform's and stored); the store's `remove` was called; with the store present a following request does not call `getOrCreate`; a valid `setViewerId` after a withdrawal is sent again; a queued `["setViewerId", null]` applied before `run` behaves as a withdrawal (nothing sent, `remove` called); `remove` throwing is swallowed.

## Phase 7: Polish and cross-cutting

- [X] T018 [P] Document in `README.md` per FR-012 and [contracts/viewer-id-embed.md](contracts/viewer-id-embed.md): the opt-in attribute, `setViewerId` and its queued form, the UUID requirement, withdrawal, that the platform decides when an identifier may be created or sent and must have any consent it needs, that the SDK reads no cookies or consent signals, that `window.adServe.setViewerId` exists only once the SDK has started, so before then the call must go through the queue (`window.adServe.q.push(["setViewerId", id])`), that the identifier goes on ad requests only, and that ad-serve-api caps only requests that carry one. Keep it to the one screen SC-006 asks for, and link the contract.
- [X] T019 [P] Raise the version to `1.9.0` in `package.json` and the lockfile's root entry (FR-013), and, since no build test exists and `dist` is not tracked, check in T020 that `npm run build` produces `dist/ad-serve-client.js` and that `grep -c setViewerId dist/ad-serve-client.js` finds the entry (esbuild keeps property names).
- [X] T020 Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`; fix failures. Walk through [quickstart.md](quickstart.md) steps 2 to 9 in a browser against the built bundle (Playwright/Chromium is available on this machine) and record the result in the PR description; step 10 needs adconfig and ad-serve-api on the test environment.
- [X] T021 Update `research.md` "Rejected or reversed approaches" with anything started and then abandoned (leave "None" if nothing was), add an `Implementation notes` section for anything found while building, and record the deferred items in `research.md`: sending the identifier on other endpoints, a consent-framework integration, other storage kinds for the attribute (for example `session`), and converting arbitrary platform identifiers to UUIDs.

## Dependencies and execution order

- Phase 2 first: T002 to T005 are independent of each other; T006 needs T005.
- US1 (T007 to T010) needs Phase 2; T007 before T008 and T009; T010 any time after T008.
- US4 (T011, T012) needs T007 and T008; T011 creates the `index` test file and loading helper that T015 extends.
- US2 (T013 to T015) needs T002, T004 and T007; T014 and T015 after T013.
- US3 (T016, T017) needs T007; T016 can be written with T007 since both edit the same function, then tested in T017.
- Polish last; T018 and T019 are independent of each other.

## Parallel examples

- Phase 2: T002/T003, T004 and T005 in parallel.
- After T007: T009 (tests) can be written while T008 (wiring) is done by someone else, since they touch different files.
- T018 and T019 in parallel at the end.

## Implementation strategy

MVP is Phase 2 plus US1 plus US4 (a platform that supplies an identifier gets caps, and platforms that do nothing are unchanged). US2 adds the opt-in storage and US3 the withdrawal; ship US3 together with US2, since an opt-in without a way to take it back is not usable under consent rules. ad-serve-api and adconfig are already deployed; no cap is enforced for a page until it sends an identifier and an advertiser has set a cap.

## Phase 8: Convergence

- [X] T022 Make `window.adServe.setViewerId` treat a call with more than one argument as an invalid value (a console warning through the same message, nothing changed, nothing thrown), as the spec's edge case says, by taking the arguments as a rest list in `src/index.ts` and passing the original single value on only when exactly one was given; add a case to `tests/unit/index.viewerId.test.ts` for `setViewerId(uuid, "extra")` and one for `setViewerId()` with no argument per spec.md edge cases (partial)
