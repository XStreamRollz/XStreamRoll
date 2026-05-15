import { NestFactory } from "@nestjs/core"
import compression from "compression"
import { AppModule } from "./app.module"

// Bypass compression when the response is smaller than this. Anything
// under ~1 KB doesn't benefit from gzip and the per-request CPU cost
// is a net negative.
const COMPRESSION_THRESHOLD_BYTES = 1024

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  })

  // Global response compression. The middleware honours the
  // `Accept-Encoding` request header (gzip/deflate/br when available)
  // and writes the matching `Content-Encoding` response header. Setting
  // `threshold` skips small payloads; setting `filter` keeps existing
  // `Content-Encoding` values intact and lets callers opt out via
  // `x-no-compression`.
  app.use(
    compression({
      threshold: COMPRESSION_THRESHOLD_BYTES,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false
        return compression.filter(req, res)
      },
    }),
  )

  await app.listen(3001)
  console.log("API running on http://localhost:3001")
}

bootstrap()
