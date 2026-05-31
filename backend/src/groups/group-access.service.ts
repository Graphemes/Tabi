import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureMember(groupId: number, userId: number) {
    const membership = await this.prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      include: {
        group: true,
      },
    });

    if (!membership) {
      const exists = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true },
      });

      if (!exists) {
        throw new NotFoundException('Group not found');
      }

      throw new ForbiddenException('You are not a member of this group');
    }

    return membership;
  }

  async ensureAdmin(groupId: number, userId: number) {
    const membership = await this.ensureMember(groupId, userId);
    if (membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can perform this action');
    }

    return membership;
  }
}
