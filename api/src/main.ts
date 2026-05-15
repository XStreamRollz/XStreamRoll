import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import { env } from "./config/env"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  })

  await app.listen(env.PORT)
  console.log(`API running on http://localhost:${env.PORT}`)
}

bootstrap()
