export type LoginDto = {
  email: string;
  password: string;
};

export function parseLoginDto(body: unknown): LoginDto | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const data = body as Record<string, unknown>;
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  const password = typeof data.password === 'string' ? data.password : '';

  if (!email || !password) {
    return null;
  }

  return { email, password };
}
