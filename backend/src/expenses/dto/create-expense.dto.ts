import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory, ExpenseSplitType } from '@prisma/client';

export class PaidByDto {
  @IsInt()
  @Min(1)
  userId: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}

export class ExpenseParticipantInputDto {
  @IsInt()
  @Min(1)
  userId: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  exactAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  percentage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shares?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  adjustmentAmount?: number;
}

export class ExpenseItemInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  participantUserIds: number[];
}

export class CreateExpenseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsEnum(ExpenseSplitType)
  splitType: ExpenseSplitType;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurringRule?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaidByDto)
  paidBy: PaidByDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantInputDto)
  participants: ExpenseParticipantInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseItemInputDto)
  items?: ExpenseItemInputDto[];
}
