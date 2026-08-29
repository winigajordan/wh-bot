import { Injectable, Logger } from '@nestjs/common';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import type { SessionDeliveryInfo } from '../../conversation/session.types';
import type { PendingInteractiveMessage } from '../../whatsapp-client/interactive-message.types';
import { CartService, CartSummary } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';

export type ToolExecutionContext = {
  businessId: string;
  clientPhone: string;
};

@Injectable()
export class RestaurantOrderingToolsService {
  private readonly logger = new Logger(RestaurantOrderingToolsService.name);
  private pendingInteractiveMessage: PendingInteractiveMessage | null = null;

  constructor(
    private readonly menuService: MenuService,
    private readonly cartService: CartService,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly ordersService: OrdersService,
    private readonly sessionService: ConversationSessionService,
  ) {}

  resetTurn(): void {
    this.pendingInteractiveMessage = null;
  }

  consumePendingInteractiveMessage(): PendingInteractiveMessage | null {
    const payload = this.pendingInteractiveMessage;
    this.pendingInteractiveMessage = null;
    return payload;
  }

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
      case 'ask_delivery_mode':
        return this.askDeliveryMode();
      case 'ask_order_confirmation':
        return this.askOrderConfirmation(context);
      default:
        throw new Error(`Tool inconnu: ${toolName}`);
    }
  }

  private setPendingInteractiveMessage(
    payload: PendingInteractiveMessage,
  ): void {
    if (this.pendingInteractiveMessage) {
      this.logger.warn(
        `Payload interactif écrasé (${this.pendingInteractiveMessage.type} → ${payload.type})`,
      );
    }
    this.pendingInteractiveMessage = payload;
  }

  private askDeliveryMode(): { presented: true } {
    this.setPendingInteractiveMessage({
      type: 'buttons',
      bodyText: 'Souhaitez-vous une livraison ou un retrait sur place ?',
      buttons: [
        { id: 'delivery_mode_delivery', title: 'Livraison' },
        { id: 'delivery_mode_pickup', title: 'Retrait sur place' },
      ],
    });
    return { presented: true };
  }

  private async askOrderConfirmation(
    context: ToolExecutionContext,
  ): Promise<{ presented: true } | { presented: false; reason: string }> {
    const session = await this.sessionService.getSession(
      context.businessId,
      context.clientPhone,
    );
    const summary = await this.cartService.getCartSummary(
      context.businessId,
      context.clientPhone,
    );

    if (summary.item_count === 0) {
      return { presented: false, reason: 'empty_cart' };
    }

    const bodyText = this.buildConfirmationBodyText(
      summary,
      session.delivery_info,
    );

    this.setPendingInteractiveMessage({
      type: 'buttons',
      bodyText,
      buttons: [
        { id: 'confirm_order_yes', title: 'Oui, je confirme' },
        { id: 'confirm_order_no', title: 'Non, je modifie' },
      ],
    });

    return { presented: true };
  }

  private buildConfirmationBodyText(
    summary: CartSummary,
    deliveryInfo: SessionDeliveryInfo | null,
  ): string {
    const lines = ['Récapitulatif de votre commande :', ''];

    for (const item of summary.items) {
      const options =
        item.options.length > 0
          ? ` (${item.options.map((option) => option.name).join(', ')})`
          : '';
      lines.push(
        `${item.name}${options} x${item.quantity} — ${this.formatXof(item.price * item.quantity)}`,
      );
    }

    lines.push('');
    lines.push(`Sous-total : ${this.formatXof(summary.subtotal)}`);

    if (deliveryInfo?.mode === 'delivery') {
      lines.push(`Livraison : ${this.formatXof(summary.delivery_fee)}`);
      if (deliveryInfo.zone_name || deliveryInfo.address_text) {
        lines.push(
          `Adresse : ${deliveryInfo.address_text ?? deliveryInfo.zone_name}`,
        );
      }
    } else if (deliveryInfo?.mode === 'pickup') {
      lines.push('Retrait sur place');
    }

    if (summary.order_note) {
      lines.push(`Note : ${summary.order_note}`);
    }

    lines.push('');
    lines.push(`Total : ${this.formatXof(summary.total)}`);
    lines.push('');
    lines.push('Confirmez-vous votre commande ?');

    return lines.join('\n');
  }

  private formatXof(amount: number): string {
    return this.menuService.formatXof(amount);
  }

  private async getMenu(
    businessId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const category =
      typeof input.category === 'string' ? input.category : undefined;
    const full = input.full === true;
    return this.menuService.getMenu(businessId, { category, full });
  }

  private async addToCart(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const items = this.parseAddToCartItems(input);
    return this.cartService.addItemsToCart(
      context.businessId,
      context.clientPhone,
      items,
    );
  }

  private parseAddToCartItems(
    input: Record<string, unknown>,
  ): Array<{ item_id: string; quantity: number; options?: unknown[] }> {
    if (Array.isArray(input.items)) {
      return input.items
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
        .map((entry) => ({
          item_id: typeof entry.item_id === 'string' ? entry.item_id : '',
          quantity:
            typeof entry.quantity === 'number'
              ? entry.quantity
              : Number(entry.quantity),
          options: Array.isArray(entry.options)
            ? entry.options.filter((value) => typeof value === 'string')
            : [],
        }));
    }

    if (typeof input.item_id === 'string') {
      return [
        {
          item_id: input.item_id,
          quantity:
            typeof input.quantity === 'number'
              ? input.quantity
              : Number(input.quantity),
          options: Array.isArray(input.options)
            ? input.options.filter((value) => typeof value === 'string')
            : [],
        },
      ];
    }

    return [];
  }

  private async removeFromCart(
    context: ToolExecutionContext,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const itemIds = this.parseRemoveItemIds(input);
    return this.cartService.removeItemsFromCart(
      context.businessId,
      context.clientPhone,
      itemIds,
    );
  }

  private parseRemoveItemIds(input: Record<string, unknown>): string[] {
    if (Array.isArray(input.item_ids)) {
      return input.item_ids.filter((id): id is string => typeof id === 'string');
    }
    if (typeof input.item_id === 'string') {
      return [input.item_id];
    }
    return [];
  }

  private async getDeliveryZones(businessId: string): Promise<unknown> {
    const zones = await this.deliveryZonesService.listZones(businessId);

    if (zones.length > 0) {
      this.setPendingInteractiveMessage({
        type: 'list',
        bodyText: 'Choisissez votre quartier — vous pourrez préciser l’adresse juste après :',
        buttonLabel: 'Choisir',
        rows: zones.map((zone, index) => ({
          id: `zone_${index}_${this.slugify(zone.name)}`,
          title: zone.name,
          description: `Frais : ${this.formatXof(Number(zone.delivery_fee))}`,
        })),
      });
    }

    return { zones };
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
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
    const items = Array.isArray(input.items)
      ? input.items
          .filter(
            (entry): entry is Record<string, unknown> =>
              !!entry && typeof entry === 'object',
          )
          .map((entry) => ({
            item_id: typeof entry.item_id === 'string' ? entry.item_id : '',
            quantity:
              typeof entry.quantity === 'number'
                ? entry.quantity
                : Number(entry.quantity),
            options: Array.isArray(entry.options)
              ? entry.options.filter((value) => typeof value === 'string')
              : [],
          }))
      : undefined;
    const note = typeof input.note === 'string' ? input.note : undefined;

    return this.ordersService.confirmOrder(
      context.businessId,
      context.clientPhone,
      confirmedByClient,
      { items, note },
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
