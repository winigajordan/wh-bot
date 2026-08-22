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
    expect(prompt).toContain('confirm_order');
    expect(prompt).toMatch(/inventer/i);
  });

  it('expose tous les tools de commande', () => {
    expect(restaurantOrderingModuleDefinition.getTools()).toEqual(
      ORDERING_TOOLS,
    );
    expect(restaurantOrderingModuleDefinition.getTools()).toHaveLength(8);
  });
});
