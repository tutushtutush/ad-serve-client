# Data Model: Pass audience labels

No stored data. One in-memory value in the orchestrator.

## Page audience labels

| Property | Rule |
|---|---|
| Type | `string[]`, empty by default |
| Set by | `setAudience(list)`; replaced as a whole |
| Cleared by | `setAudience(null)` or `setAudience([])` |
| Form | each entry trimmed, lowercased, `^[a-z0-9][a-z0-9_:.-]*$`, 1 to 40 characters; repeats removed (first wins); at most 20 |
| Refused (nothing changes, one warning) | not a list or null; no argument or several; a list with entries but none usable |
| Lifetime | the page view; never written anywhere; lost on reload |
| Read | when each request is built |

## Request shapes (changed)

| Type | Field | Notes |
|---|---|---|
| `AdDecisionRequest` | `audience?: string[]` | present only when labels are set |
| `BatchSharedFields` | `audience?: string[]` | present only when labels are set |

Slot configuration (`AdSlotConfig`, `SlotDeclaration`) and the group key are unchanged.
