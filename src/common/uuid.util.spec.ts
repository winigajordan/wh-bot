import { isUuid } from './uuid.util';

describe('isUuid', () => {
  it('accepte un UUID v4 valide', () => {
    expect(isUuid('2ed102a0-38f0-4426-9d0e-ab5bd53737e2')).toBe(true);
  });

  it('rejette un identifiant inventé par le modèle', () => {
    expect(isUuid('thieb-yapp-id')).toBe(false);
  });
});
