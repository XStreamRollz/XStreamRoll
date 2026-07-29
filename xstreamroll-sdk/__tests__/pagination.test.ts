import { PaginatedIterator, paginateAll } from "../src/pagination"
import type { PaginatedResponse } from "@xstreamroll/types"

interface Item {
  id: number
  name: string
}

function pageResponse<T>(items: T[], page: number, limit: number, total: number): PaginatedResponse<T> {
  return { data: items, total, page, limit }
}

describe("paginateAll", () => {
  it("yields every item across multiple pages", async () => {
    const data: Item[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
      { id: 4, name: "d" },
      { id: 5, name: "e" },
    ]
    const fetcher = jest
      .fn()
      .mockImplementation(async ({ page: p, limit }: { page: number; limit: number }) => {
        const start = (p - 1) * limit
        const chunk: Item[] = data.slice(start, start + limit)
        return pageResponse<Item>(chunk, p, limit, data.length)
      })

    const collected: Item[] = []
    for await (const item of paginateAll<Item>(fetcher, { limit: 2 })) {
      collected.push(item)
    }
    expect(collected).toEqual(data)
    // 3 pages: page=1 (2 items), page=2 (2 items), page=3 (1 item)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it("returns the wrapped AsyncIterable from a class instance", async () => {
    const data: Item[] = [{ id: 1, name: "a" }]
    const fetcher = jest.fn().mockResolvedValue(pageResponse<Item>(data, 1, 50, 1))
    const iter = paginateAll<Item>(fetcher, { limit: 50 })
    expect(iter).toBeInstanceOf(PaginatedIterator)
  })

  it("stops when the server returns fewer than `limit` items", async () => {
    const data: Item[] = [{ id: 1, name: "a" }, { id: 2, name: "b" }]
    const fetcher = jest.fn().mockResolvedValue(pageResponse<Item>(data, 1, 50, 2))
    const collected = await paginateAll<Item>(fetcher, { limit: 50 }).toArray()
    expect(collected).toEqual(data)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("stops immediately when total is 0", async () => {
    const fetcher = jest.fn().mockResolvedValue(pageResponse<Item>([], 1, 50, 0))
    const collected = await paginateAll<Item>(fetcher).toArray()
    expect(collected).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("respects an explicit maxPages ceiling", async () => {
    const data: Item[] = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      name: String(i),
    }))
    const fetcher = jest
      .fn()
      .mockImplementation(async ({ page: p, limit }: { page: number; limit: number }) => {
        const chunk: Item[] = data.slice((p - 1) * limit, p * limit)
        return pageResponse<Item>(chunk, p, limit, data.length)
      })
    const collected = await paginateAll<Item>(fetcher, { limit: 50, maxPages: 2 }).toArray()
    expect(collected).toHaveLength(100)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("supports starting from a non-1 page", async () => {
    const requestedPages: number[] = []
    const data: Item[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]
    const fetcher = jest
      .fn()
      .mockImplementation(async ({ page: p, limit }: { page: number; limit: number }) => {
        requestedPages.push(p)
        const offset = p - 1
        const remaining = Math.max(0, data.length - offset)
        const items: Item[] = []
        for (let i = 0; i < Math.min(limit, remaining); i++) {
          items.push(data[offset + i]!)
        }
        return pageResponse<Item>(items, p, limit, data.length - offset)
      })
    const collected = await paginateAll<Item>(fetcher, { startPage: 2, limit: 5 }).toArray()
    expect(requestedPages[0]).toBe(2)
    expect(collected.map((i: Item) => i.id)).toEqual([2, 3])
  })

  it("treats an AbortSignal that fires mid-iteration as exhausted", async () => {
    const data: Item[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]
    const fetcher = jest
      .fn()
      .mockImplementation(async ({ page: p, limit }: { page: number; limit: number }) => {
        const chunk: Item[] = data.slice((p - 1) * limit, p * limit)
        return pageResponse<Item>(chunk, p, limit, 3)
      })
    const controller = new AbortController()
    const iter = paginateAll<Item>(fetcher, { signal: controller.signal })
    const it = iter[Symbol.asyncIterator]()
    expect((await it.next()).value).toEqual({ id: 1, name: "a" })
    controller.abort()
    expect((await it.next()).done).toBe(true)
  })

  it("propagates fetcher errors to the caller", async () => {
    const boom = new Error("network down")
    const fetcher = jest.fn().mockRejectedValue(boom)
    const iter = paginateAll<Item>(fetcher)
    await expect(iter.next()).rejects.toBe(boom)
  })

  it("cursor reflects the next page to fetch", async () => {
    const data: Item[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]
    const fetcher = jest
      .fn()
      .mockImplementation(async ({ page: p, limit }: { page: number; limit: number }) => {
        const chunk: Item[] = data.slice((p - 1) * limit, p * limit)
        return pageResponse<Item>(chunk, p, limit, 3)
      })
    const iter = paginateAll<Item>(fetcher, { limit: 2 })
    expect(iter.cursor).toBe(1)
    await iter.next()
    // After yielding the first item the iterator has advanced its
    // internal page counter to the next fetch (page 2), even while it
    // still has one buffered item from page 1 to emit.
    expect(iter.cursor).toBe(2)
    await iter.next()
    expect([2, null]).toContain(iter.cursor)
  })

  it("toArray() avoids an extra fetch beyond the last item", async () => {
    const data: Item[] = [{ id: 1, name: "a" }]
    const fetcher = jest.fn().mockResolvedValue(pageResponse<Item>(data, 1, 50, 1))
    const collected = await paginateAll<Item>(fetcher, { limit: 50 }).toArray()
    expect(collected).toEqual(data)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
