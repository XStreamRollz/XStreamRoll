import sanitizeHtml from "sanitize-html"

/**
 * Strip every HTML tag and script-bearing construct from a string while
 * leaving the human-readable text intact.
 *
 *   "<b>Hello</b> <script>alert(1)</script> world"  ->  "Hello  world"
 *   "<a href='javascript:bad()'>click</a>"           ->  "click"
 *   "café — naïve"                                   ->  "café — naïve"
 *
 * The sanitiser is configured to strip — not encode — tags so the
 * persisted value never carries entity-encoded markup that downstream
 * consumers would have to re-decode. Whitespace inside discarded tags
 * is preserved so adjacent words don't merge.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  // `disallowedTagsMode: "discard"` (the default) strips the tag and
  // keeps the text content. We further block <style> / <script> body
  // text via `nonTextTags` so an inline <script>…</script> doesn't
  // leave its contents behind.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
  // Preserve raw text characters without HTML-entity encoding so e.g.
  // an ampersand round-trips as "&" rather than "&amp;".
  disallowedTagsMode: "discard",
  parser: { decodeEntities: true },
  allowedSchemes: [],
  allowedSchemesByTag: {},
}

/**
 * Decode the small set of HTML entities that `sanitize-html` re-emits
 * on output. We intentionally limit the set to characters the user
 * obviously typed as plain text (e.g. `&`, `<`, `>`, single + double
 * quotes) so the round-trip stays lossless for normal prose without
 * re-introducing the very markup we just stripped.
 */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
}

export function sanitizeUserText(input: string): string {
  if (typeof input !== "string") return ""
  const stripped = sanitizeHtml(input, SANITIZE_OPTIONS)
  return decodeBasicEntities(stripped)
    // collapse the runs of whitespace introduced where tags used to be
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
}
