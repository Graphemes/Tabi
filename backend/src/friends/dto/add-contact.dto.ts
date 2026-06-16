import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ContactItem {
  @IsString()
  @IsPhoneNumber()
  phone: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(60)
  name?: string;
}

export class AddContactDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ContactItem)
  contacts: ContactItem[];
}
