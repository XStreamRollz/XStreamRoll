import { createHash } from "crypto"
import { isIP } from "net"
import type { Request } from "express"

export type LogIpMasking = "none" | "last-octet" | "full-hash"

export function getRequestIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.ip ??
    null
  )
}

export function maskRequestIp(
  ip: string | null | undefined,
  mode: LogIpMasking,
): string | null {
  if (ip == null) return null
  if (mode === "none") return ip
  if (mode === "full-hash") return hashIp(ip)
  return maskIpLastOctet(ip)
}

function hashIp(ip: string): string {
  return `sha256:${createHash("sha256").update(ip).digest("hex")}`
}

function maskIpLastOctet(ip: string): string {
  const trimmed = ip.trim()
  if (!trimmed) return trimmed

  const v4Candidate = trimmed.split("/")[0]
  if (isIP(v4Candidate) === 4) {
    return maskIpv4(v4Candidate)
  }

  if (isIpv4MappedIpv6(trimmed)) {
    const mapped = trimmed.substring(trimmed.lastIndexOf(":") + 1)
    return `::ffff:${maskIpv4(mapped)}`
  }

  if (isIP(trimmed) === 6) {
    return maskIpv6Last64(trimmed)
  }

  return trimmed
}

function maskIpv4(ip: string): string {
  const parts = ip.split(".")
  if (parts.length !== 4) return ip
  parts[3] = "0"
  return parts.join(".")
}

function isIpv4MappedIpv6(ip: string): boolean {
  return /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i.test(ip)
}

function maskIpv6Last64(ip: string): string {
  const normalized = expandIpv6(ip)
  const blocks = normalized.split(":")
  return `${blocks.slice(0, 4).join(":")}:0:0:0:0`
}

function expandIpv6(ip: string): string {
  if (!ip.includes("::")) {
    return ip
  }

  const [left, right] = ip.split("::")
  const leftBlocks = left ? left.split(":").filter(Boolean) : []
  const rightBlocks = right ? right.split(":").filter(Boolean) : []
  const missing = 8 - leftBlocks.length - rightBlocks.length
  const zeros = Array(Math.max(0, missing)).fill("0")
  return [...leftBlocks, ...zeros, ...rightBlocks].join(":")
}
