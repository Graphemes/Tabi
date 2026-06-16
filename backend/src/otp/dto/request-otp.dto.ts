import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(10)
  @MaxLength(16)
  phone: string;
}
