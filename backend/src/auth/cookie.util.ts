import type { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

/** Names of the httpOnly session cookies set on the creator's browser. */
export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';

const TTL_MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parse a TTL string like '15m' / '30d' / '45s' / '1h' to milliseconds (for cookie maxAge). */
function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttl}`);
  }
  return Number(match[1]) * TTL_MULTIPLIERS[match[2]];
}

/**
 * Shared cookie attributes for the auth session cookies. `maxAge` is added per-cookie by the
 * builders below; the bare base (no maxAge) is what `clearCookie` must match to actually clear.
 * `COOKIE_SECURE` is validated to a boolean, but we accept the string form too for safety.
 */
export function baseCookieOptions(config: ConfigService): CookieOptions {
  const secure = config.get<boolean | string>('COOKIE_SECURE');
  const domain = config.get<string>('COOKIE_DOMAIN');
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure === true || secure === 'true',
    domain: domain || undefined,
    path: '/',
  };
}

/** Base options + 15m-ish access maxAge derived from `ACCESS_TOKEN_TTL`. */
export function accessCookieOptions(config: ConfigService): CookieOptions {
  return {
    ...baseCookieOptions(config),
    maxAge: parseTtlToMs(config.getOrThrow<string>('ACCESS_TOKEN_TTL')),
  };
}

/** Base options + 30d-ish refresh maxAge derived from `REFRESH_TOKEN_TTL`. */
export function refreshCookieOptions(config: ConfigService): CookieOptions {
  return {
    ...baseCookieOptions(config),
    maxAge: parseTtlToMs(config.getOrThrow<string>('REFRESH_TOKEN_TTL')),
  };
}

/** Attributes `clearCookie` must match (same domain/path/sameSite/secure) to remove the cookie. */
export function clearCookieOptions(config: ConfigService): CookieOptions {
  return baseCookieOptions(config);
}
