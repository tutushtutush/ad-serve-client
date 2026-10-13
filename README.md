# ad-serve-client

Browser embed SDK: finds ad slots on a publisher's page, requests ads from ad-serve-api and renders them in sandboxed iframes. It never throws into the host page; a slot that cannot be filled stays an empty element.

## Embedding

Paste the loader once per page:

```html
<script>
  window.adServe = window.adServe || { q: [] };
</script>
<script
  async
  src="https://cdn.example.com/ad-serve-client.js"
  data-api-base-url="https://ads.example.com"
  data-platform-id="YOUR_PLATFORM_ID"
></script>
```

- `data-api-base-url`: the ad-serve-api instance to call.
- `data-platform-id` (required): your platform id. Set it once, here, on the loader's own `<script>` tag; one platform per page. Both attributes are read once when the script loads.

If `data-platform-id` is missing, empty or blank, the loader logs this console warning once and serves nothing:

```
[ad-serve] Platform id missing: add data-platform-id="<your platform id>" to the ad-serve-client <script> tag. No ads will be served.
```

## Slots

Mark any element as a slot and give it an ad type. Slots carry no platform id; a `data-platform-id` on a slot is ignored.

```html
<div data-ad-serve-slot data-ad-type-id="banner-300x250"></div>

<!-- responsive: the entry with the largest min width that fits the window wins -->
<div data-ad-serve-slot data-ad-types="0:mobile-banner,768:banner-300x250"></div>
```

Optional targeting attributes: `data-country`, `data-device-type`, `data-category`. The full contract is in [slot-markup-contract.md](specs/001-loader-and-first/contracts/slot-markup-contract.md).

## Development

```bash
npm install
npm run build      # dist/ad-serve-client.js
npm test
npm run lint
npm run typecheck
```
