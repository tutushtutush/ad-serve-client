# Feature Specification: One batch per scan across categories

**Feature Branch**: `013-per-slot-category-in`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Per-slot category in batched requests, one batch per scan across categories. Now that ad-serve-api accepts a category on each placement in POST /ads/batch (its spec 031) and deduplicates across the whole batch, send each slot's own resolved category with its placement and group a scan's slots only by the details that are still shared (country and device type), so slots in different categories (EventPulse homepage sections) share one batch and are deduplicated against each other. Fall back exactly as today when a batch or an entry fails. Also give a batch a time limit that grows with its size, since the server resolves a deduplicated batch's slots one after another. Existing slot markup, page context, responsive ad types, infinite scroll, redisplay and tracking keep working unchanged. Framework-agnostic."

## Why this exists

Spec 012 batches the slots found by one scan, but only slots that share a category, because the batch call used to carry
one category. A page whose slots are in different categories (EventPulse's homepage: one ad at the end of each category
section) therefore made one request per category and each was decided alone, so an ad eligible in several categories
could appear in several sections. ad-serve-api now accepts a category on each placement and deduplicates across the
whole batch (its spec 031), so the SDK can send the whole scan in one batch.

## Relationship to spec 012

This feature changes spec 012's grouping rule (FR-002, Story 2): slots no longer have to share a category to share a
batch. Everything else in 012 is unchanged: results are applied to slots as single results are, a failed batch or
entry falls back to single requests, a group of one slot uses a single request, and claimed slots are never requested
again. It also resolves the batch time limit follow-up recorded in 012's research.

## User Scenarios & Testing *(mandatory)*

Users here are **publishers** embedding the ad loader; their visitors see fewer repeated ads.

### User Story 1 - Slots in different categories share one batch (Priority: P1)

A page has slots with different categories, found in one scan. The SDK sends them in one batch, each placement carrying
its own category, and asks for repeats to be avoided across the whole batch.

**Why this priority**: This is the point of the feature and the cross-category repeat fix.

**Independent Test**: With a music, a comedy and a sports slot in one scan, confirm one batch request whose placements
carry music, comedy and sports, and that each slot shows the ad returned for it.

**Acceptance Scenarios**:

1. **Given** slots with categories music, comedy and sports in one scan, **When** requests are made, **Then** there is
   one batch with three placements, each carrying its own category, with deduplication on.
2. **Given** the batch returns an ad for each, **When** results arrive, **Then** each slot shows the ad returned for its
   own placement, as a single result is shown today.
3. **Given** slots with no category of their own and a page-level category from page context, **When** requests are
   made, **Then** each placement carries the category that slot resolves to today.
4. **Given** a slot with no category at all, **When** it is batched, **Then** its placement carries none.

---

### User Story 2 - Shared details still split batches (Priority: P1)

Country and device type are still sent once per batch, so slots that differ in either go in separate batches.

**Why this priority**: Mixing them would target a slot with another slot's country or device.

**Independent Test**: Two slots in one scan, one for country US and one for CA, make two requests, each with its own
country.

**Acceptance Scenarios**:

1. **Given** slots that differ in country or device type, **When** requests are made, **Then** they are not in the same
   batch.
2. **Given** slots that share country and device type but differ in category and ad type, **When** requests are made,
   **Then** they share a batch.

---

### User Story 3 - Fallback and compatibility are unchanged (Priority: P1)

A failed batch, an unusable response or a failed entry falls back to single requests exactly as in spec 012. A batch
whose placements all resolve to the same category also carries that category once for the whole request, so a server
that does not read per-placement categories still targets it correctly.

**Why this priority**: Batching must never leave a slot worse off or targeted wrongly.

**Independent Test**: Make the batch fail; each slot makes its own request. Send a batch whose placements all share
one category; confirm the whole-request category is present too.

**Acceptance Scenarios**:

1. **Given** the batch call fails, **When** the SDK handles it, **Then** every slot makes its own single request.
2. **Given** one entry fails, **When** results arrive, **Then** only that slot makes its own single request.
3. **Given** every placement in a batch has the same category, **When** the batch is sent, **Then** that category is
   also sent for the whole request.
4. **Given** placements with different categories, **When** the batch is sent, **Then** no whole-request category is
   sent, only each placement's own.

---

### User Story 4 - Large batches get enough time (Priority: P2)

A batch's time limit grows with the number of placements, so a large batch is not abandoned just because the server
resolves its slots one after another.

**Why this priority**: Avoids a whole-batch timeout turning into many extra requests.

**Independent Test**: A batch of N placements is given a limit that grows with N up to a fixed ceiling; a single request
keeps its current limit.

**Acceptance Scenarios**:

1. **Given** a batch of two or more placements, **When** it is sent, **Then** its time limit is longer than a single
   request's and grows with the number of placements, up to a fixed maximum.
2. **Given** a single request, **When** it is sent, **Then** its time limit is unchanged.

---

### Edge Cases

- **Slot removed while the batch is in flight**: its result is dropped, as in spec 012.
- **More slots than one batch can carry**: split into several batches in discovery order; deduplication then applies
  within each batch.
- **A scan with one slot per category**: all in one batch; this is the main case and the one that benefits.
- **A scan with one slot in total**: a single request, as before.
- **Older server without per-placement categories**: placements with different categories would be requested without a
  category, so the SDK is released only after the server change is live (the server is deployed first, and the SDK is
  served by that same server).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Slots found by one scan MUST be grouped only by country and device type; slots in different categories
  MAY share a batch.
- **FR-002**: Each placement in a batch MUST carry the category its slot resolves to today (slot category, else page
  context), or none.
- **FR-003**: When every placement in a batch resolves to the same category, that category MUST also be sent for the
  whole request; otherwise no whole-request category is sent.
- **FR-004**: Deduplication MUST remain on for every batch.
- **FR-005**: Results, fallback, chunking, claimed-slot and single-slot behaviour from spec 012 MUST be unchanged.
- **FR-006**: A batch of two or more placements MUST use a time limit that grows with its size up to a fixed maximum; a
  single request's limit MUST NOT change.
- **FR-007**: Slot markup, page context, responsive ad types and the public commands MUST keep working unchanged.
- **FR-008**: The SDK MUST NOT throw to the host page for any batching failure and MUST leave no slot pending.
- **FR-009**: The SDK's contract documentation MUST describe the new grouping and the per-placement category.

### Key Entities

- **Scan batch**: the slots of one scan that share country and device type, requested together; may mix categories.
- **Placement category**: the category one slot resolves to, sent with its placement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scan whose slots are all in different categories makes one batch request (up to the batch limit), not one
  per category.
- **SC-002**: With enough eligible ads, an ad eligible in several of a page's categories appears in at most one of its
  slots in 100% of loads.
- **SC-003**: 0 batches send a placement with a category other than the one its slot resolves to.
- **SC-004**: When a batch fails, 100% of its slots are still requested individually, with no error reaching the host.
- **SC-005**: All existing SDK scenarios (including spec 012's, adjusted for the new grouping) pass.
- **SC-006**: A batch of ten placements is not abandoned by the SDK before the single-request limit plus the growth
  allowance has passed.

## Assumptions

- ad-serve-api accepts a category on each placement and deduplicates across the batch (its spec 031), and that server
  version is live before this SDK is released.
- Country and device type stay request-level; only the category varies per placement.
- Deduplication keeps the server default fallback (repeat rather than leave a slot empty).
- Out of scope: any change to ad-serve-api or EventPulse, frequency caps, and a smarter resolution order for
  deduplication.
