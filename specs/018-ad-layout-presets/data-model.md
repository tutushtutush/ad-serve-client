# Data model: Ad layout presets (ad-serve-client)

No stored data. One wire field.

## ResolvedAdCreativeRender (ad decision response, input)

| Field | Type on the wire | Rule |
|---|---|---|
| `layout` | optional text | One of `classic`, `image-left`, `image-top`, `overlay`, `text-only`. Missing, empty, not text, a different case or any other value is drawn as `classic`. Never copied into markup. |

## Layout geometry (computed here, never sent)

| Part | Meaning |
|---|---|
| image box | Percent box (left, top, width, height) of the ad, or none |
| text box | Percent box of the ad |
| centered | Text centered in its box |
| scrim | Dark layer behind the text |
| showLogo / showCta | Logo needs a text box of at least 80px, button at least 24px |

Values are those of [contracts/resolved-render.md](contracts/resolved-render.md).
