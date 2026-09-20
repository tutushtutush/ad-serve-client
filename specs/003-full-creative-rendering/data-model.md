# Phase 1 Data Model: Full Creative Rendering Fidelity

Extends feature 001/002's data model. `AdSlotConfig`, `AdDecisionRequest`, `AdDecisionResult`,
and `AdCreative` are all unchanged. One new type is added, mirrored exactly from ad-serve-api's
own `ResolvedAdCreativeRender` (`../../../ad-serve-api/specs/006-resolved-ad-creative/data-model.md`,
itself vendored verbatim from adconfig) — not persisted, arrives fresh on every ad decision.

## ResolvedAdCreativeRender (new — mirrors ad-serve-api's contract exactly)

| Field                    | Type                  | Notes                                                        |
|---------------------------|------------------------|------------------------------------------------------------|
| `headlineText`            | `string`               | Fallback already applied server-side (e.g. `"Your Headline Here"`) |
| `ctaText`                 | `string`               | Fallback already applied server-side (e.g. `"Shop Now"`)    |
| `headlineTextColor`       | `string \| undefined`  | `undefined` means "use the Renderer's own default," not "no color" |
| `headlineFontFamily`      | `string`               | Resolved CSS `font-family` value, not a stored font id      |
| `ctaTextColor`            | `string \| undefined`  | Same `undefined`-means-default convention                   |
| `ctaFontFamily`           | `string`               | Resolved CSS `font-family` value                             |
| `ctaBackgroundColor`      | `string`               | Fallback already applied server-side (e.g. `"#ffffff"`)      |
| `hasLogoImage`            | `boolean`              | Whether a logo should render at all                          |
| `logoImageDataUrl`        | `string \| undefined`  | Meaningful only when `hasLogoImage` is `true`                |
| `logoBackgroundEnabled`   | `boolean`              | Whether the logo gets a background pill                      |
| `logoBackgroundColor`     | `string`               | Fallback already applied server-side (e.g. `"#ffffff"`)      |
| `hasBackgroundImage`      | `boolean`              | Whether a background image should render at all              |
| `backgroundImageDataUrl`  | `string \| undefined`  | Meaningful only when `hasBackgroundImage` is `true`           |
| `isLinked`                | `boolean`              | Whether the ad should be a clickable link                    |
| `linkUrl`                 | `string`               | Empty string when `isLinked` is `false`                       |
| `ariaLabel`               | `string \| undefined`  | Accessibility label; `undefined` if none configured           |
| `iconSize`                | `number`               | `min(width, height) / 3`, for the background-placeholder icon |

Every field above is treated by the Renderer as **untrusted and independently defaultable** —
FR-010 requires safe degradation even if the object is missing entirely or a field is the wrong
type, so no field is assumed present or correctly typed just because the type says so.

## AdCandidate (extended — see feature 001/002's types.ts for the rest, unchanged)

| Field           | Type                              | Notes                                                     |
|-----------------|-------------------------------------|-----------------------------------------------------------|
| `resolvedRender` | `ResolvedAdCreativeRender \| undefined` | New, optional. Absent on an incomplete/older response — the degrade-safely case (FR-010) |

## Rendering Decision Table

How each `resolvedRender` field maps to a visual decision, and its safe-degraded value when
absent or invalid:

| Field(s)                              | Renders as                                    | If absent/invalid                  |
|-----------------------------------------|------------------------------------------------|-------------------------------------|
| `headlineText`                          | Headline text (escaped)                        | Empty string (blank headline, never crashes) |
| `ctaText`                               | Button text (escaped)                          | Empty string                        |
| `headlineTextColor`                     | Headline `color` CSS                           | Omitted (inherits default)          |
| `headlineFontFamily`                    | Headline `font-family` CSS                     | `"inherit"`                         |
| `ctaTextColor`                          | Button `color` CSS                             | Omitted (inherits default)          |
| `ctaFontFamily`                         | Button `font-family` CSS                       | `"inherit"`                         |
| `ctaBackgroundColor`                    | Button `background-color` CSS                  | `"#ffffff"` (FR-004 — always present) |
| `hasLogoImage` + `logoImageDataUrl`     | Logo `<img>`, only when both valid              | No logo element at all              |
| `logoBackgroundEnabled` + `logoBackgroundColor` | Logo pill `background-color`, when enabled | No background behind the logo       |
| `hasBackgroundImage` + `backgroundImageDataUrl` | Background `<img>`/CSS, only when both valid | Gradient + icon placeholder (FR-005) |
| `iconSize`                              | Placeholder icon size                          | Computed as `min(width, height) / 3` from the ad's own dimensions |
| `isLinked` + `linkUrl` (safe-URL checked) | Clickable `<a>` wrapper, only when both true/valid | Non-interactive wrapper (FR-007/FR-008) |
| `ariaLabel`                             | `aria-label` on the wrapper                    | Omitted                             |

## State Transitions

None — `resolvedRender` is read once, synchronously, at the moment `renderAd`/a redisplay is
invoked (feature 002's Tracked Slot flow is entirely unaffected); there is no rendering state
that persists or transitions across calls.

## Relationships

```text
AdDecisionResult (feature 001/002, unchanged)
  └─ "filled" → AdCandidate
                  ├─ creative: AdCreative (unchanged, opaque — Client boundary)
                  └─ resolvedRender?: ResolvedAdCreativeRender (new — Renderer's only input)
```

The Renderer consumes `ad.resolvedRender` exclusively for this feature's decisions; `ad.creative`
remains available on `AdCandidate` (unchanged) but this feature introduces no new reason for the
Renderer to read it directly.
