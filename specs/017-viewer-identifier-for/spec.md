# Feature Specification: Viewer identifier for frequency caps

**Feature Branch**: `017-viewer-identifier-for`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Viewer identifier for frequency caps in ad-serve-client (companion to adconfig spec 089 and ad-serve-api spec 051). ad-serve-api now enforces a per-viewer frequency cap for requests that carry an optional `viewerId` (a UUID that outlives the browser tab, unlike the per-tab `sessionId`), on both GET /ads and POST /ads/batch. This SDK must send one, under the platform's control because a persistent identifier can need visitor consent. Decided with the owner: off by default (nothing sent, nothing stored); the platform supplies its own opaque UUID through `adServe.setViewerId(id)` (also queueable before the SDK loads), or opts in with a loader attribute so the SDK creates and keeps a random UUID in localStorage. Withdrawing consent must stop the sending and remove any stored identifier."

## Why this exists

Advertisers can cap how often one viewer sees a campaign (adconfig), and the serving API enforces it (ad-serve-api), but only for requests that say who the viewer is. Today this SDK sends only a `sessionId`, which it keeps in the browser's per-tab session storage, so it starts over whenever the tab closes: a "3 per day" cap counted against it would really be "3 per visit". A cap per viewer needs an identifier that outlives the tab.

A persistent identifier on a visitor's device can fall under privacy and consent rules (for example ePrivacy and GDPR), and this SDK does not know whether a given visitor has consented. So the SDK sends nothing and stores nothing unless the platform that embeds it says so, and the platform can take that back at any time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The platform supplies its own viewer identifier (Priority: P1)

A platform that already has a stable, opaque identifier for its visitors (and the consent to use it for ads) hands it to the SDK. From then on every ad request the SDK makes carries it, so ad-serve-api can cap how often that viewer sees a campaign across visits, tabs and days.

**Why this priority**: It is the smallest complete way to make caps work, it puts the consent decision with the platform, and it needs no storage in the SDK.

**Independent Test**: Call `window.adServe.setViewerId("<uuid>")` on a page with two ad slots and confirm that the single request or the one batch request goes out with that identifier; reload the page, call it again, and confirm the same identifier goes out.

**Acceptance Scenarios**:

1. **Given** a platform that calls `adServe.setViewerId(id)` with a UUID, **When** the SDK requests an ad for a single slot, **Then** the request carries the identifier.
2. **Given** the same call and a page with several slots served by one batch request, **When** the batch is sent, **Then** it carries the identifier once, for the whole batch.
3. **Given** the call was queued on `window.adServe.q` before the SDK finished loading (`["setViewerId", id]`), **When** the SDK starts, **Then** it is applied before the first ad requests go out.
4. **Given** the call is made after the first ads were requested, **When** a later request is made (a refresh, or a slot added afterwards), **Then** that request carries the identifier; requests already sent are not repeated.
5. **Given** a value that is not a UUID, **When** it is passed to `setViewerId`, **Then** nothing is sent or stored for it and one console warning explains that a UUID is required.
6. **Given** a second call with a different UUID, **When** the next request is made, **Then** it carries the new identifier.

---

### User Story 2 - The platform lets the SDK keep its own random identifier (Priority: P2)

A platform that has no identifier of its own, but has the visitor's consent to keep one on their device, turns this on with an attribute on the loader's script tag. The SDK creates a random UUID once, keeps it in the browser's local storage, and sends it with every ad request, on this and later visits.

**Why this priority**: It makes caps work for platforms with no identifier of their own, but it stores something on the visitor's device, so it is opt-in and comes after the platform-supplied path.

**Independent Test**: Load a page with the opt-in attribute and confirm one UUID is created, stored and sent; reload and open a second tab, and confirm the same UUID is sent both times.

**Acceptance Scenarios**:

1. **Given** the opt-in attribute on the loader tag and no stored identifier, **When** the SDK starts, **Then** it creates a random UUID, keeps it in local storage, and sends it with ad requests.
2. **Given** a stored identifier, **When** the page is reloaded or opened in another tab, **Then** the same identifier is sent.
3. **Given** the attribute is absent (or has any other value), **When** the SDK starts, **Then** it neither creates, reads nor writes a stored identifier.
4. **Given** local storage is unavailable or blocked (private browsing, a sandboxed frame, a failing read or write), **When** the SDK starts, **Then** no identifier is sent, the page and ads work as they do today, and nothing breaks.
5. **Given** both the platform's own identifier and the opt-in attribute, **When** requests are made, **Then** the platform's identifier is the one sent, and the stored one is neither used nor changed.

---

### User Story 3 - The platform can withdraw the identifier (Priority: P2)

When a visitor withdraws consent (or the platform decides to stop), one call stops the SDK sending any identifier and removes the one it stored, so no cap can follow that visitor afterwards.

**Why this priority**: Without a way to take it back, the opt-in would not be usable under consent rules.

**Independent Test**: With an identifier in use, call `adServe.setViewerId(null)`; confirm the next request carries none and the stored value is gone from local storage.

**Acceptance Scenarios**:

1. **Given** an identifier is being sent, **When** the platform calls `adServe.setViewerId(null)` (or an empty string), **Then** later requests carry no identifier.
2. **Given** the SDK had stored an identifier, **When** the platform withdraws it as above, **Then** the stored value is removed from local storage.
3. **Given** the opt-in attribute is still on the tag, **When** the platform has withdrawn the identifier, **Then** the SDK does not create a new one again during that page's life; the next page load starts from the platform's choice again.
4. **Given** withdrawal queued as `["setViewerId", null]` before the SDK loaded, **When** the SDK starts, **Then** it behaves as a withdrawal.

---

### User Story 4 - Without opt-in, nothing changes (Priority: P1)

A platform that does nothing new sees no difference: no identifier is created, stored or sent, requests are byte-for-byte what they were, and no new storage entry appears.

**Why this priority**: Existing platforms must not start storing or sending a persistent identifier because they updated the SDK.

**Independent Test**: Run the existing test suite and one page load with no attribute and no call; compare the requests and the browser's storage with those of the previous version.

**Acceptance Scenarios**:

1. **Given** no attribute and no `setViewerId` call, **When** ads are requested, **Then** no request carries a viewer identifier.
2. **Given** the same, **When** the page has loaded, **Then** local storage holds no entry made by this SDK for it (session storage keeps its session identifier as before).
3. **Given** the existing behavior of `sessionId`, click and viewable-impression reports, **When** this feature ships, **Then** they behave exactly as before.

## Edge Cases

- The identifier is only sent with ad requests, single and batch. It is not added to click or viewable-impression reports; ad-serve-api does not take it there.
- An identifier set by the platform is held for the page's life only and is never written to storage by the SDK; the platform is responsible for supplying it again on each page.
- Two SDK copies on one page would share one storage entry; each reads the same value.
- A stored value that is not a UUID (edited by hand, or left by something else) is ignored and replaced when the opt-in is on.
- The identifier never appears in the page's markup or in anything the SDK renders.
- A host page calling `setViewerId` with an extra argument, a number, an object or an array is treated as an invalid value (warning, nothing changes), never an error thrown into the host page.
- The identifier is the visitor's, not the ad's: ads served on a page, their tracking URLs and the click redirect carry no part of it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: With no platform call and no opt-in attribute, the SDK MUST NOT create, read, write or send any viewer identifier, and MUST NOT add any local-storage entry.
- **FR-002**: The SDK MUST expose `window.adServe.setViewerId(value)`, and accept the same call as a queued entry `["setViewerId", value]`, applied before the first ad requests when queued before the SDK loads.
- **FR-003**: A `value` that is a valid UUID MUST become the viewer identifier sent with every ad request made afterwards, replacing any earlier one; the SDK MUST NOT store a platform-supplied identifier.
- **FR-004**: A `value` of `null` or an empty string MUST withdraw the identifier: later requests carry none, and an identifier the SDK stored MUST be removed from local storage.
- **FR-005**: Any other `value` MUST be ignored with one console warning naming the requirement, MUST leave the current identifier unchanged, and MUST NOT throw into the host page.
- **FR-006**: An opt-in attribute on the loader's script tag MUST make the SDK create a random UUID once, keep it in local storage under one key, and reuse it on later page loads and in other tabs, when no platform identifier has been set.
- **FR-007**: A platform-supplied identifier MUST take precedence over a stored one, and a withdrawal MUST stop the SDK from creating a new stored one for the rest of that page's life.
- **FR-008**: An unavailable, blocked or failing local storage, or an unavailable random-UUID source, MUST result in no identifier being sent and no other change in behavior; it MUST NOT raise an error or a warning on every request.
- **FR-009**: The identifier MUST be sent as the `viewerId` query parameter on a single ad request and as the `viewerId` field of the body on a batch request (once per batch), and only when one is in effect.
- **FR-010**: Click and viewable-impression reports, tracking URLs, `sessionId`, and every other request field MUST be unchanged.
- **FR-011**: Every new entry point (`setViewerId`, the queued form, the attribute reading, the storage access) MUST be fail-silent: no exception reaches the host page (Constitution Principle V).
- **FR-012**: The README MUST document the attribute, the call, withdrawal, that the platform decides when the identifier may be created or sent, that the identifier must be a UUID, and that ad-serve-api caps only requests that carry one.
- **FR-013**: The SDK's version MUST be raised for the new capability and the built bundle MUST include it.

### Key Entities

- **Viewer identifier**: an opaque UUID that distinguishes one viewer across visits; supplied by the platform or created and kept by the SDK on opt-in; sent only with ad requests; never rendered.
- **Opt-in**: the loader-tag attribute that lets the SDK create and keep an identifier in local storage.
- **Withdrawal**: `setViewerId(null)`, which stops sending and removes the stored identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the platform call, 100% of ad requests made after it (single and batch) carry the identifier, and requests made before it carry none.
- **SC-002**: With the opt-in attribute, the same identifier is sent across a reload and a second tab in 100% of tests, and exactly one storage entry exists.
- **SC-003**: Without the attribute or the call, the requests and the browser's local storage after a page load are identical to the previous version's, checked by the existing tests passing unchanged.
- **SC-004**: After a withdrawal, no later request carries an identifier and no stored identifier remains.
- **SC-005**: With storage blocked, a throwing storage, an invalid value or a missing UUID source, ads still render as before and the host page sees no exception.
- **SC-006**: A platform can enable caps with one attribute or one call, and the README shows both in under one screen.

## Assumptions

- ad-serve-api spec 051 is deployed (it ignores a `viewerId` it does not recognise, so an older server is safe either way). adconfig spec 089 is what lets an advertiser set a cap; until one does, sending the identifier has no visible effect.
- The platform is responsible for consent and for choosing an identifier that is opaque and not tied to a person; the SDK does not read cookies, consent frameworks or browser privacy signals.
- The identifier must already be a UUID, because ad-serve-api only accepts that shape. Turning arbitrary platform strings into UUIDs is the platform's job and out of scope.
- A platform-supplied identifier lives only for the page's life; persisting it across pages is the platform's job (it calls `setViewerId` on each page).
- The storage is the browser's local storage on the page's own origin, which is the platform's own first-party storage because the SDK runs inside its page.
- Out of scope: sending the identifier with click or viewable-impression reports, any consent banner, cookie storage, and any change to ad-serve-api or adconfig.
