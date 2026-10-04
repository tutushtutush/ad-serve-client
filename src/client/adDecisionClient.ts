import { withTimeout } from "../utils/withTimeout";
import type {
  AdCandidate,
  AdDecisionRequest,
  AdDecisionResult,
  BatchEntryResult,
  BatchSharedFields,
} from "../types";

export interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

export interface FetchInitLike {
  signal: AbortSignal;
  // Only the batch call (feature 012) sends a body.
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export type FetchLike = (url: string, init: FetchInitLike) => Promise<FetchResponseLike>;

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
  if (request.category) {
    params.set("category", request.category);
  }
  if (request.sessionId) {
    params.set("sessionId", request.sessionId);
  }
  return params.toString();
}

// creative is genuinely opaque (research.md; ad-serve-api's own contract makes
// no guarantee about which fields are present — only the fields a campaign
// actually set are included, not every field backfilled with a default). The
// Client only checks that it's a plausible object; per-field type safety for
// whichever fields the Renderer actually uses is the Renderer's job
// (adRenderer.ts), since only it knows which fields it dereferences.
function isAdCandidate(value: unknown): value is AdCandidate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.creative === "object" &&
    candidate.creative !== null &&
    typeof candidate.width === "number" &&
    candidate.width > 0 &&
    typeof candidate.height === "number" &&
    candidate.height > 0
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// "no-ad"/"not-found" are final ("empty", like a single {ad: null}/404); a found entry with an
// unusable ad, "error", "invalid" or anything unrecognised is "failed", so just that slot retries
// as a single request.
function parseBatchEntry(entry: Record<string, unknown>): BatchEntryResult {
  switch (entry.outcome) {
    case "found":
      return isAdCandidate(entry.ad) ? { status: "filled", ad: entry.ad } : { status: "failed" };
    case "no-ad":
    case "not-found":
      return { status: "empty" };
    default:
      return { status: "failed" };
  }
}

// Applying results to the wrong slots would be worse than not batching, so a response is only
// trusted when it has one entry per requested placement, in order, each echoing the placement it
// answers for.
function parseBatchBody(body: unknown, requests: AdDecisionRequest[]): BatchEntryResult[] | null {
  if (!isRecord(body) || !Array.isArray(body.results) || body.results.length !== requests.length) {
    return null;
  }
  const results: BatchEntryResult[] = [];
  for (const [index, entry] of body.results.entries()) {
    const request = requests[index];
    if (!isRecord(entry) || entry.platformId !== request.platformId || entry.adTypeId !== request.adTypeId) {
      return null;
    }
    results.push(parseBatchEntry(entry));
  }
  return results;
}

/**
 * Thin wrapper around ad-serve-api's `GET /ads` and `POST /ads/batch`. Every non-success outcome of
 * a single request — `{ad: null}`, 404, 400, a network error, a timeout, or a malformed body — is
 * normalized to the same `{status: "empty"}` shape (research.md), so callers never need to branch
 * on *why* a slot didn't get an ad. A batch call that can't be used as a whole returns null (the
 * caller then falls back to single requests); it never throws.
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

  // Feature 012: one call for several placements that share the viewer details in `shared`, with
  // ad-serve-api's same-page deduplication on. `dedupeFallback` is deliberately not sent, so the
  // server default (repeat an ad rather than leave a slot empty) applies.
  async function requestAdBatch(
    requests: AdDecisionRequest[],
    shared: BatchSharedFields,
  ): Promise<BatchEntryResult[] | null> {
    try {
      const body = {
        placements: requests.map(({ platformId, adTypeId }) => ({ platformId, adTypeId })),
        ...(shared.country && { country: shared.country }),
        ...(shared.deviceType && { deviceType: shared.deviceType }),
        ...(shared.category && { category: shared.category }),
        ...(shared.sessionId && { sessionId: shared.sessionId }),
        dedupe: true,
      };
      const response = await withTimeout(timeoutMs, (signal) =>
        fetchImpl(`${baseUrl}/ads/batch`, {
          signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      if (!response.ok) {
        return null;
      }
      return parseBatchBody(await response.json(), requests);
    } catch {
      return null;
    }
  }

  return { requestAd, requestAdBatch };
}
