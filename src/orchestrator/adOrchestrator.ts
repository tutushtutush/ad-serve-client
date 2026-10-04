import { asSafeString } from "../utils/asSafeString";
import { normalizeCategories } from "../utils/normalizeCategories";
import { groupSlotsForBatch } from "../utils/groupSlotsForBatch";
import { parseBreakpointList, pickByBreakpoint, type BreakpointEntry } from "../utils/breakpointList";
import type { ViewabilityDetectorLike } from "../utils/viewabilityDetector";
import type { ViewableImpressionReport } from "../client/viewableImpressionClient";
import type {
  AdCandidate,
  AdDecisionRequest,
  AdDecisionResult,
  AdSlotConfig,
  BatchEntryResult,
  BatchSharedFields,
  PlacementIdentity,
  SetContextPayload,
} from "../types";

// Re-exported so consumers of this module (index.ts, tests) don't need to know it actually lives
// in viewabilityDetector.ts — caught in review of #8: this used to be redeclared here as its own,
// independently-maintained interface structurally identical to the real one, which meant every
// signature change (like onGiveUp) had to be hand-edited in both places with nothing catching a
// future drift between them.
export type { ViewabilityDetectorLike };

export interface AdDecisionClientLike {
  requestAd(request: AdDecisionRequest): Promise<AdDecisionResult>;
  // Feature 012. Optional so a client without it (every older test fake, any custom client) simply
  // keeps the one-request-per-slot behaviour. Resolves to null when the whole batch can't be used.
  requestAdBatch?(
    requests: AdDecisionRequest[],
    shared: BatchSharedFields,
  ): Promise<BatchEntryResult[] | null>;
}

export interface AdRendererLike {
  renderAd(slotElement: Element, ad: AdCandidate, placement: PlacementIdentity, sessionId?: string): void;
}

export interface ViewableImpressionClientLike {
  reportViewableImpression(report: ViewableImpressionReport): void;
}

export interface AdOrchestratorDeps {
  client: AdDecisionClientLike;
  renderer: AdRendererLike;
  // Optional (data-model.md, feature 005): an orchestrator built without either simply never
  // starts a viewability watch, the same degrade-safely posture as a missing adConfigId — so
  // every pre-existing test of unrelated behavior doesn't also need viewability fakes. Real usage
  // (index.ts) always supplies both.
  viewabilityDetector?: ViewabilityDetectorLike;
  trackingClient?: ViewableImpressionClientLike;
  // This SDK's own originated visitor session identifier (feature 008) — read once by index.ts
  // via getOrCreateSessionId() and handed here as a single, already-resolved value, not obtained
  // by this module itself (research.md Decision 1). Forwarded, unmodified, into every
  // requestAd/reportViewableImpression/renderAd call this run makes, so every request on one page
  // load shares the identical value (spec.md US2). Absent (undefined) when origination failed for
  // any reason — every call site already treats an absent optional field as "omit it," so no
  // special-casing is needed here beyond simply passing the value through.
  sessionId?: string;
  // The width of the window the SDK runs in (feature 011), injected rather than read from `window`
  // here (Constitution Principle III). Read when slots are discovered, to pick an ad type from a
  // slot's data-ad-types. Omitted, or returning something unusable, it counts as 0 — so only list
  // entries starting at 0 can match and single-type slots behave exactly as before.
  getViewportWidth?: () => number;
}

const SLOT_SELECTOR = "[data-ad-serve-slot]";

// ad-serve-api's per-request placement limit for POST /ads/batch (its spec 003 FR-007).
const MAX_BATCH_PLACEMENTS = 50;

/**
 * Reads a slot element's data-* attributes into an AdSlotConfig. Returns
 * null when required fields are missing — an invalid slot per FR-005, which
 * must never reach the Client.
 */
// What a slot element declares in its attributes, independent of the screen: the raw text is what
// a slot's identity is built from (see makeGroupKey), so a window resize can never change it.
interface SlotDeclaration {
  element: Element;
  platformId: string;
  adTypeIdAttribute: string | null;
  adTypesAttribute: string | null;
  adTypeEntries: BreakpointEntry[];
  country: string | null;
  deviceType: string | null;
  category: string | null;
}

// Null when the slot can never be valid whatever the screen: no platform, or neither a single ad
// type nor a single usable data-ad-types entry (FR-005, feature 001).
function readSlotDeclaration(element: Element): SlotDeclaration | null {
  const platformId = element.getAttribute("data-platform-id");
  const adTypeIdAttribute = element.getAttribute("data-ad-type-id");
  const adTypesAttribute = element.getAttribute("data-ad-types");
  const adTypeEntries = parseBreakpointList(adTypesAttribute);
  if (!platformId || (!adTypeIdAttribute && adTypeEntries.length === 0)) {
    return null;
  }
  return {
    element,
    platformId,
    adTypeIdAttribute,
    adTypesAttribute,
    adTypeEntries,
    country: element.getAttribute("data-country"),
    deviceType: element.getAttribute("data-device-type"),
    category: element.getAttribute("data-category"),
  };
}

// A usable data-ad-types entry for this width wins; otherwise the single data-ad-type-id; otherwise
// nothing, and the slot makes no request (feature 011, data-model.md).
function resolveAdTypeId(declaration: SlotDeclaration, viewportWidth: number): string | undefined {
  return pickByBreakpoint(declaration.adTypeEntries, viewportWidth) ?? (declaration.adTypeIdAttribute || undefined);
}

function buildSlotConfig(declaration: SlotDeclaration, viewportWidth: number): AdSlotConfig | null {
  const adTypeId = resolveAdTypeId(declaration, viewportWidth);
  if (!adTypeId) {
    return null;
  }

  const config: AdSlotConfig = { platformId: declaration.platformId, adTypeId, element: declaration.element };
  if (declaration.country) {
    config.country = declaration.country;
  }
  if (declaration.deviceType) {
    config.deviceType = declaration.deviceType;
  }
  if (declaration.category) {
    config.category = declaration.category;
  }
  return config;
}

export function parseSlotConfig(element: Element, viewportWidth = 0): AdSlotConfig | null {
  const declaration = readSlotDeclaration(element);
  return declaration ? buildSlotConfig(declaration, viewportWidth) : null;
}

export function discoverSlots(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(SLOT_SELECTOR));
}

// A Tracked Slot's identity survives its element being replaced (e.g. a host
// page's own framework re-rendering shortly after load). Since a replacement
// DOM node has no identity linking it back to the original, position within
// a group of same-configuration elements — in document order — is the one
// signal that does survive a like-for-like replacement (research.md).
function makeGroupKey(declaration: SlotDeclaration): string {
  return JSON.stringify([
    declaration.platformId,
    declaration.adTypeIdAttribute,
    declaration.adTypesAttribute,
    declaration.country,
    declaration.deviceType,
    declaration.category,
  ]);
}

// How many times a slot's ad may be (re)displayed after the first successful
// render if it keeps getting removed (FR-010), and how many consecutive
// mutation batches it must survive, once (re)displayed, before it's
// considered settled and watching stops (FR-008). Both are bounded by
// discrete events, not wall-clock time (research.md).
const INITIAL_REDISPLAYS_REMAINING = 3;
const INITIAL_QUIET_BATCHES_REMAINING = 10;

// Caught in review (ad-serve-client#9): quietBatchesRemaining above only ever decrements when a
// mutation batch actually fires. A page that mutates once (the initial render itself) and never
// again leaves it permanently one batch short of settling, so a slot's redisplay tracking — and
// the top-level MutationObserver/trackedSlots array this file retains until every slot settles —
// never releases, for the rest of the page's life. This wall-clock fallback (feature 006) bounds
// that: past this point since a slot's most recent (re)display, its redisplay tracking settles
// anyway, the same outcome the quiet-batch path already produces. Sized like
// viewabilityDetector.ts's MAX_WATCH_DURATION_MS (feature/#8), the established precedent for this
// exact style of "bound a watch that might otherwise never conclude" fix in this codebase.
export const REDISPLAY_SETTLE_TIMEOUT_MS = 2 * 60 * 1000;

interface TrackedSlot {
  config: AdDecisionRequest;
  groupKey: string;
  groupPosition: number;
  currentElement: Element | null;
  resolved: boolean;
  // Set once the ad decision arrives filled; remembered so a redisplay
  // (FR-009) reuses it rather than requesting again (research.md).
  ad: AdCandidate | null;
  // The specific element last rendered into — checked each mutation batch
  // for disconnection to detect the FR-009 case.
  renderedElement: Element | null;
  redisplaysRemaining: number;
  quietBatchesRemaining: number;
  // The active viewability watch's stop function, or null when none is pending (never started,
  // already fired, or already stopped). Stopped and reset to null on redisplay (a fresh watch
  // starts for the new element, FR-003) and whenever the slot is marked resolved (FR-007) —
  // see resolveSlot/startViewabilityWatch below (feature 005).
  stopViewabilityWatch: (() => void) | null;
  // This slot's own run() call's disconnectIfAllResolved (feature 009) — set once, at creation.
  // resolveSlot/settleRedisplayTracking call this instead of a single shared outer pointer, so one
  // run() call's slots can never trigger a *different* run() call's disconnect check (the bug a
  // prior version of this file documented but didn't fix: a second run() call would overwrite the
  // first's pointer, leaking the first call's MutationObserver or disconnecting it on the wrong
  // condition).
  notifySettled: () => void;
  // True once a viewable impression has been reported for this slot's ad. A redisplay reuses the
  // same already-fetched slot.ad (FR-009, research.md) rather than requesting a new one, so this
  // flag is scoped per slot rather than per (slot, redisplay instance) — it stays valid identity
  // for the ad across every redisplay. Caught in review (eventpulse #58 / ad-serve-client #7): a
  // slot redisplayed within its budget (default 3 extra attempts) started an independent watch
  // each time with no memory of a prior report, so a single ad shown once could produce up to 4
  // duplicate viewable-impression events. Checked at the top of startViewabilityWatch so a
  // redisplay after reporting doesn't even start a new IntersectionObserver.
  viewableImpressionReported: boolean;
  // The pending wall-clock settle timer (feature 006), or null when none is pending — never
  // started, already fired, or already cleared. The same invariant discipline as
  // stopViewabilityWatch above: every place that ends a slot's tracked-for-redisplay lifetime
  // (resolveSlot, settleRedisplayTracking) MUST clear this too, and every (re)display MUST
  // restart it (see scheduleSettleTimer below).
  settleTimer: ReturnType<typeof setTimeout> | null;
}

interface GroupedSlotElement {
  element: Element;
  // Null when no ad type resolves at the current width (feature 011): the slot still counts toward
  // its group's positions, so identity matching never shifts with the screen, but it is never
  // tracked or requested.
  config: AdDecisionRequest | null;
  groupKey: string;
  groupPosition: number;
}

// Scans root for every validly-configured slot element, grouping them by
// their (platformId, adTypeId, country, deviceType, category) tuple in document
// order. The single source of truth for group-position computation — used
// both to create Tracked Slots at discovery time and to re-resolve their
// current element on every later mutation (research.md) — so the two can
// never silently diverge on how positions are assigned.
function groupDiscoveredSlots(root: ParentNode, viewportWidth: number): GroupedSlotElement[] {
  const groupCounts = new Map<string, number>();
  const grouped: GroupedSlotElement[] = [];

  for (const element of discoverSlots(root)) {
    const declaration = readSlotDeclaration(element);
    if (!declaration) {
      continue; // invalid config: never tracked, never requested (FR-005, feature 001)
    }
    const parsed = buildSlotConfig(declaration, viewportWidth);
    const config: AdDecisionRequest | null = parsed && {
      platformId: parsed.platformId,
      adTypeId: parsed.adTypeId,
      country: parsed.country,
      deviceType: parsed.deviceType,
      category: parsed.category,
    };
    const groupKey = makeGroupKey(declaration);
    const groupPosition = groupCounts.get(groupKey) ?? 0;
    groupCounts.set(groupKey, groupPosition + 1);
    grouped.push({ element, config, groupKey, groupPosition });
  }

  return grouped;
}

function mapSlotsByGroupPosition(root: ParentNode, viewportWidth: number): Map<string, Element> {
  const byPosition = new Map<string, Element>();
  for (const { element, groupKey, groupPosition } of groupDiscoveredSlots(root, viewportWidth)) {
    byPosition.set(`${groupKey}#${groupPosition}`, element);
  }
  return byPosition;
}

export function createAdOrchestrator({
  client,
  renderer,
  viewabilityDetector,
  trackingClient,
  sessionId,
  getViewportWidth,
}: AdOrchestratorDeps) {
  // Every element any run() call on this instance has already turned into a TrackedSlot — at
  // initial discovery, and again on each redisplay's replacement element (feature 009). A later
  // run() call's discovery loop skips any element already in here, so a readiness signal whose
  // scanned region overlaps previously-handled content never re-requests or re-renders an
  // already-claimed slot (FR-003). A WeakSet needs no manual cleanup: an element that's later
  // garbage-collected (removed from the DOM with nothing else referencing it) simply drops out.
  const claimedElements = new WeakSet<Element>();

  // Read each time slots are discovered or re-matched; anything unusable counts as 0 (feature 011).
  function currentViewportWidth(): number {
    try {
      const width = getViewportWidth?.();
      return typeof width === "number" && Number.isFinite(width) && width >= 0 ? width : 0;
    } catch {
      return 0;
    }
  }

  // The categories the host page declared for the whole page (feature 010), already normalized.
  // Read when each request is built, never captured on a slot, so a later declaration applies to
  // every request made after it without touching slot identity (research.md Decisions 3-4).
  let pageCategories: string[] = [];

  // Replaces the page's categories: absent or empty clears them, a list with at least one usable
  // entry replaces them. A payload that isn't an object, whose `categories` isn't a list, or whose
  // non-empty list has no usable entry is ignored and the previous categories kept, so a typo
  // can't silently drop targeting (spec.md edge cases).
  function setContext(payload: unknown): void {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return;
    }
    const { categories } = payload as SetContextPayload;
    if (categories === undefined) {
      pageCategories = [];
      return;
    }
    if (!Array.isArray(categories)) {
      return;
    }
    const normalized = normalizeCategories(categories);
    if (categories.length > 0 && normalized.length === 0) {
      return; // had entries but none usable — malformed, not a clear
    }
    pageCategories = normalized;
  }

  // The one place a request's category is decided: the slot's own wins outright (no merging),
  // otherwise the page's, otherwise none. A future batch request builder must reuse this.
  function resolveCategory(slotCategory: string | undefined): string | undefined {
    if (slotCategory && slotCategory.trim() !== "") {
      return slotCategory;
    }
    return pageCategories.length > 0 ? pageCategories.join(",") : undefined;
  }

  // Wrapped, not called directly — caught in review of #10: unlike every other schedule-driven
  // entry point in this file, a bare call to a slot's notify hook had no guard of its own. If
  // `slot.notifySettled()` itself ever threw (a hostile/patched host-page global, a broken
  // MutationObserver polyfill), the throw would propagate out of resolveSlot()/
  // settleRedisplayTracking() — including out of runSlot()'s own catch block, which calls
  // resolveSlot() again on failure, risking an unhandled rejection on runSlot(...).finally(...)
  // reaching the host page (Constitution Principle V).
  function safeNotifySettled(slot: TrackedSlot): void {
    try {
      slot.notifySettled();
    } catch {
      // See comment above.
    }
  }

  // Marks a slot resolved and stops any viewability watch still pending for it — used only where
  // the rendered instance is genuinely gone for good (never rendered, a decision failure, or
  // removed with no redisplay budget left to bring it back) and so could never become viewable
  // (FR-007).
  function resolveSlot(slot: TrackedSlot): void {
    slot.resolved = true;
    slot.stopViewabilityWatch?.();
    slot.stopViewabilityWatch = null;
    if (slot.settleTimer !== null) {
      clearTimeout(slot.settleTimer);
      slot.settleTimer = null;
    }
    safeNotifySettled(slot);
  }

  // Stops only the redisplay/mutation-tracking bookkeeping for a slot whose rendered element is
  // still connected and still on the page — deliberately does NOT touch stopViewabilityWatch.
  // Caught in code review: the FR-008 "quiet batches" settle counter bounds how long to keep
  // re-checking for *redisplay churn* (a proxy for "has the host page's own hydration/redraw
  // settled down"), which is an unrelated question from "will the user ever scroll to this ad" —
  // any unrelated DOM activity elsewhere in the observed subtree (a chat widget, a live ticker)
  // can produce 10 mutation batches in seconds, long before a viewer scrolls to a slot below the
  // fold. Routing that case through resolveSlot() would silently stop watching a still-visible-
  // to-come ad, undercounting real viewable impressions — directly against this feature's core
  // accuracy guarantee (SC-002). The element being still connected is exactly the signal that
  // it remains eligible indefinitely; only genuine removal (handled by resolveSlot() elsewhere in
  // this function) ends eligibility.
  function settleRedisplayTracking(slot: TrackedSlot): void {
    slot.resolved = true;
    if (slot.settleTimer !== null) {
      clearTimeout(slot.settleTimer);
      slot.settleTimer = null;
    }
    safeNotifySettled(slot);
  }

  // Restarts slot's wall-clock settle fallback (feature 006) — called every time it's (re)rendered,
  // the same two moments quietBatchesRemaining is reset. If REDISPLAY_SETTLE_TIMEOUT_MS elapses
  // with no mutation batch having settled or resolved the slot first, settles it via the exact same
  // settleRedisplayTracking() the quiet-batch path already uses, producing an identical outcome
  // (viewability watch untouched). No-ops if the slot got there some other way first, or if its
  // rendered element is no longer connected (a disconnect-triggered mutation batch is either
  // already handling this slot or about to).
  function scheduleSettleTimer(slot: TrackedSlot): void {
    if (slot.settleTimer !== null) {
      clearTimeout(slot.settleTimer);
    }
    slot.settleTimer = setTimeout(() => {
      try {
        slot.settleTimer = null;
        if (slot.resolved || !slot.renderedElement || !slot.renderedElement.isConnected) {
          return;
        }
        settleRedisplayTracking(slot);
      } catch {
        // Runs on a schedule this SDK doesn't control the timing of — must never propagate to the
        // host page (Constitution Principle V), matching every other timer callback in this file.
      }
    }, REDISPLAY_SETTLE_TIMEOUT_MS);
  }

  // Starts a fresh viewability watch for a just-rendered instance of `slot`, reporting via
  // `trackingClient` once the IAB threshold (research.md) is satisfied. No-ops when either
  // dependency wasn't supplied (data-model.md) or `adConfigId` is unavailable (FR-004) — there's
  // nothing to report in either case, so no observer is started at all.
  function startViewabilityWatch(slot: TrackedSlot, element: Element): void {
    slot.stopViewabilityWatch?.();
    slot.stopViewabilityWatch = null;

    // Already reported for this slot's ad on an earlier (re)display — nothing left to watch for,
    // and starting another observer would risk yet another duplicate report (see
    // viewableImpressionReported's doc comment on TrackedSlot).
    if (slot.viewableImpressionReported) {
      return;
    }

    // adConfigId is coerced through asSafeString, same as adRenderer.ts's resolveClickHref does
    // for the identical field (feature 004) — isAdCandidate() in adDecisionClient.ts never
    // validates adConfigId's type, so a schema-drifted response (a number/object) must degrade to
    // "no report attempted", not sail through a truthy check and corrupt the report URL (caught in
    // code review; reproduced: a non-string adConfigId produced
    // "adConfigId=%5Bobject+Object%5D").
    const adConfigId = asSafeString(slot.ad?.adConfigId);
    if (!viewabilityDetector || !trackingClient || !adConfigId) {
      return;
    }

    // Coerced the same way as adConfigId above (feature 007) — impressionId is equally opaque,
    // upstream-sourced data that isAdCandidate() never validates the type of. Read at report time
    // via slot.ad, so a redisplay (which reuses the same slot.ad, never re-requesting) reports the
    // same impressionId as the original serving, never a freshly minted one (research.md
    // Decision 3, spec Acceptance Scenario 4).
    const impressionId = asSafeString(slot.ad?.impressionId) || undefined;

    slot.stopViewabilityWatch = viewabilityDetector.watch(element, () => {
      slot.stopViewabilityWatch = null;
      slot.viewableImpressionReported = true;
      // Wrapped here too, not just inside viewabilityDetector.ts's own callback — this closure is
      // itself an entry point invoked on a schedule this SDK doesn't control, and defense-in-depth
      // (this codebase's established pattern: never trust a single layer's contract alone) means
      // a throw from trackingClient must not propagate regardless of whether the injected
      // ViewabilityDetectorLike implementation also happens to guard its own callback invocation
      // (Constitution Principle V, FR-006).
      try {
        trackingClient.reportViewableImpression({
          platformId: slot.config.platformId,
          adTypeId: slot.config.adTypeId,
          adConfigId,
          impressionId,
          sessionId,
        });
      } catch {
        // See comment above.
      }
    }, () => {
      // The watch gave up on its own (MAX_WATCH_DURATION_MS elapsed, viewabilityDetector.ts) —
      // its stop() is now inert, so the documented invariant on stopViewabilityWatch ("null when
      // none is pending ... or already stopped") requires nulling it here too, not just on the
      // onViewable path above (caught in code review of #8).
      slot.stopViewabilityWatch = null;
    });
  }

  async function runSlot(slot: TrackedSlot): Promise<void> {
    try {
      const result = await client.requestAd({
        ...slot.config,
        category: resolveCategory(slot.config.category),
        sessionId,
      });
      applyResult(slot, result);
    } catch {
      // A slot that fails for any unexpected reason simply stays empty —
      // never let it escape to the host page (Constitution Principle V).
      resolveSlot(slot);
    }
  }

  // Shared by the single-request and the batch path: puts one slot's decision on the page. May
  // throw; both callers catch and resolve the slot.
  function applyResult(slot: TrackedSlot, result: AdDecisionResult): void {
    if (result.status !== "filled") {
      resolveSlot(slot);
      return;
    }

    // Read at resolution time, not capture time: currentElement may have
    // been reassigned any number of times while this request was in
    // flight (FR-003). isConnected is a final safety net against a
    // last-instant removal the observer hasn't reacted to yet.
    if (!slot.currentElement || !slot.currentElement.isConnected) {
      resolveSlot(slot);
      return;
    }

    slot.ad = result.ad;
    renderer.renderAd(
      slot.currentElement,
      result.ad,
      { platformId: slot.config.platformId, adTypeId: slot.config.adTypeId },
      sessionId,
    );
    slot.renderedElement = slot.currentElement;
    startViewabilityWatch(slot, slot.currentElement);
    scheduleSettleTimer(slot);
    // Deliberately not resolved yet: the render may itself be undone
    // shortly afterward by the host page's own redraw (e.g. a hydration
    // mismatch discarding the subtree it landed in) — the mutation
    // observer watches renderedElement and redisplays if needed, up to
    // a bounded number of attempts, before finally settling (FR-009/010).
  }

  // Feature 012: one call for slots that share a category, country and device type, so
  // ad-serve-api can give each a different ad. Never leaves a slot worse off than a single request
  // would: a failed call (null or a throw) sends every slot down the single path, and an entry the
  // server couldn't answer sends only its own slot.
  async function runBatch(slots: TrackedSlot[]): Promise<void> {
    const [first] = slots;
    let results: BatchEntryResult[] | null = null;
    try {
      results =
        (await client.requestAdBatch?.(
          slots.map((slot) => slot.config),
          {
            country: first.config.country,
            deviceType: first.config.deviceType,
            category: resolveCategory(first.config.category),
            sessionId,
          },
        )) ?? null;
    } catch {
      results = null;
    }

    await Promise.all(
      slots.map(async (slot, index) => {
        const result = results?.[index];
        if (!result || result.status === "failed") {
          await runSlot(slot);
          return;
        }
        try {
          applyResult(slot, result);
        } catch {
          resolveSlot(slot);
        }
      }),
    );
  }

  function run(root: Node & ParentNode): void {
    const trackedSlots: TrackedSlot[] = [];

    function disconnectIfAllResolved(): void {
      if (trackedSlots.every((slot) => slot.resolved)) {
        observer.disconnect();
      }
    }

    // Elements already claimed by an earlier run() call (or a redisplay within one) are skipped
    // here (feature 009, FR-003) — never re-requested or re-rendered just because this call's root
    // happens to overlap previously-handled content.
    for (const { element, config, groupKey, groupPosition } of groupDiscoveredSlots(root, currentViewportWidth())) {
      if (claimedElements.has(element)) {
        continue;
      }
      // Claimed even when no ad type resolves at this width (feature 011): "no ad" is this slot's
      // decision too, so a later run() after a resize must not quietly request one (FR-008).
      claimedElements.add(element);
      if (!config) {
        continue;
      }
      trackedSlots.push({
        config,
        groupKey,
        groupPosition,
        currentElement: element,
        resolved: false,
        ad: null,
        renderedElement: null,
        redisplaysRemaining: INITIAL_REDISPLAYS_REMAINING,
        quietBatchesRemaining: INITIAL_QUIET_BATCHES_REMAINING,
        stopViewabilityWatch: null,
        viewableImpressionReported: false,
        settleTimer: null,
        // This call's own disconnectIfAllResolved (feature 009) — see TrackedSlot.notifySettled.
        notifySettled: disconnectIfAllResolved,
      });
    }

    if (trackedSlots.length === 0) {
      return; // nothing new to track, nothing to observe
    }

    function processMutationBatch(): void {
      try {
        // Computed at most once per batch, and only if some slot actually needs it (feature 009)
        // — most mutation batches don't touch any of this call's own slots at all (unrelated host-
        // page activity, or another run() call's own subtree), so the full querySelectorAll +
        // regroup pass this performs is worth avoiding when nothing below will use it.
        let currentByPositionCache: Map<string, Element> | null = null;
        function getCurrentByPosition(): Map<string, Element> {
          if (currentByPositionCache === null) {
            currentByPositionCache = mapSlotsByGroupPosition(root, currentViewportWidth());
          }
          return currentByPositionCache;
        }

        for (const slot of trackedSlots) {
          if (slot.resolved) {
            continue;
          }

          if (!slot.renderedElement) {
            // Not yet rendered: if this slot's own element is still right where it was, leave it
            // alone — only recompute via document-order position when it's actually gone
            // (feature 009 fix). Recomputing unconditionally on every batch let a same-group slot
            // discovered by a *different* run()/refresh() call, inserted earlier in the document,
            // silently steal this slot's identity the moment document-order position 0 stopped
            // meaning this slot — even though this slot's own element never moved (FR-006/FR-007).
            // A genuine removal (the case FR-001/FR-002, feature 002 exists for) is still the only
            // thing that triggers a fresh lookup, exactly like the already-rendered branch below.
            if (slot.currentElement && slot.currentElement.isConnected) {
              continue;
            }
            slot.currentElement = getCurrentByPosition().get(`${slot.groupKey}#${slot.groupPosition}`) ?? null;
            continue;
          }

          // Rendered, watching for FR-009 (removal) or settling (FR-008). The element is still
          // connected here — settleRedisplayTracking, not resolveSlot: redisplay-churn watching
          // no longer being worth it says nothing about whether the ad might still be scrolled
          // into view later (see settleRedisplayTracking's comment).
          if (slot.renderedElement.isConnected) {
            slot.quietBatchesRemaining -= 1;
            if (slot.quietBatchesRemaining <= 0) {
              settleRedisplayTracking(slot);
            }
            continue;
          }

          const current = getCurrentByPosition().get(`${slot.groupKey}#${slot.groupPosition}`) ?? null;
          slot.currentElement = current;
          if (!current) {
            // No replacement in *this* batch doesn't mean gone for good — a
            // framework may remove and reinsert across separate mutation
            // batches rather than one coalesced swap. Keep waiting, bounded
            // by the same quiet-batch counter, rather than giving up on the
            // first empty observation (that would reintroduce the very
            // failure this feature exists to fix).
            slot.quietBatchesRemaining -= 1;
            if (slot.quietBatchesRemaining <= 0) {
              resolveSlot(slot);
            }
            continue;
          }
          if (slot.redisplaysRemaining <= 0) {
            // A current element exists, but the redisplay budget is
            // exhausted — leave the slot in whatever state it last reached
            // (FR-010).
            resolveSlot(slot);
            continue;
          }

          // Redisplay the same, already-fetched ad — never a second request
          // (research.md).
          renderer.renderAd(
            current,
            slot.ad as AdCandidate,
            { platformId: slot.config.platformId, adTypeId: slot.config.adTypeId },
            sessionId,
          );
          slot.renderedElement = current;
          // The replacement element is claimed too (feature 009), not just the originally
          // discovered one — otherwise a later run() call whose root happens to include this
          // replacement (rather than the element it replaced) would mistake it for a new slot.
          claimedElements.add(current);
          slot.redisplaysRemaining -= 1;
          slot.quietBatchesRemaining = INITIAL_QUIET_BATCHES_REMAINING;
          // A redisplayed instance is independently eligible to be reported again — a fresh
          // watch, not a continuation of whatever the pre-redisplay one was doing (FR-003,
          // spec Acceptance Scenario 4).
          startViewabilityWatch(slot, current);
          scheduleSettleTimer(slot);
        }
      } catch {
        // A defect here must never escape into the host page's own
        // mutation/render cycle — skip this batch, the next mutation gets
        // another chance (Constitution Principle V).
      }
      disconnectIfAllResolved();
    }

    const observer = new MutationObserver(processMutationBatch);
    observer.observe(root, { childList: true, subtree: true });

    // Deliberately not awaited in the loop: each slot's pipeline starts
    // immediately and independently, so one slot's latency or failure can
    // never delay or affect another (FR-006/FR-007, feature 001).
    // Feature 012: slots found by this one scan are requested together when they share the details
    // a batch can carry (resolved category, country, device type). A group of one, or a client
    // without a batch call, takes the unchanged single-request path.
    const chunks = client.requestAdBatch
      ? groupSlotsForBatch(
          trackedSlots,
          (slot) =>
            JSON.stringify([resolveCategory(slot.config.category), slot.config.country, slot.config.deviceType]),
          MAX_BATCH_PLACEMENTS,
        )
      : trackedSlots.map((slot) => [slot]);
    for (const chunk of chunks) {
      if (chunk.length > 1) {
        runBatch(chunk).finally(disconnectIfAllResolved);
      } else {
        runSlot(chunk[0]).finally(disconnectIfAllResolved);
      }
    }
  }

  return { run, setContext };
}
