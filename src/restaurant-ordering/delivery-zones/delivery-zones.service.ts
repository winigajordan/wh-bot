import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { matchZoneInAddress } from './zone-matching.util';

@Injectable()
export class DeliveryZonesService {
  constructor(
    @InjectRepository(DeliveryZone)
    private readonly zoneRepo: Repository<DeliveryZone>,
  ) {}

  async getZoneNames(businessId: string): Promise<string[]> {
    const zones = await this.zoneRepo.find({
      where: { businessId },
      order: { zoneName: 'ASC' },
    });
    return zones.map((zone) => zone.zoneName);
  }

  async matchZone(
    businessId: string,
    addressText: string,
  ): Promise<DeliveryZone | null> {
    const zones = await this.zoneRepo.find({ where: { businessId } });

    for (const zone of zones) {
      if (matchZoneInAddress(zone.zoneName, addressText)) {
        return zone;
      }
    }

    return null;
  }
}
