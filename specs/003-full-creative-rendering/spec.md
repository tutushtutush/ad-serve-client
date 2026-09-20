# Feature Specification: Full Creative Rendering Fidelity

**Feature Branch**: `003-full-creative-rendering`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Full creative rendering fidelity via resolvedRender: today, ad-serve-client's renderer only understands a small subset of an ad's creative — headline, CTA text, alt text, link URL, and a background image if present. It ignores logo images entirely, ignores every color and font field, and has no fallback/placeholder behavior when a background image is absent. This was discovered when an advertiser added a logo to an ad in adconfig and it never appeared on the live site, and the rendered ad looked substantially different from adconfig's own 'what your ad will look like' preview. The root architecture fix already shipped on the ad-serve-api side: the ad decision service now includes every rendering decision already resolved server-side — fallback headline/CTA text applied, resolved text colors and fonts, whether a logo should render at all and its own optional background color, whether a background image should render at all (vs. a placeholder), whether the ad should be a clickable link and the URL, an accessibility label, and an icon size for the placeholder case. ad-serve-client no longer needs to derive any of these decisions itself — it receives them ready-made. This feature is about updating ad-serve-client to actually consume this resolved rendering data and render a creative that matches adconfig's own preview, while keeping the existing safety guarantees (untrusted text still escaped before display, links still restricted to safe destinations regardless of what the resolved data says). The existing fail-silent behavior and the existing request/discovery/redisplay behavior from the prior two features are unaffected — this is purely about what gets built once a slot has a winning ad to display."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An ad with a logo displays the logo (Priority: P1)

An advertiser configures an ad that includes a logo image. A site visitor viewing that ad sees
the logo displayed on it, the same way it appears in the advertiser's own preview when they set
it up.

**Why this priority**: This is the exact gap that surfaced this feature — an advertiser added a
logo and it silently never appeared anywhere the ad was actually shown, undermining trust that
what they configure is what gets served.

**Independent Test**: Can be fully tested by configuring an ad with a logo and confirming the
logo appears on the displayed ad, matching its presence and position in the advertiser's preview.

**Acceptance Scenarios**:

1. **Given** an ad configured with a logo image, **When** the ad is displayed to a site visitor,
   **Then** the logo appears on the ad.
2. **Given** an ad configured with a logo image and a background color for that logo, **When**
   the ad is displayed, **Then** the logo appears with that background treatment behind it.
3. **Given** an ad configured with a logo image but with its background treatment turned off,
   **When** the ad is displayed, **Then** the logo appears without a background behind it.
4. **Given** an ad configured with no logo at all, **When** the ad is displayed, **Then** no logo
   area appears, and the rest of the ad is unaffected.

---

### User Story 2 - An ad's text matches its configured colors and fonts (Priority: P1)

An advertiser chooses specific colors and fonts for an ad's headline and button text. A site
visitor sees the ad's text rendered in those chosen colors and fonts, not generic defaults that
ignore the advertiser's choices.

**Why this priority**: Alongside the logo, this is the other half of "the ad looked substantially
different from the preview" — an advertiser's stylistic choices being silently dropped is a
direct, visible mismatch between what was configured and what visitors actually see.

**Independent Test**: Can be fully tested by configuring an ad with specific headline and button
colors/fonts and confirming the displayed ad renders text in those exact colors and fonts.

**Acceptance Scenarios**:

1. **Given** an ad with a specific headline text color and font configured, **When** the ad is
   displayed, **Then** the headline appears in that color and font.
2. **Given** an ad with a specific button text color, font, and background color configured,
   **When** the ad is displayed, **Then** the button appears with those exact choices.
3. **Given** an ad where a color or font was left unset by the advertiser, **When** the ad is
   displayed, **Then** a sensible default is used instead — the same default the advertiser would
   have seen in their own preview.

---

### User Story 3 - A button always has a visible background (Priority: P2)

Regardless of what an advertiser configures, an ad's button is always visually distinguishable as
a button — it always has some background behind it, never blending invisibly into the ad.

**Why this priority**: A button with no background at all can become unreadable or
indistinguishable depending on what's behind it — a smaller but still real fidelity gap from the
advertiser's preview, where the button always has a background by design.

**Independent Test**: Can be fully tested by configuring an ad without a specific button
background color and confirming the displayed button still has a visible background.

**Acceptance Scenarios**:

1. **Given** an ad where no button background color was configured, **When** the ad is
   displayed, **Then** the button still appears with a default background.

---

### User Story 4 - An ad without a background image shows a placeholder, not a blank gap (Priority: P3)

When an advertiser hasn't set a background image for an ad, a site visitor sees a clear visual
placeholder in that space rather than an empty or broken-looking area.

**Why this priority**: Rounds out visual fidelity with the advertiser's preview for the case where
no background image exists yet — a real but lower-severity gap than a missing logo or wrong
colors, since it affects an incomplete/in-progress ad rather than an ad believed to be finished.

**Independent Test**: Can be fully tested by configuring an ad with no background image and
confirming a placeholder appears in its place, sized appropriately for that ad's dimensions.

**Acceptance Scenarios**:

1. **Given** an ad with no background image configured, **When** the ad is displayed, **Then** a
   placeholder appears in the background area instead of a blank or broken space.
2. **Given** an ad with a background image configured, **When** the ad is displayed, **Then**
   that image is shown and no placeholder appears.

---

### User Story 5 - An ad is only clickable when a destination was actually configured (Priority: P3)

A site visitor can click through to the advertiser's destination only when the advertiser
actually configured one. An ad with no configured destination behaves as a static, non-clickable
display rather than misleadingly appearing clickable.

**Why this priority**: A smaller correctness gap than the visual mismatches above, but a real one
— a visitor should never be invited to click something that goes nowhere meaningful.

**Independent Test**: Can be fully tested by configuring an ad with no destination link and
confirming it displays as non-clickable, versus an ad with a destination configured displaying as
clickable.

**Acceptance Scenarios**:

1. **Given** an ad with a destination link configured, **When** a visitor interacts with the ad,
   **Then** it behaves as a clickable link to that destination.
2. **Given** an ad with no destination link configured, **When** the ad is displayed, **Then** it
   does not behave as a clickable link.

### Edge Cases

- What happens when the ad decision service's rendering guidance is missing or incomplete for an
  otherwise-valid ad (e.g., an older response shape)? The ad slot MUST still degrade to a
  reasonable, safe display rather than failing to show anything or breaking the host page — this
  extends the existing fail-silent guarantee to cover incomplete rendering guidance, not just a
  missing ad entirely.
- What happens when configured text (headline, button text) contains content that could be
  mistaken for page markup or code? It MUST always display as plain, visible text — never be
  capable of altering the surrounding page's appearance or behavior.
- What happens when a configured destination doesn't use a safe, standard web address format?
  The ad MUST NOT become clickable to it — this safety rule applies regardless of what the ad
  decision service otherwise indicates.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an ad includes a logo, the system MUST display that logo as part of the ad.
- **FR-002**: When an ad's logo has a background treatment configured, the system MUST display
  that background behind the logo; when the background treatment is turned off, the system MUST
  display the logo without one.
- **FR-003**: The system MUST render an ad's headline and button text using the color and font
  choices configured for that ad, falling back to a sensible default for any choice left unset.
- **FR-004**: The system MUST always give an ad's button a visible background, using the
  configured color if one was set and a default background otherwise.
- **FR-005**: When an ad has no background image, the system MUST display a placeholder instead
  of a blank or broken-looking area, sized appropriately for that ad's dimensions.
- **FR-006**: When an ad has a background image, the system MUST display that image and MUST NOT
  display a placeholder.
- **FR-007**: The system MUST make an ad clickable to its configured destination only when a
  destination was actually configured for that ad; otherwise the ad MUST NOT behave as a
  clickable link.
- **FR-008**: Regardless of what the ad decision service indicates, the system MUST NOT make an
  ad clickable to a destination that isn't a safe, standard web address — this safety rule
  overrides any other signal.
- **FR-009**: The system MUST display all advertiser-configured text as plain visible text,
  never in a way that could be mistaken for or alter the surrounding page's own markup or
  behavior.
- **FR-010**: If the ad decision service's rendering guidance for an otherwise-valid ad is
  missing or incomplete, the system MUST still degrade to a safe display (falling back to
  reasonable defaults for whatever is missing) rather than showing nothing or breaking the host
  page.
- **FR-011**: This feature MUST NOT change how or when a slot decides to request an ad, how a
  slot's element is discovered or tracked, or the existing behavior for a slot with no ad
  available — it changes only what is displayed once a slot has a winning ad.

### Key Entities

- **Rendering Guidance**: The set of already-decided display choices for a specific ad — its
  final headline and button text (with fallbacks already applied), its text colors and fonts,
  whether it has a logo and that logo's background treatment, whether it has a background image,
  whether it should be clickable and to where, and an accessibility description. This feature
  consumes this guidance as given rather than deriving any of it independently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An ad configured with a logo displays that logo to visitors in 100% of observed
  cases, eliminating the previously-reported gap where a configured logo never appeared.
- **SC-002**: An ad's displayed headline and button color/font choices match what the advertiser
  configured in 100% of observed cases, closing the visible gap between the advertiser's preview
  and what visitors actually see.
- **SC-003**: No displayed ad ever shows a button with no visible background, or a blank/broken
  area where a background image or placeholder should be.
- **SC-004**: An ad is clickable if and only if a destination was actually configured for it, in
  100% of observed cases.
- **SC-005**: A rendering problem — missing guidance, unexpected content — never breaks the rest
  of the host page, consistent with the existing fail-silent guarantee.

## Assumptions

- The ad decision service is the sole source of rendering guidance for this feature; this
  feature does not introduce a second, independent way to determine an ad's colors, fonts, logo,
  or clickability.
- Matching adconfig's own preview *pixel-for-pixel* (exact spacing, exact box layout) is not
  required by this feature — what's required is that every configured element (logo, colors,
  fonts, background/placeholder, clickability) actually appears and reflects what was configured,
  closing the specific "silently missing or ignored" class of gap this feature was raised to fix.
  Finer visual layout parity is a separate, deliberately deferred concern.
- "A safe, standard web address" for a clickable destination means the same restriction already
  in place today (destinations must use a standard, secure web address format) — this feature
  does not loosen or change that existing safety rule, only makes clickability itself conditional
  on a destination actually being configured.
