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
  delivery_fee: number;
  total: number;
  item_count: number;
  order_note: string | null;
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
    return this.buildSummary(session);
  }

  async setOrderNote(
    businessId: string,
    clientPhone: string,
    note: string,
  ): Promise<
    | { success: true; order_note: string }
    | { success: false; reason: 'empty_note' }
  > {
    const trimmed = note.trim();
    if (!trimmed) {
      return { success: false, reason: 'empty_note' };
    }

    const session = await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (current) => {
        current.order_note = trimmed;
      },
    );

    return { success: true, order_note: session.order_note! };
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
      session.order_note = null;
    });
  }

  async clearCart(
    businessId: string,
    clientPhone: string,
  ): Promise<
    | { success: true }
    | { success: false; reason: 'cart_already_empty' }
  > {
    const session = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );

    if (session.cart.length === 0) {
      return { success: false, reason: 'cart_already_empty' };
    }

    await this.clearCartAndDelivery(businessId, clientPhone);
    return { success: true };
  }

  private buildSummary(session: ConversationSession): CartSummary {
    const item_count = session.cart.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const subtotal = session.cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const delivery_fee =
      session.delivery_info?.mode === 'delivery'
        ? (session.delivery_info.delivery_fee ?? 0)
        : 0;

    return {
      items: session.cart,
      subtotal,
      delivery_fee,
      total: subtotal + delivery_fee,
      item_count,
      order_note: session.order_note,
    };
  }
}
