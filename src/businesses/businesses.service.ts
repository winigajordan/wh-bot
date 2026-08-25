import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from './entities/business.entity';

@Injectable()
export class BusinessesService {
  constructor(
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
  ) {}

  findByWhatsAppPhoneNumberId(
    phoneNumberId: string,
  ): Promise<Business | null> {
    return this.businessRepository.findOne({
      where: { whatsappPhoneNumberId: phoneNumberId },
      relations: { module: true },
    });
  }

  findById(id: string): Promise<Business | null> {
    return this.businessRepository.findOne({
      where: { id },
      relations: { module: true },
    });
  }

  findByUserId(userId: string): Promise<Business | null> {
    return this.businessRepository.findOne({
      where: { userId },
      relations: { module: true },
    });
  }
}
