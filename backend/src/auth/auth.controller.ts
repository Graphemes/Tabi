import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { MobileLoginDto } from './dto/mobile-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(
      signupDto.email,
      signupDto.password,
      signupDto.username,
    );
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Post('mobile-login')
  async mobileLogin(@Body() dto: MobileLoginDto) {
    return this.authService.loginWithMobile(dto.mobile, dto.name);
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: any) {
    return { message: 'Protected route', user };
  }
}
