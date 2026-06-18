import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreatePollDateDto } from './create-poll.dto';

/**
 * Edit an open poll. Every field is optional — only the keys present are patched. `description`
 * and `closesAt` may be sent as `null` to clear them.
 *
 * `dates` follows a **replace** strategy: when present it fully supersedes the poll's existing
 * dates + slots (the old ones are deleted and recreated); when omitted, nested data is left
 * untouched. Nested slot DTOs are reused transitively via `CreatePollDateDto`.
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
  @Type(() => CreatePollDateDto)
  dates?: CreatePollDateDto[];
}
