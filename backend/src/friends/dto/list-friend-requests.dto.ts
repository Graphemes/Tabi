import { IsEnum, IsOptional } from 'class-validator';
import { FriendRequestStatus } from '@prisma/client';

export class ListFriendRequestsDto {
  @IsOptional()
  @IsEnum(FriendRequestStatus)
  status?: FriendRequestStatus;
}
