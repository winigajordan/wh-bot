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
  const matchZone = jest.fn();
  const setDeliveryInfo = jest.fn();
  const confirmOrder = jest.fn();

  const context = { businessId: 'biz-1', clientPhone: '22177' };

  beforeEach(async () => {
    getMenu.mockReset();
    addToCart.mockReset();
    getZoneNames.mockReset();
    matchZone.mockReset();
    setDeliveryInfo.mockReset();
    confirmOrder.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RestaurantOrderingToolsService,
        { provide: MenuService, useValue: { getMenu } },
        { provide: CartService, useValue: { addToCart, setDeliveryInfo } },
        {
          provide: DeliveryZonesService,
          useValue: { getZoneNames, matchZone },
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

  it('exécute add_to_cart', async () => {
    addToCart.mockResolvedValue({ success: true, cart: [] });

    await service.execute(
      'add_to_cart',
      { item_id: 'item-1', quantity: 2 },
      context,
    );

    expect(addToCart).toHaveBeenCalledWith('biz-1', '22177', 'item-1', 2, []);
  });

  it('valide set_delivery_info en livraison', async () => {
    matchZone.mockResolvedValue({ id: 'zone-1', zoneName: 'Almadies' });
    setDeliveryInfo.mockResolvedValue({});

    await expect(
      service.execute(
        'set_delivery_info',
        { mode: 'delivery', address_text: 'Rue 12 Almadies' },
        context,
      ),
    ).resolves.toEqual({ valid: true, matched_zone: 'Almadies' });
  });

  it('rejette un tool inconnu', async () => {
    await expect(service.execute('unknown', {}, context)).rejects.toThrow(
      'Tool inconnu',
    );
  });
});
