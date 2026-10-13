export interface LoaderTagConfig {
  apiBaseUrl: string;
  platformId: string;
}

// The loader's own <script> tag carries the page-wide settings. Values are returned as written;
// the orchestrator owns treating a blank platform id as missing.
export function readLoaderTagConfig(scriptEl: Element | null): LoaderTagConfig {
  return {
    apiBaseUrl: scriptEl?.getAttribute("data-api-base-url") ?? "",
    platformId: scriptEl?.getAttribute("data-platform-id") ?? "",
  };
}
