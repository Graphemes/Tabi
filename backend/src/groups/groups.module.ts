import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupAccessService } from './group-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupAccessService],
  exports: [GroupsService, GroupAccessService],
})
export class GroupsModule {}
