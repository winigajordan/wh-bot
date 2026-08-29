import { Test, TestingModule } from '@nestjs/testing';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import { CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import { RestaurantOrderingToolsService } from './restaurant-ordering-tools.service';

describe('RestaurantOrderingToolsService', () => {
  let service: RestaurantOrderingToolsService;
  const getMenu = jest.fn();
  const addToCart = jest.fn();
  const getCartSummary = jest.fn();
  const getSession = jest.fn();
  const getZoneNames = jest.fn();
  const listZones = jest.fn();
  const matchZone = jest.fn();
  const setDeliveryInfo = jest.fn();
  const clearCart = jest.fn();
  const confirmOrder = jest.fn();
  const formatXof = jest.fn((amount: number) => `${amount} F`);

  const context = { businessId: 'biz-1', clientPhone: '22177' };

  beforeEach(async () => {
    getMenu.mockReset();
    addToCart.mockReset();
    getCartSummary.mockReset();
    getSession.mockReset();
    getZoneNames.mockReset();
    listZones.mockReset();
    matchZone.mockReset();
    setDeliveryInfo.mockReset();
    clearCart.mockReset();
    confirmOrder.mockReset();
    formatXof.mockImplementation((amount: number) => `${amount} F`);
    service = null as unknown as RestaurantOrderingToolsService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantOrderingToolsService,
        { provide: MenuService, useValue: { getMenu, formatXof } },
        {
          provide: CartService,
          useValue: {
            addToCart,
            addItemsToCart: addToCart,
            setDeliveryInfo,
            clearCart,
            removeItemsFromCart: jest.fn(),
            getCartSummary,
          },
        },
        {
          provide: DeliveryZonesService,
          useValue: { getZoneNames, listZones, matchZone },
        },
        { provide: OrdersService, useValue: { confirmOrder } },
        { provide: ConversationSessionService, useValue: { getSession } },
      ],
    }).compile();

    service = module.get(RestaurantOrderingToolsService);
    service.resetTurn();
  });

  it('exécute get_menu', async () => {
    getMenu.mockResolvedValue({ categories: [] });

    await expect(
      service.execute('get_menu', { category: 'Plats' }, context),
    ).resolves.toEqual({ categories: [] });

    expect(getMenu).toHaveBeenCalledWith('biz-1', {
      category: 'Plats',
      full: false,
    });
  });

  it('exécute get_menu avec full', async () => {
    getMenu.mockResolvedValue({ mode: 'full', categories: [] });

    await service.execute('get_menu', { full: true }, context);

    expect(getMenu).toHaveBeenCalledWith('biz-1', {
      category: undefined,
      full: true,
    });
  });

  it('exécute add_to_cart en batch via items', async () => {
    addToCart.mockResolvedValue({
      success: true,
      cart: [],
      added: [],
      failed: [],
    });

    await service.execute(
      'add_to_cart',
      {
        items: [
          { item_id: 'item-1', quantity: 2 },
          { item_id: 'item-2', quantity: 1 },
        ],
      },
      context,
    );

    expect(addToCart).toHaveBeenCalledWith('biz-1', '22177', [
      { item_id: 'item-1', quantity: 2, options: [] },
      { item_id: 'item-2', quantity: 1, options: [] },
    ]);
  });

  it('accepte encore add_to_cart legacy item_id/quantity', async () => {
    addToCart.mockResolvedValue({
      success: true,
      cart: [],
      added: [],
      failed: [],
    });

    await service.execute(
      'add_to_cart',
      { item_id: 'item-1', quantity: 2 },
      context,
    );

    expect(addToCart).toHaveBeenCalledWith('biz-1', '22177', [
      { item_id: 'item-1', quantity: 2, options: [] },
    ]);
  });

  it('valide set_delivery_info en livraison avec frais', async () => {
    matchZone.mockResolvedValue({
      id: 'zone-1',
      zoneName: 'Almadies',
      deliveryFee: '1500.00',
    });
    setDeliveryInfo.mockResolvedValue({});

    await expect(
      service.execute(
        'set_delivery_info',
        { mode: 'delivery', address_text: 'Rue 12 Almadies' },
        context,
      ),
    ).resolves.toEqual({
      valid: true,
      matched_zone: 'Almadies',
      delivery_fee: 1500,
    });

    expect(setDeliveryInfo).toHaveBeenCalledWith(
      'biz-1',
      '22177',
      expect.objectContaining({
        mode: 'delivery',
        zone_id: 'zone-1',
        delivery_fee: 1500,
      }),
    );
  });

  it('exécute clear_cart', async () => {
    clearCart.mockResolvedValue({ success: true });

    await expect(service.execute('clear_cart', {}, context)).resolves.toEqual({
      success: true,
    });

    expect(clearCart).toHaveBeenCalledWith('biz-1', '22177');
  });

  it('ask_delivery_mode stocke un payload boutons', async () => {
    await expect(
      service.execute('ask_delivery_mode', {}, context),
    ).resolves.toEqual({ presented: true });

    expect(service.consumePendingInteractiveMessage()).toEqual({
      type: 'buttons',
      bodyText: 'Souhaitez-vous une livraison ou un retrait sur place ?',
      buttons: [
        { id: 'delivery_mode_delivery', title: 'Livraison' },
        { id: 'delivery_mode_pickup', title: 'Retrait sur place' },
      ],
    });
  });

  it('get_delivery_zones retourne les zones et stocke une liste', async () => {
    listZones.mockResolvedValue([
      { name: 'Fass', delivery_fee: 1200 },
      { name: 'Médina', delivery_fee: 1500 },
    ]);

    await expect(
      service.execute('get_delivery_zones', {}, context),
    ).resolves.toEqual({
      zones: [
        { name: 'Fass', delivery_fee: 1200 },
        { name: 'Médina', delivery_fee: 1500 },
      ],
    });

    expect(service.consumePendingInteractiveMessage()).toEqual(
      expect.objectContaining({
        type: 'list',
        bodyText:
          'Choisissez votre quartier — vous pourrez préciser l’adresse juste après :',
        rows: [
          expect.objectContaining({
            title: 'Fass',
            description: 'Frais : 1200 F',
          }),
          expect.objectContaining({
            title: 'Médina',
            description: 'Frais : 1500 F',
          }),
        ],
      }),
    );
  });

  it('ask_order_confirmation stocke un payload boutons avec récap', async () => {
    getCartSummary.mockResolvedValue({
      items: [{ name: 'Salade César', price: 5500, quantity: 1, options: [] }],
      subtotal: 5500,
      delivery_fee: 2000,
      total: 7500,
      item_count: 1,
      order_note: null,
    });
    getSession.mockResolvedValue({
      delivery_info: {
        mode: 'delivery',
        zone_name: 'Point E',
        address_text: 'Point E, à côté d’Auchan',
      },
    });

    await expect(
      service.execute('ask_order_confirmation', {}, context),
    ).resolves.toEqual({ presented: true });

    const payload = service.consumePendingInteractiveMessage();
    expect(payload).toEqual(
      expect.objectContaining({
        type: 'buttons',
        buttons: [
          { id: 'confirm_order_yes', title: 'Oui, je confirme' },
          { id: 'confirm_order_no', title: 'Non, je modifie' },
        ],
      }),
    );
    expect(payload?.type === 'buttons' ? payload.bodyText : '').toContain(
      'Salade César',
    );
    expect(payload?.type === 'buttons' ? payload.bodyText : '').toContain(
      'Total : 7500 F',
    );
  });

  it('rejette un tool inconnu', async () => {
    await expect(service.execute('unknown', {}, context)).rejects.toThrow(
      'Tool inconnu',
    );
  });
});
