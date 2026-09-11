import { DocumentBuilder } from "@nestjs/swagger";

// Shared with main.ts's own app.setGlobalPrefix(GLOBAL_PREFIX) call, and
// with scripts/generate-openapi.ts - SwaggerModule.createDocument() only
// includes the prefix in every path if the prefix was actually set on the
// app instance it's building the document from, so both call sites must
// apply the exact same prefix before building the document, not just this
// one string.
export const GLOBAL_PREFIX = "api/v1";

// Shared between main.ts (live Swagger UI) and scripts/generate-openapi.ts
// (static openapi.yaml committed to the repo) so the two can never drift
// apart into two different specs for the same API.
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle("DCMS API")
    .setDescription(
      "Dialysis Center Management System - REST API covering all 16 project phases " +
        "(docs/PROJECT-PHASES-PLAN.md). Every protected route requires the bearer JWT " +
        "returned by POST /auth/login, and every request is re-checked against the " +
        "caller's current permissions - nothing here is cached from login time.",
    )
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .build();
}
