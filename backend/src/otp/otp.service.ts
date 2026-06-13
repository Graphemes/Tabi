import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async requestOtp(phone: string, name?: string) {
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
      data: { phone: normalized, otp, name, expiresAt },
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
      const syntheticEmail = `${normalized}@tabi.mobile`;
      user = await this.prisma.user.findUnique({
        where: { email: syntheticEmail },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { phone: normalized },
        });
      }
    }

    if (!user) {
      const userName = record.name || 'User';
      const baseUsername = userName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 24);

      const username = `${baseUsername || 'user'}-${normalized.slice(-4)}`;
      const randomPassword = await bcrypt.hash(`otp:${normalized}`, 10);

      user = await this.prisma.user.create({
        data: {
          email: `${normalized}@tabi.mobile`,
          phone: normalized,
          username,
          password: randomPassword,
        },
      });
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      phone: normalized,
    };
  }
}
