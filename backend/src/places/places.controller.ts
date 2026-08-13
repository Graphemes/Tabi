import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { PlacesService } from './places.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';

@Controller('groups/:groupId/places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Post()
  create(
    @Param('groupId') groupId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePlaceDto,
  ) {
    return this.placesService.create(Number(groupId), user.userId, dto);
  }

  @Get()
  list(@Param('groupId') groupId: string, @CurrentUser() user: AuthUser) {
    return this.placesService.list(Number(groupId), user.userId);
  }

  @Patch(':placeId')
  update(
    @Param('groupId') groupId: string,
    @Param('placeId') placeId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.placesService.update(
      Number(groupId),
      Number(placeId),
      user.userId,
      dto,
    );
  }

  @Delete(':placeId')
  remove(
    @Param('groupId') groupId: string,
    @Param('placeId') placeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.placesService.remove(
      Number(groupId),
      Number(placeId),
      user.userId,
    );
  }

  @Post(':placeId/share')
  share(
    @Param('groupId') groupId: string,
    @Param('placeId') placeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.placesService.shareToChat(
      Number(groupId),
      Number(placeId),
      user.userId,
    );
  }
}
