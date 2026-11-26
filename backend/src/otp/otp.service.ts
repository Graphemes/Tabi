import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { requiredEnv } from '../common/config/required-env';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  private async generateTokens(userId: number) {
    const accessToken = this.jwtService.sign(
      { sub: userId },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      {
        secret: requiredEnv('JWT_REFRESH_SECRET'),
        expiresIn: '24h',
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async requestOtp(phone: string) {
    const normalized = phone.replace(/\s+/g, '');

    const recent = await this.prisma.otpCode.findFirst({
      where: {
        phone: normalized,
        used: false,
        expiresAt: { gte: new Date() },
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
    });

    if (recent) {
      throw new BadRequestException(
        'OTP already sent recently. Please wait 2 minutes before requesting again.',
      );
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { phone: normalized, otp, expiresAt },
    });

    this.logger.log(`[OTP] For ${normalized}: ${otp}`);

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(phone: string, otp: string) {
    const normalized = phone.replace(/\s+/g, '');

    const record = await this.prisma.otpCode.findFirst({
      where: {
        phone: normalized,
        otp,
        used: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.otpCode.update({
      where: { id: record.id },
      data: { used: true },
    });

    let user = await this.prisma.user.findFirst({
      where: { phone: normalized },
    });

    if (!user) {
      const randomPassword = await bcrypt.hash(`otp:${normalized}`, 10);

      user = await this.prisma.user.create({
        data: {
          phone: normalized,
          password: randomPassword,
        },
      });
    }

    const tokens = await this.generateTokens(user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
      },
      phone: normalized,
    };
  }
}
