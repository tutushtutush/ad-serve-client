// Shared by adRenderer.ts's click-URL construction (feature 004) and
// viewableImpressionClient.ts's report URL construction (feature 005) — both build
// `{baseUrl}/{path}?platformId=&adTypeId=&adConfigId=` against ad-serve-api, and previously
// duplicated this exact pattern independently (caught in code review, feature 005).
export function buildTrackingUrl(
  baseUrl: string,
  path: string,
  params: {
    platformId: string;
    adTypeId: string;
    adConfigId: string;
    impressionId?: string;
    sessionId?: string;
  },
): string {
  const searchParams = new URLSearchParams({
    platformId: params.platformId,
    adTypeId: params.adTypeId,
    adConfigId: params.adConfigId,
  });
  // Appended only when present (feature 007) — ad-serve-api's own contract treats a missing
  // impressionId identically to an omitted one, never as an empty-string value to dedup against.
  if (params.impressionId) {
    searchParams.set("impressionId", params.impressionId);
  }
  // Same treatment for sessionId (feature 008) — appended only when present.
  if (params.sessionId) {
    searchParams.set("sessionId", params.sessionId);
  }
  return `${baseUrl}/${path}?${searchParams.toString()}`;
}
