import { PollStatus } from '@prisma/client';

/**
 * Sanitized public view of a poll, returned by `GET /api/public/polls/:token`. Deliberately omits
 * the owner `userId`, participant data/emails, and completion internals (`finalSlotId`, timestamps).
 * BigInt `id` fields stay `bigint` here — the global `BigIntSerializerInterceptor` stringifies them
 * on the wire.
 */
export interface PublicPollSlot {
  id: bigint;
  startTime: Date | null;
  endTime: Date | null;
  isAllDay: boolean;
  label: string | null;
  sortOrder: number;
}

export interface PublicPollDate {
  id: bigint;
  eventDate: Date;
  sortOrder: number;
  slots: PublicPollSlot[];
}

export interface PublicPoll {
  id: bigint;
  title: string;
  description: string | null;
  timezone: string;
  status: PollStatus;
  dates: PublicPollDate[];
}
