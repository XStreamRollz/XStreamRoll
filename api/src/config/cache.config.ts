import { CacheModuleOptions } from "@nestjs/cache-manager"
import { redisStore } from "cache-manager-redis-store"

export function cacheConfig(): CacheModuleOptions {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    return {
      store: redisStore as never,
      url: redisUrl,
      ttl: 3600,
    }
  }

  return { ttl: 3600, max: 1024 }
}

export function adminCacheConfig(): CacheModuleOptions {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    return {
      store: redisStore as never,
      url: redisUrl,
      ttl: 60_000,
    }
  }

  return { ttl: 60_000, max: 256 }
}

export function streamsCacheConfig(): CacheModuleOptions {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    return {
      store: redisStore as never,
      url: redisUrl,
      ttl: 60_000,
    }
  }

  return { ttl: 60_000, max: 512 }
}
