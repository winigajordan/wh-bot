import { parseLoginDto } from './login.dto';

describe('parseLoginDto', () => {
  it('parse un body valide', () => {
    expect(parseLoginDto({ email: ' a@b.c ', password: 'x' })).toEqual({
      email: 'a@b.c',
      password: 'x',
    });
  });

  it('rejette un body invalide', () => {
    expect(parseLoginDto({})).toBeNull();
    expect(parseLoginDto({ email: 'a@b.c' })).toBeNull();
    expect(parseLoginDto(null)).toBeNull();
  });
});
