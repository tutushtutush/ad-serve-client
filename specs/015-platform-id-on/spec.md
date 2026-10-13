# Feature Specification: Platform id on the loader script tag

**Feature Branch**: `015-platform-id-on`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Platform id on the loader script tag. Today every ad slot carries data-platform-id and a slot without one is silently skipped. Make the platform id a single attribute on the loader's own <script> tag, read synchronously at load time through document.currentScript the same way data-api-base-url is. Slots then carry only data-ad-type-id (or data-ad-types). The slot-level data-platform-id is removed, with no backward compatibility, because we are still in dev and test. If the script tag has no platform id, the loader logs a clear console warning naming the problem and serves nothing, instead of skipping slots silently. Update the slot-markup contract and the README. The API request shape is unchanged: platformId is still sent on every request. Out of scope: adconfig's embed snippet and copy UI (a follow-up spec in adconfig, which must land only after this is deployed), and mixed-platform pages."

## Why this exists

A publisher's page belongs to one platform, yet today the platform id is repeated on every ad slot. That is noisy to paste, easy to get wrong on one slot of many, and when it is missing the slot is skipped with no sign of why, so the publisher sees an empty page and nothing to debug. The platform id is a property of the page's integration, like the API address, so it belongs once on the loader's own script tag. A missing id then becomes one clear, visible message instead of many silent skips.

## User Scenarios & Testing *(mandatory)*

Users here are **publishers** embedding the loader and marking slots on their pages.

### User Story 1 - Set the platform once on the loader tag (Priority: P1)

A publisher puts the platform id once on the loader's script tag. Every slot on the page then needs only its ad type (`data-ad-type-id`, or `data-ad-types` for responsive slots) and is served for that platform.

**Why this priority**: This is the feature; everything else supports it.

**Independent Test**: Load a page whose loader tag carries a platform id and whose slots carry only an ad type; check every slot is requested with that platform id and filled as before.

**Acceptance Scenarios**:

1. **Given** a loader tag with a platform id and slots carrying only `data-ad-type-id`, **When** the page loads, **Then** every slot is requested and filled, and each request carries the tag's platform id.
2. **Given** responsive slots carrying only `data-ad-types`, **When** the page loads, **Then** they are served as before, with the tag's platform id on each request.
3. **Given** a slot added to the page after load and picked up by a later scan, **When** it is served, **Then** it too uses the tag's platform id.

---

### User Story 2 - A missing platform id is loudly reported (Priority: P1)

A publisher who forgets the platform id on the loader tag (or leaves it empty) sees one clear console warning that names the problem, and no ads are requested.

**Why this priority**: Replaces silent failure with something a publisher can act on in seconds.

**Independent Test**: Load a page with the loader tag lacking the attribute (and again with it empty or blank); check one warning naming the missing platform id on the script tag is logged, no ad request is made, and the page is otherwise untouched.

**Acceptance Scenarios**:

1. **Given** a loader tag with no platform id, **When** the page loads, **Then** a console warning states that the platform id is missing from the loader script tag and which attribute to add, and no ad request is sent.
2. **Given** a loader tag whose platform id is empty or only whitespace, **When** the page loads, **Then** it is treated as missing, with the same warning and no requests.
3. **Given** a missing platform id, **When** the page has many slots or later rescans, **Then** the warning is not repeated per slot and the slots are left as empty elements, with no error reaching the page.

---

### User Story 3 - The slot-level platform id is gone (Priority: P2)

The per-slot `data-platform-id` attribute no longer has any effect. The slot-markup documentation and the embed documentation show only the script-tag form.

**Why this priority**: One way to do it avoids two sources of truth; compatibility is deliberately not kept because the product is still in dev and test.

**Independent Test**: Load a page where the loader tag has platform A and a slot still carries `data-platform-id` of B; check the request uses A and B is ignored. Check no documentation shows the slot-level attribute.

**Acceptance Scenarios**:

1. **Given** a slot that still carries `data-platform-id` and a loader tag with no platform id, **When** the page loads, **Then** nothing is served and the missing-platform warning appears (the slot attribute is not a fallback).
2. **Given** both are present and differ, **When** the slot is served, **Then** the tag's value is used.
3. **Given** the slot-markup contract and README, **When** read, **Then** they describe the platform id only on the loader script tag and list no slot-level platform attribute.

### Edge Cases

- The id is read once when the loader first runs; later changes to the tag's attribute do not affect an already-running loader.
- A slot missing its ad type is still skipped as today; only the platform id requirement moves.
- The id is passed to the API unchanged and never validated by the SDK (the server decides whether the platform exists).
- Pages mixing slots of several platforms are not supported by this feature: a page has one platform.
- If the loader cannot identify its own script tag when it starts, it behaves as having no platform id: the same warning and nothing served.
- Page-level categories, batching, responsive types, tracking and rendering are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform id MUST be a single attribute on the loader's own script tag, read once, synchronously, when the loader starts, the same way the API address is.
- **FR-002**: Slots MUST require only an ad type (`data-ad-type-id` or `data-ad-types`); a slot MUST NOT need or accept a platform id of its own.
- **FR-003**: Every ad request, including batched, responsive and rescanned ones, MUST carry the script tag's platform id as it does today; the request shape sent to the API MUST NOT change.
- **FR-004**: A slot-level `data-platform-id` MUST have no effect: it is not read, not a fallback, and does not override the tag's value. No backward compatibility is provided.
- **FR-005**: When the script tag has no platform id, or an empty or whitespace-only one, the loader MUST log a console warning that names the missing platform id on the loader script tag and the attribute to add, and MUST serve nothing (no ad requests).
- **FR-006**: The missing-platform warning MUST be logged once per page load, not once per slot or scan.
- **FR-007**: A missing platform id MUST NOT throw into the page, alter slot elements, or affect other page scripts.
- **FR-008**: The slot-markup contract and the README (embed documentation) MUST be updated to show the platform id on the script tag, show slots without it, and describe the missing-id warning.

### Key Entities

- **Platform id**: Identifies the publisher's platform to the API. One per page, supplied on the loader script tag.
- **Loader script tag**: The tag that loads the SDK. Already carries the API address; now also carries the platform id.
- **Slot declaration**: An element marked for ads. Now carries only an ad type (single or responsive list) plus its optional targeting attributes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A publisher can embed the loader and any number of slots while stating the platform id exactly once per page.
- **SC-002**: With the id on the script tag, 100% of requests carry that id and look identical to those sent today.
- **SC-003**: With the id absent, empty or blank, zero ad requests are sent and exactly one warning naming the cause appears per page load.
- **SC-004**: A slot-level `data-platform-id` changes no request in any tested case.
- **SC-005**: No documentation in the repo's current contract or README shows a slot carrying a platform id.

## Assumptions

- This is a breaking change by design (dev and test only); there are no live publishers to migrate.
- The attribute on the script tag is named `data-platform-id`, matching the existing `data-api-base-url` convention; the name is confirmed during planning.
- The repo has no README file today; the embed documentation lives in the slot-markup contract and feature quickstarts. "README" is taken to mean the publisher-facing embed documentation, and planning decides whether to add a README or update the quickstarts that show slot markup. Earlier specs are historical records and are not rewritten.
- Out of scope: adconfig's embed snippet and copy UI (a follow-up adconfig spec that MUST land only after this is deployed, so snippets never emit a tag this loader cannot read), and mixed-platform pages.
- The request shape to the API, response handling, rendering and tracking are unchanged.
