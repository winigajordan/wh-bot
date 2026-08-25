import { restaurantOrderingModuleDefinition } from './restaurant-ordering.module-definition';
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
  });

  it('expose tous les tools de commande', () => {
    expect(restaurantOrderingModuleDefinition.getTools()).toEqual(
      ORDERING_TOOLS,
    );
    expect(restaurantOrderingModuleDefinition.getTools()).toHaveLength(10);
  });
});
