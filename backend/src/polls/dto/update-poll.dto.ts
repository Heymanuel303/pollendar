import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One slot inside an edit payload. Mirrors `CreatePollSlotDto`'s scalar fields and adds the two
 * diff markers: `id` (a stringified BigInt ⇒ this slot matches an existing row) and `invalidatedAt`
 * (a non-null ISO instant ⇒ deactivate the slot; `null`/absent ⇒ active).
 */
export class UpdatePollSlotDto {
  @IsOptional() @IsString() startTime?: string; // null/absent ⇒ open-ended / all-day
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsNumberString() id?: string; // stringified BigInt of an existing slot
  @IsOptional() @IsISO8601() invalidatedAt?: string | null; // non-null ⇒ deactivate
}

/**
 * One date inside an edit payload. Carries the same diff markers as `UpdatePollSlotDto` and holds
 * the full desired set of slots for the date.
 */
export class UpdatePollDateDto {
  @IsISO8601() eventDate!: string; // "YYYY-MM-DD" (Prisma @db.Date)
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsNumberString() id?: string; // stringified BigInt of an existing date
  @IsOptional() @IsISO8601() invalidatedAt?: string | null; // non-null ⇒ deactivate
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePollSlotDto)
  slots!: UpdatePollSlotDto[];
}

/**
 * Edit an open poll. Every field is optional, only the keys present are patched. `description`
 * and `closesAt` may be sent as `null` to clear them.
 *
 * `dates`, when present, is the FULL desired tree of dates → slots and is applied as a **diff**,
 * not a blind replace:
 * - A date/slot carrying an `id` matches an existing row. A non-null `invalidatedAt` on it
 *   soft-invalidates that row (preserving its votes); a `null` marker reactivates a
 *   previously-invalidated row. Markers are honoured before any scalar reconciliation.
 * - A date/slot without an `id` is created fresh.
 * - An existing row absent from the payload is defensively soft-invalidated (never hard-deleted) —
 *   the editor always re-sends every existing row with its current marker, so this is a safety net.
 *
 * When the poll has zero votes the diff collapses to the historical destructive replace; once any
 * vote exists no row is ever deleted (a `Response` must never be lost).
 */
export class UpdatePollDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsISO8601() closesAt?: string | null; // ISO datetime; null clears it
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePollDateDto)
  dates?: UpdatePollDateDto[];
}
