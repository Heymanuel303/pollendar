import { Availability } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One participant answer for a single slot. `pollSlotId` arrives as a string (BigInt ids are
 * stringified by the global `BigIntSerializerInterceptor` in the Phase 1 GET). */
export class ResponseAnswerDto {
  @IsString() pollSlotId!: string;
  @IsEnum(Availability) availability!: Availability;
}

/** Anonymous availability submission for a poll. `email` is optional; when present it is subject to
 * the `participants @@unique([pollId, email])` constraint (duplicate ⇒ 409). */
export class SubmitResponsesDto {
  @IsString() @MaxLength(120) displayName!: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ResponseAnswerDto)
  answers!: ResponseAnswerDto[];
}
