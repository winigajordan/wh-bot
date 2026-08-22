import { ClaudeToolDefinition } from '../../module-registry/module-definition';

export const GET_MENU_TOOL: ClaudeToolDefinition = {
  name: 'get_menu',
  description:
    'Récupère le menu du restaurant (plats, prix, disponibilité). À utiliser pour toute question sur la carte — ne jamais inventer un plat ou un prix.',
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
