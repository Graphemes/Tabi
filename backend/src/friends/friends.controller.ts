import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { FriendsService } from './friends.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { ListFriendRequestsDto } from './dto/list-friend-requests.dto';
import { DiscoverUsersDto } from './dto/discover-users.dto';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  listFriends(@CurrentUser() user: AuthUser) {
    return this.friendsService.listFriends(user.userId);
  }

  @Get('discover')
  discoverUsers(@CurrentUser() user: AuthUser, @Query() query: DiscoverUsersDto) {
    return this.friendsService.discoverUsers(user.userId, query);
  }

  @Post('requests')
  sendRequest(@CurrentUser() user: AuthUser, @Body() dto: SendFriendRequestDto) {
    return this.friendsService.sendRequest(user.userId, dto);
  }

  @Get('requests/incoming')
  listIncoming(
    @CurrentUser() user: AuthUser,
    @Query() query: ListFriendRequestsDto,
  ) {
    return this.friendsService.listIncomingRequests(user.userId, query);
  }

  @Get('requests/sent')
  listSent(@CurrentUser() user: AuthUser, @Query() query: ListFriendRequestsDto) {
    return this.friendsService.listSentRequests(user.userId, query);
  }

  @Patch('requests/:requestId/respond')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('requestId') requestId: string,
    @Body() dto: RespondFriendRequestDto,
  ) {
    return this.friendsService.respondToRequest(
      user.userId,
      Number(requestId),
      dto,
    );
  }

  @Patch('requests/:requestId/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('requestId') requestId: string) {
    return this.friendsService.cancelSentRequest(user.userId, Number(requestId));
  }

  @Delete(':friendUserId')
  removeFriend(
    @CurrentUser() user: AuthUser,
    @Param('friendUserId') friendUserId: string,
  ) {
    return this.friendsService.removeFriend(user.userId, Number(friendUserId));
  }
}
