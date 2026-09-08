import { plainToInstance } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength, Max, Min, validateSync } from "class-validator";

// Values that must never be accepted as a real secret, even if someone pastes
// one of them into an env file "temporarily" - they're public in this repo's
// history/docs, so a fallback default would defeat the point of a secret.
const KNOWN_INSECURE_SECRETS = new Set(["dev-secret-change-me", "dev-secret-change-me-in-production", "secret", "changeme"]);

class EnvironmentVariables {
  @IsOptional()
  @IsIn(["development", "test", "production"])
  NODE_ENV?: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: "JWT_SECRET must be at least 32 characters - generate one with `openssl rand -base64 48`" })
  JWT_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SUPER_ADMIN_USERNAME?: string;

  @IsString()
  @MinLength(8, { message: "SUPER_ADMIN_PASSWORD must be at least 8 characters - there is no default anymore" })
  SUPER_ADMIN_PASSWORD!: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(
      `Invalid environment configuration, refusing to start:\n  - ${messages.join("\n  - ")}`,
    );
  }

  if (KNOWN_INSECURE_SECRETS.has(validatedConfig.JWT_SECRET)) {
    throw new Error(
      "JWT_SECRET is a known placeholder value from this codebase's own history - generate a real secret with `openssl rand -base64 48`",
    );
  }

  return validatedConfig;
}
