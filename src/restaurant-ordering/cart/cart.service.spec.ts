import { Test, TestingModule } from '@nestjs/testing';
import { ConversationSessionService } from '../../conversation/conversation-session.service';
import { MenuService } from '../menu/menu.service';
import { CartService } from './cart.service';

const ITEM_1 = '11111111-1111-4111-8111-111111111111';
const ITEM_2 = '22222222-2222-4222-8222-222222222222';

describe('CartService', () => {
  let service: CartService;
  const mutateSession = jest.fn();
  const getSession = jest.fn();
  const findById = jest.fn();

  beforeEach(async () => {
    mutateSession.mockReset();
    getSession.mockReset();
    findById.mockReset();

    getSession.mockResolvedValue({
      cart: [],
      delivery_info: null,
      order_note: null,
      messages: [],
      last_activity: '',
    });

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
      id: ITEM_1,
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
      service.addToCart('biz-1', '22177', ITEM_1, 2),
    ).resolves.toEqual({
      success: true,
      cart: [
        expect.objectContaining({
          item_id: ITEM_1,
          name: 'Thieb',
          price: 3500,
          quantity: 2,
        }),
      ],
    });
  });

  it('ajoute plusieurs items en un seul appel', async () => {
    findById
      .mockResolvedValueOnce({
        id: ITEM_1,
        name: 'Thieb',
        price: '3500.00',
        available: true,
      })
      .mockResolvedValueOnce({
        id: ITEM_2,
        name: 'Bouye',
        price: '600.00',
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
      service.addItemsToCart('biz-1', '22177', [
        { item_id: ITEM_1, quantity: 1 },
        { item_id: ITEM_2, quantity: 2 },
      ]),
    ).resolves.toEqual({
      success: true,
      cart: [
        expect.objectContaining({ item_id: ITEM_1, quantity: 1 }),
        expect.objectContaining({ item_id: ITEM_2, quantity: 2 }),
      ],
      added: [
        { item_id: ITEM_1, name: 'Thieb', quantity: 1 },
        { item_id: ITEM_2, name: 'Bouye', quantity: 2 },
      ],
    });

    expect(mutateSession).toHaveBeenCalledTimes(1);
  });

  it('refuse tout le lot addItemsToCart si un id est invalide (tout-ou-rien)', async () => {
    findById.mockResolvedValueOnce({
      id: ITEM_1,
      name: 'Thieb',
      price: '3500.00',
      available: true,
    });

    await expect(
      service.addItemsToCart('biz-1', '22177', [
        { item_id: ITEM_1, quantity: 1 },
        { item_id: 'pas-un-uuid', quantity: 1 },
      ]),
    ).resolves.toEqual({
      success: false,
      reason: 'invalid_items',
      cart: [],
      added: [],
      failed: [
        expect.objectContaining({
          item_id: 'pas-un-uuid',
          reason: 'item_not_found',
        }),
      ],
    });

    expect(mutateSession).not.toHaveBeenCalled();
  });

  it('refuse un item indisponible', async () => {
    findById.mockResolvedValue({
      id: ITEM_1,
      available: false,
    });

    await expect(
      service.addToCart('biz-1', '22177', ITEM_1, 1),
    ).resolves.toEqual({ success: false, reason: 'item_unavailable' });
  });

  it('refuse un item_id non-UUID sans interroger la base', async () => {
    await expect(
      service.addToCart('biz-1', '22177', 'thieb-yapp-id', 1),
    ).resolves.toEqual({ success: false, reason: 'item_not_found' });

    expect(findById).not.toHaveBeenCalled();
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
      cart: [
        {
          item_id: ITEM_1,
          name: 'Thieb',
          price: 3500,
          quantity: 1,
          options: [],
        },
      ],
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
