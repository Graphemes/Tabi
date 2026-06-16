import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { FriendsService } from './friends.service';
import { DiscoverUsersDto } from './dto/discover-users.dto';
import { AddContactDto } from './dto/add-contact.dto';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('add-contact')
  addContact(@CurrentUser() user: AuthUser, @Body() dto: AddContactDto) {
    return this.friendsService.addContact(user.userId, dto);
  }

  @Get()
  listContacts(@CurrentUser() user: AuthUser) {
    return this.friendsService.listContacts(user.userId);
  }

  @Get('discover')
  discoverUsers(
    @CurrentUser() user: AuthUser,
    @Query() query: DiscoverUsersDto,
  ) {
    return this.friendsService.discoverUsers(user.userId, query);
  }

  @Delete(':contactId')
  removeContact(
    @CurrentUser() user: AuthUser,
    @Param('contactId') contactId: string,
  ) {
    return this.friendsService.removeContact(user.userId, Number(contactId));
  }
}
