import { createHash, randomBytes, randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 Algorithm.Argon2id (a const enum, which verbatimModuleSyntax cannot import).
const ARGON2ID = 2;

// OWASP-recommended Argon2id parameters (19 MiB memory, 2 iterations, 1 lane).
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same CPU time as a real verification so responses for unknown accounts are not
 * measurably faster (mitigates account enumeration by timing).
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-1');
  await verifyPassword(await dummyHash, password);
}

/** Opaque, URL-safe random token (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Readable temporary password (letters + digits, no ambiguous characters). */
export function generateTemporaryPassword(length = 12): string {
  let out = '';
  while (!(/[A-Za-z]/.test(out) && /\d/.test(out)) || out.length < length) {
    out = Array.from({ length }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
  }
  return out;
}
