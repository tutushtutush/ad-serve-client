# Feature Specification: Batched ad requests with same-page deduplication

**Feature Branch**: `012-batch-ad-requests`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Batch ad requests per scan. When the SDK finds several ad slots in one scan or refresh, request their ads together in one batch call to ad-serve-api's POST /ads/batch with same-page deduplication turned on, so slots on one page do not all get the same ad. Slots that share the same viewer details and category go in one batch; slots with different categories go in separate batches because the batch call carries one category. Each result is applied to its slot exactly as a single-slot result is today. If the batch call fails or is unavailable, fall back to today's one-request-per-slot behaviour so no slot is left worse off. Existing slot markup, page context, responsive ad types, infinite scroll, redisplay and tracking keep working unchanged. Framework-agnostic." Motivation: EventPulse shows one ad after every third event card and every slot got the same ad (see ad-serve-api spec 030, PR #43).

## Why this exists

Today the SDK sends one ad request per slot, and each is decided on its own, so when several ads are eligible
the same one can win every slot on a page. ad-serve-api can now spread ads across the slots of one batch
request (opt-in same-page deduplication, ad-serve-api spec 030), but it can only do that for requests it sees
together. The SDK is the only place that knows which slots belong to the same page view, so it has to send them
together.

## User Scenarios & Testing *(mandatory)*

Users here are **publishers** embedding the ad loader. Their visitors benefit indirectly: fewer repeated ads on a page.

### User Story 1 - Slots on one page get different ads (Priority: P1)

A publisher's page has several slots that ask for the same kind of ad and the same category. When the SDK scans
the page, it requests all of those slots' ads in one call and asks for repeats to be avoided, so each slot gets a
different ad whenever enough ads are eligible.

**Why this priority**: This is the whole feature and the visible fix for repeated ads.

**Independent Test**: On a page with three slots of the same type and category and three eligible ads, load the
page; confirm one batch request goes out for the three slots and three different ads are shown.

**Acceptance Scenarios**:

1. **Given** a page with three slots of the same ad type and category found in one scan, **When** the SDK
   requests their ads, **Then** it makes one batch request listing all three, with deduplication on.
2. **Given** the batch returns a different ad for each slot, **When** the results arrive, **Then** each slot
   shows the ad returned for it, in the same way a single-slot result is shown today.
3. **Given** the batch reports no ad for one slot, **When** results arrive, **Then** that slot stays empty
   exactly as an empty single-slot result does today and the others still show their ads.
4. **Given** a page with exactly one slot in a scan, **When** the SDK requests its ad, **Then** the visitor
   sees the same result as before this feature (a batch of one or a single request are equivalent for them).

---

### User Story 2 - Slots with different details are batched separately (Priority: P1)

Some slots on a page declare different categories (for example the music and comedy sections of an events page).
The batch call can only carry one category, so slots that differ in category (or viewer details) are requested
in separate batches, each batch with deduplication on.

**Why this priority**: Without this, one batch could attach a slot to the wrong category, which is a targeting
bug, not just a missed optimisation.

**Independent Test**: On a page with two music slots and two comedy slots in one scan, confirm two batch
requests, one per category, each carrying only its own category and its own slots.

**Acceptance Scenarios**:

1. **Given** slots with category music and slots with category comedy in one scan, **When** requests are made,
   **Then** there is one batch per category and no batch mixes categories.
2. **Given** slots with no category of their own and a page-level category set by page context, **When**
   requests are made, **Then** slots are grouped by the category each one actually resolves to, as for single
   requests today.
3. **Given** slots that resolve to the same category, **When** requests are made, **Then** they share a batch
   even if they are different ad types.

---

### User Story 3 - A failed batch never leaves slots worse off (Priority: P1)

If the batch call cannot be made or fails (network error, timeout, server error, or an unusable response), each
slot in that batch falls back to requesting its own ad the way it does today, so a page never has fewer ads
because of batching.

**Why this priority**: Batching must be a pure improvement. The ad system must never break or empty a page.

**Independent Test**: Make the batch endpoint fail; confirm each slot then makes its own single request and
shows its own ad.

**Acceptance Scenarios**:

1. **Given** the batch request fails, **When** the SDK handles the failure, **Then** each slot in it makes
   its own single request and is filled or left empty exactly as today.
2. **Given** the batch request succeeds but one slot's entry is an error or invalid, **When** results arrive,
   **Then** only that slot falls back to its own single request; the other slots keep their batch results.
3. **Given** a failure, **When** the host page is observed, **Then** nothing is thrown to the host page and no
   slot is left in a pending state.

---

### User Story 4 - Everything else keeps working (Priority: P2)

Slot markup, page-level category context, responsive ad types, infinite-scroll and refresh calls, redisplay
and viewability tracking, click and impression reporting all behave as before. Slots added later (client-side
navigation, infinite scroll) are requested in their own batch for that scan.

**Why this priority**: The feature must not regress the existing, relied-on behaviour.

**Independent Test**: Run the existing behaviour scenarios; confirm they pass unchanged, and confirm a later
refresh with new slots makes its own batch while already-claimed slots are never requested again.

**Acceptance Scenarios**:

1. **Given** slots already filled by an earlier scan, **When** a later refresh finds new slots, **Then** only
   the new slots are requested, in a batch of their own, and the old ones are untouched.
2. **Given** responsive ad types, **When** a batch is built, **Then** each slot lists the ad type chosen for
   its width at request time, once per slot.
3. **Given** a rendered ad, **When** it is viewed or clicked, **Then** the impression and click reports carry
   the same identifiers they do today for a single-slot result.

---

### Edge Cases

- **Slot removed while the batch is in flight**: its result is dropped, as a single-slot result is today when its
  element has been removed.
- **Slot with no resolvable ad type at the current width**: it takes part in no batch, as today.
- **More slots than the batch limit**: a scan with more slots than one batch can carry is split into several
  batches, in order; deduplication then applies within each batch only.
- **Different viewer details across slots** (country or device type): they are split into separate batches by
  the same grouping rule as category.
- **Batch response with the wrong number or order of entries**: treated as unusable; every slot in that batch
  falls back to its own single request.
- **A slot that already has an ad type chosen for its width**: the choice is made once, when the batch is built,
  and not changed afterwards.
- **Server that does not support deduplication or the batch endpoint**: treated as a failed batch and falls back
  per slot.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When one scan or refresh finds several slots needing ads, the SDK MUST request their ads together
  in batch calls instead of one call per slot, with same-page deduplication turned on.
- **FR-002**: Slots MUST be grouped so that every slot in a batch resolves to the same category, country and
  device type; slots that differ in any of these MUST NOT share a batch.
- **FR-003**: The category sent for a batch MUST be the category each of its slots resolves to today (slot
  category, else page context), so targeting is unchanged.
- **FR-004**: Each batch result MUST be applied to its slot exactly as a single-slot result is applied today
  (rendering, tracking, redisplay, viewability, impression and click reporting).
- **FR-005**: If a batch call fails, or its response cannot be matched to its slots, every slot in it MUST fall
  back to its own single request. If one entry is an error or invalid, only that slot falls back.
- **FR-006**: A "no ad" result for a slot MUST leave that slot empty as it does today and MUST NOT trigger a
  fallback request.
- **FR-007**: A scan with more slots than one batch can carry MUST be split into as many batches as needed,
  preserving the order slots were found in.
- **FR-008**: Slots already claimed by an earlier scan MUST NOT be requested again; slots found by a later scan
  MUST be requested in their own batch.
- **FR-009**: Slot markup, page-level context, responsive ad types and the public commands MUST keep working
  with no change for publishers.
- **FR-010**: The SDK MUST NOT throw to the host page for any batching failure and MUST leave no slot pending.
- **FR-011**: The SDK MUST send the same session identifier on a batch as it sends on single requests today.
- **FR-012**: The SDK documentation and its contract notes MUST describe the batching, the grouping rule and
  the fallback.

### Key Entities

- **Scan batch**: the slots found in one scan or refresh that share a category, country and device type,
  requested together.
- **Batch entry**: one slot's ad type within a batch, with its result (ad, no ad, or a failure that falls back).
- **Single-request fallback**: today's one-request-per-slot path, used when a batch or entry fails.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a page with N slots of one type and category found in one scan and at least N eligible ads,
  100% of loads show N different ads.
- **SC-002**: A scan of N slots with the same category makes one batch request (for N up to the batch limit)
  instead of N requests.
- **SC-003**: When the batch call fails, 100% of slots are still requested individually and filled or left
  empty as before, with no error reaching the host page.
- **SC-004**: Slots with different categories never share a batch: 0 requests carry a category that differs
  from any of their slots' own.
- **SC-005**: All existing SDK behaviour scenarios (page context, responsive types, infinite scroll, redisplay,
  tracking) pass unchanged.
- **SC-006**: A visitor sees their first ad no later than before this feature on a page with one slot, and no
  more than a short, bounded delay longer on a page with several slots.

## Assumptions

- ad-serve-api's batch endpoint with opt-in deduplication (ad-serve-api spec 030, PR #43) is deployed before
  this ships. Until then a batch fails and every slot falls back to a single request, so shipping early is
  safe but has no benefit.
- The batch call carries one category, country and device type for the whole request, so grouping by those is
  required and deduplication only happens within a batch. A page whose slots span several categories gets
  different ads within each category, but the same ad can still appear across categories. Closing that gap
  needs per-placement category on the server and is separate future work.
- Deduplication uses the server's default fallback (repeat an ad when none is left unused), so no slot is
  left empty because of it.
- Each scan or refresh is one page view for deduplication purposes; slots added by a later scan are
  deduplicated among themselves but not against earlier ones.
- Out of scope: frequency caps across batches or sessions, any change to ad-serve-api, any change to EventPulse,
  and per-slot control over deduplication.
