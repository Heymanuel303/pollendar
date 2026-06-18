import { Availability } from '@prisma/client';

/**
 * Per-participant response shape for `GET /api/public/polls/:token/participants-responses`.
 * `participantId`/`pollSlotId` are typed `string` to document the wire contract: the service emits
 * raw `bigint` and the global `BigIntSerializerInterceptor` stringifies them in transit. A
 * participant's `email` is never part of this shape — it is excluded at the SQL SELECT level.
 */
export interface ParticipantAnswer {
  pollSlotId: string;
  availability: Availability;
}

export interface ParticipantWithResponses {
  participantId: string;
  displayName: string;
  answers: ParticipantAnswer[];
}

export interface ParticipantResponses {
  participants: ParticipantWithResponses[];
  total: number;
  hasMore: boolean;
}
