import {
  buildRestaurantOrderingSystemPrompt,
  DEFAULT_STYLE_DIRECTIVES,
  restaurantOrderingModuleDefinition,
} from './restaurant-ordering.module-definition';
import { ORDERING_TOOLS } from './tools/ordering.tools';

describe('restaurantOrderingModuleDefinition', () => {
  const business = {
    name: 'Les délices de Jordan',
    address: 'Almadies, Dakar',
    contactPhone: '+221781234567',
  };

  it('injecte le nom, l’adresse et le contact', () => {
    const prompt = restaurantOrderingModuleDefinition.buildSystemPrompt(business);

    expect(prompt).toContain('Les délices de Jordan');
    expect(prompt).toContain('Almadies, Dakar');
    expect(prompt).toContain('+221781234567');
  });

  it('décrit le flow de commande complet', () => {
    const prompt =
      restaurantOrderingModuleDefinition.buildSystemPrompt(business);

    expect(prompt).toContain('get_menu');
    expect(prompt).toContain('add_to_cart');
    expect(prompt).toContain('items:');
    expect(prompt).toContain('confirm_order');
    expect(prompt).toContain('clear_cart');
    expect(prompt).toContain('Budget tools');
    expect(prompt).toMatch(/inventer/i);
    expect(prompt).toMatch(/success:\s*true/i);
    expect(prompt).toMatch(/Jamais un appel add_to_cart par plat/i);
    expect(prompt).toMatch(/required:\s*true/i);
    expect(prompt).toMatch(/Présentation du menu/i);
    expect(prompt).toMatch(/price_label/i);
    expect(prompt).toMatch(/mode=categories/i);
    expect(prompt).toMatch(/full:\s*true/i);
    expect(prompt).toMatch(/Vouvoiement OBLIGATOIRE/i);
    expect(prompt).toMatch(/tu veux voir quoi en premier/i);
    expect(prompt).toMatch(/vous voulez voir les grillades ou les sandwichs/i);
    expect(prompt).toMatch(/phrase descriptive/i);
    expect(prompt).toMatch(/Exemple MAUVAIS \(liste\)/i);
  });

  it('donne un exemple descriptif et interdit la liste de noms', () => {
    const prompt =
      restaurantOrderingModuleDefinition.buildSystemPrompt(business);
    expect(prompt).toContain(
      'Grillades — viandes et volailles au feu de bois, brochettes et accompagnements, et bien d’autres',
    );
    expect(prompt).toContain(
      'Grillades — tawouk, kafta, brochettes et d’autres',
    );
  });

  it('expose tous les tools de commande', () => {
    expect(restaurantOrderingModuleDefinition.getTools()).toEqual(
      ORDERING_TOOLS,
    );
    expect(restaurantOrderingModuleDefinition.getTools()).toHaveLength(10);
  });

  it('garde un ordre figé des tools (breakpoint cache = dernier)', () => {
    const tools = restaurantOrderingModuleDefinition.getTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      'get_menu',
      'add_to_cart',
      'remove_from_cart',
      'clear_cart',
      'get_cart_summary',
      'get_delivery_zones',
      'set_delivery_info',
      'set_order_note',
      'confirm_order',
      'get_order_status',
    ]);
    expect(tools.at(-1)?.name).toBe('get_order_status');
    // Même référence / même contenu à chaque appel — pas de tri dynamique
    expect(restaurantOrderingModuleDefinition.getTools()).toBe(ORDERING_TOOLS);
    expect(restaurantOrderingModuleDefinition.getTools()).toEqual(
      restaurantOrderingModuleDefinition.getTools(),
    );
  });

  it('sans provider ou avec claude : prompt identique au style Claude par défaut', () => {
    const withoutProvider =
      restaurantOrderingModuleDefinition.buildSystemPrompt(business);
    const withClaude = buildRestaurantOrderingSystemPrompt(business, 'claude');

    expect(withoutProvider).toBe(withClaude);
    expect(withoutProvider).toContain(DEFAULT_STYLE_DIRECTIVES);
    expect(withoutProvider).toContain('Titre de catégorie en MAJUSCULES');
    expect(withoutProvider).not.toContain('INTERDIT : tout caractère #');
  });

  it('avec openai : injecte le style override GPT (fluidité + texte brut)', () => {
    const prompt = buildRestaurantOrderingSystemPrompt(business, 'openai');

    expect(prompt).toContain('conversation fluide');
    expect(prompt).toContain('INTERDIT ABSOLU : tout caractère *');
    expect(prompt).toContain('Fluidité et non-répétition');
    expect(prompt).toContain('C’est noté pour la César');
    expect(prompt).toContain('PAS de puces • devant chaque plat');
    expect(prompt).not.toContain('Titre de catégorie en MAJUSCULES');
    expect(prompt).not.toContain('*Total : 9 500 F*');
    expect(prompt).toContain('Ne jamais inventer un plat');
    expect(prompt).toContain('confirm_order');
  });
});
