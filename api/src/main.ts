import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  })

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
