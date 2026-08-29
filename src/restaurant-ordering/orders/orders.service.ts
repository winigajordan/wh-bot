import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUuid } from '../../common/uuid.util';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import {
  SessionCartItem,
  SessionDeliveryInfo,
} from '../../conversation/session.types';
import {
  DASHBOARD_ORDER_CREATED,
  DASHBOARD_ORDER_UPDATED,
} from './dashboard-order.events';
import { CartAddItemInput, CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { MenuService } from '../menu/menu.service';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order, OrderStatus } from './entities/order.entity';

type InvalidCartItem = {
  item_id: string;
  name: string;
  reason:
    | 'item_not_found'
    | 'item_unavailable'
    | 'price_changed'
    | 'invalid_options'
    | 'missing_required_options';
  missing_options?: string[];
  invalid_options?: string[];
};

export type DashboardOrderDto = {
  id: string;
  order_number: string;
  client_phone: string;
  items: unknown[];
  delivery_mode: string;
  delivery_address: string | null;
  delivery_fee: number;
  total: number;
  status: OrderStatus;
  note: string | null;
  created_at: string;
};

export type ListOrdersOptions = {
  status?: OrderStatus;
  limit?: number;
  /** Jour civil YYYY-MM-DD (UTC) */
  date?: string;
};

const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  received: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

export const ORDER_STATUSES: OrderStatus[] = [
  'received',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === 'string' && (ORDER_STATUSES as string[]).includes(value)
  );
}

export function isOrderDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepo: Repository<OrderStatusHistory>,
    private readonly sessionService: ConversationSessionService,
    private readonly cartService: CartService,
    private readonly menuService: MenuService,
    private readonly deliveryZonesService: DeliveryZonesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async confirmOrder(
    businessId: string,
    clientPhone: string,
    confirmedByClient: boolean,
    options: {
      items?: CartAddItemInput[];
      note?: string;
    } = {},
  ): Promise<
    | {
        success: true;
        order_number: string;
        subtotal: number;
        delivery_fee: number;
        total: number;
      }
    | {
        success: false;
        reason:
          | 'not_confirmed'
          | 'empty_cart'
          | 'delivery_not_set'
          | 'items_changed'
          | 'invalid_items';
        invalid_items?: InvalidCartItem[];
      }
  > {
    if (!confirmedByClient) {
      return { success: false, reason: 'not_confirmed' };
    }

    if (options.items && options.items.length > 0) {
      const replaced = await this.cartService.replaceCartItems(
        businessId,
        clientPhone,
        options.items,
      );
      if (!replaced.success) {
        return {
          success: false,
          reason: 'invalid_items',
          invalid_items: (replaced.failed ?? []).map((entry) => ({
            item_id: entry.item_id,
            name: entry.item_id,
            reason:
              entry.reason === 'item_unavailable'
                ? 'item_unavailable'
                : entry.reason === 'invalid_options'
                  ? 'invalid_options'
                  : entry.reason === 'missing_required_options'
                    ? 'missing_required_options'
                    : entry.reason === 'invalid_quantity'
                      ? 'item_not_found'
                      : 'item_not_found',
            missing_options: entry.missing_options,
            invalid_options: entry.invalid_options,
          })),
        };
      }
    }

    if (typeof options.note === 'string' && options.note.trim()) {
      await this.cartService.setOrderNote(
        businessId,
        clientPhone,
        options.note,
      );
    }

    const session = await this.sessionService.getSession(
      businessId,
      clientPhone,
    );

    if (session.cart.length === 0) {
      return { success: false, reason: 'empty_cart' };
    }

    if (!session.delivery_info) {
      return { success: false, reason: 'delivery_not_set' };
    }

    const invalidItems = await this.findInvalidCartItems(
      businessId,
      session.cart,
    );
    if (invalidItems.length > 0) {
      return {
        success: false,
        reason: 'items_changed',
        invalid_items: invalidItems,
      };
    }

    const summary = await this.cartService.getCartSummary(
      businessId,
      clientPhone,
    );
    const deliveryFee = await this.resolveDeliveryFee(
      businessId,
      session.delivery_info,
    );
    if (deliveryFee === null) {
      return { success: false, reason: 'delivery_not_set' };
    }

    const total = summary.subtotal + deliveryFee;
    const orderNumber = await this.generateOrderNumber(businessId);

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        businessId,
        clientPhone,
        orderNumber,
        items: session.cart.map((item) => ({
          item_id: item.item_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          options: Array.isArray(item.options)
            ? item.options.map((option) => {
                if (typeof option === 'object' && option) {
                  const typed = option as {
                    name?: unknown;
                    price?: unknown;
                    choice?: unknown;
                  };
                  return {
                    name:
                      typeof typed.name === 'string' ? typed.name : 'option',
                    price: typeof typed.price === 'number' ? typed.price : 0,
                    choice:
                      typeof typed.choice === 'string' ? typed.choice : null,
                  };
                }
                if (
                  typeof option === 'string' ||
                  typeof option === 'number' ||
                  typeof option === 'boolean'
                ) {
                  return { name: String(option), price: 0, choice: null };
                }
                return { name: 'option', price: 0, choice: null };
              })
            : [],
        })),
        deliveryMode: session.delivery_info.mode,
        deliveryAddress:
          session.delivery_info.mode === 'delivery'
            ? (session.delivery_info.address_text ?? null)
            : null,
        deliveryZoneId: session.delivery_info.zone_id ?? null,
        deliveryFee: deliveryFee.toFixed(2),
        total: total.toFixed(2),
        status: 'received',
        note: session.order_note,
      }),
    );

    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: order.id,
        status: 'received',
      }),
    );

    await this.cartService.clearCartAndDelivery(businessId, clientPhone);

    const dashboardOrder = this.toDashboardDto({
      ...order,
      createdAt: order.createdAt ?? new Date(),
    });
    this.eventEmitter.emit(DASHBOARD_ORDER_CREATED, {
      businessId,
      order: dashboardOrder,
    });

    return {
      success: true,
      order_number: orderNumber,
      total,
      delivery_fee: deliveryFee,
      subtotal: summary.subtotal,
    };
  }

  async getOrderStatus(
    businessId: string,
    clientPhone: string,
    orderNumber: string,
  ): Promise<
    | {
        found: true;
        order_number: string;
        status: string;
        note: string | null;
        history: { status: string; changed_at: string }[];
      }
    | { found: false }
  > {
    const order = await this.orderRepo.findOne({
      where: { businessId, clientPhone, orderNumber },
    });

    if (!order) {
      return { found: false };
    }

    const history = await this.historyRepo.find({
      where: { orderId: order.id },
      order: { changedAt: 'ASC' },
    });

    return {
      found: true,
      order_number: order.orderNumber,
      status: order.status,
      note: order.note,
      history: history.map((entry) => ({
        status: entry.status,
        changed_at: entry.changedAt.toISOString(),
      })),
    };
  }

  async listForBusiness(
    businessId: string,
    options: ListOrdersOptions = {},
  ): Promise<DashboardOrderDto[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.businessId = :businessId', { businessId })
      .orderBy('o.createdAt', 'DESC')
      .take(limit);

    if (options.status) {
      qb.andWhere('o.status = :status', { status: options.status });
    }

    if (options.date) {
      qb.andWhere('o.createdAt >= :dayStart', {
        dayStart: `${options.date}T00:00:00.000Z`,
      });
      qb.andWhere('o.createdAt <= :dayEnd', {
        dayEnd: `${options.date}T23:59:59.999Z`,
      });
    }

    const orders = await qb.getMany();
    return orders.map((order) => this.toDashboardDto(order));
  }

  async findForBusiness(
    businessId: string,
    orderId: string,
  ): Promise<DashboardOrderDto | null> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, businessId },
    });
    return order ? this.toDashboardDto(order) : null;
  }

  async updateStatus(
    businessId: string,
    orderId: string,
    nextStatus: OrderStatus,
  ): Promise<
    | { success: true; order: DashboardOrderDto }
    | {
        success: false;
        reason: 'not_found' | 'invalid_transition';
        allowed?: OrderStatus[];
      }
  > {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, businessId },
    });

    if (!order) {
      return { success: false, reason: 'not_found' };
    }

    if (order.status === nextStatus) {
      return { success: true, order: this.toDashboardDto(order) };
    }

    const allowed = ORDER_STATUS_FLOW[order.status];
    if (!allowed.includes(nextStatus)) {
      return {
        success: false,
        reason: 'invalid_transition',
        allowed,
      };
    }

    order.status = nextStatus;
    const saved = await this.orderRepo.save(order);
    await this.historyRepo.save(
      this.historyRepo.create({
        orderId: saved.id,
        status: nextStatus,
      }),
    );

    const dashboardOrder = this.toDashboardDto(saved);
    this.eventEmitter.emit(DASHBOARD_ORDER_UPDATED, {
      businessId,
      order: dashboardOrder,
    });

    return { success: true, order: dashboardOrder };
  }

  private toDashboardDto(order: Order): DashboardOrderDto {
    return {
      id: order.id,
      order_number: order.orderNumber,
      client_phone: order.clientPhone,
      items: order.items,
      delivery_mode: order.deliveryMode,
      delivery_address: order.deliveryAddress,
      delivery_fee: Number(order.deliveryFee),
      total: Number(order.total),
      status: order.status,
      note: order.note,
      created_at: order.createdAt.toISOString(),
    };
  }

  private async findInvalidCartItems(
    businessId: string,
    cart: SessionCartItem[],
  ): Promise<InvalidCartItem[]> {
    const invalid: InvalidCartItem[] = [];

    for (const cartItem of cart) {
      if (!isUuid(cartItem.item_id)) {
        invalid.push({
          item_id: cartItem.item_id,
          name: cartItem.name,
          reason: 'item_not_found',
        });
        continue;
      }

      const menuItem = await this.menuService.findById(
        businessId,
        cartItem.item_id,
      );

      if (!menuItem) {
        invalid.push({
          item_id: cartItem.item_id,
          name: cartItem.name,
          reason: 'item_not_found',
        });
        continue;
      }

      if (!menuItem.available) {
        invalid.push({
          item_id: cartItem.item_id,
          name: menuItem.name,
          reason: 'item_unavailable',
        });
        continue;
      }

      const selectedTokens = (cartItem.options ?? []).flatMap((option) => {
        if (!option || typeof option !== 'object') {
          return [];
        }
        const choice =
          typeof option.choice === 'string' && option.choice.trim()
            ? option.choice.trim()
            : null;
        if (choice) {
          return [choice];
        }
        return typeof option.name === 'string' && option.name.trim()
          ? [option.name.trim()]
          : [];
      });

      const resolved = this.menuService.resolveSelectedOptions(
        menuItem.options,
        selectedTokens,
      );
      if (!resolved.success) {
        invalid.push({
          item_id: cartItem.item_id,
          name: menuItem.name,
          reason: resolved.reason,
          ...(resolved.reason === 'missing_required_options'
            ? { missing_options: resolved.missing }
            : { invalid_options: resolved.invalid }),
        });
        continue;
      }

      const expectedPrice = Number(menuItem.price) + resolved.extra;
      if (expectedPrice !== Number(cartItem.price)) {
        invalid.push({
          item_id: cartItem.item_id,
          name: menuItem.name,
          reason: 'price_changed',
        });
      }
    }

    return invalid;
  }

  private async resolveDeliveryFee(
    businessId: string,
    deliveryInfo: SessionDeliveryInfo,
  ): Promise<number | null> {
    if (deliveryInfo.mode === 'pickup') {
      return 0;
    }

    const zoneId = deliveryInfo.zone_id;
    if (!zoneId) {
      return null;
    }

    const zone = await this.deliveryZonesService.findById(businessId, zoneId);
    if (!zone) {
      return null;
    }

    return Number(zone.deliveryFee);
  }

  private async generateOrderNumber(businessId: string): Promise<string> {
    const count = await this.orderRepo.count({ where: { businessId } });
    return `CMD-${String(count + 1).padStart(4, '0')}`;
  }
}
