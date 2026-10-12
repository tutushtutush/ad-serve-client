# Tasks: Background image position

- [X] T001 [US1] Add `backgroundImagePosition?: string` (comment: one of nine names, spec 014) to `ResolvedAdCreativeRender` in `src/types.ts`.
- [X] T002 [US1] In `src/renderer/adRenderer.ts` add a fixed table of the nine names to their anchors and a small `backgroundObjectPosition(value)` that returns the anchor for an exact match and `center center` otherwise; add `object-position:<anchor>;` to the background `<img>` style.
- [X] T003 [US1] Tests in `tests/unit/renderer/adRenderer.test.ts`: each of the nine names gives its anchor (table from adconfig spec 074).
- [X] T004 [US2] Tests: missing, empty, "LEFT", a number, `"url(x)"`, `"left; x"`, `"toString"` and `"__proto__"` all give `center center`, and the raw value never appears in the output; an ad without a background image is unchanged.
- [X] T005 Run `npx jest`, `npx tsc --noEmit` and `npm run lint`.

Order: T001 → T002 → T003, T004 → T005. Deploy first of the three repos.
- [X] T006 Bump `package.json` (and the lock file's own version) from 1.6.0 to 1.7.0, as each earlier feature did.
