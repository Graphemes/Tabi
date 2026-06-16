import { IsString, MinLength, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(10)
  @MaxLength(16)
  phone: string;

  @IsString()
  @MinLength(4)
  @MaxLength(8)
  otp: string;
}
