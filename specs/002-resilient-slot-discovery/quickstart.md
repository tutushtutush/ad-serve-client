# Quickstart: Resilient Slot Discovery for Client-Rendered Host Pages

Scenario 1 validates the exact real-world bug this feature fixes, using the actual environment
that surfaced it (both timing directions — replacement before render, and hydration's
mismatch-recovery removing the ad after render — happen on this same real page, depending on how
fast ad-serve-api happens to respond). Scenarios 2–4 validate the pre-render edge cases (FR-004,
FR-005, FR-007) with standalone test pages, since eventpulse's own React tree doesn't naturally
produce those specific conditions on demand. Scenarios 5–6 (added by the FR-009/FR-010 amendment)
validate the post-render redisplay behavior and its bound, also via standalone test pages.

## Prerequisites

- This repo built (`npm run build`) so `dist/ad-serve-client.js` reflects this feature.
- ad-serve-api running locally, pointed at adconfig's shared database.
- For Scenario 1: eventpulse running locally, already integrated with ad-serve-client (see the
  full-circle integration work: `public/ad-serve-client.js` copied in, the loader snippet in
  `layout.tsx`, and an ad slot in `page.tsx`), and adconfig seeded with a real published ad for
  the platform/ad-type that slot uses.

## Scenario 1: The original bug is fixed — ad appears on eventpulse's real homepage (US1)

Rebuild and re-copy the bundle into eventpulse, then load the homepage:

```bash
npm run build
cp dist/ad-serve-client.js ../eventpulse/public/ad-serve-client.js
```

Load `http://localhost:3000` in a browser (or drive it headlessly) with eventpulse, ad-serve-api,
and eventpulse-api all running.

**Expected**: the ad slot on the homepage displays the seeded ad, and — reload a few times to
check — it *stays* displayed rather than flickering away. (Before this feature, this scenario
failed outright: the request succeeded but the ad never appeared. After T001 alone, it still
failed by a different route: the ad would render, then React's hydration mismatch-recovery would
immediately discard it — visible as a "Hydration failed" warning in the browser console naming
the injected `<iframe>` — since it landed before hydration reconciled that section. Both routes
are now covered.) Confirm via the browser's element inspector that the `<iframe>` is inside the
*current* `[data-ad-serve-slot]` element on the page, not orphaned in a detached node. Note: React
may still log its own hydration-mismatch warning in the console when the timing race lands that
way — that warning is React's own diagnostic, outside this feature's control, and is not itself a
failure; what matters is that the ad is present and connected once the page settles, regardless of
whether that warning appeared.

## Scenario 2: A slot removed for good still stays empty (US2, FR-004)

Build a standalone test page with a slot and a script that removes it shortly after load, with no
replacement:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="container">
      <div
        data-ad-serve-slot
        data-platform-id="11111111-1111-1111-1111-111111111111"
        data-ad-type-id="medium-rectangle"
      ></div>
    </div>
    <script>
      window.adServe = window.adServe || { q: [] };
    </script>
    <script src="./dist/ad-serve-client.js" data-api-base-url="http://localhost:4010"></script>
    <script>
      // Simulate permanent removal, before the ad request resolves.
      setTimeout(() => {
        document.getElementById("container").remove();
      }, 20);
    </script>
  </body>
</html>
```

**Expected**: no ad ever appears anywhere on the page; no console error; the page otherwise
functions normally.

## Scenario 3: Two replacements before resolution still show exactly one ad (US3, FR-005)

Same test page as Scenario 1's slot, but instead of removing the container, replace it twice in
quick succession with structurally identical containers holding a fresh slot element with the
same configuration:

```html
<script>
  function replaceSlot() {
    const container = document.getElementById("container");
    const fresh = container.cloneNode(true);
    container.replaceWith(fresh);
    fresh.id = "container";
  }
  setTimeout(replaceSlot, 10);
  setTimeout(replaceSlot, 20);
</script>
```

**Expected**: exactly one `<iframe>` ad appears, inside the final (third) container, once the ad
result resolves. No duplicate ads, no ad rendered into an earlier, now-detached container.

## Scenario 4: Two identically-configured slots stay correctly distinguished (FR-007)

A test page with two slots sharing the exact same `data-platform-id`/`data-ad-type-id`, where only
the *second* slot's element is replaced:

```html
<div id="slot-a-container">
  <div
    data-ad-serve-slot
    data-platform-id="11111111-1111-1111-1111-111111111111"
    data-ad-type-id="medium-rectangle"
  ></div>
</div>
<div id="slot-b-container">
  <div
    data-ad-serve-slot
    data-platform-id="11111111-1111-1111-1111-111111111111"
    data-ad-type-id="medium-rectangle"
  ></div>
</div>
<script>
  setTimeout(() => {
    const c = document.getElementById("slot-b-container");
    const fresh = c.cloneNode(true);
    c.replaceWith(fresh);
    fresh.id = "slot-b-container";
  }, 10);
</script>
```

**Expected**: both slots display an ad once resolved (assuming the placement has one available);
slot A's ad ends up in slot A's (never-replaced) element, and slot B's ad ends up in slot B's
*replacement* element — never crossed.

## Scenario 5: The ad is redisplayed if it's removed shortly after first appearing (US1 scenario 3, FR-009)

A test page whose script removes the *already-rendered* ad's element (not the original,
pre-render slot) shortly after it first appears — simulating hydration's mismatch-recovery
removing a render that landed too early:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="container">
      <div
        data-ad-serve-slot
        data-platform-id="11111111-1111-1111-1111-111111111111"
        data-ad-type-id="medium-rectangle"
      ></div>
    </div>
    <script>
      window.adServe = window.adServe || { q: [] };
    </script>
    <script src="./dist/ad-serve-client.js" data-api-base-url="http://localhost:4010"></script>
    <script>
      // Poll for the ad to appear, then simulate it being wiped out — the
      // way hydration's mismatch-recovery removes a too-early render — by
      // replacing the *rendered* element (not the original slot div).
      const poll = setInterval(() => {
        const iframe = document.querySelector("[data-ad-serve-slot] iframe");
        if (!iframe) return;
        clearInterval(poll);
        const slot = document.querySelector("[data-ad-serve-slot]");
        const fresh = slot.cloneNode(false); // same config, empty — no iframe
        slot.replaceWith(fresh);
      }, 5);
    </script>
  </body>
</html>
```

**Expected**: the ad disappears briefly, then reappears in the fresh element — the *same* ad,
with no second network request to ad-serve-api (confirm via the browser's network inspector: only
one `GET /ads` call total).

## Scenario 6: Redisplay eventually gives up if the ad keeps getting removed (FR-010)

Same as Scenario 5, but the polling script keeps replacing the rendered element every time an
iframe reappears, indefinitely (simulating something pathological, well beyond a one-time
hydration event):

```html
<script>
  setInterval(() => {
    const iframe = document.querySelector("[data-ad-serve-slot] iframe");
    if (!iframe) return;
    const slot = document.querySelector("[data-ad-serve-slot]");
    slot.replaceWith(slot.cloneNode(false));
  }, 5);
</script>
```

**Expected**: after a small, bounded number of redisplay attempts, the ad stops reappearing and
the slot settles as empty — the page never ends up in an infinite render/remove loop, and no
error appears in the console.

## Cleanup

No persistent state is created by this feature's own scenarios; standalone test pages need no
cleanup. Scenario 1 reuses whatever adconfig/eventpulse state the full-circle integration test
already established.
