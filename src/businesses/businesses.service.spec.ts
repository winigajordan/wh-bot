import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BusinessesService } from './businesses.service';
import { Business } from './entities/business.entity';

describe('BusinessesService', () => {
  let service: BusinessesService;
  const findOne = jest.fn();

  beforeEach(async () => {
    findOne.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessesService,
        {
          provide: getRepositoryToken(Business),
          useValue: { findOne },
        },
      ],
    }).compile();

    service = module.get(BusinessesService);
  });

  it('résout un business par whatsapp_phone_number_id', async () => {
    const business = { id: 'biz-1', name: 'Chez Fatou' } as Business;
    findOne.mockResolvedValue(business);

    await expect(
      service.findByWhatsAppPhoneNumberId('test_phone_number_id_fatou'),
    ).resolves.toBe(business);

    expect(findOne).toHaveBeenCalledWith({
      where: { whatsappPhoneNumberId: 'test_phone_number_id_fatou' },
      relations: { module: true },
    });
  });

  it('retourne null si inconnu', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.findByWhatsAppPhoneNumberId('unknown'),
    ).resolves.toBeNull();
  });
});
