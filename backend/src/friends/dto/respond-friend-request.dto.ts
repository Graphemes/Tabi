import { IsEnum } from 'class-validator';
import { FriendRequestStatus } from '@prisma/client';

export class RespondFriendRequestDto {
  @IsEnum(FriendRequestStatus)
  status: FriendRequestStatus;
}
