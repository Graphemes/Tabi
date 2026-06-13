import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GroupAccessService } from '../groups/group-access.service';
import { ActivityService } from './activity.service';
import { AuthUser } from '../common/interfaces/auth-user.interface';

@Controller('groups/:groupId/activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(
    private readonly groupAccessService: GroupAccessService,
    private readonly activityService: ActivityService,
  ) {}

  @Get()
  async list(@Param('groupId') groupId: string, @CurrentUser() user: AuthUser) {
    const parsedGroupId = Number(groupId);
    await this.groupAccessService.ensureMember(parsedGroupId, user.userId);
    return this.activityService.list(parsedGroupId);
  }
}
