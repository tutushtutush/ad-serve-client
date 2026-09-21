// Shared by adRenderer.ts's click-URL construction (feature 004) and
// viewableImpressionClient.ts's report URL construction (feature 005) — both build
// `{baseUrl}/{path}?platformId=&adTypeId=&adConfigId=` against ad-serve-api, and previously
// duplicated this exact pattern independently (caught in code review, feature 005).
export function buildTrackingUrl(
  baseUrl: string,
  path: string,
  params: { platformId: string; adTypeId: string; adConfigId: string },
): string {
  return `${baseUrl}/${path}?${new URLSearchParams(params).toString()}`;
}
