# Implementation Plan: Background image position

**Branch**: `014-background-image-position` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

## Summary

Add an optional `backgroundImagePosition` to the resolved-render wire type and have the renderer write an `object-position` for it from a fixed table, with center as the fallback.

## Technical Context

TypeScript, Jest, no new dependencies. Pure string rendering in `src/renderer/adRenderer.ts`.

## Constitution Check

The renderer keeps its fail-silent rule (Principle V): an unknown value never throws and never reaches the markup. No layering change. PASS.

## Source Code

```text
src/types.ts                         # ResolvedAdCreativeRender.backgroundImagePosition?: string
src/renderer/adRenderer.ts           # fixed table + object-position on the background <img>
tests/unit/renderer/adRenderer.test.ts
```

## Contract

The nine names and anchors: adconfig `specs/074-background-image-alignment/contracts/resolved-render.md`.
