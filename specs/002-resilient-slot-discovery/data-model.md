# Phase 1 Data Model: Resilient Slot Discovery for Client-Rendered Host Pages

Extends feature 001's data model (`AdSlotConfig`, `AdDecisionRequest`, `AdDecisionResult`,
`AdCreative` — all unchanged). This feature adds one new in-memory concept; nothing here is
persisted.

## Tracked Slot (internal — not persisted)

Replaces feature 001's implicit "hold the `Element` reference for the life of the request"
approach. One Tracked Slot exists per slot discovered, for as long as that slot's outcome is
undetermined.

| Field           | Type                          | Notes                                                |
|-----------------|--------------------------------|-------------------------------------------------------|
| `config`        | `AdDecisionRequest`            | The slot's platform/ad-type/targeting, fixed at discovery — used both for the outbound request and as the grouping key (research.md) |
| `groupPosition` | integer                        | This slot's position (0-based) among all discovered slots sharing the same `config`, fixed at discovery |
| `currentElement`| `Element \| null`              | Re-resolved on every observed mutation (data-model "State Transitions" below); `null` means no element currently occupies this slot's `(config, groupPosition)` |
| `resolved`      | boolean                        | Set once an outcome (filled-and-rendered, or empty) is reached; once `true`, this Tracked Slot is dropped and no longer updated (FR-008) |

## Configuration Group (internal, derived — not persisted)

Not a stored entity — the grouping used to compute `groupPosition` and to re-resolve
`currentElement`. Computed fresh from the current set of matching elements each time it's needed:
all currently-discovered elements sharing an identical `config`, ordered by document position.
`groupPosition` indexes into this group.

## State Transitions

A Tracked Slot's `currentElement` can change any number of times before resolution; the Tracked
Slot itself moves through the same overall outcomes as feature 001's per-slot state machine, with
one addition (the *watching* state, replacing feature 001's single-shot discovery moment):

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
  filled [resolved] (rendered into currentElement, whichever element that
                      currently is — not necessarily the one seen at
                      discovery time)
```

Unlike feature 001, `currentElement` reassignment itself is not a state transition that produces
a visible outcome — it's bookkeeping that happens while the Tracked Slot is still in the
`requesting`/`checking-current-element` window. Once `resolved` becomes `true`, no further
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
