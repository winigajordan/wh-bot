import { ClaudeToolDefinition } from '../../module-registry/module-definition';

export const GET_MENU_TOOL: ClaudeToolDefinition = {
  name: 'get_menu',
    description:
    'Consulte le menu. Sans category ni full : si la carte est longue, renvoie mode=categories (name, sample[{name,description}], has_more) — présente chaque famille par une phrase descriptive, pas une liste de plats. Avec category : mode=items. full=true : carte complète uniquement si le client le demande. Petit menu : mode=full d’emblée. Ne jamais inventer un plat, un prix ou une option.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description:
          'Nom exact d’une catégorie (ex. "Grillades", "Boissons") pour en lister les plats.',
      },
      full: {
        type: 'boolean',
        description:
          'true uniquement si le client demande explicitement la carte / le menu complet. Ignoré si category est fourni.',
      },
    },
  },
};
