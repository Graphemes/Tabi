import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { LocationService } from './location.service';
import { ToggleLocationSharingDto } from './dto/toggle-location-sharing.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';
import { MessagesService } from '../messages/messages.service';
import { MessageType } from '@prisma/client';

@Controller('groups/:groupId/location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly messagesService: MessagesService,
  ) {}

  @Patch('sharing')
  setSharing(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ToggleLocationSharingDto,
  ) {
    return this.locationService.setSharing(Number(groupId), user.userId, dto);
  }

  @Post('live')
  updateLive(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLiveLocationDto,
  ) {
    return this.locationService.updateLiveLocation(Number(groupId), user.userId, dto);
  }

  @Get('live')
  listLive(@Param('groupId') groupId: string, @CurrentUser() user: AuthUser) {
    return this.locationService.listVisibleLocations(Number(groupId), user.userId);
  }

  @Post('message')
  async sendLocationMessage(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLiveLocationDto,
  ) {
    const mapUrl = this.locationService.buildMapsDeepLink(
      dto.latitude,
      dto.longitude,
    );

    return this.messagesService.create(Number(groupId), user.userId, {
      type: MessageType.LOCATION,
      latitude: dto.latitude,
      longitude: dto.longitude,
      content: mapUrl,
    });
  }
}
