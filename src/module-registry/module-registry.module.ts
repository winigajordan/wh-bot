import { Global, Module } from '@nestjs/common';
import { restaurantOrderingModuleDefinition } from '../restaurant-ordering/restaurant-ordering.module-definition';
import { ModuleDefinition } from './module-definition';

export const MODULE_REGISTRY_TOKEN = 'MODULE_REGISTRY';

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
  ],
  exports: [MODULE_REGISTRY_TOKEN],
})
export class ModuleRegistryModule {}
