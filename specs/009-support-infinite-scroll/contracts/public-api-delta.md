# Contract Delta: Public `window.adServe` API

Documents the new surface this SDK exposes to a host page's own scripts (e.g. its infinite-scroll
or pagination code). No ad-serve-api HTTP contract changes — see research.md Decision 5.

## `window.adServe.q` (existing, `loader/snippet.js` — now actually drained)

A host page's own script may push a zero-argument callback onto this array at any time, including
before this SDK's async bundle has finished loading:

```js
window.adServe = window.adServe || { q: [] };
window.adServe.q.push(function () {
  window.adServe.refresh(document.getElementById("newly-loaded-section"));
});
```

| Behavior | Before this feature | After this feature |
|---|---|---|
| Callback pushed before the SDK bundle loads | Queued, never invoked | Queued, then invoked once the bundle finishes starting up |
| Callback pushed after the SDK bundle has already loaded | Queued, never invoked | Invoked immediately (queue draining has already redefined `push`) |
| A callback that throws | N/A (never invoked) | Caught; does not prevent other queued/future callbacks from running (FR-009) |

## `window.adServe.refresh(root?)` (NEW)

| Param | Required | Behavior |
|---|---|---|
| `root` | no | A DOM node to scan for new `[data-ad-serve-slot]` elements. Defaults to `document` (the whole page) when omitted. |

- Discovers and fills every validly-configured ad slot under `root` that this SDK has not already
  discovered — via this call, an earlier `refresh` call, or the page's initial load — following the
  exact same fill/render/track behavior as initial-load slots (FR-005).
- An already-discovered slot found again under `root` (e.g. because `root` overlaps previously
  scanned content) is silently skipped — no request, no re-render (FR-003).
- Returns nothing (`void`). Never throws — any internal failure degrades to the affected slot(s)
  simply staying unfilled (FR-009).
- May be called any number of times over one page view (FR-002/FR-007); each call's slots are
  filled independently of every other call's and of the page's initial-load slots (FR-006/FR-007).

## What never happens

- A `refresh()` call, or a queued callback that invokes one, ever throwing or otherwise reaching the
  host page's own script execution (Constitution Principle V).
- A slot already claimed by an earlier `run()`/`refresh()` call being requested or rendered again,
  regardless of how much a later call's `root` overlaps previously-scanned content (FR-003).
- A readiness signal sent via `window.adServe.q.push(...)` before the SDK is ready being silently
  dropped (FR-004).
- `refresh()` changing anything about how an *already-filled* slot elsewhere on the page behaves
  (SC-005).
