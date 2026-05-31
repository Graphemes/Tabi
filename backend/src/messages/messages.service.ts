import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAccessService } from '../groups/group-access.service';
import { ActivityService } from '../activity/activity.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
    private readonly activityService: ActivityService,
  ) {}

  async create(groupId: number, senderId: number, dto: CreateMessageDto) {
    await this.groupAccessService.ensureMember(groupId, senderId);

    const type = dto.type ?? MessageType.TEXT;
    if (type === MessageType.TEXT && !dto.content) {
      throw new BadRequestException('Text message requires content');
    }

    if (
      type === MessageType.LOCATION &&
      (dto.latitude === undefined || dto.longitude === undefined)
    ) {
      throw new BadRequestException('Location message needs latitude and longitude');
    }

    const message = await this.prisma.message.create({
      data: {
        groupId,
        senderId,
        type,
        content: dto.content,
        mediaUrl: dto.mediaUrl,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mapLabel: dto.mapLabel,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });

    await this.activityService.log({
      groupId,
      actorId: senderId,
      action: 'MESSAGE_SENT',
      entityType: 'Message',
      entityId: message.id,
      metadata: {
        type,
      },
    });

    return message;
  }

  async list(groupId: number, userId: number, limit = 100, beforeId?: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    return this.prisma.message.findMany({
      where: {
        groupId,
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true,
          },
        },
      },
    });
  }
}
