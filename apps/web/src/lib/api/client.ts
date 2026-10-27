'use client';

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, parseApiResponse } from './errors';

/**
 * Browser API client. Calls same-origin /api/v1 (proxied by Next.js), sends the session cookie
 * automatically and the CSRF header required for state-changing requests.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-requested-with': 'fetch',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Session expired: hard navigation drops cached data from the previous session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
  return parseApiResponse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * Maps API field errors onto a React Hook Form. Returns true when at least one field error
 * was applied (so callers can skip a generic toast).
 */
export function applyFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (!(err instanceof ApiError)) return false;
  let applied = false;
  for (const issue of err.fieldIssues) {
    if (fields.includes(issue.path)) {
      setError(issue.path as Path<T>, { type: 'server', message: issue.message });
      applied = true;
    }
  }
  return applied;
}
