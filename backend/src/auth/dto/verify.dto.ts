import { IsNotEmpty, IsString } from 'class-validator';

/** Body of `POST /auth/verify` — the raw single-use token from the magic link. */
export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
