import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @MinLength(10)
  @MaxLength(16)
  phone: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
}
