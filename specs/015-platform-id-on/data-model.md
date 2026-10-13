# Data Model: Platform id on the loader script tag

- **Platform id** (page-level, string): value of `data-platform-id` on the loader `<script>` tag, captured once at load and trimmed by the orchestrator. Empty or blank means missing. Not validated; sent unchanged as `platformId` on every request.
- **Orchestrator dependencies (added)**: `platformId?: string` (absent or blank means missing) and `warn?: (message: string) => void` (called once with the warning text when the id is missing; absent means no logging).
- **Slot declaration (changed)**: no `platformId` field. Valid when it has a `data-ad-type-id` or a usable `data-ad-types` entry. Slot group key no longer includes the platform id.
- **AdSlotConfig / AdDecisionRequest (unchanged)**: still carry `platformId`, filled from the page-level value, so the wire request is identical.

## State

`missing-id` (set at construction): every `run()` warns on the first call only and returns; no slot is discovered, claimed or requested.
