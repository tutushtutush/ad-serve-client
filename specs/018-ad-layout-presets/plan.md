# Implementation Plan: Ad layout presets

**Branch**: `018-draw-ad-layout` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/018-ad-layout-presets/spec.md`

## Summary

Read an optional `layout` from the ad's resolved render and draw one of five arrangements, per the shared contract copied from adconfig spec 101. A small utility module holds the five names, a total `normalizeLayout` (anything unknown becomes classic) and the arrangement table (image box, text box, centered, scrim, logo and button thresholds). The renderer keeps its existing classic markup code path untouched and adds a second builder used only when the layout is not classic, so classic stays byte-identical by construction and by a golden test captured before any change. The value is looked up in the fixed table and never reaches the markup. New SDK version 1.10.0.

## Technical Context

**Language/Version**: TypeScript, bundled with esbuild into one IIFE

**Primary Dependencies**: none at runtime

**Storage**: none

**Testing**: Jest + jsdom (`tests/unit/**`), ESLint, `tsc`

**Target Platform**: browsers, embedded in third-party pages; the ad is drawn into a sandboxed iframe's `srcdoc`

**Project Type**: embeddable browser SDK (library)

**Performance Goals**: no change; a few more inline styles per non-classic ad

**Constraints**: fail-silent (Principle V): normalization and geometry are total functions, no throw is possible from a bad value. Every value reaching markup comes from a fixed table or a number computed here, never from the response. The CSS used (`display:-webkit-box`, `-webkit-line-clamp`, `overflow-wrap:anywhere`) is supported by current Chrome, Safari and Firefox; where `overflow-wrap:anywhere` is not supported the long word overflows its box but is clipped by the box's `overflow:hidden`, so nothing leaves the ad.

**Scale/Scope**: one utility, one renderer builder, one type field, the README and the version

## Constitution Check

- I Clean, readable code: one named module for the layout rules, small pure functions. PASS.
- II Layered architecture: pure rules in `utils/`, drawing in `renderer/`; the orchestrator and API client are untouched. PASS.
- III Testable layers: pure functions plus the existing renderer factory with injected document. PASS.
- IV Dedicated utility modules: `src/utils/adLayout.ts`, beside `asSafeString.ts` and friends. PASS.
- V Fail-silent: bad input degrades to classic; no new throw path; no console output for a bad layout (FR-011). PASS.

No violations; Complexity Tracking not needed.

## Design

1. **Type**: `layout?: string` on `ResolvedAdCreativeRender` in `src/types.ts`, with a comment naming the five values; typed as text because the response is untrusted.
2. **`src/utils/adLayout.ts`**: `AD_LAYOUTS` (the five names), `normalizeLayout(value: unknown)` (own-property lookup so `"constructor"`, `"__proto__"` and `"toString"` are rejected), and `layoutGeometry(layout, width, height)` returning `null` for classic or `{ image, text, centered, scrim, showLogo, showCta }` exactly as in the contract (boxes as percentages, `image-left` becomes `image-top` when height > width, logo shown when the text box is at least 80px tall, button at least 24px). A width or height that is not a positive finite number gives `null` (classic).
3. **Renderer**: `buildCreativeMarkup` computes `geometry = layoutGeometry(normalizeLayout(r.layout), ad.width, ad.height)`. If `null`, the current code runs unchanged. Otherwise a new `buildLayoutMarkup` draws: the wrapper (`position:absolute;inset:0;overflow:hidden;` and the same gradient and link/role handling), an image box (`position:absolute;overflow:hidden;left/top/width/height` in percent) holding the existing background `<img>` with its `object-position`, or the placeholder icon (sized from the box, drawn only for the two layouts with an image box beside the text), and a text box (absolute, column flex, centered or start-aligned, padding 8px, a `rgba(0,0,0,0.45)` background for the scrim) holding the logo, the clamped headline and the button under the thresholds. The existing escaping helpers are reused for every response-sourced value.
4. **Shared pieces**: the logo, headline and button strings are built by small helpers that the classic path also calls only if that leaves the classic output byte-identical; otherwise the classic path keeps its own copy. The golden test decides.
5. **Tests**: a golden file of classic markup captured from the previous release before any edit; the contract table asserted per layout at 300x250; wide and tall sizes; long headline and long word; missing parts; hostile values (markup, quotes, objects, arrays, numbers, a 10 KB string, `__proto__`).
6. **Release**: `package.json` to 1.10.0; README gains a short "Ad layouts" note stating that nothing changes for a platform.

## Rollout

First of three (ad-serve-client, then ad-serve-api, then adconfig). Merged and released alone it changes nothing visible (SC-004), because no response carries a layout yet.

## Project Structure

### Documentation (this feature)

```text
specs/018-ad-layout-presets/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/resolved-render.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
src/types.ts                              # layout?: string
src/utils/adLayout.ts                     # new
src/renderer/adRenderer.ts                # geometry, buildLayoutMarkup
tests/unit/utils/adLayout.test.ts         # new
tests/unit/renderer/adRenderer.test.ts    # layouts, hostile values, golden
tests/unit/fixtures/classicMarkup.golden.json  # new, captured before edits
README.md, package.json                   # note, 1.10.0
```

**Structure Decision**: Same shape as spec 014 (background position) in this repo: one utility module with a fixed table, the renderer looks names up and never copies them.
