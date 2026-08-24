import { Test, TestingModule } from '@nestjs/testing';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import { MenuService } from '../menu/menu.service';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  const mutateSession = jest.fn();
  const getSession = jest.fn();
  const findById = jest.fn();

  beforeEach(async () => {
    mutateSession.mockReset();
    getSession.mockReset();
    findById.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: ConversationSessionService,
          useValue: { mutateSession, getSession },
        },
        {
          provide: MenuService,
          useValue: { findById },
        },
      ],
    }).compile();

    service = module.get(CartService);
  });

  it('ajoute un item disponible au panier', async () => {
    findById.mockResolvedValue({
      id: 'item-1',
      name: 'Thieb',
      price: '3500.00',
      available: true,
    });
    mutateSession.mockImplementation(async (_b, _p, mutate) => {
      const session = {
        cart: [],
        delivery_info: null,
        order_note: null,
        messages: [],
        last_activity: '',
      };
      mutate(session);
      return session;
    });

    await expect(
      service.addToCart('biz-1', '22177', 'item-1', 2),
    ).resolves.toEqual({
      success: true,
      cart: [
        expect.objectContaining({
          item_id: 'item-1',
          name: 'Thieb',
          price: 3500,
          quantity: 2,
        }),
      ],
    });
  });

  it('refuse un item indisponible', async () => {
    findById.mockResolvedValue({
      id: 'item-1',
      available: false,
    });

    await expect(
      service.addToCart('biz-1', '22177', 'item-1', 1),
    ).resolves.toEqual({ success: false, reason: 'item_unavailable' });
  });

  it('refuse un item_id invalide sans interroger la base', async () => {
    await expect(
      service.addToCart('biz-1', '22177', 'thieb-yapp-id', 1),
    ).resolves.toEqual({ success: false, reason: 'item_not_found' });

    expect(findById).toHaveBeenCalledWith('biz-1', 'thieb-yapp-id');
  });

  it('enregistre une note optionnelle', async () => {
    mutateSession.mockImplementation(async (_b, _p, mutate) => {
      const session = {
        cart: [],
        delivery_info: null,
        order_note: null,
        messages: [],
        last_activity: '',
      };
      mutate(session);
      return session;
    });

    await expect(
      service.setOrderNote('biz-1', '22177', 'Sans oignons'),
    ).resolves.toEqual({
      success: true,
      order_note: 'Sans oignons',
    });
  });

  it('vide le panier et réinitialise livraison + note', async () => {
    getSession.mockResolvedValue({
      cart: [{ item_id: 'item-1', name: 'Thieb', price: 3500, quantity: 1, options: [] }],
      delivery_info: { mode: 'delivery', delivery_fee: 1500 },
      order_note: 'Sans piment',
      messages: [],
      last_activity: '',
    });
    mutateSession.mockResolvedValue({
      cart: [],
      delivery_info: null,
      order_note: null,
      messages: [],
      last_activity: '',
    });

    await expect(service.clearCart('biz-1', '22177')).resolves.toEqual({
      success: true,
    });
    expect(mutateSession).toHaveBeenCalled();
  });

  it('refuse clear_cart si le panier est déjà vide', async () => {
    getSession.mockResolvedValue({
      cart: [],
      delivery_info: null,
      order_note: null,
      messages: [],
      last_activity: '',
    });

    await expect(service.clearCart('biz-1', '22177')).resolves.toEqual({
      success: false,
      reason: 'cart_already_empty',
    });

    expect(mutateSession).not.toHaveBeenCalled();
  });
});
