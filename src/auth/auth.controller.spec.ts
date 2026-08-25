import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const login = jest.fn();
  const getMe = jest.fn();

  beforeEach(async () => {
    login.mockReset();
    getMe.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { login, getMe },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('délègue le login', async () => {
    login.mockResolvedValue({ access_token: 'tok' });

    await expect(
      controller.login({ email: 'a@b.c', password: 'secret' }),
    ).resolves.toEqual({ access_token: 'tok' });

    expect(login).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'secret',
    });
  });

  it('refuse un body incomplet', async () => {
    await expect(controller.login({ email: 'a@b.c' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
