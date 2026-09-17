# Contract: Publisher Slot Markup

This is the public interface ad-serve-client exposes to publishers — the markup they write and
the loader snippet they paste, per Constitution Principle II's Loader layer.

## Designating a slot

A publisher marks any element as an ad slot with the `data-ad-serve-slot` attribute plus the
required targeting `data-*` attributes (data-model.md's `AdSlotConfig`):

```html
<div
  data-ad-serve-slot
  data-platform-id="3fa85f64-5717-4562-b3fc-2c963f66afa6"
  data-ad-type-id="banner-300x250"
></div>
```

Optional targeting attributes:

```html
<div
  data-ad-serve-slot
  data-platform-id="3fa85f64-5717-4562-b3fc-2c963f66afa6"
  data-ad-type-id="banner-300x250"
  data-country="US"
  data-device-type="desktop"
></div>
```

- `data-ad-serve-slot` marks the element as a slot for discovery; its presence alone (empty
  value) is sufficient.
- `data-platform-id` and `data-ad-type-id` are required. A slot missing either is treated as
  invalid configuration (FR-005) — it resolves to empty without any network request.
- `data-country` / `data-device-type` are optional and passed through to ad-serve-api unchanged.

## Loading the script

Publishers paste the loader snippet once per page, anywhere before or after their slot markup
(slot discovery happens once the bundle loads, not at parse time):

```html
<script>
  window.adServe = window.adServe || { q: [] };
</script>
<script async src="https://cdn.example.com/ad-serve-client.js"></script>
```

- The inline snippet establishes the command queue before the async bundle has necessarily
  loaded. This feature does not yet define any queued commands beyond the implicit "scan the page
  once ready" behavior — an explicit command API is out of scope for this feature (see spec.md
  Assumptions) and may be added by a later feature without changing this contract.
- No publisher-invoked function call is required beyond including both snippets — slot discovery
  and requesting happens automatically per FR-002.

## Guarantees to the publisher

- A slot with valid configuration and an available matching ad will display that ad
  (User Story 1).
- A slot that cannot be filled for any reason is left exactly as an empty element — no error
  text, no broken layout, no thrown exception reaches the page (User Story 2).
- Slots resolve independently; one slot's outcome never depends on another slot's on the same
  page (User Story 3).
