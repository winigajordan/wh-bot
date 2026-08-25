import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  isOrderStatus,
  OrdersService,
} from '../../restaurant-ordering/orders/orders.service';

@Controller('dashboard/orders')
@UseGuards(JwtAuthGuard)
export class DashboardOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
  ) {
    if (status !== undefined && !isOrderStatus(status)) {
      throw new BadRequestException(
        'status invalide (received|preparing|ready|completed)',
      );
    }

    const limit =
      limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : undefined;
    if (limit !== undefined && Number.isNaN(limit)) {
      throw new BadRequestException('limit doit être un entier');
    }

    return this.ordersService.listForBusiness(user.businessId, {
      status,
      limit,
    });
  }

  @Get(':id')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.findForBusiness(
      user.businessId,
      id,
    );
    if (!order) {
      throw new NotFoundException('Commande introuvable');
    }
    return order;
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const status =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).status
        : undefined;

    if (!isOrderStatus(status)) {
      throw new BadRequestException(
        'status requis : received|preparing|ready|completed',
      );
    }

    const result = await this.ordersService.updateStatus(
      user.businessId,
      id,
      status,
    );

    if (!result.success) {
      if (result.reason === 'not_found') {
        throw new NotFoundException('Commande introuvable');
      }
      throw new BadRequestException({
        message: 'Transition de statut invalide',
        current_allowed: result.allowed ?? [],
      });
    }

    return result.order;
  }
}
