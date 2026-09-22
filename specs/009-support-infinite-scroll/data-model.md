# Data Model: Discover and Fill Dynamically Inserted Ad Slots

No new network request/response shapes (research.md Decision 5). This feature changes internal
orchestrator state management and adds one public method.

## `adOrchestrator.ts` — internal state changes

```ts
interface TrackedSlot {
  // ...all existing fields, unchanged...

  // NEW — replaces the single module-level notifySlotSettled pointer (research.md Decision 1).
  // Set once, at creation, to the owning run() call's own disconnectIfAllResolved. resolveSlot()/
  // settleRedisplayTracking() call this instead of a shared outer reference, so one run()'s slots
  // can never trigger a different run()'s disconnect check.
  notifySettled: () => void;
}
```

```ts
export function createAdOrchestrator({ client, renderer, viewabilityDetector, trackingClient, sessionId }: AdOrchestratorDeps) {
  // NEW — orchestrator-instance-scoped, not module-level and not per-run (research.md Decision 2).
  // Every element ever turned into a TrackedSlot by any run() call on this instance is added here:
  // at initial discovery, and again whenever a redisplay assigns a slot a new current element.
  // discoverSlots/groupDiscoveredSlots results are filtered against this before a TrackedSlot is
  // ever created for an element.
  const claimedElements = new WeakSet<Element>();

  // notifySlotSettled (the old single `let`) is removed — resolveSlot/settleRedisplayTracking now
  // take their notify target from `slot.notifySettled` instead.

  function run(root: Node & ParentNode): void {
    // unchanged discovery loop, except:
    //   - groupDiscoveredSlots(root) results are filtered: skip any { element } already in
    //     claimedElements
    //   - each newly created TrackedSlot's element is added to claimedElements
    //   - each TrackedSlot gets `notifySettled: disconnectIfAllResolved` (this call's own instance)
    // processMutationBatch's redisplay branch additionally adds `current` to claimedElements
    // whenever it assigns `slot.renderedElement = current`.
  }

  return { run };
}
```

No change to the returned public shape (`{ run }`) — `run` itself becomes safely callable more than
once; no second method is added (research.md Decision 3).

## `index.ts` — new public surface

```ts
declare global {
  interface Window {
    adServe?: {
      q: unknown[];
      // NEW — present once main()'s bootstrap has run. Absent (or still just the queue-only shape)
      // before then, which is exactly why q exists: a host page can call
      // window.adServe.q.push(() => window.adServe.refresh(root)) safely regardless of load timing.
      refresh?: (root?: Node & ParentNode) => void;
    };
  }
}
```

`main()`, after its existing `orchestrator.run(document)` call for initial load:

1. Defines `window.adServe.refresh = (root) => { try { orchestrator.run(root ?? document); } catch
   { /* Principle V */ } }`.
2. Drains whatever is already in `window.adServe.q`: each entry invoked as a zero-argument callback,
   individually wrapped in try/catch (one queued callback throwing must not stop the rest from
   running).
3. Replaces `window.adServe.q.push` with a function that invokes its argument immediately (same
   try/catch), so any callback pushed after this point runs without waiting for a later drain.

## Key Entities (from spec.md)

- **Readiness Signal**: Realized as one call to `window.adServe.refresh(root?)` — either invoked
  directly (SDK already started) or queued via `window.adServe.q.push(...)` and drained once ready.
  Each call maps to exactly one `orchestrator.run(root ?? document)` invocation.
- **Newly Discovered Ad Slot**: A `TrackedSlot` created by a `run()` call whose element was not
  already present in `claimedElements` at scan time. Once created, indistinguishable in every other
  respect from a `TrackedSlot` created at initial page load — same `runSlot`, same rendering,
  tracking, and redisplay handling.
