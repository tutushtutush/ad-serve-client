# Feature Specification: Page-level ad category context

**Feature Branch**: `010-support-page-level-ad`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Support page-level ad category context. A host page declares categories once via `window.adServe.q.push(["setContext", {categories: [...]}])` (list of plain words or IAB codes; `{}` clears), which the SDK reads fresh at each ad request and sends to ad-serve-api as category; slot-level `data-category` overrides it for that slot; context must be refreshable on SPA navigation. Framework-agnostic: plain JS API, no framework dependency. Unblocks EventPulse category-targeted ads."

## User Scenarios & Testing *(mandatory)*

Users here are **publishers**: developers embedding the ad loader on their pages.

### User Story 1 - Declare a page's categories once (Priority: P1)

A publisher knows what a page is about (for example a music listing) and wants every ad on it
matched to that topic, without tagging each ad slot individually. They declare the page's
categories once, and every slot on the page requests ads for those categories.

**Why this priority**: This is the core value and the blocker for EventPulse. Without it, every
slot on every page must be tagged by hand, which does not scale to pages with many slots or
dynamically inserted slots.

**Independent Test**: On a page with two untagged slots, declare categories `["music"]`; confirm
both slots' ad requests carry the music category.

**Acceptance Scenarios**:

1. **Given** a page with several ad slots and no per-slot category, **When** the publisher
   declares categories `["music"]`, **Then** every slot's ad request is made for category music.
2. **Given** a declaration of several categories (plain words and/or IAB codes), **When** ads are
   requested, **Then** all of the categories are sent together.
3. **Given** categories are declared before the SDK bundle has finished loading, **When** the
   bundle loads, **Then** the declaration takes effect for the first ad requests, exactly as if it
   had been declared after load.
4. **Given** a slot inserted into the page after the declaration, **When** it requests an ad,
   **Then** it uses the current page categories.

---

### User Story 2 - Update or clear categories on navigation (Priority: P1)

A publisher runs a single-page app. When the visitor navigates from a music listing to a comedy
event without a full reload, the page's topic changes. The publisher updates (or clears) the
declared categories, and ads requested afterwards reflect the new topic.

**Why this priority**: Without refresh support, ads on single-page apps stay stuck on the first
page's topic, which silently mis-targets most of a visit.

**Independent Test**: Declare `["music"]`, trigger an ad request, declare `["comedy"]`, trigger
another request; confirm the second request carries comedy. Then clear and confirm no category.

**Acceptance Scenarios**:

1. **Given** categories `["music"]` are declared, **When** the publisher declares `["comedy"]`
   and an ad is next requested, **Then** that request carries comedy only, not music.
2. **Given** categories are declared, **When** the publisher clears them with an empty
   declaration, **Then** later requests carry no page-level category.
3. **Given** an ad already on screen, **When** categories change, **Then** it is not
   re-requested or replaced until the page next requests ads (the declaration affects requests, it
   does not trigger them).

---

### User Story 3 - A slot can override the page (Priority: P2)

A page mixes topics (for example a homepage with a music section and a sports section). The
publisher keeps one page-level default but tags specific slots with their own category.

**Why this priority**: Needed for mixed-topic pages, but pages with a single topic work with
Stories 1 and 2 alone.

**Independent Test**: Declare page categories `["music"]` and tag one slot `sports`; confirm that
slot requests sports and an untagged slot requests music.

**Acceptance Scenarios**:

1. **Given** page categories and a slot with its own category, **When** that slot requests an ad,
   **Then** it uses its own category and the page categories are not added.
2. **Given** a slot with no category of its own, **When** it requests an ad, **Then** it uses the
   page categories.

---

### User Story 4 - Works on any site, no framework needed (Priority: P2)

A publisher on any stack (plain HTML, a server-rendered CMS, React, Vue, or anything else) can
use the feature with ordinary script and markup. Nothing in the SDK depends on a particular
framework.

**Why this priority**: The SDK is embedded on third-party sites with unknown stacks.

**Independent Test**: Use the feature from a plain HTML page with no framework and confirm all
Story 1 and 2 scenarios.

**Acceptance Scenarios**:

1. **Given** a plain HTML page using only the standard loader snippet, **When** the publisher
   declares categories from an inline script, **Then** ads are requested for those categories.

---

### Edge Cases

- Malformed declaration (not a list, non-string entries, empty strings): ignored without breaking
  the host page; the previous valid declaration is kept (a typo never silently drops targeting).
- Declaration with unknown words: sent as given; the ad server decides (it ignores unmapped words).
- Duplicate or differently-cased entries in one declaration: sent once each.
- Very long lists: capped. See Assumptions.
- Declaration made but no slots on the page: nothing happens; no error.
- Declared categories while a request is in flight: the in-flight request keeps the categories it
  was made with; later requests use the new ones.
- SDK bundle fails to load or errors: the host page is unaffected (existing fail-silent rule).
- Slot-level category given as a comma-separated list (already supported): still honored and
  still overrides page categories.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST let a page declare a list of categories (plain words and/or IAB codes)
  through the existing command queue, using a `setContext` command carrying `categories`.
- **FR-002**: The SDK MUST send the currently declared page categories with every ad request made
  by a slot that has no category of its own.
- **FR-003**: The SDK MUST read the declared categories at the time each request is made, so a
  declaration changed between requests applies to the next request.
- **FR-004**: A declaration made before the bundle loads MUST be applied once the bundle loads,
  in queue order.
- **FR-005**: An empty declaration MUST clear the page categories; a new declaration MUST
  replace, not merge with, the previous one.
- **FR-006**: A slot's own category MUST take precedence over page categories for that slot, with
  no merging.
- **FR-007**: Changing the page categories MUST NOT disturb the identity of slots already on the
  page (their redisplay tracking and de-duplication keep working); only the category sent on
  later requests changes.
- **FR-008**: A declaration MUST NOT by itself cause any ad request, re-render, or re-fetch.
- **FR-009**: Invalid declarations MUST be ignored safely and MUST NOT throw into host-page code
  or affect other queued commands.
- **FR-010**: The feature MUST NOT require or reference any particular front-end framework.
- **FR-011**: The ad request format to ad-serve-api MUST remain unchanged (categories travel in
  the existing category parameter, comma-joined).
- **FR-012**: Existing behavior for pages that never declare categories MUST be unchanged.

### Key Entities

- **Page category context**: the single, current list of categories declared for the page; empty
  when none declared or after clearing.
- **Slot category**: an optional category on an individual ad slot (already supported); wins over
  the page context.
- **Effective category (per slot)**: slot category if present, otherwise the page context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A publisher can target a whole page by adding one declaration; no per-slot tagging
  is needed.
- **SC-002**: After a navigation-time change, 100% of ad requests made after the change carry the
  new categories and none carry the old.
- **SC-003**: Pages that never use the feature behave identically to the previous release (no
  existing test changes meaning).
- **SC-004**: The feature works on a plain HTML page with no framework, verified end to end.
- **SC-005**: No malformed declaration can cause an error visible to the host page.

## Assumptions

- Publishers are developers who can run a short script on their page.
- ad-serve-api (live, spec 029) already accepts several categories as a comma list, plain words
  and IAB codes, and ignores unmapped words; no server change is needed.
- Page categories are a single global context per page; per-slot overrides use the existing
  `data-category` attribute.
- A cap on declared categories (proposed: 10, extras dropped) protects request size.
- Releasing this ships as a new tagged version (v1.3.0), then ad-serve-api's pin is bumped.
- Out of scope: ranking or weighting by category, mapping a platform's own labels to IAB codes,
  and framework wrapper components (those live in the consuming app).
- Out of scope: automatically re-requesting ads when the context changes.
