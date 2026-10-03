# Data Model: Page-level ad category context

## PageCategoryContext

The Orchestrator's single in-memory value.

| Field | Type | Rules |
|---|---|---|
| categories | list of non-empty strings | 0–10 entries; trimmed; unique case-insensitively (first casing kept) |

- Initial state: empty list.
- Replaced wholesale by each valid `setContext`; never merged.
- Empty list means "no page-level category".

### State transitions

| Event | Result |
|---|---|
| `setContext({categories: [...]})` | context = normalized list |
| `setContext({})` or `{categories: []}` | context = empty |
| `setContext` with non-object payload, or `categories` not an array | ignored; context unchanged |
| entry in the list is not a string, or is blank | that entry dropped; the rest kept |

## Effective category (per request)

`slot.config.category` if present and non-empty; otherwise the context joined with `,`; otherwise
the request carries no category. Computed when the request is built, not stored on the slot.

## QueuedCommand

`[name: string, payload?: unknown]`. Recognized name: `"setContext"`. Other names and non-array,
non-function entries are ignored. Existing zero-argument callbacks are unchanged.
