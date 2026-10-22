# Quickstart: validating ad layout presets (ad-serve-client)

Prerequisites: `npm ci`; on branch `018-draw-ad-layout`.

1. `npm test`, `npm run lint`, `npx tsc --noEmit` are green.
2. Golden: the classic markup test passes against `tests/unit/fixtures/classicMarkup.golden.json`, which was captured from the previous release before any change.
3. Contract: the renderer tests for each layout at 300x250, 970x250 and 300x600 assert the table in [contracts/resolved-render.md](contracts/resolved-render.md).
4. Hostile values: `layout` set to markup, quotes, an object, an array, a number and a very long string draws the classic markup and the value appears nowhere in it.
5. Browser: build the SDK (`npm run build`), serve a test page with one ad per layout fed from a stub response, and look at it in a real browser at the three sizes with a long headline and with missing parts; record in `research.md`.
6. Release: version is 1.10.0; on the test environment, after release, the served ads of the test site are unchanged (nothing sends a layout yet).
