# Contract: resolved render, `layout`

Applies to adconfig's `resolveAdCreativeRender`, ad-serve-api's copy (the `resolvedRender` object in the ad decision response), and ad-serve-client's wire type and renderer.

- Field: `layout`, string, optional on the wire.
- Values: `classic | image-left | image-top | overlay | text-only`.
- Producer: missing, not a string or not one of the five -> `"classic"`.
- Consumer: missing or unknown -> `classic`. Looks the name up in a fixed table; never copies the value into markup.
- Compatibility: adding the field is backward compatible. An older consumer ignores it; an older producer omits it.

## Arrangement (shared test table, keep identical in all three repos)

Shares are of the ad's width and height. "Tall" = height greater than width.

| Layout | Wrapper | Image box | Text box |
|---|---|---|---|
| classic | column, space-between (today) | fills the ad | bottom, left aligned (today) |
| image-left | row (stacked as image-top when tall) | left 50% x 100% | right 50%, logo above text |
| image-top | column | top 100% x 60% | bottom 40%, below the image |
| overlay | column | fills the ad | centered, on a dark scrim |
| text-only | column | none (gradient fills the ad) | centered |

Arrangement by ad shape: `image-left` and `image-top` are drawn stacked (the `image-top` row) when the ad is taller than it is wide; otherwise, when the ad is shorter than 100px, both are drawn side by side (the `image-left` row), because there is no room for stacked rows. `overlay` and `text-only` never change.

Text fit (every layout). The text box has 8px padding on every side and clips anything that still does not fit (`overflow:hidden`). Content heights, in px: headline line 18, gap 4, button 22, logo 18. With `inner` = text box height - 16:
- the button is shown when `inner` >= 44 (one headline line, a gap and the button);
- the logo is shown when the button is shown and `inner` >= 66;
- the headline gets `floor((inner - logo - button space) / 18)` lines, at least 1 and at most 3, where logo space is 22 when the logo is shown and button space is 26 when the button is shown, and is clamped to that many lines with an ellipsis;
- a single word longer than the text box breaks onto the next line instead of overflowing;
- text sizes stay as today (14px headline, 11px button).

Expected arrangement and parts for each layout and size (every repo's test asserts this table):

| Layout | Size | Arrangement | Logo | Button | Headline lines |
|---|---|---|---|---|---|
| image-left | 300x250 | side by side | yes | yes | 3 |
| image-left | 970x250 | side by side | yes | yes | 3 |
| image-left | 300x600 | stacked | yes | yes | 3 |
| image-left | 728x90 | side by side | yes | yes | 1 |
| image-left | 320x50 | side by side | no | no | 1 |
| image-left | 468x60 | side by side | no | yes | 1 |
| image-left | 320x100 | side by side | yes | yes | 2 |
| image-top | 300x250 | stacked | yes | yes | 2 |
| image-top | 970x250 | stacked | yes | yes | 2 |
| image-top | 300x600 | stacked | yes | yes | 3 |
| image-top | 728x90 | side by side | yes | yes | 1 |
| image-top | 320x50 | side by side | no | no | 1 |
| image-top | 468x60 | side by side | no | yes | 1 |
| image-top | 320x100 | stacked | no | no | 1 |
| overlay | 300x250 | full | yes | yes | 3 |
| overlay | 970x250 | full | yes | yes | 3 |
| overlay | 300x600 | full | yes | yes | 3 |
| overlay | 728x90 | full | yes | yes | 1 |
| overlay | 320x50 | full | no | no | 1 |
| overlay | 468x60 | full | no | yes | 1 |
| overlay | 320x100 | full | yes | yes | 2 |
| text-only | 300x250 | no image | yes | yes | 3 |
| text-only | 970x250 | no image | yes | yes | 3 |
| text-only | 300x600 | no image | yes | yes | 3 |
| text-only | 728x90 | no image | yes | yes | 1 |
| text-only | 320x50 | no image | no | no | 1 |
| text-only | 468x60 | no image | no | yes | 1 |
| text-only | 320x100 | no image | yes | yes | 2 |

Rules for every layout: a missing image shows the placeholder icon inside the image box (not for `overlay`, where it would sit behind the text, nor `text-only`, which has no image box); the `overlay` scrim is drawn whether or not there is an image, so the text looks the same either way; text that does not fit is clipped with an ellipsis, never overflows; the 074 `backgroundImagePosition` is the `object-position` of the image inside its box.

Each repo's test renders one fixture creative at 300x250 for each layout (plus an unknown value) and asserts the facts in this table.
