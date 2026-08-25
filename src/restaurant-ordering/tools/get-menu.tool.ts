import { ClaudeToolDefinition } from '../../module-registry/module-definition';

export const GET_MENU_TOOL: ClaudeToolDefinition = {
  name: 'get_menu',
  description:
    'Récupère le menu (plats, prix, disponibilité, options). Chaque option a name, required, price, et parfois choices[] (variantes à choisir, ex. Fanta/Coca). Ne jamais inventer un plat, un prix ou une option.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description:
          'Catégorie optionnelle pour filtrer (ex. "Grillades", "Boissons").',
      },
    },
  },
};
