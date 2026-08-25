import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUuid } from '../../common/uuid.util';
import { Order } from '../orders/entities/order.entity';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { matchZoneInAddress } from './zone-matching.util';

export type DeliveryZoneDto = {
  name: string;
  delivery_fee: number;
};

export type DashboardDeliveryZoneDto = {
  id: string;
  name: string;
  delivery_fee: number;
};

export type DeliveryZoneWriteInput = {
  name?: string;
  delivery_fee?: number;
};

@Injectable()
export class DeliveryZonesService {
  constructor(
    @InjectRepository(DeliveryZone)
    private readonly zoneRepo: Repository<DeliveryZone>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async listZones(businessId: string): Promise<DeliveryZoneDto[]> {
    const zones = await this.zoneRepo.find({
      where: { businessId },
      order: { zoneName: 'ASC' },
    });
    return zones.map((zone) => this.toDto(zone));
  }

  async listForDashboard(
    businessId: string,
  ): Promise<DashboardDeliveryZoneDto[]> {
    const zones = await this.zoneRepo.find({
      where: { businessId },
      order: { zoneName: 'ASC' },
    });
    return zones.map((zone) => this.toDashboardDto(zone));
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

  async createZone(
    businessId: string,
    data: { name: string; delivery_fee: number },
  ): Promise<DashboardDeliveryZoneDto> {
    const name = data.name.trim();
    if (!name) {
      throw new BadRequestException('name requis (string non vide)');
    }
    if (!Number.isFinite(data.delivery_fee) || data.delivery_fee < 0) {
      throw new BadRequestException('delivery_fee doit être un nombre ≥ 0');
    }

    await this.assertUniqueName(businessId, name);

    const zone = this.zoneRepo.create({
      businessId,
      zoneName: name,
      deliveryFee: String(data.delivery_fee),
    });
    const saved = await this.zoneRepo.save(zone);
    return this.toDashboardDto(saved);
  }

  async updateZone(
    businessId: string,
    zoneId: string,
    data: DeliveryZoneWriteInput,
  ): Promise<DashboardDeliveryZoneDto | null> {
    const zone = await this.findById(businessId, zoneId);
    if (!zone) {
      return null;
    }

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) {
        throw new BadRequestException('name requis (string non vide)');
      }
      await this.assertUniqueName(businessId, name, zone.id);
      zone.zoneName = name;
    }

    if (data.delivery_fee !== undefined) {
      if (!Number.isFinite(data.delivery_fee) || data.delivery_fee < 0) {
        throw new BadRequestException('delivery_fee doit être un nombre ≥ 0');
      }
      zone.deliveryFee = String(data.delivery_fee);
    }

    const saved = await this.zoneRepo.save(zone);
    return this.toDashboardDto(saved);
  }

  async deleteZone(
    businessId: string,
    zoneId: string,
  ): Promise<{ deleted: true } | null> {
    const zone = await this.findById(businessId, zoneId);
    if (!zone) {
      return null;
    }

    const orderCount = await this.orderRepo.count({
      where: { deliveryZoneId: zone.id },
    });
    if (orderCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${orderCount} commande(s) référencent encore cette zone`,
      );
    }

    await this.zoneRepo.remove(zone);
    return { deleted: true };
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

  toDashboardDto(zone: DeliveryZone): DashboardDeliveryZoneDto {
    return {
      id: zone.id,
      name: zone.zoneName,
      delivery_fee: Number(zone.deliveryFee),
    };
  }

  private async assertUniqueName(
    businessId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.zoneRepo
      .createQueryBuilder('zone')
      .where('zone.business_id = :businessId', { businessId })
      .andWhere('LOWER(zone.zone_name) = LOWER(:name)', { name })
      .getOne();

    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Cette zone existe déjà');
    }
  }

  private toDto(zone: DeliveryZone): DeliveryZoneDto {
    return {
      name: zone.zoneName,
      delivery_fee: Number(zone.deliveryFee),
    };
  }
}
