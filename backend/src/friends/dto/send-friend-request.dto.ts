import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SendFriendRequestDto {
  @IsInt()
  @Min(1)
  receiverId: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}
