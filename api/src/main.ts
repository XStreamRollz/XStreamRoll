import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import helmet from "helmet"

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

  // Issue #88: Configure CORS with trusted origin from env, credentials support, and preflight
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })

  await app.listen(3001)
  console.log("API running on http://localhost:3001")
}

bootstrap()
