# Research: Echo the Per-Impression Idempotency Key on Tracking Reports

No `NEEDS CLARIFICATION` markers remain in the Technical Context — this feature's counterpart
(ad-serve-api feature 014) already shipped and its contract deltas fully pin down the wire shape.
The decisions below record why the client-side approach follows directly from that shipped
contract rather than introducing anything new.

## Decision 1: Where `impressionId` is declared

**Decision**: Add `impressionId?: string` to `AdCandidate` in `src/types.ts`, alongside the
existing optional `adConfigId?: string`.

**Rationale**: `AdCandidate` is this codebase's one type describing "the ad object as returned by
ad-serve-api's decision response" (types.ts:64-75). `adConfigId` already establishes the pattern
for a field that's optional, opaque, and used only for tracking rather than rendering —
`impressionId` is exactly that same kind of field per ad-serve-api's contract delta
(`ad-decision-endpoints-delta.md`: "present whenever `ad` is non-null").

**Alternatives considered**: A separate `ImpressionMetadata` type wrapping just `impressionId`.
Rejected — over-engineering for a single string field with the same lifecycle and trust level as
a field already sitting right next to it.

## Decision 2: No new runtime validation needed in `adDecisionClient.ts`

**Decision**: `isAdCandidate()` (adDecisionClient.ts:33-46) is not changed. Once `AdCandidate`
declares `impressionId?: string`, a decision response's extra field passes through the existing
type-guarded cast unchanged — JS objects carry properties the guard didn't explicitly check,
exactly as `adConfigId` already does today (the guard only checks `creative`/`width`/`height`).

**Rationale**: Matches this codebase's own established precedent (`adConfigId`'s treatment) and
Constitution Principle I (no new abstraction where the existing pattern already covers the case).

**Alternatives considered**: Adding an explicit `typeof candidate.impressionId === "string"`
check to the guard. Rejected — this would make `impressionId` *required* for a response to be
treated as filled at all, directly violating FR-005/User Story 3 (an older ad-serve-api without
`impressionId` must still serve ads normally). The field's optionality belongs entirely in the
type declaration, not in the structural guard.

## Decision 3: How it travels through redisplay

**Decision**: No new state. `impressionId` rides along on `TrackedSlot.ad` (adOrchestrator.ts:107),
which already survives redisplay by design (feature 006's research.md: "reuses the same
already-fetched slot.ad ... rather than requesting a new one"). Every call site that reads
`slot.ad.adConfigId` today (viewability watch, render/redisplay) gains a parallel read of
`slot.ad.impressionId`.

**Rationale**: A redisplay is explicitly *not* a new ad serving (spec.md Edge Cases; mirrors
ad-serve-api spec 014's own Edge Cases: "this feature deliberately does not collapse counts
across separate servings... each serving gets its own identifier"). Since `slot.ad` is the single
already-established mechanism for "this is still the same serving," no new field or bookkeeping
is needed to keep `impressionId` consistent across a redisplay — it's automatic.

**Alternatives considered**: Storing `impressionId` as its own field on `TrackedSlot` (sibling to
`ad`). Rejected — would duplicate state that's already 1:1 with `slot.ad`'s lifecycle, and could
drift out of sync with it (e.g. a future change to how `slot.ad` is reset would need to
separately remember to reset a sibling field too).

## Decision 4: Coercion at the send sites

**Decision**: At each of the two send sites (`resolveClickHref` in adRenderer.ts,
`startViewabilityWatch`'s `onViewable` callback in adOrchestrator.ts), coerce `impressionId`
through `asSafeString()` — the same utility already used for `adConfigId` at both sites — before
handing it to `buildTrackingUrl`.

**Rationale**: `asAdCandidate` never validates `impressionId`'s type at parse time (Decision 2),
so a schema-drifted or malformed response (a number/object) must degrade to "no impressionId
sent," not get stringified into a broken query value — the exact failure mode already documented
and fixed for `adConfigId` in this codebase (adRenderer.ts's `resolveClickHref` comment: "a
non-string adConfigId produced `adConfigId=%5Bobject+Object%5D`"). Reusing `asSafeString` avoids
reintroducing that same class of bug for the new field.

**Alternatives considered**: Trusting the field's declared TypeScript type at runtime (skip
coercion). Rejected — TypeScript types are erased at runtime and don't protect against an actual
malformed HTTP response body, exactly the reasoning already documented for `adConfigId`.

## Decision 5: `buildTrackingUrl`'s signature

**Decision**: Add `impressionId?: string` as an optional field on `buildTrackingUrl`'s existing
`params` object; include it in the built `URLSearchParams` only when it's a non-empty string
(mirrors ad-serve-api's own tolerance — `click-endpoint-delta.md`/`viewable-impression-endpoint-
delta.md`: "Missing ... is never a 400 — treated identically to omitted").

**Rationale**: Keeps `buildTrackingUrl` a single shared function for both call sites (its own
existing doc comment: "previously duplicated this exact pattern independently"). `URLSearchParams`
can't be constructed from an object with an `undefined` value without emitting the literal string
`"undefined"`, so the params object must be built incrementally rather than passed straight into
the constructor once a field is optional.

**Alternatives considered**: Always sending `impressionId=` (empty string) when absent. Rejected
— ad-serve-api's own `placementIdentity.ts` treats a value as either "a validly-formed UUID" or
"absent" (`extractOptionalImpressionId`); an empty-string parameter is neither and adds no value,
just a longer URL.
