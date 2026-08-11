import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupsModule } from '../groups/groups.module';
import { ActivityModule } from '../activity/activity.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [PrismaModule, GroupsModule, ActivityModule, RealtimeModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
