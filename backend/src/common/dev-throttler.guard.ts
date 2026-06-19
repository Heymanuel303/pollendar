import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limiting guard that disables itself in local development. Iterating on the app locally
 * (repeated magic-link/login attempts, HMR reloads, multiple tabs) all share one loopback IP, so
 * the global `THROTTLE_LIMIT` and the tighter per-route `@Throttle` overrides trip 429s constantly.
 *
 * Overriding `shouldSkip` short-circuits the *entire* guard, so it covers the global default AND
 * every per-route `@Throttle` decorator at once. Enforcement stays ON in production and test
 * (`NODE_ENV !== 'development'`) so e2e can still assert throttling and prod keeps its limits.
 *
 * `NODE_ENV` is read from `process.env` (populated by `@nestjs/config` from the root `.env` at
 * boot, before any request runs); this keeps the documented no-constructor override shape and
 * avoids injecting throttler-internal tokens.
 */
@Injectable()
export class DevThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(): Promise<boolean> {
    return Promise.resolve(process.env.NODE_ENV === 'development');
  }
}
