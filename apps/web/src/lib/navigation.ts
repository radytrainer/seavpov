import type { Role } from '@rt/shared';

export function homeForRole(role: Role): string {
  return role === 'ADMIN' ? '/admin' : role === 'TRAINER' ? '/trainer' : '/dashboard';
}

/** Accepts only same-site relative paths, preventing open redirects via ?next=. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  return next;
}
