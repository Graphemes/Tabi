import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupsModule } from '../groups/groups.module';
import { ActivityModule } from '../activity/activity.module';
import { MessagesModule } from '../messages/messages.module';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [PrismaModule, GroupsModule, ActivityModule, MessagesModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
