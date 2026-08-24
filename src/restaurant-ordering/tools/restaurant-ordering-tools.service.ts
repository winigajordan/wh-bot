import { Injectable } from '@nestjs/common';
import { CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';

export type ToolExecutionContext = {
  businessId: string;
  clientPhone: string;
};

@Injectable()
export class RestaurantOrderingToolsService {
  constructor(
    private readonly menuService: MenuService,
    private readonly cartService: CartService,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly ordersService: OrdersService,
  ) {}

  async execute(
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    switch (toolName) {
      case 'get_menu':
        return this.getMenu(context.businessId, input);
      case 'add_to_cart':
        return this.addToCart(context, input);
      case 'remove_from_cart':
        return this.removeFromCart(context, input);
      case 'clear_cart':
        return this.cartService.clearCart(
          context.businessId,
          context.clientPhone,
        );
      case 'get_cart_summary':
        return this.cartService.getCartSummary(
          context.businessId,
          context.clientPhone,
        );
      case 'get_delivery_zones':
        return this.getDeliveryZones(context.businessId);
      case 'set_delivery_info':
        return this.setDeliveryInfo(context, input);
      case 'set_order_note':
        return this.setOrderNote(context, input);
      case 'confirm_order':
        return this.confirmOrder(context, input);
      case 'get_order_status':
        return this.getOrderStatus(context, input);
      default:
        throw new Error(`Tool inconnu: ${toolName}`);
    }
  }

  private async getMenu(
    businessId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const category =
      typeof input.category === 'string' ? input.category : undefined;
    return this.menuService.getMenu(businessId, category);
  }

  private async addToCart(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const itemId = typeof input.item_id === 'string' ? input.item_id : '';
    const quantity =
      typeof input.quantity === 'number' ? input.quantity : Number(input.quantity);
    const options = Array.isArray(input.options)
      ? input.options.filter((value) => typeof value === 'string')
      : [];

    return this.cartService.addToCart(
      context.businessId,
      context.clientPhone,
      itemId,
      quantity,
      options,
    );
  }

  private async removeFromCart(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const itemId = typeof input.item_id === 'string' ? input.item_id : '';
    return this.cartService.removeFromCart(
      context.businessId,
      context.clientPhone,
      itemId,
    );
  }

  private async getDeliveryZones(businessId: string): Promise<unknown> {
    const zones = await this.deliveryZonesService.listZones(businessId);
    return { zones };
  }

  private async setDeliveryInfo(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const mode = input.mode === 'delivery' || input.mode === 'pickup'
      ? input.mode
      : null;

    if (!mode) {
      return { valid: false, available_zones: [] };
    }

    if (mode === 'pickup') {
      await this.cartService.setDeliveryInfo(
        context.businessId,
        context.clientPhone,
        { mode: 'pickup', delivery_fee: 0 },
      );
      return { valid: true, delivery_fee: 0 };
    }

    const addressText =
      typeof input.address_text === 'string' ? input.address_text.trim() : '';
    if (!addressText) {
      const zones = await this.deliveryZonesService.getZoneNames(
        context.businessId,
      );
      return { valid: false, available_zones: zones };
    }

    const matchedZone = await this.deliveryZonesService.matchZone(
      context.businessId,
      addressText,
    );

    if (!matchedZone) {
      const zones = await this.deliveryZonesService.getZoneNames(
        context.businessId,
      );
      return { valid: false, available_zones: zones };
    }

    await this.cartService.setDeliveryInfo(
      context.businessId,
      context.clientPhone,
      {
        mode: 'delivery',
        address_text: addressText,
        zone_id: matchedZone.id,
        zone_name: matchedZone.zoneName,
        delivery_fee: Number(matchedZone.deliveryFee),
      },
    );

    return {
      valid: true,
      matched_zone: matchedZone.zoneName,
      delivery_fee: Number(matchedZone.deliveryFee),
    };
  }

  private async setOrderNote(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const note = typeof input.note === 'string' ? input.note : '';
    return this.cartService.setOrderNote(
      context.businessId,
      context.clientPhone,
      note,
    );
  }

  private async confirmOrder(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const confirmedByClient = input.confirmed_by_client === true;
    return this.ordersService.confirmOrder(
      context.businessId,
      context.clientPhone,
      confirmedByClient,
    );
  }

  private async getOrderStatus(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const orderNumber =
      typeof input.order_number === 'string' ? input.order_number.trim() : '';
    return this.ordersService.getOrderStatus(
      context.businessId,
      context.clientPhone,
      orderNumber,
    );
  }
}
