export interface LoaderTagConfig {
  apiBaseUrl: string;
  platformId: string;
}

// The loader's own <script> tag carries the page-wide settings. Platform id is trimmed so a
// whitespace-only value counts as missing; it is otherwise passed on unchanged and never validated.
export function readLoaderTagConfig(scriptEl: Element | null): LoaderTagConfig {
  return {
    apiBaseUrl: scriptEl?.getAttribute("data-api-base-url") ?? "",
    platformId: (scriptEl?.getAttribute("data-platform-id") ?? "").trim(),
  };
}
