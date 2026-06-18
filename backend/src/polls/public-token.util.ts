import * as crypto from 'crypto';

/** Opaque, URL-safe sharing token; exactly 22 chars to fit polls.public_token CHAR(22). */
export function generatePublicToken(): string {
  return crypto.randomBytes(16).toString('base64url'); // 16 bytes → 22 base64url chars
}

/** Public sharing URL for a poll, e.g. https://app.example/p/<token>. */
export function buildShareUrl(appUrl: string, publicToken: string): string {
  return `${appUrl.replace(/\/$/, '')}/p/${publicToken}`;
}
