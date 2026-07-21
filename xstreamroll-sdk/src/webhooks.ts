/**
 * Webhook signature verification.
 *
 * Uses the Web Crypto API (`crypto.subtle`) rather than Node's `crypto`
 * module so this works unmodified in both Node (18+, where `crypto` is a
 * global) and any modern browser — matching the rest of the SDK, which is
 * built on global `fetch` rather than Node-only APIs.
 *
 * Signature format matches the server: `sha256=<hex-hmac>`, computed over
 * the exact raw request body bytes.
 */

/**
 * Verifies a webhook delivery's `X-Webhook-Signature` header against the
 * subscription's secret.
 *
 * `rawBody` must be the exact string received in the request body — do
 * not `JSON.parse` and re-`JSON.stringify` it before verifying, since
 * re-serialization is not guaranteed to reproduce the exact bytes the
 * server signed.
 *
 * @param secret The webhook's signing secret (returned once by `subscribeWebhook()`).
 * @param rawBody The exact raw request body received.
 * @param signature The `X-Webhook-Signature` header value, e.g. `"sha256=..."`.
 */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const expected = await computeWebhookSignature(secret, rawBody)
  return timingSafeEqual(expected, signature)
}

/** Computes the `sha256=<hex-hmac>` signature for a given secret and raw body. */
export async function computeWebhookSignature(
  secret: string,
  rawBody: string,
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody))
  const hex = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `sha256=${hex}`
}

/**
 * Constant-time string comparison. A length mismatch short-circuits, but
 * that leaks nothing about the secret — only equal-length secret-derived
 * buffers need constant-time comparison to avoid a timing oracle.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
