# Feature Specification: Pass audience labels with each ad request

**Feature Branch**: `021-pass-audience-labels`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Pass audience labels with each ad request, in ad-serve-client (companion to adconfig spec 114 and ad-serve-api spec 061). An advertiser can limit a campaign to viewers a platform has tagged with audience labels (for example `follows-team-x`); ad-serve-api serves such a campaign only to a request that carries at least one of its labels, in an `audience` field. Nothing sends that field yet, so a labelled campaign serves to nobody. This SDK needs a way for the host page to hand it the viewer's labels and to send them with every ad request."

## Why this exists

An advertiser can aim a campaign at viewers a platform has tagged, for example fans of one team
(AdConfig). The serving API honours it (ad-serve-api): a campaign with labels is served only to a
request that says the viewer has one of them, and a request that says nothing never gets such a
campaign. The platform knows its viewer; the serving API does not. This SDK is the part that runs
in the platform's page, so it is the only place that can carry the platform's labels from the page
to the request.

The SDK decides nothing about who a viewer is and invents no labels. It carries what the host page
gives it, for this page view only, and stores nothing. The platform is responsible for which labels
a viewer gets and for any consent its visitors' privacy rules require, as it already is for the
viewer identifier (spec 017).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The host page tells the SDK the viewer's labels (Priority: P1)

A platform that has tagged the current viewer (for example as following a team) hands those labels
to the SDK. From then on every ad request the SDK makes carries them, so an advertiser's labelled
campaign can be served to this viewer.

**Why this priority**: it is the whole feature; without it labelled campaigns serve to nobody.

**Independent Test**: on a page with two ad slots, call `window.adServe.setAudience(["follows-team-x"])` and confirm that the single request or the one batch request goes out with that label; reload the page without the call and confirm no label is sent.

**Acceptance Scenarios**:

1. **Given** a host page that calls `adServe.setAudience(["follows-team-x", "age-25-34"])`, **When** the SDK requests an ad for a single slot, **Then** the request carries both labels.
2. **Given** the same call and a page whose slots are served by one batch request, **When** the batch is sent, **Then** it carries the labels once, for the whole batch.
3. **Given** a batch that failed so that its slots fall back to single requests, **When** each single request is sent, **Then** each still carries the labels.
4. **Given** a host page that never calls it, **When** the SDK requests ads, **Then** the requests are exactly what they were before this feature (no new field).
5. **Given** a call made later, **When** more slots are filled (for example after `refresh`), **Then** those requests carry the labels, and requests already sent are unchanged.

---

### User Story 2 - Labels queued before the SDK has loaded still apply to the first requests (Priority: P1)

The host page's script usually runs before the SDK's script has finished loading. The page can queue the labels the same way it queues other commands, and they take effect before the first ad requests go out.

**Why this priority**: the first ad request is the one that matters most; a label that arrives after it would leave the first impression unlabelled.

**Independent Test**: push `["setAudience", ["follows-team-x"]]` onto `window.adServe.q` before the SDK loads and confirm the very first request carries the label.

**Acceptance Scenarios**:

1. **Given** `window.adServe.q.push(["setAudience", ["follows-team-x"]])` before the SDK starts, **When** the SDK starts and requests ads, **Then** the first requests carry the label.
2. **Given** several queued `setAudience` entries, **When** the SDK starts, **Then** the last valid one wins, as a later call would.

---

### User Story 3 - The labels can be changed or withdrawn (Priority: P1)

A viewer's labels can change during a visit (the viewer signs in, picks a team, or withdraws consent). The host page can replace the labels or clear them, and later requests follow.

**Why this priority**: consent withdrawal and sign-in changes are the cases where sending a stale label would be wrong.

**Independent Test**: call `setAudience(["a"])`, make a request, call `setAudience(null)`, make another: the second carries no label.

**Acceptance Scenarios**:

1. **Given** labels already set, **When** the page calls `setAudience(["b"])`, **Then** later requests carry only `b`.
2. **Given** labels already set, **When** the page calls `setAudience(null)` or `setAudience([])`, **Then** later requests carry no labels.
3. **Given** labels already set, **When** the page calls it with something that is not a list or null (a string, a number, an object, no argument, several arguments), **Then** nothing changes and one console warning says so.
4. **Given** labels already set, **When** the page passes a list with entries but none usable, **Then** nothing changes and one console warning says so (a typo cannot silently drop or replace targeting).

---

### User Story 4 - A bad label list can never break the page or the request (Priority: P2)

Labels come from the host page's own code. The SDK cleans them to the form the serving API expects and never lets a bad value break a request or the page.

**Why this priority**: the SDK runs inside someone else's page and must fail silent (Constitution V).

**Independent Test**: pass labels in odd case, with spaces, repeats, invalid characters and 25 entries and confirm what is sent.

**Acceptance Scenarios**:

1. **Given** `[" Follows-Team-X ", "AGE-25-34"]`, **When** a request is made, **Then** it carries `follows-team-x` and `age-25-34`.
2. **Given** entries that are not strings, blank, contain spaces or symbols, or are over 40 characters, **When** cleaned, **Then** those entries are dropped and the rest are kept.
3. **Given** repeated labels, **When** cleaned, **Then** each is sent once.
4. **Given** more than 20 valid labels, **When** cleaned, **Then** only the first 20 are sent.
5. **Given** any of the above, **When** the call is made, **Then** no error reaches the host page and no request is blocked.

---

### Edge Cases

- A page calls `setAudience` with the labels of a signed-in viewer, then the viewer signs out: the page calls `setAudience(null)`; the SDK does not know about sign-out by itself.
- The labels are never stored: they are lost on reload, so the page must call it on every page view (like `setViewerId`).
- The SDK sends nothing for audience when there are none, so a platform that does not use the feature sees no change in its requests.
- Labels are not sent on click or viewable-impression reports, and are never rendered into the page.
- On a single-slot request the labels travel in the URL's query string, which a CDN or host can record in access logs; the documentation must say so, and that labels must not identify a person.
- A slot attribute cannot carry labels in this release: labels belong to the viewer, not to a slot, so there is no `data-audience`.
- A batch groups slots by country, device type and category; labels are the same for the whole page, so they never split a batch.
- If the serving API predates ad-serve-api spec 061, the unknown `audience` field is ignored by it; nothing breaks.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST offer `window.adServe.setAudience(labels)` once started, and accept `["setAudience", labels]` on `window.adServe.q` before that, applied before the first ad requests exactly as `setContext` and `setViewerId` are.
- **FR-002**: `labels` MUST be a list of strings, `null`, or an empty list. A list replaces the page's labels; `null` or an empty list clears them. Any other value, a call with no argument or with more than one, MUST change nothing and write one console warning, never throw.
- **FR-003**: A list with at least one entry but no usable one MUST change nothing and write one console warning.
- **FR-004**: The SDK MUST clean labels to the serving API's form before use: trim, lowercase, keep only entries matching `^[a-z0-9][a-z0-9_:.-]*$` of 1 to 40 characters, remove repeats keeping the first, then keep at most the first 20.
- **FR-005**: Every ad request made after labels are set MUST carry them: on a single request as the `audience` query parameter (comma-separated), on a batch request as the top-level `audience` field of the body (a list), and on a single request that a failed batch falls back to.
- **FR-006**: With no labels set, every request MUST be identical to what it is today (no `audience` parameter or field).
- **FR-007**: The labels MUST be read when each request is built, so a call applies to requests made after it and leaves earlier ones alone, and MUST NOT take part in how slots are identified, grouped or batched.
- **FR-008**: The SDK MUST keep the labels in memory for the page view only. It MUST NOT write them to cookies, local or session storage, or anywhere else, and MUST NOT send them on click or viewable-impression reports or render them into the page.
- **FR-009**: The SDK MUST NOT generate, infer or look up labels, MUST NOT read cookies or consent banners, and MUST leave consent to the host page.
- **FR-010**: No error from labelling (a bad value, a failing store, a throwing logger) may reach the host page or stop an ad request (Constitution V).
- **FR-011**: The README MUST document the call, the queued form, when to call it, what is cleaned, that nothing is stored, the query-string exposure of a single request, and that labels must not identify a person; a contract file in this spec MUST state the request shapes.
- **FR-012**: The package version MUST be raised for the release (a new feature, 1.13.0), and the release MUST be tagged after merge so ad-serve-api can pin it.

### Key Entities

- **Page audience labels**: the cleaned list of labels the host page last gave the SDK, held in memory for this page view; empty when none were given or they were cleared.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With labels set, 100% of single requests, batch requests and batch fallbacks carry them; with none set, 0 requests differ from today's.
- **SC-002**: Labels queued before the SDK loads are on the first request of the page in 100% of tested loads.
- **SC-003**: Every case of bad input listed in the acceptance scenarios leaves the page and the request working, with at most one warning per call.
- **SC-004**: After `setAudience(null)` no later request carries a label.
- **SC-005**: No label is found in any storage, in a click or viewable-impression report, or in the page markup after a run with labels set.
- **SC-006**: Checked live against ad-serve-api on the test environment: a labelled campaign is served to a page that sets its label and not to one that does not.

## Assumptions

- ad-serve-api's `audience` field (its spec 061, merged) is the receiving end: query parameter on `GET /ads`, top-level body field on `POST /ads/batch`, at most 20 labels, the form in FR-004.
- Labels are per viewer and per page view, set by script; there is no loader-tag attribute and no per-slot label (a static attribute cannot say who the viewer is).
- The platform (for example EventPulse) decides which labels a viewer gets; its privacy wording covers them. The SDK adds no consent mechanism.
- The command style follows `setViewerId`: one value, a method once started, a queue entry before.
- Platforms update the SDK by the usual route: a tagged release, then ad-serve-api's pin is bumped (as for spec 019 and 020).

## Out of Scope

- A loader-tag attribute or per-slot attribute for labels.
- Storing labels between page views.
- Working out labels from the page, cookies, the viewer identifier or anything else.
- Sending labels on click or viewable-impression reports.
- A consent mechanism.
- Changes in ad-serve-api or AdConfig.
