import { ClaudeToolDefinition } from '../../module-registry/module-definition';

export const GET_MENU_TOOL: ClaudeToolDefinition = {
  name: 'get_menu',
  description:
    'Récupère le menu (plats, prix, disponibilité, options). Chaque plat a price_label (prix déjà formaté pour WhatsApp, avec variantes si besoin). Options : name, required, price, parfois choices[{name, price}]. Ne jamais inventer un plat, un prix ou une option.',
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
