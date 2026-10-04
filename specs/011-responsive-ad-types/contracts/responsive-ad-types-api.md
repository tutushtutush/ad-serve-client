# Contract: Responsive ad types (publisher-facing)

Plain HTML attribute; no framework or script needed.

## `data-ad-types`

```html
<div data-ad-serve-slot
     data-platform-id="..."
     data-ad-types="0:mobile-leaderboard,768:leaderboard,1024:billboard"></div>
```

Comma-separated `minWidth:adTypeId` pairs. The slot requests the entry with the largest `minWidth` not above the
width of the browser window (or frame) when the slot is first discovered.

| Screen width | Chosen type for the example |
|---|---|
| 390 | mobile-leaderboard |
| 768 | leaderboard (minimum is inclusive) |
| 900 | leaderboard |
| 1280 | billboard |

Rules:

- `minWidth` is a whole number ≥ 0; the type is any non-blank text. Spaces around parts are ignored.
- Malformed entries are ignored; valid entries still apply. Order does not matter; equal widths: first wins.
- Include a `0:` entry to cover every width. A screen narrower than every minimum, with no `0:` entry and no
  `data-ad-type-id`, gets no ad (no request).
- Each listed type must be enabled for the platform in the ad platform's settings.

## Interaction with `data-ad-type-id`

| `data-ad-types` | `data-ad-type-id` | Result |
|---|---|---|
| absent | present | that type (unchanged from before) |
| yields a type | any | the list's choice |
| yields nothing | present | `data-ad-type-id` |
| yields nothing | absent | no request |

## Behavior over time

- The choice is made once per slot and kept for the page view. Resizing or rotating never re-requests or swaps
  the ad.
- A slot added later (infinite scroll, client-side navigation) is sized by the screen at that moment.
- Click and viewable-impression reports carry the type that was actually requested.

## Narrow windows

An ad keeps its exact size. If the window later becomes narrower than the chosen ad, the host page decides what
happens. Recommended rule on the slot element:

```css
[data-ad-serve-slot] { max-width: 100%; overflow: hidden; }
```

## Wire format (unchanged)

`GET /ads?platformId=...&adTypeId=<chosen type>&...`: exactly one ad type per request.
