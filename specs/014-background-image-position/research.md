# Research: Background image position

- **D1.** The value is a name looked up in a fixed table (nine entries). Rejected: passing a CSS string from the server into the style; the response is untrusted and the existing renderer avoids writing response text into CSS (see the comment above the background image in `adRenderer.ts`).
- **D2.** Name matching is exact and case-sensitive. Anything else is center (the same rule as adconfig and ad-serve-api).
- **D3.** Written as `object-position` next to the existing `object-fit:cover` on the background `<img>`.

## Rejected or reversed approaches

None.
