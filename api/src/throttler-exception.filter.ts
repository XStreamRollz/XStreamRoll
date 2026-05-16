import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from "@nestjs/common"
import { ThrottlerException } from "@nestjs/throttler"
import { Response } from "express"

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const ttl = parseInt(process.env.THROTTLE_TTL ?? "60000")
    res
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .set("Retry-After", String(Math.ceil(ttl / 1000)))
      .json({ statusCode: 429, message: "Too Many Requests" })
  }
}
