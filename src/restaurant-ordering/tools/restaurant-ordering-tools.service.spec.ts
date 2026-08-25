import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from '../cart/cart.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import { RestaurantOrderingToolsService } from './restaurant-ordering-tools.service';

describe('RestaurantOrderingToolsService', () => {
  let service: RestaurantOrderingToolsService;
  const getMenu = jest.fn();
  const addToCart = jest.fn();
  const getZoneNames = jest.fn();
  const listZones = jest.fn();
  const matchZone = jest.fn();
  const setDeliveryInfo = jest.fn();
  const clearCart = jest.fn();
  const confirmOrder = jest.fn();

  const context = { businessId: 'biz-1', clientPhone: '22177' };

  beforeEach(async () => {
    getMenu.mockReset();
    addToCart.mockReset();
    getZoneNames.mockReset();
    listZones.mockReset();
    matchZone.mockReset();
    setDeliveryInfo.mockReset();
    clearCart.mockReset();
    confirmOrder.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantOrderingToolsService,
        { provide: MenuService, useValue: { getMenu } },
        { provide: CartService, useValue: { addToCart, addItemsToCart: addToCart, setDeliveryInfo, clearCart, removeItemsFromCart: jest.fn() } },
        {
          provide: DeliveryZonesService,
          useValue: { getZoneNames, listZones, matchZone },
        },
        { provide: OrdersService, useValue: { confirmOrder } },
      ],
    }).compile();

    service = module.get(RestaurantOrderingToolsService);
  });

  it('exécute get_menu', async () => {
    getMenu.mockResolvedValue({ categories: [] });

    await expect(
      service.execute('get_menu', { category: 'Plats' }, context),
    ).resolves.toEqual({ categories: [] });

    expect(getMenu).toHaveBeenCalledWith('biz-1', 'Plats');
  });

  it('exécute add_to_cart en batch via items', async () => {
    addToCart.mockResolvedValue({ success: true, cart: [], added: [], failed: [] });

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
    addToCart.mockResolvedValue({ success: true, cart: [], added: [], failed: [] });

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

  it('rejette un tool inconnu', async () => {
    await expect(service.execute('unknown', {}, context)).rejects.toThrow(
      'Tool inconnu',
    );
  });
});
