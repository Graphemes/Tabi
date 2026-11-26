import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { requiredEnv } from '../common/config/required-env';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [OtpController],
  providers: [OtpService],
})
export class OtpModule {}
