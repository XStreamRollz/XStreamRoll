import { ArgumentsHost } from "@nestjs/common"
import { QueryTimeoutExceptionFilter } from "./query-timeout-exception.filter"

describe("QueryTimeoutExceptionFilter", () => {
  function buildHost() {
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ json })
    const res = { status }
    const host = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost
    return { host, status, json }
  }

  it("returns 503 when the query was cancelled by statement_timeout", () => {
    const filter = new QueryTimeoutExceptionFilter({} as never)
    const { host, status, json } = buildHost()

    const error = Object.assign(new Error("canceling statement due to statement timeout"), {
      code: "57014",
    })

    filter.catch(error, host)

    expect(status).toHaveBeenCalledWith(503)
    expect(json).toHaveBeenCalledWith({
      statusCode: 503,
      message: "Database query timed out",
    })
  })

  it("delegates non-timeout errors to the default handler", () => {
    const filter = new QueryTimeoutExceptionFilter({} as never)
    const superCatch = jest.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(filter)),
      "catch",
    ).mockImplementation(() => undefined)
    const { host, status } = buildHost()

    filter.catch(new Error("boom"), host)

    expect(superCatch).toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    superCatch.mockRestore()
  })
})
