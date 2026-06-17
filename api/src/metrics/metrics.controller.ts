import { Controller, Get, Header, Res } from "@nestjs/common"
import { ApiExcludeEndpoint } from "@nestjs/swagger"
import { Response } from "express"
import { MetricsService } from "./metrics.service"

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Exposes Prometheus-format metrics for scraping.
   * Excluded from Swagger to avoid confusion with REST endpoints.
   */
  @Get()
  @Header("Cache-Control", "no-cache, no-store, must-revalidate")
  @ApiExcludeEndpoint()
  async getMetrics(@Res() res: Response): Promise<void> {
    const [body, contentType] = await Promise.all([
      this.metricsService.getMetrics(),
      Promise.resolve(this.metricsService.contentType),
    ])
    res.setHeader("Content-Type", contentType)
    res.end(body)
  }
}
