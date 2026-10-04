# Data Model: One batch per scan across categories

No persistent data.

- **Batch group** (internal): slots of one scan sharing country and device type, in discovery order, chunked to 50.
- **Placement request**: `AdDecisionRequest` per slot, now always carrying the slot's resolved category (or none).
- **Shared fields**: country, device type, session id, and a category only when all placements share it.
- Wire shapes: see [contracts/batch-request.md](contracts/batch-request.md).
