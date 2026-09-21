// Must be the very first import: other modules (JwtModule.register, etc.)
// read process.env.* synchronously at import time, before Nest's own
// ConfigModule would otherwise get a chance to load .env (docs review
// DCMS-002 follow-up - relying on import-order luck there was fragile).
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { allowedOrigins } from "./common/cookie";
import { ipRateLimit } from "./common/rate-limit.middleware";
import { AppModule } from "./app.module";
import { buildOpenApiConfig, GLOBAL_PREFIX } from "./openapi.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers. CSP is left to the web app/proxy: it would break the
  // Swagger UI and a JSON API has no page to protect. CORP must stay
  // cross-origin because the web app lives on another origin.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Explicit origins + credentials: required by the HttpOnly cookie login.
  app.enableCors({ origin: allowedOrigins(), credentials: true });
  app.use(ipRateLimit());

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Interactive API reference, live against whatever is actually running -
  // apps/api/openapi.yaml (scripts/generate-openapi.ts) is the same
  // document frozen to a file for tools that want it without a running
  // server (Postman import, client codegen, ...).
  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
  // setGlobalPrefix only affects Nest's own controller routing and the
  // paths *inside* the generated document above - SwaggerModule.setup()
  // mounts the UI directly on the underlying HTTP adapter and does NOT
  // inherit the global prefix on its own, so it must be spelled out here or
  // the UI silently ends up served at "/docs" instead of "/api/v1/docs".
  SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DCMS API listening on http://localhost:${port}/${GLOBAL_PREFIX}`);
  // eslint-disable-next-line no-console
  console.log(`API docs at http://localhost:${port}/${GLOBAL_PREFIX}/docs`);
}

bootstrap();
