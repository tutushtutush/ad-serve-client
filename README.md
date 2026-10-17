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

## Capping how often one viewer sees a campaign

An advertiser can cap how many times one viewer sees a campaign. ad-serve-api enforces it, but only for requests that say who the viewer is, and **by default this SDK sends nothing and stores nothing**. You decide whether to let it, and you are responsible for any consent your visitors' privacy rules require: the SDK does not read cookies, consent banners or browser privacy signals.

**Give the SDK your own identifier** (a UUID that is opaque and not tied to a person):

```js
// before the SDK has loaded: queue it (safe at any time)
window.adServe.q.push(["setViewerId", "3fa85f64-5717-4562-b3fc-2c963f66afa6"]);
// once the SDK has started
window.adServe.setViewerId("3fa85f64-5717-4562-b3fc-2c963f66afa6");
```

It applies to requests made after the call, is kept in memory for that page only (the SDK never stores it, so call it on every page), and anything that is not a UUID is ignored with a console warning.

**Or let the SDK keep a random one** on the visitor's device, by adding one attribute to the loader tag:

```html
<script async src="https://cdn.example.com/ad-serve-client.js" data-api-base-url="..." data-platform-id="..."
  data-viewer-id-storage="local"></script>
```

It creates one UUID in local storage (key `adServeViewerId`) and sends it on this and later visits, in every tab. Your own identifier, if you give one, wins over it.

**Withdraw it** when a visitor withdraws consent:

```js
window.adServe.setViewerId(null);
```

Later requests carry no identifier, the stored one is removed, and the attribute does not create a new one on that page.

The identifier goes on ad requests only (not on click or viewable-impression reports) and is never rendered. On a single-slot request it travels in the URL's query string, which a CDN or host can record in its access logs, and with several slots it travels in the request body; so use a random identifier that is not tied to a person. The attribute must be exactly `local`; any other value is ignored with a console warning. If storage is blocked, nothing is sent and ads work as before. Details: [viewer-id-embed.md](specs/017-viewer-identifier-for/contracts/viewer-id-embed.md).

## Development

```bash
npm install
npm run build      # dist/ad-serve-client.js
npm test
npm run lint
npm run typecheck
```
