import { buildTrackingUrl } from "../utils/buildTrackingUrl";

export interface ViewableImpressionReport {
  platformId: string;
  adTypeId: string;
  adConfigId: string;
  // ad-serve-api's per-serving dedup key (feature 014/007) — optional, same treatment as every
  // other field here: absent just means no dedup key is sent, never blocks the report.
  impressionId?: string;
  // This SDK's own originated visitor session identifier (feature 008) — same optional,
  // degrade-silently treatment as impressionId above.
  sessionId?: string;
}

export type SendBeaconLike = (url: string) => boolean;
export type BeaconFetchLike = (
  url: string,
  init: { method: string; keepalive: boolean },
) => Promise<unknown> | unknown;

export interface ViewableImpressionClientLike {
  reportViewableImpression(report: ViewableImpressionReport): void;
}

/**
 * Thin, fire-and-forget wrapper around ad-serve-api's `POST /viewable-impression`
 * (ad-serve-api/specs/009-viewable-impressions/contracts/viewable-impression-endpoint.md) —
 * always POST, no body, response never read by any caller here, matching that contract's own
 * `navigator.sendBeacon()`-oriented design (research.md). Prefers `sendBeaconImpl`; falls back to
 * `fetchImpl` with `keepalive: true` when `sendBeaconImpl` is absent or returns `false`.
 */
export function createViewableImpressionClient(
  baseUrl: string,
  sendBeaconImpl: SendBeaconLike | undefined,
  fetchImpl: BeaconFetchLike | undefined,
): ViewableImpressionClientLike {
  function reportViewableImpression(report: ViewableImpressionReport): void {
    if (!baseUrl) {
      return;
    }

    // Wrapped end-to-end: this is called from a browser-triggered viewability callback this SDK
    // doesn't control the timing of, and neither transport's failure may ever propagate
    // (Constitution Principle V, FR-006).
    try {
      const url = buildTrackingUrl(baseUrl, "viewable-impression", {
        platformId: report.platformId,
        adTypeId: report.adTypeId,
        adConfigId: report.adConfigId,
        impressionId: report.impressionId,
        sessionId: report.sessionId,
      });

      if (sendBeaconImpl && sendBeaconImpl(url)) {
        return;
      }
      // The try/catch above only guards a *synchronous* throw from fetchImpl — a real fetch call
      // returns a Promise, and a rejection (offline, DNS failure, CORS) would otherwise surface as
      // an unhandled promise rejection, propagating to the host page's own `unhandledrejection`
      // listeners regardless of this function's own try/catch (caught in code review — confirmed
      // by reproducing it against a rejecting fake before this fix).
      const pending = fetchImpl?.(url, { method: "POST", keepalive: true });
      if (pending && typeof (pending as { catch?: unknown }).catch === "function") {
        (pending as Promise<unknown>).catch(() => {});
      }
    } catch {
      // See comment above.
    }
  }

  return { reportViewableImpression };
}
