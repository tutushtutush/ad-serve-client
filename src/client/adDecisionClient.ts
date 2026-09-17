import { withTimeout } from "../utils/withTimeout";
import type { AdCandidate, AdDecisionRequest, AdDecisionResult } from "../types";

export interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<FetchResponseLike>;

const DEFAULT_TIMEOUT_MS = 3000;

function buildQueryString(request: AdDecisionRequest): string {
  const params = new URLSearchParams({
    platformId: request.platformId,
    adTypeId: request.adTypeId,
  });
  if (request.country) {
    params.set("country", request.country);
  }
  if (request.deviceType) {
    params.set("deviceType", request.deviceType);
  }
  return params.toString();
}

function isAdCandidate(value: unknown): value is AdCandidate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.creative === "object" &&
    candidate.creative !== null &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

function parseAdDecisionBody(body: unknown): AdDecisionResult {
  if (typeof body !== "object" || body === null || !("ad" in body)) {
    return { status: "empty" };
  }
  const ad = (body as { ad: unknown }).ad;
  if (ad === null) {
    return { status: "empty" };
  }
  if (isAdCandidate(ad)) {
    return { status: "filled", ad };
  }
  return { status: "empty" };
}

/**
 * Thin wrapper around ad-serve-api's `GET /ads`. Every non-success outcome —
 * `{ad: null}`, 404, 400, a network error, a timeout, or a malformed body —
 * is normalized to the same `{status: "empty"}` shape (research.md), so
 * callers never need to branch on *why* a slot didn't get an ad.
 */
export function createAdDecisionClient(
  fetchImpl: FetchLike,
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  async function requestAd(request: AdDecisionRequest): Promise<AdDecisionResult> {
    try {
      const response = await withTimeout(timeoutMs, (signal) =>
        fetchImpl(`${baseUrl}/ads?${buildQueryString(request)}`, { signal }),
      );
      if (!response.ok) {
        return { status: "empty" };
      }
      const body = await response.json();
      return parseAdDecisionBody(body);
    } catch {
      return { status: "empty" };
    }
  }

  return { requestAd };
}
