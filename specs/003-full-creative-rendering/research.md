# Phase 0 Research: Full Creative Rendering Fidelity

The architecture question (where rendering decisions get resolved, and why) was already settled
across this session's discussion with ad-serve-api and adconfig, and shipped on ad-serve-api's
side as its own feature 006 (merged). The research below covers the remaining concrete decisions
needed to consume that contract correctly and safely in ad-serve-client.

## Decision: Consume `resolvedRender` values directly; never re-derive a rendering decision

**Rationale**: The whole point of the shipped architecture is that ad-serve-api (using logic
vendored from adconfig) has already decided every fallback, color, font, and presence/absence
question. Re-deriving any of these client-side would recreate exactly the class of bug that
started this feature (a client-side reimplementation silently drifting from adconfig's actual
rules). ad-serve-client's job is limited to turning already-decided values into markup/layout —
confirmed against ad-serve-api's authoritative contract:
`../../../ad-serve-api/specs/006-resolved-ad-creative/contracts/resolved-render-addendum.md` and
its `data-model.md`.

**Alternatives considered**: None seriously — this was the entire premise agreed with ad-serve-api
and adconfig before their side shipped.

## Decision: Defensive per-field fallbacks live in the Renderer, not the Client

**Rationale**: Consistent with the existing pattern from feature 001's PR #1 code review fix
(`asSafeString` for `creative` fields) — the Client stays a thin, opaque pass-through
(Constitution Principle IV) and never validates `resolvedRender`'s internal shape; the Renderer,
which is the only layer that actually consumes each field, is where a missing/wrong-typed field
gets a safe default. This also directly satisfies FR-010 (missing/incomplete rendering guidance
must still degrade safely) without needing the Client to know what "safe" means for a field it
never interprets.

**Alternatives considered**: Validating `resolvedRender`'s shape in the Client (mirroring the
rejected, since-reverted, over-strict `isAdCandidate` validation from feature 001's original code
review fix) — rejected for the same reason it was reverted there: the Client isn't the layer that
knows which fields are load-bearing for rendering, and a wrong guess there risks discarding an
otherwise-good ad over an unrelated field defect.

## Decision: Omit the non-data-driven "disclosure" icon adconfig's preview shows

**Rationale**: adconfig's own preview (`AdSlot.tsx`) renders a small "i" disclosure-style icon in
the top-right corner of every ad, but it's hardcoded UI chrome — not derived from any creative
field, and not part of `resolvedRender`. spec.md's Assumptions already scope out pixel-perfect
layout parity with adconfig's preview; including a static element that carries no advertiser
configuration would add layout complexity for a purely cosmetic detail nothing in this feature's
requirements calls for.

**Alternatives considered**: Replicating it for closer visual parity — rejected as out of scope;
revisit only if a future requirement explicitly asks for it (e.g., an actual disclosure/consent
feature, which would be a real, data-driven requirement rather than static chrome).

## Decision: Background placeholder uses an inline SVG icon, not an icon library

**Rationale**: adconfig's preview placeholder uses a `lucide-react` icon component — not portable
to a plain HTML string inside a sandboxed iframe. A small, hand-written inline SVG (a generic
"image" glyph) sized via `resolvedRender.iconSize` reproduces the same visual intent (a muted
icon centered over a gradient) without pulling in a dependency for one glyph, consistent with
Constitution Technology Constraints keeping the SDK dependency-free.

**Alternatives considered**: Loading an icon library from a CDN — rejected as unnecessary weight
for a single decorative glyph, and inconsistent with the project's no-runtime-dependency stance.

## Decision: `iconSize` gets a computed client-side fallback if absent, matching adconfig's own formula

**Rationale**: `resolvedRender.iconSize` is documented (ad-serve-api's data-model.md) as
`min(width, height) / 3`, computed from the ad type's dimensions — the same formula adconfig's
`AdSlot.tsx` uses. If `resolvedRender` is missing entirely or `iconSize` isn't a valid positive
number (FR-010's degrade-safely case), the Renderer computes the same formula itself from the ad's
own `width`/`height` (already available on `AdCandidate`) rather than falling back to an arbitrary
fixed size — keeping the degraded case visually consistent with the normal case instead of
introducing a second, different-looking fallback.

**Alternatives considered**: A fixed fallback icon size (e.g., 32px) — rejected; it would look
visibly different (and disproportionate for very small or very large ad slots) from the
formula-driven size used in the normal case, for no benefit over just computing the same formula.

## Decision: Clickability's safe-URL check is the same existing function, applied to `resolvedRender.linkUrl`

**Rationale**: FR-008 requires the existing safe-destination restriction to apply regardless of
what `isLinked` says. The Renderer already has a `toSafeHref`-style check (http/https only) from
feature 001 — reused unchanged, just now fed `resolvedRender.linkUrl` instead of
`creative.linkUrl`, and only invoked at all when `resolvedRender.isLinked` is strictly `true` (a
falsy/missing `isLinked` means the ad is rendered as a non-interactive wrapper regardless of
`linkUrl`'s content).

**Alternatives considered**: Trusting `isLinked` alone without re-checking the URL scheme —
rejected outright; `resolvedRender.linkUrl` is still advertiser-supplied, untrusted data by the
time it reaches the browser, and FR-008 explicitly requires the client-side safety rule to be the
final word regardless of what upstream signals say.
