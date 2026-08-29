import { Injectable } from '@nestjs/common';
import type { PendingInteractiveMessage } from '../whatsapp-client/interactive-message.types';
import {
  RESTAURANT_ORDERING_MODULE_KEY,
} from '../restaurant-ordering/restaurant-ordering.module-definition';
import {
  RestaurantOrderingToolsService,
  ToolExecutionContext,
} from '../restaurant-ordering/tools/restaurant-ordering-tools.service';

@Injectable()
export class ModuleToolRegistryService {
  constructor(
    private readonly restaurantOrderingTools: RestaurantOrderingToolsService,
  ) {}

  resetTurn(moduleKey: string): void {
    if (moduleKey === RESTAURANT_ORDERING_MODULE_KEY) {
      this.restaurantOrderingTools.resetTurn();
    }
  }

  consumePendingInteractiveMessage(
    moduleKey: string,
  ): PendingInteractiveMessage | null {
    if (moduleKey === RESTAURANT_ORDERING_MODULE_KEY) {
      return this.restaurantOrderingTools.consumePendingInteractiveMessage();
    }
    return null;
  }

  async execute(
    moduleKey: string,
    toolName: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    if (moduleKey === RESTAURANT_ORDERING_MODULE_KEY) {
      return this.restaurantOrderingTools.execute(toolName, input, context);
    }

    throw new Error(`Pas de handler tools pour le module: ${moduleKey}`);
  }
}
