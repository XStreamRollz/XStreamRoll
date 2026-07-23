import "./tracing" // Must be the first import — OTEL patches modules before they load
import { ValidationPipe } from "@nestjs/common"
import { HttpAdapterHost, NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import compression from "compression"
import helmet from "helmet"
import * as cookieParser from "cookie-parser"
import { AppModule } from "./app.module"
import { SanitizeStringsPipe } from "./common/sanitization/sanitize-strings.pipe"
import { ThrottlerExceptionFilter } from "./throttler-exception.filter"
import { QueryTimeoutExceptionFilter } from "./database/query-timeout-exception.filter"

// Bypass compression when the response is smaller than this. Anything
// under ~1 KB doesn't benefit from gzip and the per-request CPU cost
// is a net negative.
const COMPRESSION_THRESHOLD_BYTES = 1024

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Issue #89: Apply Helmet middleware globally for secure HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
        },
      },
    }),
  )

  app.use(cookieParser.default())

  // Issue #88: Configure CORS with trusted origin from env, credentials support, and preflight
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })

  // Global response compression.
  app.use(
    compression({
      threshold: COMPRESSION_THRESHOLD_BYTES,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false
        return compression.filter(req, res)
      },
    }),
  )

  // Strip HTML/script tags from every string in the incoming payload
  // before any other pipe runs. Order matters: sanitisation runs BEFORE
  // ValidationPipe so DTO validators see already-stripped text.
  app.useGlobalPipes(
    new SanitizeStringsPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  const { httpAdapter } = app.get(HttpAdapterHost)
  app.useGlobalFilters(
    new ThrottlerExceptionFilter(),
    new QueryTimeoutExceptionFilter(httpAdapter),
  )

  // Swagger / OpenAPI documentation served at /docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle("XStreamRoll API")
    .setDescription(
      "REST and WebSocket API for the XStreamRoll streaming platform.",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter a JWT access token issued by /auth/login.",
      },
      "bearer",
    )
    .addTag("health", "Liveness and readiness probes")
    .addTag("streams", "Stream lifecycle CRUD")
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: { persistAuthorization: true },
  })

  await app.listen(3001)
  console.log("API running on http://localhost:3001")
  console.log("Swagger UI available at http://localhost:3001/docs")
}

bootstrap()
