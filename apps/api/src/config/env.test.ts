import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x' });
    expect(env.API_PORT).toBe(4010);
    expect(env.COOKIE_SECURE).toBe(false);
  });

  it('fails fast with readable messages', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('requires secure cookies in production', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'production' })).toThrow(
      /COOKIE_SECURE/,
    );
  });
});
