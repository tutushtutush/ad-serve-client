# Implementation Plan: A very long headline stays inside a classic ad

**Branch**: `020-classic-headline-clamp` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

## Summary

Add `classicHeadlineLines(adHeight, { hasLogo, hasCta })` to `src/utils/adLayout.ts` (returns null for a bad height or an ad under 82px, via `classicFit`), with the SDK's constants (line 20, button 21). In the classic template of `src/renderer/adRenderer.ts` add the line clamp (`clampedTextStyle`) to the headline and the one-line limit to the button when the function returns a number; the template string is otherwise untouched.

## Technical Context

TypeScript (strict), browser SDK; no new dependency; no storage; Jest (jsdom) with golden files; real-browser check in headless Chromium. No scripts run in the SDK iframe, so the count is computed beforehand.

## Constitution Check

A pure function and a render branch with unit tests; no wire change; nothing about a platform. No violations.

## Structure

```text
src/utils/adLayout.ts        # classicHeadlineLines + constants
src/renderer/adRenderer.ts   # clamp and one-line button in the classic template
tests/unit/utils/adLayout.test.ts, tests/unit/renderer/adRenderer.test.ts
tests/unit/fixtures/classicMarkup.pre110.golden.json (copy, committed first), classicMarkup.golden.json (regenerated)
package.json, package-lock.json   # 1.12.0
```

## Release

Merge, tag `v1.12.0` on the merge commit, then ad-serve-api bumps its pinned tag.
