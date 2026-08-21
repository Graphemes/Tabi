import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, PlaceKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ActivityService } from '../activity/activity.service';
import { LocationService } from '../location/location.service';
import { MessagesService } from '../messages/messages.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';

const CREATOR_SELECT = {
  select: { id: true, email: true, username: true, name: true, phone: true },
} as const;

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
    private readonly activityService: ActivityService,
    private readonly locationService: LocationService,
    private readonly messagesService: MessagesService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(groupId: number, userId: number, dto: CreatePlaceDto) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const duplicate = await this.findDuplicate(groupId, dto);
    if (duplicate) {
      throw new ConflictException(
        `"${duplicate.name}" is already saved to this trip`,
      );
    }

    if (dto.kind === PlaceKind.START || dto.kind === PlaceKind.DESTINATION) {
      await this.ensureSingle(groupId, dto.kind);
    }

    const place = await this.prisma.savedPlace.create({
      data: {
        groupId,
        createdById: userId,
        name: dto.name,
        kind: dto.kind,
        note: dto.note,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        externalId: dto.externalId,
      },
      include: { createdBy: CREATOR_SELECT },
    });

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: 'PLACE_SAVED',
      entityType: 'SavedPlace',
      entityId: place.id,
      metadata: { name: place.name },
    });

    this.realtimeGateway.server.to(`group:${groupId}`).emit('place:new', place);

    return place;
  }

  async list(groupId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    return this.prisma.savedPlace.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: CREATOR_SELECT },
    });
  }

  async update(
    groupId: number,
    placeId: number,
    userId: number,
    dto: UpdatePlaceDto,
  ) {
    await this.groupAccessService.ensureMember(groupId, userId);
    await this.findInGroup(groupId, placeId);

    if (dto.kind === PlaceKind.START || dto.kind === PlaceKind.DESTINATION) {
      await this.ensureSingle(groupId, dto.kind, placeId);
    }

    const place = await this.prisma.savedPlace.update({
      where: { id: placeId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.note === undefined ? {} : { note: dto.note }),
        ...(dto.kind === undefined ? {} : { kind: dto.kind }),
      },
      include: { createdBy: CREATOR_SELECT },
    });

    this.realtimeGateway.server
      .to(`group:${groupId}`)
      .emit('place:updated', place);

    return place;
  }

  async remove(groupId: number, placeId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);
    const place = await this.findInGroup(groupId, placeId);

    await this.prisma.savedPlace.delete({ where: { id: placeId } });

    await this.activityService.log({
      groupId,
      actorId: userId,
      action: 'PLACE_REMOVED',
      entityType: 'SavedPlace',
      entityId: placeId,
      metadata: { name: place.name },
    });

    this.realtimeGateway.server
      .to(`group:${groupId}`)
      .emit('place:removed', { groupId, placeId });

    return { deleted: true, id: placeId };
  }

  async shareToChat(groupId: number, placeId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);
    const place = await this.findInGroup(groupId, placeId);

    const mapUrl = this.locationService.buildMapsDeepLink(
      place.latitude,
      place.longitude,
      place.name,
    );

    // MessagesService owns validation + activity logging; it does not broadcast,
    // so the emit below mirrors what expenses.service does after creating a message.
    const message = await this.messagesService.create(groupId, userId, {
      type: MessageType.LOCATION,
      latitude: place.latitude,
      longitude: place.longitude,
      mapLabel: place.name,
      content: mapUrl,
    });

    this.realtimeGateway.server
      .to(`group:${groupId}`)
      .emit('message:new', message);

    return message;
  }

  /**
   * A trip runs from one source to one destination, with any number of stops in
   * between — both ends anchor the route, so a second of either is rejected rather
   * than silently reordering the trip. Everything else is a STOP.
   */
  private async ensureSingle(
    groupId: number,
    kind: Extract<PlaceKind, 'START' | 'DESTINATION'>,
    exceptPlaceId?: number,
  ) {
    const existing = await this.prisma.savedPlace.findFirst({
      where: {
        groupId,
        kind,
        ...(exceptPlaceId ? { id: { not: exceptPlaceId } } : {}),
      },
    });

    if (!existing) return;

    throw new ConflictException(
      kind === PlaceKind.START
        ? `"${existing.name}" is already the starting point for this trip`
        : `"${existing.name}" is already the destination for this trip`,
    );
  }

  /**
   * A place counts as already saved if it's the same provider POI, or sits within
   * ~11m of an existing pin. Coordinates are floats, so an exact match is unreliable —
   * the same search hit can round differently between clients.
   */
  private async findDuplicate(groupId: number, dto: CreatePlaceDto) {
    if (dto.externalId) {
      const byExternalId = await this.prisma.savedPlace.findFirst({
        where: { groupId, externalId: dto.externalId },
      });
      if (byExternalId) return byExternalId;
    }

    const EPSILON = 0.0001;
    return this.prisma.savedPlace.findFirst({
      where: {
        groupId,
        latitude: { gte: dto.latitude - EPSILON, lte: dto.latitude + EPSILON },
        longitude: {
          gte: dto.longitude - EPSILON,
          lte: dto.longitude + EPSILON,
        },
      },
    });
  }

  /** Guards against a place id from another group being used under this group's path. */
  private async findInGroup(groupId: number, placeId: number) {
    const place = await this.prisma.savedPlace.findFirst({
      where: { id: placeId, groupId },
    });

    if (!place) {
      throw new NotFoundException('Place not found in this trip');
    }

    return place;
  }
}
