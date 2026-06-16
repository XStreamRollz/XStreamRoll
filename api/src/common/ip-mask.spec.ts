import { maskRequestIp } from "./ip-mask"

describe("maskRequestIp", () => {
  it("returns null when the input is null", () => {
    expect(maskRequestIp(null, "last-octet")).toBeNull()
  })

  it("returns the original IP when mode is none", () => {
    expect(maskRequestIp("192.168.1.42", "none")).toBe("192.168.1.42")
    expect(maskRequestIp("2001:db8::1", "none")).toBe("2001:db8::1")
  })

  it("masks the last octet for IPv4 addresses", () => {
    expect(maskRequestIp("192.168.1.42", "last-octet")).toBe("192.168.1.0")
  })

  it("masks IPv4-mapped IPv6 addresses by zeroing the IPv4 octet", () => {
    expect(maskRequestIp("::ffff:192.168.1.42", "last-octet")).toBe("::ffff:192.168.1.0")
  })

  it("masks the last 64 bits of IPv6 addresses", () => {
    expect(maskRequestIp("2001:db8:85a3::8a2e:370:7334", "last-octet")).toBe(
      "2001:db8:85a3:0:0:0:0:0",
    )
    expect(maskRequestIp("2001:db8::1", "last-octet")).toBe(
      "2001:db8:0:0:0:0:0:0",
    )
  })

  it("hashes the IP for full-hash mode", () => {
    expect(maskRequestIp("192.168.1.42", "full-hash")).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})
