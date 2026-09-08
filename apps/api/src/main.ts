// Must be the very first import: other modules (JwtModule.register, etc.)
// read process.env.* synchronously at import time, before Nest's own
// ConfigModule would otherwise get a chance to load .env (docs review
// DCMS-002 follow-up - relying on import-order luck there was fragile).
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DCMS API listening on http://localhost:${port}/api/v1`);
}

bootstrap();
