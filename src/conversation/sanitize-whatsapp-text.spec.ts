import { sanitizeWhatsappText } from './sanitize-whatsapp-text';

describe('sanitizeWhatsappText', () => {
  it('supprime ### en début de ligne', () => {
    expect(sanitizeWhatsappText('### Grillades\nPoulet 2 500 F')).toBe(
      'Grillades\nPoulet 2 500 F',
    );
  });

  it('supprime # et ## aussi', () => {
    expect(sanitizeWhatsappText('# Titre\n## Sous-titre')).toBe(
      'Titre\nSous-titre',
    );
  });

  it('retire le gras WhatsApp (*…*) et garde le texte', () => {
    expect(sanitizeWhatsappText('Total : *7 500 F* pour *Point E*')).toBe(
      'Total : 7 500 F pour Point E',
    );
    expect(sanitizeWhatsappText('• *Grillades* : viandes')).toBe(
      '• Grillades : viandes',
    );
    expect(sanitizeWhatsappText('*Salade César* — 5 500 F')).toBe(
      'Salade César — 5 500 F',
    );
  });

  it('ne modifie pas le reste du texte', () => {
    const input = 'Bonjour ! Voici le menu.\nPizza Reine — 5 500 F';
    expect(sanitizeWhatsappText(input)).toBe(input);
  });

  it('ne touche pas aux # au milieu d’une ligne', () => {
    expect(sanitizeWhatsappText('Pizza #1 spéciale')).toBe('Pizza #1 spéciale');
  });

  it('supprime emoji de statut après confirmée', () => {
    expect(sanitizeWhatsappText('Commande confirmée ✅')).toBe(
      'Commande confirmée',
    );
    expect(sanitizeWhatsappText('Commande confirmé 🎉')).toBe(
      'Commande confirmé',
    );
  });
});
