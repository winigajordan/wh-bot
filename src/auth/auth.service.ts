import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessesService } from '../businesses/businesses.service';
import { User } from '../businesses/entities/user.entity';
import type { JwtPayload } from './auth.types';
import type { LoginDto } from './dto/login.dto';

export type LoginResult = {
  access_token: string;
  user: { id: string; email: string };
  business: {
    id: string;
    name: string;
    moduleKey: string | null;
    status: string;
  };
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly businessesService: BusinessesService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const business = await this.businessesService.findByUserId(user.id);
    if (!business) {
      throw new UnauthorizedException(
        'Aucun business lié à ce compte',
      );
    }

    const payload: JwtPayload = {
      sub: user.id,
      businessId: business.id,
      email: user.email,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, email: user.email },
      business: {
        id: business.id,
        name: business.name,
        moduleKey: business.module?.key ?? null,
        status: business.status,
      },
    };
  }

  async getMe(userId: string): Promise<LoginResult['user'] & {
    business: LoginResult['business'];
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }

    const business = await this.businessesService.findByUserId(user.id);
    if (!business) {
      throw new UnauthorizedException('Aucun business lié à ce compte');
    }

    return {
      id: user.id,
      email: user.email,
      business: {
        id: business.id,
        name: business.name,
        moduleKey: business.module?.key ?? null,
        status: business.status,
      },
    };
  }
}
