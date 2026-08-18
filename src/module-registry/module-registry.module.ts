import { Global, Module } from '@nestjs/common';
import { restaurantOrderingModuleDefinition } from '../restaurant-ordering/restaurant-ordering.module-definition';
import { ModuleDefinition } from './module-definition';
import { MODULE_REGISTRY_TOKEN } from './module-registry.constants';
import { ModuleRegistryService } from './module-registry.service';

export { MODULE_REGISTRY_TOKEN } from './module-registry.constants';

export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  restaurant_ordering: restaurantOrderingModuleDefinition,
};

@Global()
@Module({
  providers: [
    {
      provide: MODULE_REGISTRY_TOKEN,
      useValue: MODULE_REGISTRY,
    },
    ModuleRegistryService,
  ],
  exports: [MODULE_REGISTRY_TOKEN, ModuleRegistryService],
})
export class ModuleRegistryModule {}
