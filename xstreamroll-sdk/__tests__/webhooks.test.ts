import * as crypto from "crypto"
import { computeWebhookSignature, verifyWebhookSignature } from "../src/webhooks"

/** Reference implementation using Node's crypto module, for cross-checking. */
function nodeSign(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")
}

describe("computeWebhookSignature", () => {
  it("matches Node's own HMAC-SHA256 computation", async () => {
    const secret = "test-secret"
    const body = JSON.stringify({ event: "stream:started", streamId: 1 })

    const signature = await computeWebhookSignature(secret, body)
    expect(signature).toBe(nodeSign(secret, body))
  })

  it("is deterministic for the same secret and body", async () => {
    const a = await computeWebhookSignature("secret", "body")
    const b = await computeWebhookSignature("secret", "body")
    expect(a).toBe(b)
  })

  it("differs when the secret changes", async () => {
    const a = await computeWebhookSignature("secret-a", "body")
    const b = await computeWebhookSignature("secret-b", "body")
    expect(a).not.toBe(b)
  })

  it("differs when a single byte of the body changes", async () => {
    const a = await computeWebhookSignature("secret", "body-a")
    const b = await computeWebhookSignature("secret", "body-b")
    expect(a).not.toBe(b)
  })
})

describe("verifyWebhookSignature", () => {
  const secret = "webhook-secret"
  const rawBody = JSON.stringify({ event: "stream:stopped", streamId: 42 })

  it("returns true for a signature computed with the correct secret", async () => {
    const signature = nodeSign(secret, rawBody)
    await expect(verifyWebhookSignature(secret, rawBody, signature)).resolves.toBe(true)
  })

  it("returns false for a signature computed with the wrong secret", async () => {
    const signature = nodeSign("a-different-secret", rawBody)
    await expect(verifyWebhookSignature(secret, rawBody, signature)).resolves.toBe(false)
  })

  it("returns false when the body was tampered with after signing", async () => {
    const signature = nodeSign(secret, rawBody)
    const tamperedBody = JSON.stringify({ event: "stream:stopped", streamId: 999 })
    await expect(
      verifyWebhookSignature(secret, tamperedBody, signature),
    ).resolves.toBe(false)
  })

  it("returns false for a malformed signature instead of throwing", async () => {
    await expect(
      verifyWebhookSignature(secret, rawBody, "not-a-real-signature"),
    ).resolves.toBe(false)
  })

  it("returns false for an empty signature", async () => {
    await expect(verifyWebhookSignature(secret, rawBody, "")).resolves.toBe(false)
  })
})
