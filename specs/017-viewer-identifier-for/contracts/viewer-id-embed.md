# Contract: viewer identifier on the embed (publisher-facing)

## Default

Nothing is created, stored or sent. A platform that does nothing is unchanged.

## Let the SDK keep a random identifier (opt-in)

```html
<script async src="https://ads.example.com/ad-serve-client.js"
  data-api-base-url="https://ads.example.com"
  data-platform-id="YOUR_PLATFORM_ID"
  data-viewer-id-storage="local"></script>
```

Only `local` turns it on. The SDK then creates one random UUID in the browser's local storage (key `adServeViewerId`) and sends it with every ad request, on this and later visits, in every tab. Turn it on only where your visitors have agreed to this kind of storage.

## Supply your own identifier

```js
window.adServe = window.adServe || { q: [] };
window.adServe.q.push(["setViewerId", "3fa85f64-5717-4562-b3fc-2c963f66afa6"]);   // before the SDK loads
window.adServe.setViewerId("3fa85f64-5717-4562-b3fc-2c963f66afa6");              // only once the SDK has started
```

- `window.adServe.setViewerId` exists only after the SDK has started; before that, push the call on the queue as shown, which is safe at any time.
- The value must be a UUID. Anything else is ignored with a console warning.
- It applies to requests made after the call; requests already sent are not repeated.
- It is kept in memory for the page only; call it on every page. The SDK never stores it.
- It takes precedence over the opt-in's stored identifier.

## Withdraw

```js
window.adServe.setViewerId(null);   // or ""
```

Later requests carry no identifier, a stored identifier is removed from local storage, and the opt-in does not create a new one again on that page. The next page starts from your choice again.

## What it is for

ad-serve-api caps how often one viewer sees a campaign only for requests that carry an identifier, and only for campaigns an advertiser has capped. The identifier is sent with ad requests only (not with click or viewable-impression reports) and is never rendered.
