import { IsString, MaxLength, MinLength } from 'class-validator';

export class MobileLoginDto {
  @IsString()
  @MinLength(10)
  @MaxLength(16)
  mobile: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}
