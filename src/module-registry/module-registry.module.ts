import { Global, Module } from '@nestjs/common';
import { RestaurantOrderingModule } from '../restaurant-ordering/restaurant-ordering.module';
import { restaurantOrderingModuleDefinition } from '../restaurant-ordering/restaurant-ordering.module-definition';
import { ModuleDefinition } from './module-definition';
import { MODULE_REGISTRY_TOKEN } from './module-registry.constants';
import { ModuleRegistryService } from './module-registry.service';
import { ModuleToolRegistryService } from './module-tool-registry.service';

export { MODULE_REGISTRY_TOKEN } from './module-registry.constants';

export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  restaurant_ordering: restaurantOrderingModuleDefinition,
};

@Global()
@Module({
  imports: [RestaurantOrderingModule],
  providers: [
    {
      provide: MODULE_REGISTRY_TOKEN,
      useValue: MODULE_REGISTRY,
    },
    ModuleRegistryService,
    ModuleToolRegistryService,
  ],
  exports: [
    MODULE_REGISTRY_TOKEN,
    ModuleRegistryService,
    ModuleToolRegistryService,
  ],
})
export class ModuleRegistryModule {}
