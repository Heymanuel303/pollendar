import { ExecutionContext, NotFoundException } from '@nestjs/common';
import type { Poll, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PollOwnershipGuard } from './poll-ownership.guard';

const findUnique = jest.fn<Promise<unknown>, [unknown]>();
const prisma: Partial<PrismaService> = {
  poll: { findUnique } as never,
};

/** Build an ExecutionContext whose HTTP request carries the given params + user. */
function ctxFor(
  params: Record<string, string>,
  user: Partial<User>,
): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { params, user };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('PollOwnershipGuard', () => {
  const guard = new PollOwnershipGuard(prisma as PrismaService);

  beforeEach(() => findUnique.mockReset());

  it('allows the owner and attaches the loaded poll to the request', async () => {
    const poll = { id: 5n, userId: 42n } as Poll;
    findUnique.mockResolvedValue(poll);
    const { ctx, req } = ctxFor({ id: '5' }, { id: 42n });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 5n } });
    expect(req.poll).toBe(poll);
  });

  it('throws 404 when the poll does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const { ctx } = ctxFor({ id: '5' }, { id: 42n });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 when the poll is owned by someone else (no existence leak)', async () => {
    findUnique.mockResolvedValue({ id: 5n, userId: 99n });
    const { ctx } = ctxFor({ id: '5' }, { id: 42n });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 for a non-numeric id without querying', async () => {
    const { ctx } = ctxFor({ id: 'not-a-number' }, { id: 42n });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
