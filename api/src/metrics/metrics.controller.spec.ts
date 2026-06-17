import { Test, TestingModule } from "@nestjs/testing"
import { MetricsController } from "./metrics.controller"
import { MetricsService } from "./metrics.service"
import { Response } from "express"

function makeRes(): { res: Response & { _headers: Record<string, string>; _body: string }; setHeader: jest.Mock; end: jest.Mock } {
  const setHeader = jest.fn()
  const end = jest.fn()
  const res = { setHeader, end, _headers: {}, _body: "" } as unknown as Response & { _headers: Record<string, string>; _body: string }
  return { res, setHeader, end }
}

describe("MetricsController", () => {
  let controller: MetricsController
  let metricsService: Partial<MetricsService>

  beforeEach(async () => {
    metricsService = {
      getMetrics: jest.fn().mockResolvedValue("# HELP http_requests_total\nhttp_requests_total 0\n"),
      contentType: "text/plain; version=0.0.4; charset=utf-8",
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metricsService }],
    }).compile()

    controller = module.get<MetricsController>(MetricsController)
  })

  it("sets Content-Type header and ends response with metrics body", async () => {
    const { res, setHeader, end } = makeRes()

    await controller.getMetrics(res)

    expect(setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/plain; version=0.0.4; charset=utf-8",
    )
    expect(end).toHaveBeenCalledWith(
      "# HELP http_requests_total\nhttp_requests_total 0\n",
    )
  })

  it("calls metricsService.getMetrics once per request", async () => {
    const { res } = makeRes()
    await controller.getMetrics(res)
    expect(metricsService.getMetrics).toHaveBeenCalledTimes(1)
  })
})
