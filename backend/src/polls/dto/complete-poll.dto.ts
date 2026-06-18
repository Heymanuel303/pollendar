import { IsNotEmpty, IsNumberString } from 'class-validator';

/** Finalize a poll by picking its winning slot. BigInt ids arrive as numeric strings. */
export class CompletePollDto {
  @IsNotEmpty() @IsNumberString() finalSlotId!: string;
}
