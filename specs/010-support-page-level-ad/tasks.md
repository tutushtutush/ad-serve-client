# Tasks: Page-level ad category context

**Input**: Design documents from `/specs/010-support-page-level-ad/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/page-context-api.md

**Tests**: Included. The constitution (Principle III) requires unit tests for every Orchestrator change.

**Organization**: Grouped by user story. Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)

## Phase 1: Setup

- [ ] T001 Confirm a clean baseline on branch `010-support-page-level-ad`: run `npm ci`, then `npm run typecheck`, `npm run lint` and `npm test`; all must pass before any change

---

## Phase 2: Foundational (blocks all stories)

- [ ] T002 [P] Create `src/utils/normalizeCategories.ts`: pure function taking `unknown` and returning a list of trimmed, non-empty strings, unique case-insensitively (first casing kept), capped at 10 (data-model.md, research Decision 5); add `tests/unit/utils/normalizeCategories.test.ts` covering non-strings, blanks, duplicates, cap and empty input
- [ ] T003 [P] Add `QueuedCommand` (`[name: string, payload?: unknown]`) and `SetContextPayload` types to `src/types.ts`, and widen `window.adServe.q` in the `declare global` block of `src/index.ts` to accept callbacks or commands, with an optional `setContext?: (payload: unknown) => void`

**Checkpoint**: shared pieces compile; no behavior change yet.

---

## Phase 3: User Story 1 - Declare a page's categories once (P1) 🎯 MVP

**Goal**: every slot without its own category requests with the declared page categories.

**Independent Test**: two untagged slots, declare `["music"]`, both requests carry `category=music`; a queued declaration applies to the first requests.

- [ ] T004 [P] [US1] Create `tests/unit/orchestrator/queuedCommands.test.ts`: `setContext` entry is dispatched with its payload; unknown names, non-array and non-function entries are ignored; a throwing handler does not stop later entries
- [ ] T005 [P] [US1] Create `tests/unit/orchestrator/adOrchestrator.pageContext.test.ts` using the injected fakes from the existing orchestrator tests: untagged slots send the context, several categories are comma-joined, a slot discovered later by `run(root)` uses the current context
- [ ] T006 [P] [US1] Create `src/orchestrator/queuedCommands.ts`: pure function that applies one `["name", payload]` entry to a handlers map, ignoring unknown names and swallowing handler errors (Constitution V)
- [ ] T007 [US1] In `src/orchestrator/adOrchestrator.ts` add the context state and `setContext(payload)` (normalize with T002), and resolve the effective category in one function used where the request is built (the `client.requestAd({ ...slot.config, sessionId })` call): slot category if present, else context joined with `,`; leave `makeGroupKey` unchanged (research Decision 4)
- [ ] T008 [US1] In `src/index.ts`: before `orchestrator.run(document)`, apply every array entry already in `q` through T006; keep function callbacks draining after `run()` as today; extend the `queue.push` override to dispatch array entries; set `adServe.setContext` to the orchestrator's (research Decisions 1-2)

**Checkpoint**: US1 works end to end and is demonstrable on its own.

---

## Phase 4: User Story 2 - Update or clear on navigation (P1)

**Goal**: later requests reflect changed or cleared categories; declarations never trigger requests.

**Independent Test**: declare music, request, declare comedy, request: second carries comedy only; clear: no category.

- [ ] T009 [P] [US2] Extend `tests/unit/orchestrator/adOrchestrator.pageContext.test.ts`: a new declaration replaces (not merges); `{}` and `{categories: []}` clear; a non-object payload or non-array `categories` is ignored and the previous context kept; `setContext` makes no client call and no render; an in-flight request keeps its original category
- [ ] T010 [US2] Implement replace, clear and malformed-ignore in `setContext` in `src/orchestrator/adOrchestrator.ts` per the data-model.md state table
- [ ] T011 [US2] Add a test for the SPA flow (`setContext`, insert a slot, `run(root)`/`refresh`): the new slot uses the new categories and already-filled slots make no new request

**Checkpoint**: US1 and US2 both pass.

---

## Phase 5: User Story 3 - A slot can override the page (P2)

**Goal**: a slot's own `data-category` wins with no merging.

**Independent Test**: page `["music"]`, one slot `sports`: that slot requests sports, an untagged slot requests music.

- [ ] T012 [P] [US3] Extend `tests/unit/orchestrator/adOrchestrator.pageContext.test.ts`: slot category beats context with no merge; a slot-level comma list is still honored; changing the context mid-page does not break redisplay re-resolution (slot identity unchanged, FR-007)
- [ ] T013 [US3] Confirm precedence and key stability in `src/orchestrator/adOrchestrator.ts` (adjust the effective-category function only if T012 exposes a gap)

**Checkpoint**: mixed-topic pages work.

---

## Phase 6: User Story 4 - Works on any site, no framework (P2)

**Goal**: the feature runs on plain HTML with nothing but the loader snippet.

**Independent Test**: quickstart.md section 2 on a plain HTML page.

- [ ] T014 [US4] Manual: `npm run build`, serve a throwaway plain HTML page (not committed) with the loader snippet, two untagged slots and one `data-category="sports"` slot, and run quickstart.md sections 2 and 3, checking requests in the network tab
- [ ] T015 [US4] Grep `src/` to confirm no framework reference was introduced (FR-010)

---

## Phase 7: Polish

- [ ] T016 Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`; all must pass, existing tests unchanged (FR-012)
- [ ] T017 Bump `package.json` version to 1.3.0 (research Decision 8)
- [ ] T018 Open a PR to `main` for review; after merge, the owner tags v1.3.0 (tag pushes fail from the cloud session's git proxy), then bump the pin in ad-serve-api

---

## Dependencies & Order

- T001, then Phase 2 (T002, T003 in parallel), then US1 to US4.
- US1 first (MVP). US2 builds on `setContext` from T007. US3 and US4 need US1 only and can run in parallel with US2 after it.
- Within a story: tests (marked P) first and failing, then implementation. T004, T005 and T006 are parallel; T007 follows T002 and T005; T008 follows T006 and T007.

## Implementation Strategy

MVP is Phase 3 alone (declare once, queued commands applied before the first requests). Ship US1 and US2 together for EventPulse, since single-page navigation needs both. Batching is out of scope (see research.md follow-up).
