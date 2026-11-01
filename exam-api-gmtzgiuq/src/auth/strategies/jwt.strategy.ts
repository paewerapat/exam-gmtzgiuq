import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || '',
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // A token without a usable `sub` (e.g. signed with a leaked secret) must
    // not reach findById, which would otherwise match the first user
    const sub: unknown = payload?.sub;
    if (typeof sub !== 'string' || sub.trim() === '') {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findById(sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
