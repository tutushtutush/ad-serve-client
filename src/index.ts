import { createAdDecisionClient } from "./client/adDecisionClient";
import { createViewableImpressionClient } from "./client/viewableImpressionClient";
import { createAdOrchestrator } from "./orchestrator/adOrchestrator";
import { createAdRenderer } from "./renderer/adRenderer";
import { createViewabilityDetector } from "./utils/viewabilityDetector";

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
      const orchestrator = createAdOrchestrator({ client, renderer, viewabilityDetector, trackingClient });

      orchestrator.run(document);
    } catch {
      // A setup failure must never break the host page (Constitution
      // Principle V) — slots simply stay empty.
    }
  });
}

main();
