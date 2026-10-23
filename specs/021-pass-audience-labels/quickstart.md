# Quickstart: validating audience labels in the SDK

Prerequisites: `npm install`. For the live step, ad-serve-api with spec 061 deployed and a campaign with labels on a placement.

1. **Tests**: `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build` pass.
2. **Nothing set**: load a page with two slots and no call: the requests carry no `audience` (same as 1.12.0).
3. **Method**: `window.adServe.setAudience(["Follows-Team-X "])` then `window.adServe.refresh()` on a page with a new slot: the single request has `audience=follows-team-x`.
4. **Queued**: `window.adServe.q.push(["setAudience", ["follows-team-x"]])` before the script: the first request carries it.
5. **Batch**: with two slots of the same country, device and category, the one batch body has `"audience": ["follows-team-x"]`; with the batch refused by the server, both single fallbacks carry it.
6. **Replace and clear**: `setAudience(["b"])`, then `setAudience(null)`: later requests carry `b`, then nothing.
7. **Bad input**: `setAudience("a")`, `setAudience()`, `setAudience(["has space"])`: nothing changes; one warning each; the page works.
8. **Not stored**: after a run with labels, `localStorage`, `sessionStorage` and `document.cookie` hold no label; click and viewable-impression reports carry none.
9. **Live**: against the test environment, a page that sets the campaign's label is served the campaign; one that does not is not.

Contracts: [contracts/](contracts/). Data rules: [data-model.md](data-model.md).
