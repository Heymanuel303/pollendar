import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Coerce common truthy/falsy env strings ("true"/"1"/"false"/"0") to a boolean. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0' || v === '') return false;
  }
  return value;
};

/**
 * Validation schema for the environment variables the backend consumes (PLAN.md §4).
 * MYSQL_* vars are consumed by docker-compose, not the app, so they are intentionally
 * not validated here. DATABASE_URL is the single Prisma connection string.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 3000;

  @IsString()
  @IsNotEmpty()
  APP_URL!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  ACCESS_TOKEN_TTL!: string;

  @IsString()
  @IsNotEmpty()
  REFRESH_TOKEN_TTL!: string;

  @IsString()
  @IsNotEmpty()
  MAGIC_LINK_TTL!: string;

  // Empty = host-only cookie (the right default for localhost / LAN IPs). IP
  // literals are invalid here per RFC 6265, so only set a real registered domain.
  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  @Transform(toBoolean)
  @IsBoolean()
  COOKIE_SECURE = false;

  @IsString()
  @IsNotEmpty()
  SMTP_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT = 1025;

  @Transform(toBoolean)
  @IsBoolean()
  SMTP_SECURE = false;

  // Mailpit needs no auth, so SMTP credentials may be absent/empty in dev.
  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsString()
  @IsNotEmpty()
  MAIL_FROM!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_TTL = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 10;
}

/**
 * Passed to `ConfigModule.forRoot({ validate })`. Coerces and validates the raw env,
 * throwing (so the app fails fast on boot) when a required var is missing or invalid.
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    // Coerce numeric env strings (e.g. "3000") to numbers from the TS types;
    // booleans are handled explicitly via @Transform since Boolean("false") is true.
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map(
          (e) =>
            `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
        )
        .join('\n')}`,
    );
  }

  // Production hardening: real outbound mail goes through Resend SMTP, which
  // requires auth + TLS. Mailpit (dev) and the e2e stub need none of this, and
  // Jest may boot with NODE_ENV=test against the auth-less dev SMTP env, so this
  // guard is scoped to production only, dev/test keep booting on port 1025.
  if (validatedConfig.NODE_ENV === Environment.Production) {
    const prodErrors: string[] = [];
    if (!validatedConfig.SMTP_USER?.trim()) {
      prodErrors.push(
        'SMTP_USER: required outside development (Resend SMTP needs auth)',
      );
    }
    if (!validatedConfig.SMTP_PASSWORD?.trim()) {
      prodErrors.push(
        'SMTP_PASSWORD: required outside development (Resend SMTP API key)',
      );
    }
    if (validatedConfig.SMTP_SECURE !== true) {
      prodErrors.push(
        'SMTP_SECURE: must be true outside development (Resend SMTP uses TLS on port 465)',
      );
    }
    if (prodErrors.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n${prodErrors
          .map((e) => `  - ${e}`)
          .join('\n')}`,
      );
    }
  }

  return validatedConfig;
}
