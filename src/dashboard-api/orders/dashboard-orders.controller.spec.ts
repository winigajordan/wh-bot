import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../../restaurant-ordering/orders/orders.service';
import { DashboardOrdersController } from './dashboard-orders.controller';

describe('DashboardOrdersController', () => {
  let controller: DashboardOrdersController;
  const listForBusiness = jest.fn();
  const findForBusiness = jest.fn();
  const updateStatus = jest.fn();
  const user = {
    userId: 'user-1',
    businessId: 'biz-1',
    email: 'delices@test.local',
  };

  beforeEach(async () => {
    listForBusiness.mockReset();
    findForBusiness.mockReset();
    updateStatus.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardOrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: { listForBusiness, findForBusiness, updateStatus },
        },
      ],
    }).compile();

    controller = module.get(DashboardOrdersController);
  });

  it('liste les commandes du business du JWT', async () => {
    listForBusiness.mockResolvedValue([]);

    await expect(controller.list(user)).resolves.toEqual([]);
    expect(listForBusiness).toHaveBeenCalledWith('biz-1', {
      status: undefined,
      limit: undefined,
    });
  });

  it('refuse un status query invalide', async () => {
    await expect(controller.list(user, 'nope')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('404 si commande absente', async () => {
    findForBusiness.mockResolvedValue(null);

    await expect(controller.getOne(user, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('met à jour le statut', async () => {
    updateStatus.mockResolvedValue({
      success: true,
      order: { id: 'order-1', status: 'preparing' },
    });

    await expect(
      controller.updateStatus(user, 'order-1', { status: 'preparing' }),
    ).resolves.toEqual({ id: 'order-1', status: 'preparing' });
  });
});
