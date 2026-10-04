# Research: Responsive ad types per breakpoint

## Decision 1 — Resolve in the Orchestrator at discovery, freeze on the tracked slot

**Decision**: `parseSlotConfig` (Orchestrator) resolves the slot's ad type once when the slot is discovered,
and that resolved type lives in the tracked slot's config for the slot's whole life. Request, render, click and
viewable-impression reporting already read `slot.config.adTypeId`, so they all use the resolved type with no
change (FR-007, FR-008).

**Rationale**: A slot makes its request right at discovery, so "at request time" and "at discovery" coincide.
Freezing prevents any later width change from altering what is reported.

**Alternatives**: Resolve inside the request call — would split the decision from the stored config that
tracking reads, inviting a mismatch. Rejected.

## Decision 2 — Slot identity from raw attributes, not the resolved type

**Decision**: `makeGroupKey` is built from the raw `data-ad-type-id` and raw `data-ad-types` strings (plus the
existing platform, country, device, category), not from the resolved type.

**Rationale**: The key re-identifies a slot after the host page replaces its element
(`mapSlotsByGroupPosition` re-parses the DOM). If the key used the resolved type, a window resize between
discovery and replacement would make the new parse resolve differently, the keys would stop matching, and
redisplay tracking would silently break (FR-009). Raw attributes never change with the screen.

## Decision 3 — Attribute notation

**Decision**: `data-ad-types="0:mobile-leaderboard,768:leaderboard"`: comma-separated `minWidth:adTypeId`
pairs. Width is a non-negative whole number; whitespace around parts is trimmed; the type is any non-blank text
after the first colon, passed through untouched like `data-ad-type-id` today.

**Rationale**: Mirrors the min-width semantics of CSS breakpoints and of GPT size mapping; trivially parseable;
works in plain HTML.

**Alternatives**: JSON in an attribute — noisy to hand-write and easy to break with quoting. Several
`data-ad-type-at-*` attributes — unbounded attribute names. Both rejected.

## Decision 4 — Picking rule

**Decision**: Choose the entry with the largest minimum width less than or equal to the viewport width. Equal
widths: the first listed wins. Entry order otherwise does not matter. Malformed entries are dropped silently.

## Decision 5 — Precedence with the single type, and no match

**Decision**: A usable list wins. If the list yields nothing (no usable entry, or the viewport is narrower than
every minimum width) and `data-ad-type-id` is present, that is used. If neither yields a type, the slot is
treated as invalid: no request, nothing breaks (same as a slot missing its type today).

## Decision 6 — Viewport width is injected

**Decision**: `createAdOrchestrator` takes an optional `getViewportWidth: () => number`. `index.ts` supplies a
guarded reader of `window.innerWidth` (a throw or non-finite value counts as 0). When omitted (existing tests),
width is 0, so only entries starting at 0 can match, and single-type slots behave exactly as before.

**Rationale**: Constitution III forbids reaching for `window` inside the Orchestrator. `innerWidth` is the width
CSS media queries use and, inside an iframe, that frame's own width (spec edge case).

## Decision 7 — No re-request on resize, and no scaling

**Decision**: Nothing listens for resize or rotation. Ads wider than a narrowed container are left to the host
page's CSS; the contract recommends `max-width:100%; overflow:hidden` on the slot. Scale-to-fit is out of scope.

**Rationale**: Matches GPT and Prebid defaults (size mapping is evaluated at request time), avoids double-counted
requests. Scaling is a common publisher technique but not a standard; it can be added later if real use shows a
need.

## Decision 8 — Release

**Decision**: v1.4.0 (minor, additive), then bump the ad-serve-api pin.
