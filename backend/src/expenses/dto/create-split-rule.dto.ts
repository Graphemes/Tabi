import {
  IsEnum,
  IsInt,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ExpenseSplitType } from '@prisma/client';

export class CreateSplitRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEnum(ExpenseSplitType)
  splitType: ExpenseSplitType;

  @IsObject()
  @IsNotEmptyObject()
  config: object;

  @IsOptional()
  @IsInt()
  @Min(1)
  groupId?: number;
}
