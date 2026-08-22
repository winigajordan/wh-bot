import { Injectable } from '@nestjs/common';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import {
  ConversationSession,
  SessionCartItem,
  SessionDeliveryInfo,
} from '../../conversation/session.types';
import { MenuService } from '../menu/menu.service';

export type CartSummary = {
  items: SessionCartItem[];
  subtotal: number;
  item_count: number;
};

@Injectable()
export class CartService {
  constructor(
    private readonly sessionService: ConversationSessionService,
    private readonly menuService: MenuService,
  ) {}

  async addToCart(
    businessId: string,
    clientPhone: string,
    itemId: string,
    quantity: number,
    options: unknown[] = [],
  ): Promise<
    | { success: true; cart: SessionCartItem[] }
    | { success: false; reason: 'item_not_found' | 'item_unavailable' }
  > {
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { success: false, reason: 'item_not_found' };
    }

    const menuItem = await this.menuService.findById(businessId, itemId);
    if (!menuItem) {
      return { success: false, reason: 'item_not_found' };
    }
    if (!menuItem.available) {
      return { success: false, reason: 'item_unavailable' };
    }

    const price = Number(menuItem.price);
    const session = await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (current) => {
        const existing = current.cart.find((item) => item.item_id === itemId);
        if (existing) {
          existing.quantity += quantity;
          existing.price = price;
          existing.name = menuItem.name;
          existing.options = options;
        } else {
          current.cart.push({
            item_id: itemId,
            name: menuItem.name,
            price,
            quantity,
            options,
          });
        }
      },
    );

    return { success: true, cart: session.cart };
  }

  async removeFromCart(
    businessId: string,
    clientPhone: string,
    itemId: string,
  ): Promise<
    | { success: true; cart: SessionCartItem[] }
    | { success: false; reason: 'item_not_in_cart' }
  > {
    const session = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );
    const exists = session.cart.some((item) => item.item_id === itemId);
    if (!exists) {
      return { success: false, reason: 'item_not_in_cart' };
    }

    const updated = await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (current) => {
        current.cart = current.cart.filter((item) => item.item_id !== itemId);
      },
    );

    return { success: true, cart: updated.cart };
  }

  async getCartSummary(
    businessId: string,
    clientPhone: string,
  ): Promise<CartSummary> {
    const session = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );
    return this.buildSummary(session.cart);
  }

  async setDeliveryInfo(
    businessId: string,
    clientPhone: string,
    deliveryInfo: SessionDeliveryInfo,
  ): Promise<ConversationSession> {
    return this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (session) => {
        session.delivery_info = deliveryInfo;
      },
    );
  }

  async clearCartAndDelivery(
    businessId: string,
    clientPhone: string,
  ): Promise<void> {
    await this.sessionService.mutateSession(businessId, clientPhone, (session) => {
      session.cart = [];
      session.delivery_info = null;
    });
  }

  private buildSummary(cart: SessionCartItem[]): CartSummary {
    const item_count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    return { items: cart, subtotal, item_count };
  }
}
