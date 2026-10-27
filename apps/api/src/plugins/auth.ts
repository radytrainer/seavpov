import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@rt/shared';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { sha256 } from '../lib/security';

export const SESSION_COOKIE = 'rt_session';

export interface AuthContext {
  userId: string;
  role: Role;
  sessionId: string;
  mustChangePassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    sessionCookieOptions: (maxAgeSeconds: number) => {
      httpOnly: true;
      sameSite: 'lax';
      secure: boolean;
      path: '/';
      maxAge: number;
    };
  }
}

interface AuthPluginOptions {
  cookieSecure: boolean;
  sessionTtlHours: number;
}

/** Routes a user with `mustChangePassword` may still call. */
const PASSWORD_CHANGE_ALLOWLIST = ['/api/v1/auth/'];

/**
 * Resolves the session cookie to an AuthContext on every API request.
 * Expired sessions and inactive users are treated as unauthenticated.
 * Sessions slide: when less than half the TTL remains, the expiry is extended.
 */
export const authPlugin = fp<AuthPluginOptions>(async (app, opts) => {
  const ttlMs = opts.sessionTtlHours * 3_600_000;

  app.decorate('sessionCookieOptions', (maxAgeSeconds: number) => ({
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: opts.cookieSecure,
    path: '/' as const,
    maxAge: maxAgeSeconds,
  }));
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/')) return;
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;

    const session = await app.prisma.authSession.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        expiresAt: true,
        lastSeenAt: true,
        user: { select: { id: true, role: true, status: true, mustChangePassword: true } },
      },
    });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now || session.user.status !== 'ACTIVE') {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return;
    }

    request.auth = {
      userId: session.user.id,
      role: session.user.role,
      sessionId: session.id,
      mustChangePassword: session.user.mustChangePassword,
    };

    const remaining = session.expiresAt.getTime() - now;
    if (remaining < ttlMs / 2) {
      const expiresAt = new Date(now + ttlMs);
      await app.prisma.authSession.update({
        where: { id: session.id },
        data: { expiresAt, lastSeenAt: new Date(now) },
      });
      reply.setCookie(SESSION_COOKIE, token, app.sessionCookieOptions(ttlMs / 1000));
    } else if (now - session.lastSeenAt.getTime() > 5 * 60_000) {
      await app.prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
  });
});

/** preHandler: requires a signed-in user, optionally with one of the given roles. */
export function requireAuth(...roles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth) throw unauthorized();
    if (
      auth.mustChangePassword &&
      !PASSWORD_CHANGE_ALLOWLIST.some((p) => request.url.startsWith(p))
    ) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Please change your password first');
    }
    if (roles.length > 0 && !roles.includes(auth.role)) throw forbidden();
  };
}

/** Narrowing helper for handlers behind requireAuth. */
export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}
