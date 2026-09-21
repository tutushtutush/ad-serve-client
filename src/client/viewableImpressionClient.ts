export interface ViewableImpressionReport {
  platformId: string;
  adTypeId: string;
  adConfigId: string;
}

export type SendBeaconLike = (url: string) => boolean;
export type BeaconFetchLike = (url: string, init: { method: string; keepalive: boolean }) => unknown;

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
      const params = new URLSearchParams({
        platformId: report.platformId,
        adTypeId: report.adTypeId,
        adConfigId: report.adConfigId,
      });
      const url = `${baseUrl}/viewable-impression?${params.toString()}`;

      if (sendBeaconImpl && sendBeaconImpl(url)) {
        return;
      }
      fetchImpl?.(url, { method: "POST", keepalive: true });
    } catch {
      // See comment above.
    }
  }

  return { reportViewableImpression };
}
