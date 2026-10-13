# Research: Platform id on the loader script tag

## 1. Where the id is read

**Decision**: `index.ts` reads `data-platform-id` from `document.currentScript` in the same synchronous helper style as `getApiBaseUrl()`, at module evaluation, before any `await` or `runWhenPageReady`.
**Rationale**: `currentScript` is null once the script yields. Reading both attributes from one captured script element avoids two reads of a fragile global.
**Alternatives**: Query `script[src*=...]` later (fragile, breaks with renamed bundles); a new `window.adServe` setting (a second configuration channel the user ruled out).

## 2. Attribute name

**Decision**: `data-platform-id`, same name as the old slot attribute.
**Rationale**: Matches the `data-api-base-url` convention and the request's `platformId`. Because the slot attribute is removed and ignored, reuse cannot cause a conflict; the old slot value is simply never read.
**Alternatives**: `data-ad-serve-platform-id` (longer, no gain).

## 3. Who owns the "serve nothing" decision

**Decision**: The orchestrator takes `platformId` (the raw tag value; the orchestrator trims it once, empty or blank means missing) and `warn` as dependencies. If `platformId` is empty, `run()` logs once per orchestrator lifetime and returns without discovering slots. `index.ts` still sets up `window.adServe` and the queue, so queued callbacks and `refresh`/`setContext` keep working harmlessly.
**Rationale**: Keeps the rule unit-testable with a fake `warn` (Principle III) and covers initial scans and later `refresh()` calls with one guard. Warning once satisfies FR-006.
**Alternatives**: Skip building the orchestrator when the id is missing (leaves `refresh` undefined, so host code calling `adServe.refresh` throws; riskier for Principle V); warn in `index.ts` only (the orchestrator would still need its own guard).

## 4. Trim, but don't validate

**Decision**: Surrounding whitespace is trimmed; a blank result counts as missing. Otherwise the value is sent unchanged and never validated (the server decides).
**Rationale**: Spec edge case; catches copy-paste whitespace without second-guessing ids.

## 5. Warning text

**Decision**: One line, prefixed `[ad-serve]`: `Platform id missing: add data-platform-id="<your platform id>" to the ad-serve-client <script> tag. No ads will be served.` Logged through `console.warn`.
**Rationale**: Names the problem, the tag and the attribute (FR-005).

## 6. Slot identity

**Decision**: Remove the platform id from the slot group key; it is constant for a page.
**Rationale**: It no longer varies per slot; the key only distinguishes slot configurations.

## 7. README

**Decision**: The repo has none. Add a short `README.md` covering the embed (loader snippet with `data-api-base-url` and `data-platform-id`, slot markup, the missing-id warning), and link to the slot-markup contract. Existing quickstarts in older specs stay unchanged.
**Alternatives**: Only edit the contract (leaves "update the README" unmet).
