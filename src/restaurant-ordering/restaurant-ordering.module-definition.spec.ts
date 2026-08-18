import { restaurantOrderingModuleDefinition } from './restaurant-ordering.module-definition';

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

  it('calibré entre froid et commercial', () => {
    const prompt =
      restaurantOrderingModuleDefinition.buildSystemPrompt(business);

    expect(prompt).toContain('serveur sympa');
    expect(prompt).toContain("Pas d'emoji systématique");
    expect(prompt).toContain('Pas de gras');
    expect(prompt).toContain('Bonne question');
    expect(prompt).toContain('excuse');
    expect(prompt).toContain('+221781234567');
  });

  it('annonce que menu et commande ne sont pas encore disponibles', () => {
    const prompt =
      restaurantOrderingModuleDefinition.buildSystemPrompt(business);

    expect(prompt).toMatch(/menu/i);
    expect(prompt).toMatch(/commande/i);
    expect(prompt).toMatch(/pas encore/i);
  });

  it('ne fournit pas de tools en Phase 2', () => {
    expect(restaurantOrderingModuleDefinition.getTools()).toEqual([]);
  });
});
