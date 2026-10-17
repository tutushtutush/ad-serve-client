export interface LoaderTagConfig {
  apiBaseUrl: string;
  platformId: string;
  // Feature 017: true only when the platform let the SDK keep its own viewer identifier in local storage
  // (data-viewer-id-storage="local"). Off, and nothing is created or stored, by default.
  viewerIdStorage: boolean;
  // The attribute is present but is not `local` (a typo such as "Local" or "true"): the SDK ignores it, and
  // index.ts says so once, so an integrator is not left wondering why no identifier is ever sent.
  viewerIdStorageUnrecognized: boolean;
}

// The loader's own <script> tag carries the page-wide settings. Values are returned as written;
// the orchestrator owns treating a blank platform id as missing.
export function readLoaderTagConfig(scriptEl: Element | null): LoaderTagConfig {
  const viewerIdStorageValue = scriptEl?.getAttribute("data-viewer-id-storage") ?? null;
  const viewerIdStorage = viewerIdStorageValue?.trim() === "local";
  return {
    apiBaseUrl: scriptEl?.getAttribute("data-api-base-url") ?? "",
    platformId: scriptEl?.getAttribute("data-platform-id") ?? "",
    viewerIdStorage,
    viewerIdStorageUnrecognized: viewerIdStorageValue !== null && !viewerIdStorage,
  };
}
