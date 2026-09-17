# Phase 1 Data Model: Resilient Slot Discovery for Client-Rendered Host Pages

Extends feature 001's data model (`AdSlotConfig`, `AdDecisionRequest`, `AdDecisionResult`,
`AdCreative` — all unchanged). This feature adds one new in-memory concept; nothing here is
persisted.

## Tracked Slot (internal — not persisted)

Replaces feature 001's implicit "hold the `Element` reference for the life of the request"
approach. One Tracked Slot exists per slot discovered, for as long as that slot's outcome is
undetermined.

| Field                    | Type                | Notes                                                |
|--------------------------|----------------------|-------------------------------------------------------|
| `config`                 | `AdDecisionRequest`  | The slot's platform/ad-type/targeting, fixed at discovery — used both for the outbound request and as the grouping key (research.md) |
| `groupPosition`          | integer               | This slot's position (0-based) among all discovered slots sharing the same `config`, fixed at discovery |
| `currentElement`         | `Element \| null`     | Re-resolved on every observed mutation (data-model "State Transitions" below); `null` means no element currently occupies this slot's `(config, groupPosition)` |
| `ad`                     | `AdCandidate \| null` | **Amended.** Set once the ad decision arrives filled; remembered so a redisplay (FR-009) reuses the same ad rather than requesting again (research.md) |
| `renderedElement`        | `Element \| null`     | **Amended.** The specific element last rendered into; checked each mutation batch for disconnection to detect the FR-009 case |
| `redisplaysRemaining`    | integer               | **Amended.** Starts at 3 on first successful render (research.md — tuned against the real environment); decremented each time a redisplay actually happens (FR-010) |
| `quietBatchesRemaining`  | integer               | **Amended.** Starts at 10 on every (re)display (research.md — tuned against the real environment), reset on each redisplay; decremented each mutation batch where `renderedElement` was still connected — reaching 0 means "settled," done |
| `resolved`               | boolean               | Set once an outcome is *finally* determined (empty, or filled-and-survived-the-watch-window); once `true`, this Tracked Slot is dropped and no longer updated (FR-008) |

## Configuration Group (internal, derived — not persisted)

Not a stored entity — the grouping used to compute `groupPosition` and to re-resolve
`currentElement`. Computed fresh from the current set of matching elements each time it's needed:
all currently-discovered elements sharing an identical `config`, ordered by document position.
`groupPosition` indexes into this group.

## State Transitions

**Amended**: the original diagram ended at the first successful render (`filled [resolved]`).
Real-world verification showed a render can be undone by the host page's own redraw shortly
afterward (spec.md's Assumptions), so `filled` is no longer immediately final — a bounded
watch-and-redisplay window (FR-009/FR-010) sits between a render and the slot actually being
done:

```text
discovered → (invalid config) ──────────────────────────────────► empty [resolved]
     │
     ▼ (valid config)
  requesting (currentElement tracked, may be reassigned any number of
             times via configuration-group matching as mutations occur)
     │
     ▼ (timeout / error / no match / malformed response)
  empty [resolved]
     │
     ▼ (ad returned)
  checking-current-element (re-resolve currentElement one final time)
     │
     ├─ currentElement is null ──────────────────────────────────► empty [resolved]
     │  (no element currently occupies this slot's group position —
     │   removed for good, FR-004)
     │
     ▼ currentElement is set
  rendered (renderedElement := currentElement, ad := result.ad,
            redisplaysRemaining := 3, quietBatchesRemaining := 10)
     │
     │ ◄── loop: on each subsequent mutation batch ──────────────────────┐
     │                                                                    │
     ├─ renderedElement still connected                                  │
     │    quietBatchesRemaining -= 1                                     │
     │    ├─ > 0 ────────────────────────────────────────────────────────┘
     │    └─ = 0 ──────────────────────────────────────────► filled [resolved]
     │              (settled — ad survived the watch window)
     │
     └─ renderedElement disconnected (FR-009 case)
          ├─ no current element for this slot ────────────► empty [resolved]
          │    (genuinely gone — FR-004's outcome applies here too)
          ├─ redisplaysRemaining = 0 ─────────────────────► empty [resolved]
          │    (bounded attempts exhausted — FR-010; "leave it in whatever
          │     state it last reached" — here, that state is empty)
          └─ redisplaysRemaining > 0 ──► redisplay into the current element
                    (renderedElement := that element, redisplaysRemaining -= 1,
                     quietBatchesRemaining reset to 10) ──► back to the loop above
```

Unlike feature 001, `currentElement` reassignment itself is not a state transition that produces
a visible outcome — it's bookkeeping that happens throughout. Once `resolved` becomes `true`
(reached either directly, or after the watch-and-redisplay loop above concludes), no further
mutation observation affects that slot (FR-008).

## Relationships

```text
AdSlotConfig (1, at discovery) ──produces──► Tracked Slot (1)
                                                    │
                                    config + groupPosition define which
                                    Configuration Group this slot belongs to
                                                    │
                                                    ▼
                                   currentElement ← (re-resolved per mutation,
                                                      from the Configuration
                                                      Group's current members)
```

Every Tracked Slot still produces exactly one `AdDecisionRequest` → `AdDecisionResult` chain
(feature 001, unchanged) — this feature only changes what happens to the *target element* that
chain's result is applied to, not the request/response chain itself.
