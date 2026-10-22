# Implementation Plan: Classic layout fits very short ads

**Branch**: `019-classic-fit-short` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

Add `classicFit(adHeight)` to `src/utils/adLayout.ts` next to `layoutGeometry`, sharing one private text-fit helper so the layouts and Classic cannot disagree. In `src/renderer/adRenderer.ts`, when `layoutGeometry` is null (classic) and `classicFit` is non-null, draw the same classic wrapper with the text group alone at the bottom (logo omitted, button only if it fits, headline with an 18px line and a line clamp, button with the fixed-height style); otherwise leave the classic template string untouched.

## Technical Context

**Language/Version**: TypeScript (strict), browser SDK bundle. **Dependencies**: none new. **Storage**: none. **Testing**: Jest (jsdom) with the golden file of the previous release; a real-browser check in headless Chromium at all seven sizes. **Constraints**: byte-identical classic output at inner height 66 and above; no wire change.

## Constitution Check

Read `.specify/memory/constitution.md` of this repo; the change adds a pure function and a render branch with unit tests, no new dependency, no wire change, nothing sent to a platform. No violations.

## Structure

```text
src/utils/adLayout.ts                 # classicFit + shared fitText
src/renderer/adRenderer.ts            # short classic branch before the unchanged classic template
tests/unit/utils/adLayout.test.ts     # classicFit cases + the shared table rows
tests/unit/renderer/adRenderer.test.ts# short classic markup + golden unchanged
tests/unit/fixtures/classicCases.ts, classicMarkup.golden.json   # 728x90 and 320x100 cases (captured first)
```

## Release

Merge, tag the next minor after `v1.10.0`, then ad-serve-api bumps its pinned tag (the SDK is served from the pin; spec 018 lesson).
