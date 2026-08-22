import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import { CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { MenuService } from '../menu/menu.service';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  const orderSave = jest.fn();
  const historySave = jest.fn();
  const orderCount = jest.fn();
  const orderFindOne = jest.fn();
  const historyFind = jest.fn();
  const getSession = jest.fn();
  const getCartSummary = jest.fn();
  const clearCartAndDelivery = jest.fn();
  const findById = jest.fn();
  const findZoneById = jest.fn();

  beforeEach(async () => {
    orderSave.mockReset();
    historySave.mockReset();
    orderCount.mockReset();
    orderFindOne.mockReset();
    historyFind.mockReset();
    getSession.mockReset();
    getCartSummary.mockReset();
    clearCartAndDelivery.mockReset();
    findById.mockReset();
    findZoneById.mockReset();

    orderCount.mockResolvedValue(0);
    orderSave.mockImplementation(async (order) => ({ ...order, id: 'order-1' }));
    historySave.mockResolvedValue(undefined);
    getCartSummary.mockResolvedValue({
      subtotal: 3500,
      delivery_fee: 0,
      total: 3500,
      items: [],
      item_count: 1,
      order_note: null,
    });
    findById.mockResolvedValue({
      id: 'item-1',
      name: 'Thieb',
      price: '3500.00',
      available: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            save: orderSave,
            count: orderCount,
            findOne: orderFindOne,
            create: (data: unknown) => data,
          },
        },
        {
          provide: getRepositoryToken(OrderStatusHistory),
          useValue: {
            save: historySave,
            find: historyFind,
            create: (data: unknown) => data,
          },
        },
        {
          provide: ConversationSessionService,
          useValue: { getSession },
        },
        {
          provide: CartService,
          useValue: { getCartSummary, clearCartAndDelivery },
        },
        {
          provide: MenuService,
          useValue: { findById },
        },
        {
          provide: DeliveryZonesService,
          useValue: { findById: findZoneById },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('crée une commande sans frais en retrait', async () => {
    getSession.mockResolvedValue({
      cart: [
        {
          item_id: 'item-1',
          name: 'Thieb',
          price: 3500,
          quantity: 1,
          options: [],
        },
      ],
      delivery_info: { mode: 'pickup' },
      order_note: null,
    });

    await expect(
      service.confirmOrder('biz-1', '22177', true),
    ).resolves.toEqual({
      success: true,
      order_number: 'CMD-0001',
      subtotal: 3500,
      delivery_fee: 0,
      total: 3500,
    });

    expect(orderSave).toHaveBeenCalledWith(
      expect.objectContaining({ note: null, deliveryFee: '0.00', total: '3500.00' }),
    );
  });

  it('ajoute les frais de livraison au total', async () => {
    getSession.mockResolvedValue({
      cart: [
        {
          item_id: 'item-1',
          name: 'Thieb',
          price: 3500,
          quantity: 1,
          options: [],
        },
      ],
      delivery_info: {
        mode: 'delivery',
        zone_id: 'zone-1',
        address_text: 'Fass',
        delivery_fee: 1500,
      },
      order_note: null,
    });
    getCartSummary.mockResolvedValue({
      subtotal: 3500,
      delivery_fee: 1500,
      total: 5000,
      items: [],
      item_count: 1,
      order_note: null,
    });
    findZoneById.mockResolvedValue({ id: 'zone-1', deliveryFee: '1500.00' });

    await expect(
      service.confirmOrder('biz-1', '22177', true),
    ).resolves.toEqual({
      success: true,
      order_number: 'CMD-0001',
      subtotal: 3500,
      delivery_fee: 1500,
      total: 5000,
    });

    expect(orderSave).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryFee: '1500.00', total: '5000.00' }),
    );
  });

  it('refuse un panier vide', async () => {
    getSession.mockResolvedValue({
      cart: [],
      delivery_info: { mode: 'pickup' },
      order_note: null,
    });

    await expect(
      service.confirmOrder('biz-1', '22177', true),
    ).resolves.toEqual({ success: false, reason: 'empty_cart' });
  });
});
