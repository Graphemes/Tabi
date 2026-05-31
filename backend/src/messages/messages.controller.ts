import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('groups/:groupId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  create(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(Number(groupId), user.userId, dto);
  }

  @Get()
  list(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    return this.messagesService.list(
      Number(groupId),
      user.userId,
      limit ? Number(limit) : 100,
      beforeId ? Number(beforeId) : undefined,
    );
  }
}
