# Data Model: Viewer identifier for frequency caps

## State (in the orchestrator, per page)

| Field | Type | Meaning |
|---|---|---|
| `platformViewerId` | string, undefined | The UUID the platform passed to `setViewerId`; memory only. |
| `viewerIdWithdrawn` | boolean | Set by a withdrawal; stops the opt-in creating a stored identifier again until the next page load. |
| `storedViewerId` | string, undefined, "unavailable" | The identifier read or created from the store on first use, cached; "unavailable" when storage failed (not retried each request). |

**Current identifier** (read when each request is built): `platformViewerId`, else `undefined` if withdrawn or no store was supplied, else `storedViewerId` (resolved lazily).

## Dependency (injected into the orchestrator)

```text
ViewerIdStoreLike = { getOrCreate(): string | undefined; remove(): void }
```

Built by `index.ts` only when `data-viewer-id-storage="local"` is present; absent otherwise. Never throws.

## Local storage (opt-in only)

| Key | Value |
|---|---|
| `adServeViewerId` | a random UUID created by this SDK; removed on withdrawal. |

Nothing else is written. Session storage keeps `adServeSessionId` as before (feature 008).

## Request fields

```text
AdDecisionRequest.viewerId?: string      -> GET /ads?...&viewerId=<uuid>
BatchSharedFields.viewerId?: string      -> POST /ads/batch body { ..., "viewerId": "<uuid>" }
```

Present only when an identifier is in effect.

## Validation

A UUID is `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` in either case. `null` and `""` mean withdraw. Anything else (number, object, array, other string) is refused with one warning and leaves the current state unchanged.
