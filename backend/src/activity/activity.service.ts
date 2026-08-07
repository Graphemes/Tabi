import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogActivityInput {
  groupId: number;
  actorId: number;
  action: string;
  entityType?: string;
  entityId?: number;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: LogActivityInput) {
    return this.prisma.activityLog.create({
      data: {
        groupId: input.groupId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  }

  async list(groupId: number) {
    return this.prisma.activityLog.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, email: true, username: true, name: true, phone: true },
        },
      },
    });
  }
}
