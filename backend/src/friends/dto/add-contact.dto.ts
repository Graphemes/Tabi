import { IsPhoneNumber, IsString } from 'class-validator';

export class AddContactDto {
  @IsString()
  @IsPhoneNumber()
  phone: string;
}
