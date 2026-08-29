import { matchZoneInAddress, normalizeZoneText } from './zone-matching.util';

describe('zone-matching.util', () => {
  it('normalise accents et casse', () => {
    expect(normalizeZoneText('  Point É  ')).toBe('point e');
  });

  it('matche une zone exacte', () => {
    expect(matchZoneInAddress('Fass', 'Fass')).toBe(true);
  });

  it('matche une zone contenue dans l’adresse', () => {
    expect(matchZoneInAddress('Almadies', 'Rue 10, Almadies, Dakar')).toBe(
      true,
    );
  });

  it('ne matche pas une zone absente', () => {
    expect(matchZoneInAddress('Mermoz', 'Almadies')).toBe(false);
  });
});
