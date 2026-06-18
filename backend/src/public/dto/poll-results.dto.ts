/**
 * Result shape for `GET /api/public/polls/:token/results`. `slotId` is typed `string` to document the
 * wire contract: the service emits raw `bigint` and the global `BigIntSerializerInterceptor`
 * stringifies it in transit.
 */
export interface SlotTallyResult {
  slotId: string;
  available: number;
  maybe: number;
  unavailable: number;
  score: number;
}

export interface BestSlot {
  slotId: string;
  date: string;
  label: string | null;
  score: number;
}

export interface PollResults {
  /** `null` only when the poll has zero slots (defensive); otherwise always populated. */
  best: BestSlot | null;
  slots: SlotTallyResult[];
}
