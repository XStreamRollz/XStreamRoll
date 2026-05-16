/** A function that transforms a request config before it is sent. */
export type RequestInterceptor = (
  config: RequestInit & { url: string }
) => RequestInit & { url: string }

/** A function that transforms a response after it is received. */
export type ResponseInterceptor = (response: Response) => Response | Promise<Response>

/** Opaque handle returned when registering an interceptor. */
export type InterceptorHandle = number

/**
 * Lightweight interceptor chain for the SDK HTTP layer.
 *
 * Usage:
 *   const http = new HttpClient("https://api.xstreamroll.io")
 *   const handle = http.addRequestInterceptor(cfg => {
 *     return { ...cfg, headers: { ...cfg.headers, Authorization: `Bearer ${token}` } }
 *   })
 *   http.removeInterceptor(handle)
 */
export class HttpClient {
  private readonly baseUrl: string
  private nextId = 0
  private readonly requestInterceptors = new Map<InterceptorHandle, RequestInterceptor>()
  private readonly responseInterceptors = new Map<InterceptorHandle, ResponseInterceptor>()

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  addRequestInterceptor(fn: RequestInterceptor): InterceptorHandle {
    const id = this.nextId++
    this.requestInterceptors.set(id, fn)
    return id
  }

  addResponseInterceptor(fn: ResponseInterceptor): InterceptorHandle {
    const id = this.nextId++
    this.responseInterceptors.set(id, fn)
    return id
  }

  removeInterceptor(handle: InterceptorHandle): void {
    this.requestInterceptors.delete(handle)
    this.responseInterceptors.delete(handle)
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    let config: RequestInit & { url: string } = { ...init, url: `${this.baseUrl}${path}` }

    for (const fn of this.requestInterceptors.values()) {
      config = fn(config)
    }

    const { url, ...fetchInit } = config
    let response = await fetch(url, fetchInit)

    for (const fn of this.responseInterceptors.values()) {
      response = await fn(response)
    }

    return response
  }
}
