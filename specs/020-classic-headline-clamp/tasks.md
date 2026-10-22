# Tasks: A very long headline stays inside a classic ad

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/classic-headline.md](contracts/classic-headline.md). Merge only when the owner says "merge".

- [x] T001 Copy `classicMarkup.golden.json` to `classicMarkup.pre110.golden.json` and commit it alone, before any code change; save reference geometry from the unchanged renderer
- [x] T002 `src/utils/adLayout.ts`: `classicHeadlineLines(adHeight, { hasLogo, hasCta })` (SDK constants 17 and 19; null for a bad height or under 82px)
- [x] T003 `src/renderer/adRenderer.ts`: in the classic template add the clamp to the headline and the one-line limit to the button when the function returns a number; touch nothing else
- [x] T004 [P] `tests/unit/utils/adLayout.test.ts`: the function (sizes, missing logo or button, bad heights, no cap) and the "Lines (SDK)" column of the copied contract
- [x] T005 `tests/unit/renderer/adRenderer.test.ts`: clamp and button styles at 320x100 and 300x250; none for a bad height or under 82px; a test that removes only the added styles from every golden case and expects the pre-110 string
- [x] T006 Regenerate `classicMarkup.golden.json` in a commit of its own (all entries gain the same two additions)
- [x] T007 Real-browser check of the SDK markup against the saved geometry: ordinary ads identical, a 40-line headline with a 150-character label inside the ad at five sizes and four fonts; record in `research.md`
- [x] T008 Bump `package.json` and the lock to 1.12.0; `npx tsc --noEmit`, `npx eslint .`, `npx jest`, `npm run build`; README line; open the PR
- [x] T009 After merge: tag `v1.12.0` on the merge commit; adconfig spec 110 then bumps ad-serve-api's pin and checks the test site
