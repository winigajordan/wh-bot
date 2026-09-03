import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import { FieldEncryptionService } from './field-encryption.service';

describe('FieldEncryptionService', () => {
  const masterKeyBase64 = randomBytes(32).toString('base64');

  async function createService(
    key: string | undefined,
    nodeEnv = 'development',
  ): Promise<FieldEncryptionService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FieldEncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (path: string) => {
              if (path === 'encryption.messageKeyBase64') {
                return key;
              }
              if (path === 'app.nodeEnv') {
                return nodeEnv;
              }
              return undefined;
            },
          },
        },
      ],
    }).compile();

    const service = module.get(FieldEncryptionService);
    service.onModuleInit();
    return service;
  }

  it('chiffre et déchiffre quand la clé est valide', async () => {
    const service = await createService(masterKeyBase64);
    expect(service.isReady()).toBe(true);
    const encrypted = service.encrypt('hello');
    expect(service.decrypt(encrypted)).toBe('hello');
    expect(service.hashPhone('221700000000')).toHaveLength(64);
  });

  it('reste non prêt sans clé en development', async () => {
    const service = await createService(undefined, 'development');
    expect(service.isReady()).toBe(false);
    expect(() => service.encrypt('x')).toThrow(ServiceUnavailableException);
  });

  it('plante au boot en production sans clé', async () => {
    await expect(createService(undefined, 'production')).rejects.toThrow(
      /MESSAGE_ENCRYPTION_KEY/,
    );
  });
});
