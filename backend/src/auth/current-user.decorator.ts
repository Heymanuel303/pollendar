import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Returns the creator that `JwtAuthGuard` attached to the request. Only meaningful on routes
 * guarded by `JwtAuthGuard`; otherwise `req.user` is undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
