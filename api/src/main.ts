import { NestFactory } from "@nestjs/core"
import { ThrottlerExceptionFilter } from "./throttler-exception.filter"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  })

  app.useGlobalFilters(new ThrottlerExceptionFilter())

  await app.listen(3001)
  console.log("API running on http://localhost:3001")
}

bootstrap()
