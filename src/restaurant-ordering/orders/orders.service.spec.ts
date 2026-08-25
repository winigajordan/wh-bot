import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  const orderFind = jest.fn();
  const orderCreateQueryBuilder = jest.fn();
  const historyFind = jest.fn();
  const getSession = jest.fn();
  const getCartSummary = jest.fn();
  const clearCartAndDelivery = jest.fn();
  const findById = jest.fn();
  const findZoneById = jest.fn();
  const eventEmit = jest.fn();

  beforeEach(async () => {
    orderSave.mockReset();
    historySave.mockReset();
    orderCount.mockReset();
    orderFindOne.mockReset();
    orderFind.mockReset();
    orderCreateQueryBuilder.mockReset();
    historyFind.mockReset();
    getSession.mockReset();
    getCartSummary.mockReset();
    clearCartAndDelivery.mockReset();
    findById.mockReset();
    findZoneById.mockReset();
    eventEmit.mockReset();

    orderCount.mockResolvedValue(0);
    orderSave.mockImplementation(async (order) => ({
      ...order,
      id: 'order-1',
      createdAt: new Date('2026-08-25T00:00:00.000Z'),
    }));
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
      id: '11111111-1111-4111-8111-111111111111',
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
            find: orderFind,
            createQueryBuilder: orderCreateQueryBuilder,
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
          useValue: { getCartSummary, clearCartAndDelivery, replaceCartItems: jest.fn(), setOrderNote: jest.fn() },
        },
        {
          provide: MenuService,
          useValue: { findById },
        },
        {
          provide: DeliveryZonesService,
          useValue: { findById: findZoneById },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: eventEmit },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('crée une commande sans frais en retrait', async () => {
    getSession.mockResolvedValue({
      cart: [
        {
          item_id: '11111111-1111-4111-8111-111111111111',
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
          item_id: '11111111-1111-4111-8111-111111111111',
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

  it('liste les commandes d’un business', async () => {
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'CMD-0001',
        clientPhone: '22177',
        items: [],
        deliveryMode: 'pickup',
        deliveryAddress: null,
        deliveryFee: '0.00',
        total: '3500.00',
        status: 'received',
        note: null,
        createdAt: new Date('2026-08-25T00:00:00.000Z'),
      },
    ]);
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany,
    };
    orderCreateQueryBuilder.mockReturnValue(qb);

    await expect(service.listForBusiness('biz-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'order-1',
        order_number: 'CMD-0001',
        status: 'received',
        total: 3500,
      }),
    ]);
  });

  it('avance le statut received → preparing', async () => {
    orderFindOne.mockResolvedValue({
      id: 'order-1',
      businessId: 'biz-1',
      orderNumber: 'CMD-0001',
      clientPhone: '22177',
      items: [],
      deliveryMode: 'pickup',
      deliveryAddress: null,
      deliveryFee: '0.00',
      total: '3500.00',
      status: 'received',
      note: null,
      createdAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    orderSave.mockImplementation(async (order) => order);

    await expect(
      service.updateStatus('biz-1', 'order-1', 'preparing'),
    ).resolves.toEqual({
      success: true,
      order: expect.objectContaining({ status: 'preparing' }),
    });

    expect(historySave).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-1', status: 'preparing' }),
    );
  });

  it('refuse une transition invalide', async () => {
    orderFindOne.mockResolvedValue({
      id: 'order-1',
      status: 'received',
      orderNumber: 'CMD-0001',
      clientPhone: '22177',
      items: [],
      deliveryMode: 'pickup',
      deliveryAddress: null,
      deliveryFee: '0.00',
      total: '3500.00',
      note: null,
      createdAt: new Date('2026-08-25T00:00:00.000Z'),
    });

    await expect(
      service.updateStatus('biz-1', 'order-1', 'completed'),
    ).resolves.toEqual({
      success: false,
      reason: 'invalid_transition',
      allowed: ['preparing', 'cancelled'],
    });
  });

  it('annule une commande received → cancelled', async () => {
    orderFindOne.mockResolvedValue({
      id: 'order-1',
      businessId: 'biz-1',
      orderNumber: 'CMD-0001',
      clientPhone: '22177',
      items: [],
      deliveryMode: 'pickup',
      deliveryAddress: null,
      deliveryFee: '0.00',
      total: '3500.00',
      status: 'received',
      note: null,
      createdAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    orderSave.mockImplementation(async (order) => order);

    await expect(
      service.updateStatus('biz-1', 'order-1', 'cancelled'),
    ).resolves.toEqual({
      success: true,
      order: expect.objectContaining({ status: 'cancelled' }),
    });
  });
});
