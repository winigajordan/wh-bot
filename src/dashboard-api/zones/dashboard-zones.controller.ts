import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  DeliveryZonesService,
  type DeliveryZoneWriteInput,
} from '../../restaurant-ordering/delivery-zones/delivery-zones.service';

@Controller('dashboard/zones')
@UseGuards(JwtAuthGuard)
export class DashboardZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveryZonesService.listForDashboard(user.businessId);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = this.parseCreateBody(body);
    return this.deliveryZonesService.createZone(user.businessId, input);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = this.parseUpdateBody(body);
    const zone = await this.deliveryZonesService.updateZone(
      user.businessId,
      id,
      input,
    );
    if (!zone) {
      throw new NotFoundException('Zone introuvable');
    }
    return zone;
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const result = await this.deliveryZonesService.deleteZone(
      user.businessId,
      id,
    );
    if (!result) {
      throw new NotFoundException('Zone introuvable');
    }
    return result;
  }

  private parseCreateBody(body: unknown): {
    name: string;
    delivery_fee: number;
  } {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body JSON requis');
    }

    const raw = body as Record<string, unknown>;
    return {
      name: this.readRequiredString(raw.name, 'name'),
      delivery_fee: this.readFee(
        raw.delivery_fee !== undefined ? raw.delivery_fee : raw.deliveryFee,
      ),
    };
  }

  private parseUpdateBody(body: unknown): DeliveryZoneWriteInput {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Body JSON requis');
    }

    const raw = body as Record<string, unknown>;
    const input: DeliveryZoneWriteInput = {};

    if (raw.name !== undefined) {
      input.name = this.readRequiredString(raw.name, 'name');
    }

    if (raw.delivery_fee !== undefined || raw.deliveryFee !== undefined) {
      input.delivery_fee = this.readFee(
        raw.delivery_fee !== undefined ? raw.delivery_fee : raw.deliveryFee,
      );
    }

    if (Object.keys(input).length === 0) {
      throw new BadRequestException('Aucun champ à mettre à jour');
    }

    return input;
  }

  private readRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} requis (string non vide)`);
    }
    return value.trim();
  }

  private readFee(value: unknown): number {
    const fee = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new BadRequestException('delivery_fee doit être un nombre ≥ 0');
    }
    return fee;
  }
}
