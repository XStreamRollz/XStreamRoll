# `lib/cache/` — Server-side query caching

This directory wraps Next.js's `unstable_cache` so the frontend can
avoid hitting the API for every render. The cache is keyed by the
function arguments and tagged so mutations can bust the relevant
entries surgically.

## Files

| File             | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `cache-config.ts`| Single source of truth for cache tags + TTLs             |
| `cached.ts`      | Thin wrapper around `unstable_cache` with dev hit/miss logs |
| `streams.ts`     | `getStreamList`, `getStreamDetail`, and invalidate helpers |

## Cache lifecycle

```
read   ── getStreamList() / getStreamDetail() ──▶ unstable_cache
                                                       │
                                                       ▼
                                                  HTTP to /api
                                                       │
                                                       ▼
                                              cached for TTL or
                                              until revalidateTag

mutate ── invalidateStreamList() / invalidateStreamDetail(id)
            └─ revalidateTag("stream-list" / "stream-detail:<id>")
```

The acceptance criteria for issue 93 are:

- **Stream list cached for 30 seconds** — enforced by
  `CACHE_TTL_SECONDS.streamList = 30` in `cache-config.ts`.
- **Cache invalidated on stream create / update / delete** — server
  actions should import and call `invalidateStreamList()` or
  `invalidateStreamDetail(id)` after the API mutation succeeds.
- **Cache miss/hit visible in dev tools** — `cached.ts` logs a
  `[cache miss]` line on first compute and `[cache hit?]` on
  subsequent calls. The log lines surface in the Next.js dev tools
  panel (`Server` log) and in stdout when running `next dev`.

## Adding new cached queries

```ts
// lib/cache/users.ts
import "server-only"
import { revalidateTag } from "next/cache"
import { cached } from "./cached"
import { CACHE_TAGS, CACHE_TTL_SECONDS } from "./cache-config"

export const getCurrentUserProfile = cached(
  async (userId: string) => {
    /* fetch... */
  },
  ["users", "profile"],
  {
    tags: ["user-profile"],
    revalidate: 60,
    label: "users.profile",
  },
)

export function invalidateUserProfile() {
  revalidateTag("user-profile")
}
```

Always add the new tag to `CACHE_TAGS` so the constant remains the
audit trail for every cached entry the app keeps in memory.
