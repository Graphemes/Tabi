import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../../common/interfaces/auth-user.interface';

// Module augmentation rather than `declare global { namespace Express }`: same effect
// on `req.user`, in the ES module syntax the lint rules require.
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const payload = this.jwtService.verify(token);
      req.user = {
        userId: payload.sub,
        email: payload.email,
      };
      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
