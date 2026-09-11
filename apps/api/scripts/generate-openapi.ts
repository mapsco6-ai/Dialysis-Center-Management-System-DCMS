// Freezes the same OpenAPI document main.ts serves live at /api/v1/docs
// into a committed file, for tools that want the spec without a running
// server (Postman import, client codegen, ...).
//
// Usage: npm run generate:openapi --workspace=@dcms/api
//
// Creates the Nest dependency graph without app.init()/listen(): lifecycle
// hooks (including DB connection) are not run. Valid configuration is still
// required. Always close the graph, including when writing the file fails.
import "dotenv/config";
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../src/app.module";
import { buildOpenApiConfig, GLOBAL_PREFIX } from "../src/openapi.config";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    // Must match main.ts's own setGlobalPrefix call exactly, or every path in
    // this file comes out missing "/api/v1" - see the comment on GLOBAL_PREFIX.
    app.setGlobalPrefix(GLOBAL_PREFIX);
    const document = SwaggerModule.createDocument(app, buildOpenApiConfig());

    const outPath = path.join(__dirname, "..", "openapi.yaml");
    fs.writeFileSync(outPath, yaml.dump(document, { noRefs: true }));
    // eslint-disable-next-line no-console
    console.log(`OpenAPI spec written to ${outPath}`);

  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
