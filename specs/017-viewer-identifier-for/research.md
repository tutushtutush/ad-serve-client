# Research: Viewer identifier for frequency caps

## D1 Off by default, platform in control

**Decision**: no identifier is created, stored or sent unless the platform calls `setViewerId` with a UUID or sets `data-viewer-id-storage="local"` on the loader tag.

**Why**: decided with the owner. A persistent identifier on a visitor's device can need consent, and the SDK cannot know whether a given visitor gave it. Defaulting to off means upgrading the SDK never starts tracking anyone.

**Alternatives considered**: always create a random UUID in local storage (caps work everywhere, but a persistent identifier is set with no consent control); platform-supplied only (smallest and safest, but every platform needs its own identifier and storage).

## D2 Attribute name and value

**Decision**: `data-viewer-id-storage="local"`. Any other value, or no attribute, is off.

**Why**: names what it does (where the SDK keeps the identifier) and leaves room for other storage kinds later without changing the meaning of a bare attribute. A boolean attribute (`data-viewer-id`) would be read as "here is an id" by some people.

**Alternatives considered**: `data-persist-viewer-id` (a boolean that invites `="false"` mistakes: an attribute present with that value would still count as present in many readers); `data-viewer-id="auto"` (overloads one name for a value and a mode).

## D3 Platform-supplied identifier is held in memory only

**Decision**: a UUID passed to `setViewerId` is kept for the page's life and never written to storage by the SDK.

**Why**: the platform has the identifier and the consent; persisting it is its job. Writing a platform's identifier to local storage would be the SDK creating a second copy of a persistent identifier without being asked.

**Alternatives considered**: also store the platform's identifier (a second copy that could outlive a withdrawal the platform handled itself).

## D4 Withdrawal removes the stored value and blocks re-creation for the page

**Decision**: `setViewerId(null)` or `""` clears the platform's identifier, removes the stored one, and sets a flag so the opt-in does not create a new one until the next page load. A later valid `setViewerId` works again (the platform decided).

**Why**: otherwise a withdrawal followed by the next ad request would silently create a new identifier through the opt-in, undoing it.

**Alternatives considered**: no flag (withdrawal would be undone by the next request); a flag that survives page loads (needs storage of its own, which is what a withdrawing visitor does not want).

## D5 Precedence and when the stored identifier is created

**Decision**: current identifier = the platform's, else (not withdrawn and opted in) the stored one, created lazily on the first request that needs it and cached for the page. A failure to read or write storage yields no identifier, without a warning per request.

**Why**: lazy creation means a page with no ad slots never touches storage; caching avoids a storage read per request; a platform identifier that arrives after the first request still wins for later ones.

**Alternatives considered**: create at startup (touches storage even when nothing is requested); read storage on every request (slower, and a sandboxed frame would throw each time).

## D6 Validation: a UUID or nothing

**Decision**: the SDK checks the UUID shape (any case, 8-4-4-4-12 hex) and refuses anything else with one console warning through the injected `warn`; it does not try to convert other strings.

**Why**: ad-serve-api only accepts UUIDs and treats anything else as absent; sending a value the server ignores would look like it works. Deriving a UUID from an arbitrary string (hashing) would make the SDK decide what identifies a person.

**Alternatives considered**: hash any string into a UUID in the SDK (hides the mistake, and the SDK would be choosing an identity scheme); pass through whatever the platform gives and let the server ignore it (silent no-op for the platform).

## D7 Single request versus batch

**Decision**: the identifier is sent as the `viewerId` query parameter on a single request and as a body field on a batch (once, with the shared fields).

**Why**: matches ad-serve-api contract 051 and its advice to prefer the body, since a GET's query string can appear in a host's access logs. A single slot request is still a GET, which is why the identifier stays a random, non-personal UUID.

**Alternatives considered**: always use the batch endpoint for one slot (changes request behaviour for every existing platform); a header (ad-serve-api reads the parameter, not a header).

## D8 Not sent with click or viewable-impression reports

**Decision**: only ad requests carry it.

**Why**: ad-serve-api counts impressions from the decision request; the other endpoints do not take it, and sending it there would only widen where the identifier travels.

**Alternatives considered**: add it to every call for future use (data minimisation says no).

## D9 Implementation notes

- Walked through [quickstart.md](quickstart.md) steps 2 to 9 in Chromium (Playwright) against the built bundle and a small mock ad-serve-api: by default no `viewerId` and nothing in local storage; a platform call applied to later requests only; a queued call applied to the first request; an invalid value gave one warning and nothing sent; a batch carried the identifier once in its body; the opt-in created one UUID under `adServeViewerId` that a second tab read back; the platform's identifier won and left the stored one untouched; withdrawing removed the stored value and stopped sending (also when queued before load); and with `localStorage` access throwing, ads were requested without an identifier and with no page error. Step 10 (a real cap) needs adconfig and ad-serve-api on the test environment.
- The bundle grew from 15,930 to 17,226 bytes.
- No test imported `src/index.ts` before; `tests/unit/index.viewerId.test.ts` loads a fresh copy per test by defining `document.currentScript`, stubbing `fetch` and evaluating the module in `jest.isolateModules`, and is reusable for later wiring tests.
- T010's queued-command cases are covered in `adOrchestrator.viewerId.test.ts` and the `index` test (queued before load, queued withdrawal, a handler that throws), so `queuedCommands.test.ts` is unchanged.
- The platform's own identifier is never stored by the SDK, which is why a withdrawal only has to remove the SDK's kept one.

## Out of scope, for later

- Sending the identifier on click or viewable-impression reports (ad-serve-api does not take it there).
- A consent-framework integration (reading a consent signal instead of relying on the platform's call).
- Other storage kinds for the attribute, for example `session`.
- Turning arbitrary platform identifiers into UUIDs.

## Rejected or reversed approaches

None. Nothing was started and then abandoned during implementation.
