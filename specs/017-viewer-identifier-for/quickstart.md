# Quickstart: validating the viewer identifier

**Prerequisites**: `npm install`; `npm run build` for the browser bundle; a page with two slots and the loader tag.

1. **Automated**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
2. **Default**: load the page with no attribute and no call. Expect no `viewerId` in any request (browser dev tools, Network) and no `adServeViewerId` in Application, Local storage.
3. **Platform call**: in the console run `adServe.setViewerId("3fa85f64-5717-4562-b3fc-2c963f66afa6")`, then `adServe.refresh()`. Expect the next request(s) to carry that value, and nothing in local storage.
4. **Queued call**: add `adServe.q.push(["setViewerId", "<uuid>"])` before the loader; expect the first requests to carry it.
5. **Invalid value**: `adServe.setViewerId("abc")` and `adServe.setViewerId(5)`: one warning each, requests unchanged.
6. **Opt-in**: add `data-viewer-id-storage="local"`, reload. Expect one UUID created, stored under `adServeViewerId`, sent; reload and open a second tab and confirm it is the same value.
7. **Precedence**: with the opt-in on, call `setViewerId("<other uuid>")`: later requests carry the other value and the stored one is untouched.
8. **Withdraw**: `adServe.setViewerId(null)`: later requests carry nothing, the storage entry is gone, and a refresh does not create a new one. Reload: back to the platform's choice.
9. **Blocked storage**: in a sandboxed frame without storage access, or with storage disabled, the opt-in sends nothing and ads still render.
10. **End to end**: with a campaign capped at 2 per day in adconfig, a page with the opt-in on shows the campaign twice and then not again for that browser.
