# Quickstart: validating page-level category context

Prerequisites: `npm ci`. Run checks with `npm run typecheck && npm run lint && npm test`.
Contract details: [contracts/page-context-api.md](contracts/page-context-api.md).

## 1. Automated

`npm test` must pass, including the new orchestrator, queued-commands and normalizer tests.

## 2. Manual, plain HTML page (User Stories 1, 3, 4)

1. `npm run build`, then serve a plain HTML page containing the loader snippet, two untagged slots
   and one slot with `data-category="sports"`.
2. Before the bundle loads, push `["setContext", {categories: ["music"]}]`.
3. In the browser network tab, confirm the two untagged slots request `category=music` and the
   tagged slot requests `category=sports`, with no extra requests from the declaration itself.

## 3. SPA refresh (User Story 2)

1. From the console: `adServe.setContext({categories: ["comedy"]})`, then insert a new slot and call
   `adServe.refresh(container)`.
2. Confirm the new slot requests `category=comedy` and already-filled slots made no new request.
3. `adServe.setContext({})`, insert another slot, refresh: the request has no `category`.
4. `adServe.setContext("oops")`: no console error; the next request still uses the previous value.

## 4. Regression

A page that never calls `setContext` behaves exactly as v1.2.0 (existing tests unchanged).
