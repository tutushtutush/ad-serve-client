# Research: Pass audience labels with each ad request

## D1 A command shaped like `setViewerId`

**Decision**: `window.adServe.setAudience(labels)` once the SDK has started, and `["setAudience", labels]` on `window.adServe.q` before, applied ahead of the first requests. Exactly one argument; none or several is refused like a bad value.

**Rationale**: it is the established way a host page tells the SDK something about the viewer (spec 017), including the queue, the early application and the arity rule. A platform integrating twice learns one pattern.

**Alternatives considered**: an object payload `{ labels: [...] }` like `setContext` (room for future keys, but audience has exactly one value and `setViewerId` is the closer sibling: it is about the viewer, not the page); a loader-tag attribute (static, cannot say who the viewer is); per-slot `data-audience` (labels belong to the viewer, and a per-slot value would split batches).

## D2 What a value means

**Decision**: a list of strings replaces the labels; `null` or `[]` clears them; any other value (string, number, object, no argument, several arguments) changes nothing and warns once; a list with entries but none usable clears the labels and warns once.

**Rationale**: clearing must be explicit and easy, because a withdrawn consent or a sign-out is the case where a stale label is wrong. A list that yields nothing usable also clears (with a warning), unlike `setContext`'s rule for page categories ("had entries but none usable: malformed, not a clear"): categories describe the page, these labels describe a person, and after a sign-in or a consent change the safe failure is to send none, never the previous viewer's (changed after the PR review, see below). A bare string is refused rather than split, so a page does not depend on a separator convention the SDK would then have to keep.

**Alternatives considered**: accept a comma-separated string (two ways to say one thing, and the server's own comma parsing would be the SDK's contract); treat an unusable list as a clear (silently drops targeting on a typo).

## D3 Clean in the SDK as well as in the API

**Decision**: `normalizeAudienceLabels(value)` trims, lowercases, keeps entries matching `^[a-z0-9][a-z0-9_:.-]*$` of 1 to 40 characters, removes repeats (first wins) and keeps the first 20. Invalid and repeated entries are removed before the cap, in that order.

**Rationale**: the same form and order as ad-serve-api (its spec 061 D2), so what the SDK sends is already what the server would keep; the page does not send junk or an oversized request; and a label that cannot match is dropped where the page's author can be told (one warning) rather than silently on the server. The server cleans again, as it must for any caller.

**Alternatives considered**: send whatever the page gave (relies on the server, no feedback to the page, larger requests); stricter local rules than the server (labels the server accepts would be refused).

## D4 Page-level, read at request time, outside slot identity

**Decision**: the list is a variable in the orchestrator read in `runSlot` and `runBatch`, never captured on a slot and never part of `makeGroupKey`.

**Rationale**: the page-category precedent (spec 010 D3 and D4): a later call applies to every request after it without changing slot identity, so a redisplay or a re-run does not treat a slot as new. Labels are the same for the whole page, so they cannot split a batch.

**Alternatives considered**: capture at discovery (a later call would not reach already-discovered slots' fallbacks); include in the group key (a label change would orphan tracked slots).

## D5 Transport

**Decision**: a single request adds `audience=<labels joined with commas>` to the query string after the existing parameters; a batch adds `"audience": [<labels>]` to the shared fields of the JSON body. A single request that a failed batch falls back to carries it like any other.

**Rationale**: ad-serve-api (spec 061) reads both forms; comma-joined is what `category` already does on the query, and a list is the natural body form. Labels are cleaned to a pattern that has no comma, so joining is lossless.

**Alternatives considered**: a repeated query key (longer URLs, no gain); a header (the server does not read one).

## D6 Nothing stored, nothing on reports

**Decision**: labels live in an orchestrator variable for the page view. Click redirects, viewable-impression reports and tracking URLs carry none, and nothing is rendered.

**Rationale**: the same stance as the viewer identifier: the SDK carries what the page gives it and keeps nothing, so the platform's consent decision stays with the platform. Reports do not need labels (the server never reads them there).

**Alternatives considered**: remember the labels between page views (storage and a consent question the SDK cannot answer); send on reports (the server ignores them there, and more places would expose them).

## D7 No consent logic in the SDK

**Decision**: the SDK does not read cookies, consent banners or browser signals. The README says the platform is responsible and that labels must not identify a person.

**Rationale**: as spec 017: the SDK cannot know a visitor's consent, and a half-measure would suggest otherwise.

**Alternatives considered**: a consent flag the page must set (adds an API the platform can set wrongly; the platform simply does not call `setAudience` without consent).

## D8 Version and release

**Decision**: 1.13.0 (a new, backward-compatible feature), raised in the PR; tag `v1.13.0` on the merge commit after merge; ad-serve-api bumps its pin in its own change.

**Rationale**: the same route as 1.11.0 and 1.12.0.

**Alternatives considered**: a patch version (a new public method is a feature).

## Approaches started and rejected

- **A test stub that answered every batch with an empty `results` list** (copied from the viewer-id index test) made the SDK treat the batch as failed and fall back to singles, so a "first batch request" test saw three requests. The stub now answers a batch with one `no-ad` or `found` entry per placement. The behaviour tested (labels on the fallback singles) was right; only the fixture was wrong.
- **Nothing else was started and reversed.**

## Implementation findings

- **Comma encoding (contract):** `URLSearchParams` writes the joining comma as `%2C`; the server decodes it (checked live below). The request contract now says so.
- **No consent signal, no storage:** `tests/unit/index.audience.test.ts` pins that nothing reaches `localStorage`, `sessionStorage`, cookies or the page markup, and that only ad requests carry the label.

## Quickstart run (T015)

Real Chromium (Playwright) against the built bundle (`dist/ad-serve-client.js`, 1.13.0) and the real local ad-serve-api (spec 061, merged), with two throwaway campaigns on one placement: a labelled one (`follows-team-x`, `age-25-34`, weight 100) and an open one (weight 1), both removed afterwards. Which ad was served is read from the `adConfigId` in the viewable-impression report (`...0001` labelled, `...0002` open).

| Step | Result |
|---|---|
| 1 Tests, types, lint, build | Pass: 799 tests, `tsc`, `eslint`, `npm run build` |
| 2 Nothing set | Request has no `audience`; the open campaign served |
| 3 Method after load (`setAudience([...])`, new slot, `refresh()`) | The new request has `audience=follows-team-x`; the labelled campaign served; the first request, made before the call, had none |
| 4 Queued before the script (`" Follows-Team-X "`) | The very first request has `audience=follows-team-x` (cleaned); the labelled campaign served |
| 5 Batch and fallback | Covered by unit tests (batch shared fields, failed batch, no batch client); not run in the browser (one slot per page) |
| 6 Replace and clear | After `setAudience([...])` then `setAudience(null)` the next request has no `audience` and the open campaign is served |
| 7 Bad input | `"oops"`, no argument and two arguments changed nothing; a following valid list (`other-label`) was sent; the open campaign served (no match) |
| 8 Not stored | No label in `localStorage`, `sessionStorage` or cookies in any run; viewable-impression reports carry no `audience` |
| 9 Test environment | Not run: needs the tag, ad-serve-api's pin bump and a deploy |

## Review of PR #37

Six findings; one behaviour changed, one documentation gap closed, four left on purpose.

- **Changed: a list with no usable label now clears the labels (with a warning)** instead of keeping the previous ones. The labels describe a person, so on a sign-in or consent change the safe failure is to send none, not the previous viewer's. Spec FR-003 and US3, D2, the data model, the embed contract, the README and the tests were updated.
- **Documented: timing.** Labels apply to requests made after the call; ads already requested are not asked for again, and the README now says to queue the call before the SDK starts and to use `refresh()` for slots added later.
- **Left: labels in the single-request URL.** The README already says a single-slot request puts them in the query string, which a CDN or host can log; 20 labels of up to 40 characters is about a kilobyte at most. Sending single requests as POST would change the API contract for every request; it is not worth it for this.
- **Left: `setAudience(undefined)` keeps the old labels with a warning.** `undefined` is "not a list", the same refusal as a string; a page that does not know the viewer yet should not call it (or pass `null` to clear).
- **Left: one sentinel per command.** `MALFORMED_AUDIENCE_CALL` mirrors `MALFORMED_VIEWER_ID_CALL`; merging them is a cleanup for the code that is not part of this feature.
- **Left: labels dropped in cleaning are not warned about** (case and spaces are fixed silently; invalid and over-20 entries are dropped). The README lists exactly what is cleaned; a warning per call would be noise for a call that runs once per page.
- **`.specify/feature.json`** restored to the repository's pretty-printed form.
