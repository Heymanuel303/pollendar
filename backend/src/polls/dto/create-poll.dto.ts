import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One time slot on a date. start/end are "HH:mm" or "HH:mm:ss" (Prisma @db.Time). */
export class CreatePollSlotDto {
  @IsOptional() @IsString() startTime?: string; // null/absent ⇒ open-ended / all-day
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

/** One candidate date with at least one slot. */
export class CreatePollDateDto {
  @IsISO8601() eventDate!: string; // "YYYY-MM-DD" (Prisma @db.Date)
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePollSlotDto)
  slots!: CreatePollSlotDto[];
}

/** Create a poll with nested dates + slots in one request. */
export class CreatePollDto {
  @IsString() @IsNotEmpty() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string; // defaults to "UTC" in schema
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePollDateDto)
  dates!: CreatePollDateDto[];
}
