import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUuid } from '../../common/uuid.util';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { matchZoneInAddress } from './zone-matching.util';

export type DeliveryZoneDto = {
  name: string;
  delivery_fee: number;
};

@Injectable()
export class DeliveryZonesService {
  constructor(
    @InjectRepository(DeliveryZone)
    private readonly zoneRepo: Repository<DeliveryZone>,
  ) {}

  async listZones(businessId: string): Promise<DeliveryZoneDto[]> {
    const zones = await this.zoneRepo.find({
      where: { businessId },
      order: { zoneName: 'ASC' },
    });
    return zones.map((zone) => this.toDto(zone));
  }

  async getZoneNames(businessId: string): Promise<string[]> {
    const zones = await this.listZones(businessId);
    return zones.map((zone) => zone.name);
  }

  async findById(
    businessId: string,
    zoneId: string,
  ): Promise<DeliveryZone | null> {
    if (!isUuid(zoneId)) {
      return null;
    }
    return this.zoneRepo.findOneBy({ id: zoneId, businessId });
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

  private toDto(zone: DeliveryZone): DeliveryZoneDto {
    return {
      name: zone.zoneName,
      delivery_fee: Number(zone.deliveryFee),
    };
  }
}
