import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ActivityService } from '../activity/activity.service';
import { ToggleLocationSharingDto } from './dto/toggle-location-sharing.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';

const USER_SUMMARY = {
  id: true,
  email: true,
  username: true,
  name: true,
  phone: true,
} as const;

/**
 * Something the rest of the trip should see straight away. Positions arrive over both
 * REST and the socket, and sharing is toggled over REST, so the service announces the
 * change itself rather than leaving it to whichever transport happened to carry it —
 * the realtime gateway relays these to the group's room.
 */
export type LocationEvent =
  | {
      type: 'update';
      groupId: number;
      userId: number;
      location: Awaited<ReturnType<LocationService['upsertLocation']>>;
    }
  | { type: 'sharing'; groupId: number; userId: number; enabled: boolean };

@Injectable()
export class LocationService {
  readonly events = new Subject<LocationEvent>();

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
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
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

    this.events.next({
      type: 'sharing',
      groupId,
      userId,
      enabled: member.locationSharingEnabled,
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

    const location = await this.upsertLocation(groupId, userId, dto);
    this.events.next({ type: 'update', groupId, userId, location });

    return {
      updated: true,
      location,
    };
  }

  /** Same shape as `listVisibleLocations` rows, so listeners can use either. */
  private upsertLocation(
    groupId: number,
    userId: number,
    dto: UpdateLiveLocationDto,
  ) {
    return this.prisma.liveLocation.upsert({
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
      include: {
        user: {
          select: USER_SUMMARY,
        },
      },
    });
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
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
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
