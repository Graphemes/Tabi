import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthMiddleware } from './middleware/auth.middleware';
import { requiredEnv } from '../common/config/required-env';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: requiredEnv('JWT_SECRET'),
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply AuthMiddleware only to protected routes
    consumer
      .apply(AuthMiddleware)
      .forRoutes({ path: 'auth/profile', method: RequestMethod.GET });
  }
}
