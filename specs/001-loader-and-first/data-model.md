# Phase 1 Data Model: Ad Slot Request & Render Flow

None of these shapes are persisted — everything here exists only for the duration of a single
page load, held in memory by the Orchestrator/Client/Renderer.

## AdSlotConfig (parsed from the DOM, not persisted)

Read from a slot element's `data-*` attributes by the Orchestrator. Field names deliberately
mirror ad-serve-api's `GET /ads` query parameters (research.md) rather than inventing a second
vocabulary.

| Field           | Source attribute      | Required | Notes                                             |
|-----------------|------------------------|----------|-----------------------------------------------------|
| `platformId`    | `data-platform-id`     | yes      | Must be present and non-empty, or the slot's config is invalid (FR-005) |
| `adTypeId`      | `data-ad-type-id`      | yes      | Must be present and non-empty, or the slot's config is invalid (FR-005) |
| `country`       | `data-country`         | no       | Passed through opaquely to ad-serve-api            |
| `deviceType`    | `data-device-type`     | no       | Passed through opaquely to ad-serve-api            |
| `element`       | (the slot element itself) | yes  | Reference used to check `isConnected` (FR-009) and to receive the rendered iframe |

Validation rule: a slot missing `platformId` or `adTypeId` is invalid and MUST NOT produce a
network request at all (FR-005's "invalid configuration" case) — it resolves straight to the
empty-slot outcome without involving the Client.

## AdDecisionRequest (outbound, not persisted)

The exact query parameters sent to ad-serve-api's `GET /ads`, built one-to-one from a validated
`AdSlotConfig`.

| Field        | Type   | Required |
|--------------|--------|----------|
| `platformId` | string | yes      |
| `adTypeId`   | string | yes      |
| `country`    | string | no       |
| `deviceType` | string | no       |

## AdDecisionResult (internal — normalized Client output, not persisted)

Every outcome from a single slot's request/response cycle, collapsed to one of two cases per
research.md's "treat every non-success identically" decision:

- **Filled**: `{ status: "filled", ad: { creative: AdCreative, width: number, height: number } }`
  — ad-serve-api returned a winning ad.
- **Empty**: `{ status: "empty" }` — covers ad-serve-api's `{ ad: null }` response, its `404`/`400`
  responses, a network error, a timeout (FR-008), and an unparseable response body. The
  Orchestrator and Renderer treat all of these identically (FR-005).

## AdCreative (opaque payload, not persisted)

Passed through unmodified from ad-serve-api's response (its own data-model.md documents this
shape authoritatively); the Renderer reads these fields to build the iframe's markup and MUST
escape every text field before interpolating it (research.md's sandboxed-iframe decision).

| Field                    | Type           |
|---------------------------|----------------|
| `backgroundImageDataUrl`  | string \| null |
| `logoImageDataUrl`        | string \| null |
| `logoBackgroundEnabled`   | boolean        |
| `logoBackgroundColor`     | string         |
| `headline`                | string         |
| `ctaText`                 | string         |
| `linkUrl`                 | string         |
| `altText`                 | string         |
| `headlineTextColor`       | string         |
| `headlineFontFamily`      | string         |
| `ctaTextColor`            | string         |
| `ctaFontFamily`           | string         |
| `ctaBackgroundColor`      | string         |

## State Transitions

Each slot moves through a strictly linear, one-way sequence per page load — it never re-enters an
earlier state:

```text
discovered → (invalid config) ──────────────► empty
     │
     ▼ (valid config)
  requesting → (timeout / error / no match / malformed response) ─► empty
     │
     ▼ (ad returned)
  checking-still-present → (element no longer in page, FR-009) ──► empty (discarded, not rendered)
     │
     ▼ (still present)
  filled
```

No slot is retried and no slot transitions back to `requesting` — one pass per slot per page
load, consistent with FR-002's "as soon as the page loads" and the Assumptions' "no fallback ad
source" scope boundary.

## Relationships

```text
AdSlotConfig (1) ──produces──► AdDecisionRequest (1) ──sent to ad-serve-api──► AdDecisionResult (1)
                                                                                      │
                                                                     (Filled only) ◄──┘
                                                                          │
                                                                          ▼
                                                                     AdCreative (1)
```

Each slot on a page owns exactly one `AdSlotConfig` → `AdDecisionRequest` → `AdDecisionResult`
chain; chains for different slots never share or block on each other (FR-006/FR-007).
