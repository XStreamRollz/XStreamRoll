/**
 * Convert a free-form tag label into a URL-safe slug.
 *
 *   "  Live Streaming! "  -> "live-streaming"
 *   "Café / Brunch"        -> "cafe-brunch"
 *   "C++"                  -> "c"
 *
 * The implementation is intentionally dependency-free: it lowercases,
 * strips diacritics via NFD normalisation, replaces every non-
 * alphanumeric run with a single dash, and trims leading / trailing
 * dashes. Empty input (or input that contains only punctuation) returns
 * an empty string so callers can treat that as a validation error.
 */
export function slugify(input: string | null | undefined): string {
  if (typeof input !== "string") return ""
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) // hard cap so slugs stay index-friendly
}
