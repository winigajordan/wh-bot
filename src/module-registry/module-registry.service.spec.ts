import { Test, TestingModule } from '@nestjs/testing';
import { restaurantOrderingModuleDefinition } from '../restaurant-ordering/restaurant-ordering.module-definition';
import { MODULE_REGISTRY_TOKEN } from './module-registry.constants';
import { MODULE_REGISTRY } from './module-registry.module';
import { ModuleRegistryService } from './module-registry.service';

describe('ModuleRegistryService', () => {
  let service: ModuleRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModuleRegistryService,
        {
          provide: MODULE_REGISTRY_TOKEN,
          useValue: MODULE_REGISTRY,
        },
      ],
    }).compile();

    service = module.get(ModuleRegistryService);
  });

  it('résout restaurant_ordering', () => {
    expect(service.resolve('restaurant_ordering')).toBe(
      restaurantOrderingModuleDefinition,
    );
  });

  it('lève si le key est inconnu', () => {
    expect(() => service.resolve('beauty_booking')).toThrow(
      'Module inconnu: beauty_booking',
    );
  });
});
