import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupAccessService } from './group-access.service';

/**
 * Someone joined or left a trip. The realtime gateway joins only at connect time, so
 * without this a member added (or a trip created) while they're online would get none
 * of that trip's live events until they reloaded — and a removed member would keep
 * receiving them. The gateway moves their open sockets in or out of the room.
 */
export type MembershipEvent = {
  type: 'added' | 'removed';
  groupId: number;
  userId: number;
};

@Injectable()
export class GroupsService {
  readonly membershipEvents = new Subject<MembershipEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
  ) {}

  async create(dto: CreateGroupDto, userId: number) {
    const group = await this.prisma.group.create({
      data: {
        name: dto.name,
        description: dto.description,
        photoUrl: dto.photoUrl,
        defaultCurrency: dto.defaultCurrency?.toUpperCase() ?? 'USD',
        createdById: userId,
        members: {
          create: { userId, role: 'ADMIN' },
        },
      },
      include: {
        members: {
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
        },
        createdBy: {
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

    this.membershipEvents.next({ type: 'added', groupId: group.id, userId });
    return group;
  }

  async findAll(userId: number) {
    const groups = await this.prisma.group.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: {
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
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
        // Newest message per group, so the trip list can show a real preview line
        // instead of a placeholder.
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, name: true, username: true, phone: true },
            },
            expense: {
              select: {
                id: true,
                title: true,
                totalAmount: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    return groups.map(({ messages, ...group }) => ({
      ...group,
      lastMessage: messages[0] ?? null,
    }));
  }

  async updateMemberStatus(
    groupId: number,
    userId: number,
    status: 'ACTIVE' | 'PENDING' | 'ARCHIVED',
  ) {
    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return this.prisma.groupMember.update({
      where: { id: membership.id },
      data: { status },
    });
  }

  async findOne(groupId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
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
        },
        createdBy: {
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

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    return group;
  }

  async update(groupId: number, dto: UpdateGroupDto, userId: number) {
    await this.groupAccessService.ensureAdmin(groupId, userId);

    return this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.defaultCurrency !== undefined
          ? { defaultCurrency: dto.defaultCurrency.toUpperCase() }
          : {}),
      },
      include: {
        members: {
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
        },
        createdBy: {
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

  async addMember(groupId: number, dto: AddMemberDto, userId: number) {
    await this.groupAccessService.ensureAdmin(groupId, userId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const alreadyMember = group.members.some((m) => m.userId === dto.userId);
    if (alreadyMember) {
      throw new ForbiddenException('User is already a member');
    }

    const member = await this.prisma.groupMember.create({
      data: { groupId, userId: dto.userId, status: 'PENDING' },
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

    this.membershipEvents.next({ type: 'added', groupId, userId: dto.userId });
    return member;
  }

  async removeMember(groupId: number, memberUserId: number, userId: number) {
    await this.groupAccessService.ensureAdmin(groupId, userId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (memberUserId === group.createdById) {
      throw new ForbiddenException('Cannot remove the group creator');
    }

    const membership = group.members.find((m) => m.userId === memberUserId);
    if (!membership) {
      throw new NotFoundException('User is not a member');
    }

    const removed = await this.prisma.groupMember.delete({
      where: { id: membership.id },
    });

    this.membershipEvents.next({
      type: 'removed',
      groupId,
      userId: memberUserId,
    });
    return removed;
  }

  async remove(groupId: number, userId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.createdById !== userId) {
      throw new ForbiddenException('Only the creator can delete the group');
    }

    return this.prisma.group.delete({ where: { id: groupId } });
  }
}
