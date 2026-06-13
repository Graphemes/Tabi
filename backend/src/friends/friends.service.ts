import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { RespondFriendRequestDto } from './dto/respond-friend-request.dto';
import { ListFriendRequestsDto } from './dto/list-friend-requests.dto';
import { DiscoverUsersDto } from './dto/discover-users.dto';
import { AddContactDto } from './dto/add-contact.dto';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  private pair(userIdA: number, userIdB: number) {
    return userIdA < userIdB
      ? { userAId: userIdA, userBId: userIdB }
      : { userAId: userIdB, userBId: userIdA };
  }

  private async ensureUserExists(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  async sendRequest(senderId: number, dto: SendFriendRequestDto) {
    if (senderId === dto.receiverId) {
      throw new BadRequestException(
        'You cannot send a friend request to yourself',
      );
    }

    await this.ensureUserExists(dto.receiverId);

    const { userAId, userBId } = this.pair(senderId, dto.receiverId);
    const existingFriendship = await this.prisma.friendship.findUnique({
      where: {
        userAId_userBId: {
          userAId,
          userBId,
        },
      },
    });
    if (existingFriendship) {
      throw new BadRequestException('Users are already friends');
    }

    const reversePending = await this.prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId: dto.receiverId,
          receiverId: senderId,
        },
      },
    });

    if (reversePending?.status === FriendRequestStatus.PENDING) {
      const accepted = await this.acceptRequest(senderId, reversePending.id);
      return {
        autoAccepted: true,
        ...accepted,
      };
    }

    const existing = await this.prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId: dto.receiverId,
        },
      },
    });

    if (existing?.status === FriendRequestStatus.PENDING) {
      throw new BadRequestException('Friend request already pending');
    }

    const request = existing
      ? await this.prisma.friendRequest.update({
          where: { id: existing.id },
          data: {
            status: FriendRequestStatus.PENDING,
            message: dto.message,
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true,
                name: true,
                phone: true,
              },
            },
            receiver: {
              select: {
                id: true,
                email: true,
                username: true,
                name: true,
                phone: true,
              },
            },
          },
        })
      : await this.prisma.friendRequest.create({
          data: {
            senderId,
            receiverId: dto.receiverId,
            message: dto.message,
          },
          include: {
            sender: {
              select: {
                id: true,
                email: true,
                username: true,
                name: true,
                phone: true,
              },
            },
            receiver: {
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

    return request;
  }

  async listFriends(userId: number) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
        userB: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return friendships.map((friendship) => {
      const friend =
        friendship.userAId === userId ? friendship.userB : friendship.userA;
      return {
        friendshipId: friendship.id,
        friend,
        createdAt: friendship.createdAt,
      };
    });
  }

  async listIncomingRequests(userId: number, query: ListFriendRequestsDto) {
    return this.prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSentRequests(userId: number, query: ListFriendRequestsDto) {
    return this.prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        receiver: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptRequest(userId: number, requestId: number) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
        receiver: {
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

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new ForbiddenException('You can only accept requests sent to you');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be accepted');
    }

    const { userAId, userBId } = this.pair(
      request.senderId,
      request.receiverId,
    );

    const [updatedRequest, friendship] = await this.prisma.$transaction([
      this.prisma.friendRequest.update({
        where: { id: request.id },
        data: { status: FriendRequestStatus.ACCEPTED },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              username: true,
              name: true,
              phone: true,
            },
          },
          receiver: {
            select: {
              id: true,
              email: true,
              username: true,
              name: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.friendship.upsert({
        where: {
          userAId_userBId: {
            userAId,
            userBId,
          },
        },
        create: {
          userAId,
          userBId,
        },
        update: {},
      }),
    ]);

    return {
      request: updatedRequest,
      friendship,
    };
  }

  async respondToRequest(
    userId: number,
    requestId: number,
    dto: RespondFriendRequestDto,
  ) {
    if (
      dto.status !== FriendRequestStatus.ACCEPTED &&
      dto.status !== FriendRequestStatus.REJECTED
    ) {
      throw new BadRequestException('Status must be ACCEPTED or REJECTED');
    }

    if (dto.status === FriendRequestStatus.ACCEPTED) {
      return this.acceptRequest(userId, requestId);
    }

    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new ForbiddenException('You can only reject requests sent to you');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.REJECTED },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
        receiver: {
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

  async cancelSentRequest(userId: number, requestId: number) {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.senderId !== userId) {
      throw new ForbiddenException('You can only cancel your own sent request');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: FriendRequestStatus.CANCELLED },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            phone: true,
          },
        },
        receiver: {
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

  async removeFriend(userId: number, friendUserId: number) {
    if (userId === friendUserId) {
      throw new BadRequestException('You cannot unfriend yourself');
    }

    const { userAId, userBId } = this.pair(userId, friendUserId);

    const friendship = await this.prisma.friendship.findUnique({
      where: {
        userAId_userBId: {
          userAId,
          userBId,
        },
      },
    });

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    await this.prisma.friendship.delete({
      where: { id: friendship.id },
    });

    return {
      removed: true,
      friendUserId,
    };
  }

  async addContact(userId: number, dto: AddContactDto) {
    const results: Array<{ phone: string; status: string; error?: string }> =
      [];

    for (const item of dto.contacts) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { phone: item.phone },
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            name: true,
          },
        });

        if (!user) {
          results.push({
            phone: item.phone,
            status: 'error',
            error: 'No user found with this phone number',
          });
          continue;
        }

        if (item.name && !user.name) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { name: item.name },
          });
        }

        const request = await this.sendRequest(userId, {
          receiverId: user.id,
        });
        results.push({
          phone: item.phone,
          status: 'success',
        });
      } catch (err: any) {
        results.push({
          phone: item.phone,
          status: 'error',
          error: err.message || 'Failed to add contact',
        });
      }
    }

    return { results };
  }

  async discoverUsers(userId: number, query: DiscoverUsersDto) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: {
        userAId: true,
        userBId: true,
      },
    });

    const friendIds = new Set<number>();
    for (const friendship of friendships) {
      friendIds.add(
        friendship.userAId === userId ? friendship.userBId : friendship.userAId,
      );
    }

    const pendingRequests = await this.prisma.friendRequest.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: FriendRequestStatus.PENDING,
      },
      select: {
        senderId: true,
        receiverId: true,
      },
    });

    const pendingIds = new Set<number>();
    for (const request of pendingRequests) {
      pendingIds.add(
        request.senderId === userId ? request.receiverId : request.senderId,
      );
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          not: userId,
        },
        ...(query.query
          ? {
              OR: [
                { username: { contains: query.query, mode: 'insensitive' } },
                { email: { contains: query.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
      orderBy: {
        username: 'asc',
      },
      take: 50,
    });

    return users.map((user) => ({
      ...user,
      isFriend: friendIds.has(user.id),
      hasPendingRequest: pendingIds.has(user.id),
    }));
  }
}
