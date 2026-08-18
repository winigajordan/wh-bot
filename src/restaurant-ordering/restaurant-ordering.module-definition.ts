import {
  BusinessPromptContext,
  ModuleDefinition,
} from '../module-registry/module-definition';

export const RESTAURANT_ORDERING_MODULE_KEY = 'restaurant_ordering';

export const restaurantOrderingModuleDefinition: ModuleDefinition = {
  key: RESTAURANT_ORDERING_MODULE_KEY,
  buildSystemPrompt(business: BusinessPromptContext): string {
    return [
      `Tu es l'assistant de commande WhatsApp de ${business.name}.`,
      business.address ? `Adresse : ${business.address}` : '',
      business.contactPhone ? `Contact : ${business.contactPhone}` : '',
      'Le prompt métier complet (règles de commande, tools, ton) sera injecté en Phase 2.',
    ]
      .filter(Boolean)
      .join('\n');
  },
  getTools() {
    return [];
  },
  onboardingSteps: [
    { key: 'upload_menu', label: 'Upload du menu', order: 1 },
    { key: 'review_extraction', label: 'Review de l’extraction', order: 2 },
    { key: 'delivery_zones', label: 'Zones de livraison', order: 3 },
    { key: 'first_test', label: 'Premier test', order: 4 },
  ],
};
