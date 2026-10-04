# Data Model: Responsive ad types per breakpoint

## ResponsiveTypeList

Parsed from a slot's `data-ad-types` attribute.

| Field | Type | Rules |
|---|---|---|
| entries | list of (minWidth, adTypeId) | each minWidth a whole number ≥ 0; each adTypeId non-blank, trimmed |

- Malformed entries (non-numeric or negative width, blank type, no colon) are dropped; the rest are kept.
- Duplicate minimum widths are both kept; the first listed wins when picking.

## Resolved ad type

One string per slot, decided once at discovery and frozen on the tracked slot.

| Condition at discovery | Result |
|---|---|
| list has an entry with minWidth ≤ viewport width | the entry with the largest such minWidth (first listed on ties) |
| list yields nothing, `data-ad-type-id` present | `data-ad-type-id` |
| neither yields a type | slot invalid: not tracked, no request |
| `data-ad-types` absent | `data-ad-type-id` (unchanged behavior) |

The viewport width comes from the injected `getViewportWidth()`; 0 when omitted or unreadable.

## Slot identity key

`[platformId, rawAdTypeId, rawAdTypes, country, deviceType, category]` using the raw attribute text
(null when absent). Independent of screen width, so it stays stable across resizes. The resolved type is not
part of it.

## State

No state changes after discovery: the resolved type never changes for the life of the slot.
