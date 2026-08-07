import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ActivityService } from '../activity/activity.service';
import { ToggleLocationSharingDto } from './dto/toggle-location-sharing.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';

@Injectable()
export class LocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
    private readonly activityService: ActivityService,
  ) {}

  async setSharing(
    groupId: number,
    userId: number,
    dto: ToggleLocationSharingDto,
  ) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const member = await this.prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: {
        locationSharingEnabled: dto.enabled,
      },
      include: {
        user: {
          select: { id: true, email: true, username: true, name: true, phone: true },
        },
      },
    });

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: dto.enabled
        ? 'LOCATION_SHARING_ENABLED'
        : 'LOCATION_SHARING_DISABLED',
      entityType: 'GroupMember',
      entityId: member.id,
    });

    return member;
  }

  async updateLiveLocation(
    groupId: number,
    userId: number,
    dto: UpdateLiveLocationDto,
  ) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!membership?.locationSharingEnabled) {
      return {
        updated: false,
        reason: 'Location sharing is disabled for this user',
      };
    }

    const location = await this.prisma.liveLocation.upsert({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        speed: dto.speed,
        heading: dto.heading,
        sharedAt: new Date(),
      },
      create: {
        groupId,
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        speed: dto.speed,
        heading: dto.heading,
      },
    });

    return {
      updated: true,
      location,
    };
  }

  async listVisibleLocations(groupId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    return this.prisma.liveLocation.findMany({
      where: {
        groupId,
        user: {
          groupMembers: {
            some: {
              groupId,
              locationSharingEnabled: true,
            },
          },
        },
      },
      orderBy: { sharedAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, username: true, name: true, phone: true },
        },
      },
    });
  }

  buildMapsDeepLink(lat: number, lng: number, label?: string) {
    if (label) {
      const encoded = encodeURIComponent(label);
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}%20(${encoded})`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
}
