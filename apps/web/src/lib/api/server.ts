import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApiError, parseApiResponse } from './errors';
import type { CurrentUser } from '../types';
import { homeForRole } from '../navigation';

// 127.0.0.1 avoids a ~200 ms IPv6 fallback per request on Windows (see next.config.ts).
const API_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4010';

/**
 * Server Component data fetching: calls the API over the internal network, forwarding the
 * user's session cookie. 401 → login page; required password change → change-password page.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store',
  });
  try {
    return await parseApiResponse<T>(res);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    if (err instanceof ApiError && err.code === 'PASSWORD_CHANGE_REQUIRED') {
      redirect('/change-password');
    }
    throw err;
  }
}

/** Same as apiGet but returns null for 404 (so pages can call notFound()). */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Current user for this request (deduplicated across layouts/pages via React cache). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader.includes('rt_session=')) return null;
  const res = await fetch(`${API_URL}/api/v1/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  const body = await parseApiResponse<{ data: CurrentUser }>(res);
  return body.data;
});

/** Requires a signed-in user (optionally with one of the given roles). */
export async function requireUser(...roles: CurrentUser['role'][]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/change-password');
  if (roles.length > 0 && !roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

export interface RegistrationInfo {
  enabled: boolean;
  institutionName: string;
  classes: { id: string; name: string; generation: { id: string; name: string } }[];
}

/** Public: whether student self-registration is open (never throws; closed on errors). */
export async function getRegistrationInfo(): Promise<RegistrationInfo> {
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/registration`, { cache: 'no-store' });
    const body = await parseApiResponse<{ data: RegistrationInfo }>(res);
    return body.data;
  } catch {
    return { enabled: false, institutionName: '', classes: [] };
  }
}
