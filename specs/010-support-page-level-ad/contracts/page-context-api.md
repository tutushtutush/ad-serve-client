# Contract: Page context API (publisher-facing)

Framework-agnostic: plain JavaScript and HTML only.

## `setContext`

Declares the categories for the current page.

```js
// Works before or after the bundle loads (standard loader snippet creates window.adServe.q):
window.adServe = window.adServe || { q: [] };
window.adServe.q.push(["setContext", { categories: ["music"] }]);

// After the bundle has loaded, the direct form is equivalent:
window.adServe.setContext({ categories: ["music", "IAB1-6"] });
```

| Payload | Effect |
|---|---|
| `{ categories: ["music", "IAB1-6"] }` | page categories become exactly this list |
| `{}` or `{ categories: [] }` | clears page categories |
| anything else malformed (not an object, `categories` not an array, or a non-empty list with no usable entry) | ignored; previous categories kept; no error thrown |

- Entries are plain words or IAB codes, sent as given (trimmed, case-insensitive duplicates
  removed, at most 10). Unknown words are passed through; ad-serve-api ignores unmapped ones.
- A declaration never triggers an ad request or re-render by itself.
- Queued `setContext` commands apply before the first ad requests of the page.

## Slot-level override

```html
<div data-platform-id="..." data-ad-type-id="..." data-category="sports"></div>
```

A slot with `data-category` uses only that value (comma list allowed, as today); page categories
are not merged in. A slot without it uses the page categories.

## Single-page apps

```js
// On route change:
window.adServe.q.push(["setContext", { categories: [newTopic] }]);  // or {} to clear
window.adServe.refresh(rootElementOfNewContent);                    // fill newly inserted slots
```

Slots already filled keep their ad; only requests made afterwards use the new categories.

## Wire format (unchanged)

`GET /ads?platformId=...&adTypeId=...&category=music,IAB1-6` — categories comma-joined in the
existing `category` parameter.
