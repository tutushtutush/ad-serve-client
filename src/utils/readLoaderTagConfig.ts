export interface LoaderTagConfig {
  apiBaseUrl: string;
  platformId: string;
  // Feature 017: true only when the platform let the SDK keep its own viewer identifier in local storage
  // (data-viewer-id-storage="local"). Off, and nothing is created or stored, by default.
  viewerIdStorage: boolean;
}

// The loader's own <script> tag carries the page-wide settings. Values are returned as written;
// the orchestrator owns treating a blank platform id as missing.
export function readLoaderTagConfig(scriptEl: Element | null): LoaderTagConfig {
  return {
    apiBaseUrl: scriptEl?.getAttribute("data-api-base-url") ?? "",
    platformId: scriptEl?.getAttribute("data-platform-id") ?? "",
    viewerIdStorage: scriptEl?.getAttribute("data-viewer-id-storage")?.trim() === "local",
  };
}
