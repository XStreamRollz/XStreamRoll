import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import { SanitizeStringsPipe } from "./common/sanitization/sanitize-strings.pipe"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  })

  // Strip HTML/script tags from every string in the incoming payload
  // before any other pipe runs. The pipe is value-only (it does not
  // touch numeric or boolean fields) so it can coexist with the
  // forthcoming ValidationPipe without re-coercing types.
  app.useGlobalPipes(new SanitizeStringsPipe())

  await app.listen(3001)
  console.log("API running on http://localhost:3001")
}

bootstrap()
