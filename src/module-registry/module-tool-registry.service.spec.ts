import { Test, TestingModule } from '@nestjs/testing';
import { ModuleToolRegistryService } from './module-tool-registry.service';
import { RestaurantOrderingToolsService } from '../restaurant-ordering/tools/restaurant-ordering-tools.service';

describe('ModuleToolRegistryService', () => {
  let service: ModuleToolRegistryService;
  const execute = jest.fn();

  beforeEach(async () => {
    execute.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModuleToolRegistryService,
        {
          provide: RestaurantOrderingToolsService,
          useValue: { execute },
        },
      ],
    }).compile();

    service = module.get(ModuleToolRegistryService);
  });

  it('délègue au handler restaurant_ordering', async () => {
    execute.mockResolvedValue({ categories: [] });

    await expect(
      service.execute(
        'restaurant_ordering',
        'get_menu',
        {},
        { businessId: 'biz-1', clientPhone: '22177' },
      ),
    ).resolves.toEqual({ categories: [] });

    expect(execute).toHaveBeenCalledWith(
      'get_menu',
      {},
      { businessId: 'biz-1', clientPhone: '22177' },
    );
  });

  it('rejette un module sans handler', async () => {
    await expect(
      service.execute(
        'unknown_module',
        'get_menu',
        {},
        { businessId: 'biz-1', clientPhone: '22177' },
      ),
    ).rejects.toThrow('Pas de handler tools');
  });
});
