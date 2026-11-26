import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupsModule } from '../groups/groups.module';
import { MessagesModule } from '../messages/messages.module';
import { LocationModule } from '../location/location.module';
import { RealtimeGateway } from './realtime.gateway';
import { requiredEnv } from '../common/config/required-env';

@Module({
  imports: [
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
    }),
    PrismaModule,
    GroupsModule,
    MessagesModule,
    LocationModule,
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
