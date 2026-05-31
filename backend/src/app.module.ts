import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { GroupsModule } from './groups/groups.module';
import { ExpensesModule } from './expenses/expenses.module';
import { MessagesModule } from './messages/messages.module';
import { LocationModule } from './location/location.module';
import { ActivityModule } from './activity/activity.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GroupsModule,
    ExpensesModule,
    MessagesModule,
    LocationModule,
    ActivityModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
