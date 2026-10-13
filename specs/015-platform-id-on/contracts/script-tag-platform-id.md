# Contract: Platform id on the loader script tag

Replaces the slot-level `data-platform-id` in `specs/001-loader-and-first/contracts/slot-markup-contract.md` (which is updated in place to match).

## Loader tag

```html
<script
  async
  src="https://cdn.example.com/ad-serve-client.js"
  data-api-base-url="https://ads.example.com"
  data-platform-id="3fa85f64-5717-4562-b3fc-2c963f66afa6"
></script>
```

- `data-platform-id` is required, on the bundle's own `<script>` tag, read once and synchronously at load (like `data-api-base-url`). One platform per page.
- Surrounding whitespace is trimmed. A missing, empty or blank value means "no platform id".

## Slots

```html
<div data-ad-serve-slot data-ad-type-id="banner-300x250"></div>
<div data-ad-serve-slot data-ad-types="0:mobile-banner,768:banner-300x250"></div>
```

Slots carry only `data-ad-type-id` or `data-ad-types`, plus the optional targeting attributes. A `data-platform-id` on a slot is ignored entirely: no fallback, no override.

## Missing platform id

Console warning, once per page load:

`[ad-serve] Platform id missing: add data-platform-id="<your platform id>" to the ad-serve-client <script> tag. No ads will be served.`

No ad requests are made, slots stay empty elements, and nothing is thrown.

## Wire

Unchanged: `platformId` is sent on every decision and batch request, and in tracking URLs, as today.

## Deploy order

This SDK ships first. adconfig's embed snippet and copy UI (follow-up spec in adconfig) must not emit the script-tag form until this is deployed.
