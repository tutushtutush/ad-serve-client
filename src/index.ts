import { createAdDecisionClient } from "./client/adDecisionClient";
import { createViewableImpressionClient } from "./client/viewableImpressionClient";
import { createAdOrchestrator } from "./orchestrator/adOrchestrator";
import { createAdRenderer } from "./renderer/adRenderer";
import { createViewabilityDetector } from "./utils/viewabilityDetector";
import { getOrCreateSessionId } from "./utils/sessionId";

declare global {
  interface Window {
    adServe?: { q: unknown[] };
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

      orchestrator.run(document);
    } catch {
      // A setup failure must never break the host page (Constitution
      // Principle V) — slots simply stay empty.
    }
  });
}

main();
