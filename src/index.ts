import { createAdDecisionClient } from "./client/adDecisionClient";
import { createViewableImpressionClient } from "./client/viewableImpressionClient";
import { createAdOrchestrator } from "./orchestrator/adOrchestrator";
import { applyQueuedCommand, isQueuedCommand } from "./orchestrator/queuedCommands";
import { createAdRenderer } from "./renderer/adRenderer";
import { createViewabilityDetector } from "./utils/viewabilityDetector";
import { getOrCreateSessionId } from "./utils/sessionId";
import type { QueuedCommand } from "./types";

declare global {
  interface Window {
    adServe?: {
      q: Array<(() => void) | QueuedCommand>;
      // Present once main()'s bootstrap has run (feature 009) — discovers and fills every
      // not-yet-claimed ad slot under `root` (defaulting to the whole page when omitted),
      // following the exact same fill/render/track behavior as this SDK's initial-load slots.
      // Absent before then, which is exactly why `q` exists: a host page can safely call
      // `window.adServe.q.push(() => window.adServe.refresh(root))` regardless of load timing.
      refresh?: (root?: Node & ParentNode) => void;
      // Declares the page's categories (feature 010); see specs/010-support-page-level-ad.
      setContext?: (payload: unknown) => void;
    };
  }
}

function getApiBaseUrl(): string {
  // Must run synchronously at module-evaluation time: document.currentScript
  // only identifies the currently-executing script and becomes null once
  // this script yields to the event loop (e.g. after an await).
  const scriptEl = document.currentScript as HTMLScriptElement | null;
  return scriptEl?.getAttribute("data-api-base-url") ?? "";
}

// A bare `window.sessionStorage` property read can itself throw (e.g. a sandboxed iframe missing
// allow-same-origin, or a browser/privacy configuration that blocks storage access) — this must
// be guarded independently of getOrCreateSessionId's own try/catch, since that only wraps the
// function body, not evaluating this expression in main()'s call-site argument list. An unguarded
// throw here would propagate out of the whole argument list, aborting main()'s try block before
// the orchestrator/client/renderer are even constructed — breaking ad serving entirely for this
// page load, not just leaving sessionId absent (caught in code review).
function getSessionStorageSafely(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function runWhenPageReady(callback: () => void): void {
  // This script loads via <script async>, which can execute before the
  // rest of the page's HTML (including slot elements below it) has been
  // parsed. Discovery must wait for that to finish.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

function main(): void {
  const baseUrl = getApiBaseUrl();

  runWhenPageReady(() => {
    try {
      window.adServe = window.adServe || { q: [] };

      const client = createAdDecisionClient(window.fetch.bind(window), baseUrl);
      const renderer = createAdRenderer(document, baseUrl);
      const viewabilityDetector = createViewabilityDetector(window.IntersectionObserver);
      const trackingClient = createViewableImpressionClient(
        baseUrl,
        typeof navigator.sendBeacon === "function" ? navigator.sendBeacon.bind(navigator) : undefined,
        window.fetch.bind(window),
      );
      // Feature 008: originated once per page load, read back on a later page load in the same
      // browsing session via sessionStorage (research.md Decisions 1-3) — undefined when storage
      // or crypto.randomUUID is unavailable, which every downstream call site already treats as
      // "omit this field" (Fail-Silent, Constitution Principle V).
      const sessionId = getOrCreateSessionId(
        getSessionStorageSafely(),
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID.bind(window.crypto)
          : undefined,
      );
      const orchestrator = createAdOrchestrator({
        client,
        renderer,
        viewabilityDetector,
        trackingClient,
        sessionId,
      });

      // Feature 010: `[name, payload]` entries a host page queued before this SDK started (e.g. a
      // page-level setContext) must take effect before the very first ad requests go out, so they
      // are applied here, ahead of run(). Plain callbacks keep running after it, below, since they
      // may call refresh(), which needs the initial run and its definition below to exist
      // (research.md Decision 2).
      const commandHandlers = { setContext: orchestrator.setContext };
      for (const queued of window.adServe.q) {
        if (isQueuedCommand(queued)) {
          applyQueuedCommand(queued, commandHandlers);
        }
      }

      orchestrator.run(document);

      // Feature 009: expose a re-discovery entry point for content inserted after this initial
      // load (e.g. infinite scroll), reusing this same orchestrator/client/renderer/sessionId
      // rather than reconstructing any of them. Defined before the queue is drained below, since a
      // queued callback may itself call window.adServe.refresh(...) (research.md Decision 4).
      const adServe = window.adServe;
      adServe.setContext = (payload) => {
        applyQueuedCommand(["setContext", payload], commandHandlers);
      };
      adServe.refresh = (root) => {
        try {
          orchestrator.run(root ?? document);
        } catch {
          // A refresh failure must never break the host page (Constitution Principle V) — the
          // slot(s) it would have discovered simply stay unfilled (FR-009).
        }
      };

      // Drain whatever a host page already queued before this SDK finished starting up — each
      // entry invoked as a zero-argument callback, individually wrapped so one throwing callback
      // doesn't stop the rest from running (FR-004/FR-009). Cleared afterward (caught in code
      // review): if this bundle's script tag is ever accidentally included twice on the same page,
      // an un-cleared queue would replay every already-handled callback against the *second*
      // bootstrap's brand-new orchestrator — which has no memory of what the first one already
      // claimed — producing duplicate requests for slots that are already filled.
      const queue = adServe.q;
      for (const queued of queue) {
        if (isQueuedCommand(queued)) {
          continue; // already applied before run(), above
        }
        try {
          queued();
        } catch {
          // See above.
        }
      }
      queue.length = 0;

      // Any callback pushed after this point runs immediately instead of merely being appended —
      // the same command-queue technique Google Publisher Tag/Prebid.js use (Constitution's
      // Technology & Architecture Constraints). Delegates to the real Array.prototype.push (not
      // recursively to this override) so the return value still honors push's normal contract —
      // the array's length immediately after appending, before this queue is drained back to empty
      // below (caught in code review: an earlier version returned queue.length without ever
      // actually appending, so it always reported a stale, unchanged length).
      queue.push = (...cmds: Array<(() => void) | QueuedCommand>): number => {
        const newLength = Array.prototype.push.apply(queue, cmds);
        for (const cmd of cmds) {
          if (isQueuedCommand(cmd)) {
            applyQueuedCommand(cmd, commandHandlers);
            continue;
          }
          try {
            cmd();
          } catch {
            // See above.
          }
        }
        queue.length = 0;
        return newLength;
      };
    } catch {
      // A setup failure must never break the host page (Constitution
      // Principle V) — slots simply stay empty.
    }
  });
}

main();
