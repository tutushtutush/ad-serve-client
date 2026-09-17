/**
 * Escapes text for safe interpolation into HTML markup. `&` MUST be escaped
 * first — escaping it after the others would double-escape the entities
 * those replacements just introduced.
 */
export function escapeForMarkup(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
