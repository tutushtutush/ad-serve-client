# Contract: Classic fit

Copied from adconfig `specs/109-fix-the-classic/contracts/classic-fit.md` (the source of truth); keep the two identical. The Classic table below is read by `tests/unit/utils/adLayout.test.ts`.

Applies to adconfig's `AdSlot` and `adLayout` and this repo's renderer. ad-serve-api builds no ad markup and only serves the SDK. Extends spec 101's `contracts/resolved-render.md` (text fit rules are the same).

`inner` = ad height - 16.

- If `inner >= 66`: Classic is drawn exactly as before spec 109. Same markup, same inline styles, byte for byte.
- If `inner < 66`: Classic is one column with the text rules of spec 101 (8px padding all round, `overflow:hidden`), the logo is not shown, the button is shown when `inner >= 44`, the headline gets `max(1, floor((inner - button space) / 18))` lines (button space is 26 when shown, else 0; at most 3) with an ellipsis, the headline has an 18px line and the button is one 16px line plus 3px padding with an ellipsis. The text stays at the bottom, left aligned, as in Classic today. Everything else (colors, fonts, text sizes 14px and 11px, background, link) as Classic today.

Shared test table (keep identical in adconfig and ad-serve-client):

| Layout | Size | inner | As before | Logo | Button | Headline lines |
|---|---|---|---|---|---|---|
| classic | 300x250 | 234 | yes | yes | yes | n/a |
| classic | 970x250 | 234 | yes | yes | yes | n/a |
| classic | 300x600 | 584 | yes | yes | yes | n/a |
| classic | 728x90 | 74 | yes | yes | yes | n/a |
| classic | 320x100 | 84 | yes | yes | yes | n/a |
| classic | 468x60 | 44 | no | no | yes | 1 |
| classic | 320x50 | 34 | no | no | no | 1 |

"As before" rows have golden markup in the tests of each repo; the two changed rows are asserted by geometry and by a real-browser check that nothing is cut off.
