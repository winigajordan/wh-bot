import { Inject, Injectable } from '@nestjs/common';
import { ModuleDefinition } from './module-definition';
import { MODULE_REGISTRY_TOKEN } from './module-registry.constants';

@Injectable()
export class ModuleRegistryService {
  constructor(
    @Inject(MODULE_REGISTRY_TOKEN)
    private readonly registry: Record<string, ModuleDefinition>,
  ) {}

  resolve(moduleKey: string): ModuleDefinition {
    const definition = this.registry[moduleKey];
    if (!definition) {
      throw new Error(`Module inconnu: ${moduleKey}`);
    }
    return definition;
  }
}
