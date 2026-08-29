import { Injectable } from '@nestjs/common';
import { isUuid } from '../../common/uuid.util';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import {
  ConversationSession,
  SessionCartItem,
  SessionDeliveryInfo,
} from '../../conversation/session.types';
import { MenuService } from '../menu/menu.service';

export type CartAddItemInput = {
  item_id: string;
  quantity: number;
  options?: unknown[];
};

export type CartAddItemsFailedEntry = {
  item_id: string;
  reason:
    | 'item_not_found'
    | 'item_unavailable'
    | 'invalid_quantity'
    | 'invalid_options'
    | 'missing_required_options';
  missing_options?: string[];
  invalid_options?: string[];
};

export type CartAddItemsResult =
  | {
      success: true;
      cart: SessionCartItem[];
      added: Array<{ item_id: string; name: string; quantity: number }>;
    }
  | {
      success: false;
      reason: 'empty_items' | 'invalid_items';
      cart: SessionCartItem[];
      added: [];
      failed: CartAddItemsFailedEntry[];
    };

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
    const result = await this.addItemsToCart(businessId, clientPhone, [
      { item_id: itemId, quantity, options },
    ]);

    if (result.success) {
      return { success: true, cart: result.cart };
    }

    const failedReason = result.failed[0]?.reason;
    if (failedReason === 'item_unavailable') {
      return { success: false, reason: 'item_unavailable' };
    }
    return { success: false, reason: 'item_not_found' };
  }

  /**
   * Ajoute plusieurs plats en une seule mutation Redis.
   * Tout-ou-rien : si un seul item_id est invalide / introuvable / indispo,
   * le panier n’est pas modifié.
   */
  async addItemsToCart(
    businessId: string,
    clientPhone: string,
    items: CartAddItemInput[],
  ): Promise<CartAddItemsResult> {
    const current = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );

    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        reason: 'empty_items',
        cart: current.cart,
        added: [],
        failed: [],
      };
    }

    const preparedResult = await this.prepareValidatedItems(businessId, items);
    if (!preparedResult.success) {
      return {
        success: false,
        reason: 'invalid_items',
        cart: current.cart,
        added: [],
        failed: preparedResult.failed,
      };
    }

    const prepared = preparedResult.items;
    const session = await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (sessionState) => {
        for (const item of prepared) {
          const existing = sessionState.cart.find(
            (entry) => this.cartLineKey(entry) === this.cartLineKey(item),
          );
          if (existing) {
            existing.quantity += item.quantity;
            existing.price = item.price;
            existing.name = item.name;
            existing.options = item.options;
          } else {
            sessionState.cart.push({
              item_id: item.item_id,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              options: item.options,
            });
          }
        }
      },
    );

    return {
      success: true,
      cart: session.cart,
      added: prepared.map((item) => ({
        item_id: item.item_id,
        name: item.name,
        quantity: item.quantity,
      })),
    };
  }

  /**
   * Remplace le panier par une liste validée (tout-ou-rien).
   * Utilisé par confirm_order pour finaliser en un seul appel.
   */
  async replaceCartItems(
    businessId: string,
    clientPhone: string,
    items: CartAddItemInput[],
  ): Promise<CartAddItemsResult> {
    const current = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );

    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        reason: 'empty_items',
        cart: current.cart,
        added: [],
        failed: [],
      };
    }

    const preparedResult = await this.prepareValidatedItems(businessId, items);
    if (!preparedResult.success) {
      return {
        success: false,
        reason: 'invalid_items',
        cart: current.cart,
        added: [],
        failed: preparedResult.failed,
      };
    }

    const prepared = preparedResult.items;
    const session = await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (sessionState) => {
        sessionState.cart = prepared.map((item) => ({
          item_id: item.item_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          options: item.options,
        }));
      },
    );

    return {
      success: true,
      cart: session.cart,
      added: prepared.map((item) => ({
        item_id: item.item_id,
        name: item.name,
        quantity: item.quantity,
      })),
    };
  }

  async removeFromCart(
    businessId: string,
    clientPhone: string,
    itemId: string,
  ): Promise<
    | { success: true; cart: SessionCartItem[] }
    | { success: false; reason: 'item_not_in_cart' }
  > {
    const result = await this.removeItemsFromCart(businessId, clientPhone, [
      itemId,
    ]);
    if (result.removed.length > 0) {
      return { success: true, cart: result.cart };
    }
    return { success: false, reason: 'item_not_in_cart' };
  }

  async removeItemsFromCart(
    businessId: string,
    clientPhone: string,
    itemIds: string[],
  ): Promise<{
    success: true;
    cart: SessionCartItem[];
    removed: string[];
    missing: string[];
  }> {
    const uniqueIds = [
      ...new Set(
        itemIds
          .filter((id) => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];

    const session = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );
    const inCart = new Set(session.cart.map((item) => item.item_id));
    const removed = uniqueIds.filter((id) => inCart.has(id));
    const missing = uniqueIds.filter((id) => !inCart.has(id));

    if (removed.length === 0) {
      return { success: true, cart: session.cart, removed, missing };
    }

    const updated = await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (current) => {
        current.cart = current.cart.filter(
          (item) => !removed.includes(item.item_id),
        );
      },
    );

    return { success: true, cart: updated.cart, removed, missing };
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
    await this.sessionService.mutateSession(
      businessId,
      clientPhone,
      (session) => {
        session.cart = [];
        session.delivery_info = null;
        session.order_note = null;
      },
    );
  }

  async clearCart(
    businessId: string,
    clientPhone: string,
  ): Promise<
    { success: true } | { success: false; reason: 'cart_already_empty' }
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

  private async prepareValidatedItems(
    businessId: string,
    items: CartAddItemInput[],
  ): Promise<
    | {
        success: true;
        items: Array<{
          item_id: string;
          name: string;
          price: number;
          quantity: number;
          options: SessionCartItem['options'];
        }>;
      }
    | { success: false; failed: CartAddItemsFailedEntry[] }
  > {
    const prepared: Array<{
      item_id: string;
      name: string;
      price: number;
      quantity: number;
      options: SessionCartItem['options'];
    }> = [];
    const failed: CartAddItemsFailedEntry[] = [];

    for (const raw of items) {
      const itemId = typeof raw.item_id === 'string' ? raw.item_id.trim() : '';
      const quantity = Number(raw.quantity);
      const options = Array.isArray(raw.options) ? raw.options : [];

      if (!itemId || !isUuid(itemId)) {
        failed.push({
          item_id: itemId || 'unknown',
          reason: 'item_not_found',
        });
        continue;
      }
      if (!Number.isInteger(quantity) || quantity < 1) {
        failed.push({ item_id: itemId, reason: 'invalid_quantity' });
        continue;
      }

      const menuItem = await this.menuService.findById(businessId, itemId);
      if (!menuItem) {
        failed.push({ item_id: itemId, reason: 'item_not_found' });
        continue;
      }
      if (!menuItem.available) {
        failed.push({ item_id: itemId, reason: 'item_unavailable' });
        continue;
      }

      const resolved = this.menuService.resolveSelectedOptions(
        menuItem.options,
        options,
      );
      if (!resolved.success) {
        failed.push({
          item_id: itemId,
          reason: resolved.reason,
          ...(resolved.reason === 'missing_required_options'
            ? { missing_options: resolved.missing }
            : { invalid_options: resolved.invalid }),
        });
        continue;
      }

      prepared.push({
        item_id: itemId,
        name: menuItem.name,
        price: Number(menuItem.price) + resolved.extra,
        quantity,
        options: resolved.options,
      });
    }

    if (failed.length > 0) {
      return { success: false, failed };
    }

    return { success: true, items: prepared };
  }

  /** Même plat + mêmes options/choix = même ligne panier. */
  private cartLineKey(item: {
    item_id: string;
    options: Array<{ name: string; choice?: string | null }>;
  }): string {
    const optionsKey = [...item.options]
      .map((option) => {
        const choice =
          typeof option.choice === 'string' && option.choice.trim()
            ? option.choice.trim().toLowerCase()
            : '';
        return `${option.name.trim().toLowerCase()}:${choice}`;
      })
      .filter(Boolean)
      .sort()
      .join('|');
    return `${item.item_id}::${optionsKey}`;
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
