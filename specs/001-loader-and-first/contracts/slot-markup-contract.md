# Contract: Publisher Slot Markup

This is the public interface ad-serve-client exposes to publishers — the markup they write and
the loader snippet they paste, per Constitution Principle II's Loader layer.

## Designating a slot

A publisher marks any element as an ad slot with the `data-ad-serve-slot` attribute plus an ad
type. The platform id is not set per slot: it goes once on the loader's `<script>` tag (see
"Loading the script" below, feature 015).

```html
<div
  data-ad-serve-slot
  data-ad-type-id="banner-300x250"
></div>
```

Optional targeting attributes:

```html
<div
  data-ad-serve-slot
  data-ad-type-id="banner-300x250"
  data-country="US"
  data-device-type="desktop"
></div>
```

- `data-ad-serve-slot` marks the element as a slot for discovery; its presence alone (empty
  value) is sufficient.
- `data-ad-type-id` (or `data-ad-types`, feature 011) is required. A slot with neither is treated as
  invalid configuration (FR-005) — it resolves to empty without any network request.
- A `data-platform-id` on a slot is ignored (feature 015): it is not read, not a fallback and does
  not override the script tag's value.
- `data-country` / `data-device-type` are optional and passed through to ad-serve-api unchanged.
- `data-category` (feature 010) is optional: an IAB Content Taxonomy code (e.g. `IAB1-6` for Music)
  describing the page's content. It is sent to ad-serve-api as the `category` query parameter,
  where only campaigns targeting that category (or no category at all) are eligible. Passed
  through unchanged and never validated by the SDK; omitted/empty means no category filtering.

```html
<div
  data-ad-serve-slot
  data-ad-type-id="banner-300x250"
  data-category="IAB1-6"
></div>
```

## Loading the script

Publishers paste the loader snippet once per page, anywhere before or after their slot markup
(slot discovery happens once the bundle loads, not at parse time):

```html
<script>
  window.adServe = window.adServe || { q: [] };
</script>
<script
  async
  src="https://cdn.example.com/ad-serve-client.js"
  data-api-base-url="https://ads.example.com"
  data-platform-id="3fa85f64-5717-4562-b3fc-2c963f66afa6"
></script>
```

- The inline snippet establishes the command queue before the async bundle has necessarily
  loaded. This feature does not yet define any queued commands beyond the implicit "scan the page
  once ready" behavior — an explicit command API is out of scope for this feature (see spec.md
  Assumptions) and may be added by a later feature without changing this contract.
- `data-api-base-url` on the bundle's own `<script>` tag tells the SDK which ad-serve-api instance
  to call. It is read once, synchronously, when the bundle starts executing.
- `data-platform-id` on the same tag is required (feature 015). It is read once, synchronously, at
  load, like `data-api-base-url`, trimmed, and sent unchanged as `platformId` on every request. One
  platform per page. If it is missing, empty or blank, the SDK logs one console warning
  (`[ad-serve] Platform id missing: add data-platform-id="<your platform id>" to the
  ad-serve-client <script> tag. No ads will be served.`) and serves nothing; slots stay empty.
- No publisher-invoked function call is required beyond including both snippets — slot discovery
  and requesting happens automatically per FR-002.

## Guarantees to the publisher

- A slot with valid configuration and an available matching ad will display that ad
  (User Story 1).
- A slot that cannot be filled for any reason is left exactly as an empty element — no error
  text, no broken layout, no thrown exception reaches the page (User Story 2).
- Slots resolve independently; one slot's outcome never depends on another slot's on the same
  page (User Story 3).
