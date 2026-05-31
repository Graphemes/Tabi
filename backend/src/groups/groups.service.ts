import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupAccessService } from './group-access.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
  ) {}

  async create(dto: CreateGroupDto, userId: number) {
    return this.prisma.group.create({
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
          include: { user: { select: { id: true, email: true, username: true } } },
        },
        createdBy: { select: { id: true, email: true, username: true } },
      },
    });
  }

  async findAll(userId: number) {
    return this.prisma.group.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, username: true } } },
        },
        createdBy: { select: { id: true, email: true, username: true } },
      },
    });
  }

  async findOne(groupId: number, userId: number) {
    await this.groupAccessService.ensureMember(groupId, userId);

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, username: true } } },
        },
        createdBy: { select: { id: true, email: true, username: true } },
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
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.defaultCurrency !== undefined
          ? { defaultCurrency: dto.defaultCurrency.toUpperCase() }
          : {}),
      },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, username: true } } },
        },
        createdBy: { select: { id: true, email: true, username: true } },
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

    return this.prisma.groupMember.create({
      data: { groupId, userId: dto.userId },
      include: { user: { select: { id: true, email: true, username: true } } },
    });
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

    return this.prisma.groupMember.delete({
      where: { id: membership.id },
    });
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
