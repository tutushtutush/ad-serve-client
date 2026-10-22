# Research: Classic layout fits very short ads

Decisions, alternatives and the before/after measurements are in adconfig `specs/109-fix-the-classic/research.md` (D1 to D6). Specific to this repo:

- **R1 - Golden first.** Two cases (728x90, 320x100, with a logo) were added to `classicCases.ts` and their markup captured from the unchanged renderer in its own commit (162fb48) before any code change; the 23 earlier entries are untouched.
- **R2 - Text at the bottom.** In the short variant the text group is the only in-flow child, so the wrapper uses `justify-content:flex-end` to keep it at the bottom as classic does.

## Real-browser check (T007, 2026-10-22)

The served markup (`srcdoc`) in an iframe of the ad's own size in headless Chromium, a full ad (logo, "Big Sale", "Buy Now") and one with a long headline and a long button label, at all seven sizes: nothing is cut off at any of them. 468x60: no logo, one headline line (8 to 26) and the button (30 to 52). 320x50: no logo, no button, one headline line at the bottom (24 to 42). 300x250, 970x250, 300x600, 728x90 and 320x100 show the same positions as before the change (button bottoms 242, 242, 592, 82 and 92). The golden file confirms the markup of those sizes is byte-identical.

(adconfig's own check of its preview used a hand-written stylesheet without `justify-end`, so it showed the headline at the top at 320x50; in the real app the Tailwind class puts it at the bottom, as here.)
