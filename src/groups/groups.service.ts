import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateGroupDto, userId: number) {
    return this.prisma.group.create({
      data: {
        name: dto.name,
        description: dto.description,
        createdById: userId,
        members: {
          create: { userId, role: 'admin' },
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

    const isMember = group.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this group');
    }

    return group;
  }

  async addMember(groupId: number, dto: AddMemberDto, userId: number) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const requester = group.members.find((m) => m.userId === userId);
    if (!requester || requester.role !== 'admin') {
      throw new ForbiddenException('Only admins can add members');
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
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const requester = group.members.find((m) => m.userId === userId);
    if (!requester || requester.role !== 'admin') {
      throw new ForbiddenException('Only admins can remove members');
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
