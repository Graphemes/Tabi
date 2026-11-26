import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { GroupAccessService } from '../groups/group-access.service';
import { GroupsService } from '../groups/groups.service';
import { MessagesService } from '../messages/messages.service';
import { LocationService } from '../location/location.service';
import { CreateMessageDto } from '../messages/dto/create-message.dto';
import { ToggleLocationSharingDto } from '../location/dto/toggle-location-sharing.dto';
import { UpdateLiveLocationDto } from '../location/dto/update-live-location.dto';
import { MessageType } from '@prisma/client';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { requiredEnv } from '../common/config/required-env';

type SocketUser = {
  userId: number;
  email: string;
  username: string;
};

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  // With `namespace` set on the gateway, Nest injects that Namespace here, not the
  // root Server — so `server.sockets` is already the id → Socket map.
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly userSockets = new Map<number, Set<string>>();
  private readonly socketGroups = new Map<string, Set<number>>();
  private readonly subscriptions: Subscription[] = [];

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly groupAccessService: GroupAccessService,
    private readonly groupsService: GroupsService,
    private readonly messagesService: MessagesService,
    private readonly locationService: LocationService,
  ) {}

  /**
   * Positions and sharing toggles reach the service over REST as well as this socket,
   * so the broadcast hangs off the service's event stream rather than off the socket
   * handlers — otherwise anything sent over HTTP would never reach the rest of the trip.
   */
  afterInit() {
    const locationEvents = this.locationService.events.subscribe((event) => {
      const room = this.getGroupRoom(event.groupId);
      if (event.type === 'update') {
        this.server.to(room).emit('location:update', {
          groupId: event.groupId,
          userId: event.userId,
          username: event.location.user?.username,
          location: event.location,
        });
      } else {
        this.server.to(room).emit('location:sharing', {
          groupId: event.groupId,
          userId: event.userId,
          enabled: event.enabled,
        });
      }
    });

    // Rooms are otherwise joined only on connect, so move the member's open sockets now.
    const membershipEvents = this.groupsService.membershipEvents.subscribe(
      (event) => {
        const room = this.getGroupRoom(event.groupId);
        for (const socketId of this.userSockets.get(event.userId) ?? []) {
          const socket = this.server.sockets.get(socketId);
          if (!socket) continue;
          if (event.type === 'added') {
            socket.join(room);
            this.trackSocketGroup(socketId, event.groupId);
          } else {
            socket.leave(room);
            this.untrackSocketGroup(socketId, event.groupId);
          }
          // Lets the client refresh its trip list without a reload.
          socket.emit(
            event.type === 'added' ? 'group:added' : 'group:removed',
            { groupId: event.groupId },
          );
        }
      },
    );

    this.subscriptions.push(locationEvents, membershipEvents);
  }

  onModuleDestroy() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  private getGroupRoom(groupId: number): string {
    return `group:${groupId}`;
  }

  private addSocketForUser(userId: number, socketId: string) {
    const existing = this.userSockets.get(userId) ?? new Set<string>();
    existing.add(socketId);
    this.userSockets.set(userId, existing);
  }

  private removeSocketForUser(userId: number, socketId: string) {
    const existing = this.userSockets.get(userId);
    if (!existing) {
      return;
    }

    existing.delete(socketId);
    if (existing.size === 0) {
      this.userSockets.delete(userId);
      return;
    }

    this.userSockets.set(userId, existing);
  }

  private trackSocketGroup(socketId: string, groupId: number) {
    const existing = this.socketGroups.get(socketId) ?? new Set<number>();
    existing.add(groupId);
    this.socketGroups.set(socketId, existing);
  }

  private untrackSocketGroup(socketId: string, groupId: number) {
    const existing = this.socketGroups.get(socketId);
    if (!existing) {
      return;
    }

    existing.delete(groupId);
    if (existing.size === 0) {
      this.socketGroups.delete(socketId);
      return;
    }

    this.socketGroups.set(socketId, existing);
  }

  private hasAnotherSocketInGroup(
    userId: number,
    groupId: number,
    excludingSocketId?: string,
  ): boolean {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return false;
    }

    const roomName = this.getGroupRoom(groupId);
    for (const socketId of sockets) {
      if (excludingSocketId && socketId === excludingSocketId) {
        continue;
      }

      const sock = this.server.sockets.get(socketId);
      if (sock && sock.rooms.has(roomName)) {
        return true;
      }
    }

    return false;
  }

  private extractToken(client: Socket): string | null {
    const authToken =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : null;
    if (authToken) {
      return authToken.startsWith('Bearer ')
        ? authToken.replace('Bearer ', '')
        : authToken;
    }

    const headerToken =
      typeof client.handshake.headers.authorization === 'string'
        ? client.handshake.headers.authorization
        : null;
    if (headerToken) {
      return headerToken.startsWith('Bearer ')
        ? headerToken.replace('Bearer ', '')
        : headerToken;
    }

    const queryToken =
      typeof client.handshake.query?.token === 'string'
        ? client.handshake.query.token
        : null;
    return queryToken;
  }

  private emitError(client: Socket, context: string, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    client.emit('group:error', {
      context,
      message,
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.emit('auth:error', { message: 'Missing token' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: requiredEnv('JWT_SECRET'),
      }) as { sub: number; email: string };

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, username: true },
      });

      if (!user) {
        client.emit('auth:error', { message: 'User not found' });
        client.disconnect();
        return;
      }

      client.data.user = {
        userId: user.id,
        email: user.email,
        username: user.username,
      } as SocketUser;
      this.addSocketForUser(user.id, client.id);

      const memberships = await this.prisma.groupMember.findMany({
        where: { userId: user.id },
        select: { groupId: true },
      });
      for (const membership of memberships) {
        const room = this.getGroupRoom(membership.groupId);
        await client.join(room);
        this.trackSocketGroup(client.id, membership.groupId);
      }

      client.emit('auth:ok', {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
        },
      });
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${client.id}`);
      client.emit('auth:error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    const joinedGroups = this.socketGroups.get(client.id) ?? new Set<number>();

    for (const groupId of joinedGroups) {
      this.untrackSocketGroup(client.id, groupId);
      if (!user) {
        continue;
      }

      const isStillOnlineInGroup = this.hasAnotherSocketInGroup(
        user.userId,
        groupId,
        client.id,
      );

      if (!isStillOnlineInGroup) {
        this.server.to(this.getGroupRoom(groupId)).emit('presence:update', {
          groupId,
          userId: user.userId,
          username: user.username,
          status: 'offline',
          at: new Date().toISOString(),
        });
      }
    }

    if (user) {
      this.removeSocketForUser(user.userId, client.id);
    }
  }

  @SubscribeMessage('group:join')
  async joinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      if (!groupId || Number.isNaN(groupId)) {
        throw new Error('groupId is required');
      }

      await this.groupAccessService.ensureMember(groupId, user.userId);
      const room = this.getGroupRoom(groupId);

      await client.join(room);
      this.trackSocketGroup(client.id, groupId);

      client.emit('group:joined', { groupId });

      const isAlreadyOnlineInRoom = this.hasAnotherSocketInGroup(
        user.userId,
        groupId,
        client.id,
      );

      if (!isAlreadyOnlineInRoom) {
        this.server.to(room).emit('presence:update', {
          groupId,
          userId: user.userId,
          username: user.username,
          status: 'online',
          at: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.emitError(client, 'group:join', error);
    }
  }

  @SubscribeMessage('group:leave')
  async leaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      const room = this.getGroupRoom(groupId);
      await client.leave(room);
      this.untrackSocketGroup(client.id, groupId);

      client.emit('group:left', { groupId });

      const stillOnline = this.hasAnotherSocketInGroup(
        user.userId,
        groupId,
        client.id,
      );
      if (!stillOnline) {
        this.server.to(room).emit('presence:update', {
          groupId,
          userId: user.userId,
          username: user.username,
          status: 'offline',
          at: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.emitError(client, 'group:leave', error);
    }
  }

  @SubscribeMessage('message:send')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number; message: CreateMessageDto },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      await this.groupAccessService.ensureMember(groupId, user.userId);
      const saved = await this.messagesService.create(
        groupId,
        user.userId,
        body.message,
      );
      this.server.to(this.getGroupRoom(groupId)).emit('message:new', saved);
      return saved;
    } catch (error) {
      this.emitError(client, 'message:send', error);
      return null;
    }
  }

  @SubscribeMessage('message:history')
  async getMessageHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number; limit?: number; beforeId?: number },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      const messages = await this.messagesService.list(
        groupId,
        user.userId,
        body?.limit ?? 100,
        body?.beforeId,
      );

      client.emit('message:history', {
        groupId,
        messages,
      });
    } catch (error) {
      this.emitError(client, 'message:history', error);
    }
  }

  @SubscribeMessage('typing:start')
  async typingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      await this.groupAccessService.ensureMember(groupId, user.userId);
      client.to(this.getGroupRoom(groupId)).emit('typing:update', {
        groupId,
        userId: user.userId,
        username: user.username,
        isTyping: true,
        at: new Date().toISOString(),
      });
    } catch (error) {
      this.emitError(client, 'typing:start', error);
    }
  }

  @SubscribeMessage('typing:stop')
  async typingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      await this.groupAccessService.ensureMember(groupId, user.userId);
      client.to(this.getGroupRoom(groupId)).emit('typing:update', {
        groupId,
        userId: user.userId,
        username: user.username,
        isTyping: false,
        at: new Date().toISOString(),
      });
    } catch (error) {
      this.emitError(client, 'typing:stop', error);
    }
  }

  @SubscribeMessage('location:share-toggle')
  async toggleLocationSharing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number; payload: ToggleLocationSharingDto },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      // The service broadcasts `location:sharing` itself — see afterInit.
      return await this.locationService.setSharing(
        groupId,
        user.userId,
        body.payload,
      );
    } catch (error) {
      this.emitError(client, 'location:share-toggle', error);
      return null;
    }
  }

  @SubscribeMessage('location:update')
  async updateLiveLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { groupId: number; payload: UpdateLiveLocationDto },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      // The service broadcasts `location:update` itself — see afterInit.
      return await this.locationService.updateLiveLocation(
        groupId,
        user.userId,
        body.payload,
      );
    } catch (error) {
      this.emitError(client, 'location:update', error);
      return null;
    }
  }

  @SubscribeMessage('location:send-message')
  async sendLocationMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { groupId: number; payload: UpdateLiveLocationDto },
  ) {
    const user = client.data.user as SocketUser;
    const groupId = Number(body?.groupId);

    try {
      await this.groupAccessService.ensureMember(groupId, user.userId);

      const mapUrl = this.locationService.buildMapsDeepLink(
        body.payload.latitude,
        body.payload.longitude,
      );

      const saved = await this.messagesService.create(groupId, user.userId, {
        type: MessageType.LOCATION,
        latitude: body.payload.latitude,
        longitude: body.payload.longitude,
        content: mapUrl,
      });

      this.server.to(this.getGroupRoom(groupId)).emit('message:new', saved);
      return saved;
    } catch (error) {
      this.emitError(client, 'location:send-message', error);
      return null;
    }
  }
}
