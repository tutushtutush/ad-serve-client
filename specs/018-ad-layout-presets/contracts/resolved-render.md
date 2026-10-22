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
| image-left | row (column when tall, then as image-top) | left 50% x 100% | right 50%, logo above text |
| image-top | column | top 100% x 60% | bottom 40%, below the image |
| overlay | column | fills the ad | centered, on a dark scrim |
| text-only | column | none (gradient fills the ad) | centered |

Text fit (every layout): the headline is clamped to 3 lines with an ellipsis; the CTA is never clipped, and is hidden only when its text box is shorter than the CTA itself (about 24px); the logo is hidden before any text is (it needs a text box at least 80px tall; the CTA needs at least 24px). Text sizes stay as today (14px headline, 11px CTA). A single word longer than the text box breaks onto the next line instead of overflowing.

Rules for every layout: a missing image shows the placeholder icon inside the image box (not for `overlay`, where it would sit behind the text, nor `text-only`, which has no image box); text that does not fit is clipped with an ellipsis, never overflows; the 074 `backgroundImagePosition` is the `object-position` of the image inside its box.

Each repo's test renders one fixture creative at 300x250 for each layout (plus an unknown value) and asserts the facts in this table.
