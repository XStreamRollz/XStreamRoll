import { CACHE_MANAGER, CacheInterceptor, CacheTTL } from "@nestjs/cache-manager"
import {
  Controller,
  Get,
  Inject,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger"
import { Cache } from "cache-manager"
import { AuthGuard } from "../common/guards/auth.guard"
import { Roles, RolesGuard } from "../common/auth/roles.guard"
import { AdminStats, AdminStatsService } from "./admin-stats.service"

const STATS_CACHE_TTL_MS = 60_000

@ApiTags("admin")
@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(
    private readonly stats: AdminStatsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * GET /admin/stats — protected, cached snapshot of platform-wide
   * metrics. The 60-second TTL is enforced both by NestJS's
   * CacheInterceptor (HTTP-level) and by an explicit cache.set inside
   * the service body, so even handlers that bypass the interceptor
   * stay within budget on aggregate-query cost.
   */
  @Get("stats")
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(STATS_CACHE_TTL_MS)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Get platform-wide statistics",
    description: "Returns cached aggregate platform metrics. Admin role required.",
  })
  @ApiOkResponse({ description: "Admin platform statistics." })
  @ApiUnauthorizedResponse({ description: "Authentication required." })
  @ApiForbiddenResponse({ description: "Admin role required." })
  async getStats(): Promise<AdminStats> {
    const cacheKey = "admin:stats"
    const cached = await this.cache.get<AdminStats>(cacheKey)
    if (cached) return cached

    const snapshot = await this.stats.compute()
    await this.cache.set(cacheKey, snapshot, STATS_CACHE_TTL_MS)
    return snapshot
  }
}
