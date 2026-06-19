import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Poll } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

/** Request enriched with the ownership-checked poll once the guard has run. */
export type PollRequest = AuthenticatedRequest & { poll: Poll };

/**
 * Runs after `JwtAuthGuard` (which attaches `req.user`). Loads the `:id` poll and throws 404 if it
 * is missing OR not owned by the caller, a 404 (not 403) so a non-owned poll is indistinguishable
 * from a missing one (no existence leak), matching the Phase-1 read scoping. The loaded poll is
 * attached as `req.poll` for the handler to reuse.
 */
@Injectable()
export class PollOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    const { id: rawId } = req.params as { id: string };
    let id: bigint;
    try {
      id = BigInt(rawId);
    } catch {
      throw new NotFoundException('Poll not found');
    }

    const poll = await this.prisma.poll.findUnique({ where: { id } });
    if (!poll || poll.userId !== req.user.id) {
      throw new NotFoundException('Poll not found');
    }

    (req as PollRequest).poll = poll;
    return true;
  }
}
