import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { BusinessesService } from '../businesses/businesses.service';
import { User } from '../businesses/entities/user.entity';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  const findOne = jest.fn();
  const findByUserId = jest.fn();
  const signAsync = jest.fn();

  beforeEach(async () => {
    findOne.mockReset();
    findByUserId.mockReset();
    signAsync.mockReset();
    (bcrypt.compare as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne },
        },
        {
          provide: BusinessesService,
          useValue: { findByUserId },
        },
        {
          provide: JwtService,
          useValue: { signAsync },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('retourne un token et le business lié', async () => {
    findOne.mockResolvedValue({
      id: 'user-1',
      email: 'delices@test.local',
      passwordHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    findByUserId.mockResolvedValue({
      id: 'biz-1',
      name: 'Les délices de Jordan',
      status: 'active',
      module: { key: 'restaurant_ordering' },
    });
    signAsync.mockResolvedValue('jwt-token');

    await expect(
      service.login({
        email: 'delices@test.local',
        password: 'password123',
      }),
    ).resolves.toEqual({
      access_token: 'jwt-token',
      user: { id: 'user-1', email: 'delices@test.local' },
      business: {
        id: 'biz-1',
        name: 'Les délices de Jordan',
        moduleKey: 'restaurant_ordering',
        status: 'active',
      },
    });

    expect(signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      businessId: 'biz-1',
      email: 'delices@test.local',
    });
  });

  it('refuse un mauvais mot de passe', async () => {
    findOne.mockResolvedValue({
      id: 'user-1',
      email: 'delices@test.local',
      passwordHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'delices@test.local', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuse un user sans business', async () => {
    findOne.mockResolvedValue({
      id: 'user-1',
      email: 'orphan@test.local',
      passwordHash: 'hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    findByUserId.mockResolvedValue(null);

    await expect(
      service.login({ email: 'orphan@test.local', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
