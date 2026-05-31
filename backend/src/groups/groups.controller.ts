import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser) {
    return this.groupsService.create(dto, user.userId);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.groupsService.findAll(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.groupsService.findOne(Number(id), user.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupsService.update(Number(id), dto, user.userId);
  }

  @Post(':id/members')
  addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupsService.addMember(Number(id), dto, user.userId);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') memberUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.groupsService.removeMember(
      Number(id),
      Number(memberUserId),
      user.userId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.groupsService.remove(Number(id), user.userId);
  }
}
