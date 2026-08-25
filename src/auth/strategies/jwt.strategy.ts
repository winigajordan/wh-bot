import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { BusinessesService } from '../../businesses/businesses.service';
import type { AuthenticatedUser, JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly businessesService: BusinessesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') ?? 'dev-insecure-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload.businessId || !payload.email) {
      throw new UnauthorizedException();
    }

    const business = await this.businessesService.findByUserId(payload.sub);
    if (!business || business.id !== payload.businessId) {
      throw new UnauthorizedException();
    }

    return {
      userId: payload.sub,
      businessId: payload.businessId,
      email: payload.email,
    };
  }
}
