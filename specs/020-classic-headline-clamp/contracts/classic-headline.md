# Contract: Classic headline limit

Copied from adconfig `specs/110-classic-headline-clamp/contracts/classic-headline.md` (the source of truth); keep the two identical. The table below is read by `tests/unit/utils/adLayout.test.ts`.

Applies to adconfig's `AdSlot` and `adLayout` and to this repo's renderer, for Classic ads 82px tall or more (shorter ones keep `classic-fit.md` of spec 109). ad-serve-api builds no markup.

`inner` = ad height - 16. `room` = `inner` - (logo drawn ? 18 : 0) - (button drawn ? 4 + button height : 0).

Headline lines = `max(1, floor(room / line))`, with no cap. The line and the button height are each renderer's own, because Classic does not set a line height:

The preview's values are exact (its own page, Tailwind's 1.5 line height). The SDK's are rounded up: the SDK's iframe uses the browser's default font at line height "normal", which measured 16 to 17px (headline) and 18 to 19px (button) on a Mac but is about 19px and 21px in the default serif of Android and the Windows UI font, so 20 and 21 keep a headline inside the ad on those too, at the price of cutting an extremely long headline a line or two early where the lines are shorter.

| Renderer | line | button height |
|---|---|---|
| adconfig preview | 21 | 22 |
| ad-serve-client | 20 | 21 |

Style added to the Classic headline: the line clamp for that count, `display:-webkit-box`, `-webkit-box-orient:vertical`, `overflow:hidden`, `overflow-wrap:anywhere`, `min-width:0`, `max-width:100%`. Style added to the Classic button: `max-width:100%`, `box-sizing:border-box`, `white-space:nowrap`, `overflow:hidden`, `text-overflow:ellipsis`. Nothing else changes (no line height, colors, fonts, text sizes or padding).

Shared test table, with a logo and a button drawn (keep identical in adconfig and ad-serve-client):

| Size | inner | room (preview) | Lines (preview) | room (SDK) | Lines (SDK) |
|---|---|---|---|---|---|
| 300x250 | 234 | 190 | 9 | 191 | 9 |
| 970x250 | 234 | 190 | 9 | 191 | 9 |
| 300x600 | 584 | 540 | 25 | 541 | 27 |
| 728x90 | 74 | 30 | 1 | 31 | 1 |
| 320x100 | 84 | 40 | 1 | 41 | 2 |

Without a logo the room grows by 18, without a button by 4 plus the button height; the test also asserts those variants for 300x250 and 320x100. Sizes under 82px: `classic-fit.md` (spec 109).
