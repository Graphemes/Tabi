import { Body, Controller, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request-otp')
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto.phone);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyOtp(dto.phone, dto.otp);
  }
}
