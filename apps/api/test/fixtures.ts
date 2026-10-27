import type { FastifyInstance, InjectOptions } from 'fastify';
import type { PrismaClient, Role } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/security';

export const TEST_PASSWORD = 'Password123!';
let passwordHashPromise: Promise<string> | undefined;
let counter = 0;

export async function createUser(
  prisma: PrismaClient,
  role: Role,
  overrides: Partial<{
    username: string;
    email: string | null;
    studentCode: string | null;
    classId: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    mustChangePassword: boolean;
    fullName: string;
  }> = {},
) {
  counter += 1;
  passwordHashPromise ??= hashPassword(TEST_PASSWORD);
  const username = overrides.username ?? `${role.toLowerCase()}${counter}`;
  return prisma.user.create({
    data: {
      role,
      username,
      fullName: overrides.fullName ?? `Test ${role} ${counter}`,
      email: overrides.email === undefined ? `${username}@test.local` : overrides.email,
      studentCode:
        overrides.studentCode === undefined
          ? role === 'STUDENT'
            ? `T-${String(counter).padStart(4, '0')}`
            : null
          : overrides.studentCode,
      classId: overrides.classId ?? null,
      status: overrides.status ?? 'ACTIVE',
      mustChangePassword: overrides.mustChangePassword ?? false,
      passwordHash: await passwordHashPromise,
    },
  });
}

/** Signs in and returns a request helper that sends the session cookie and CSRF header. */
export async function loginAs(app: FastifyInstance, identifier: string, password = TEST_PASSWORD) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-requested-with': 'fetch' },
    payload: { identifier, password },
  });
  if (res.statusCode !== 200) throw new Error(`Login failed for ${identifier}: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'rt_session');
  if (!cookie) throw new Error('No session cookie returned');
  return client(app, `rt_session=${cookie.value}`);
}

export type Client = ReturnType<typeof client>;

export function client(app: FastifyInstance, cookie?: string) {
  const send = (method: InjectOptions['method'], url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { 'x-requested-with': 'fetch', ...(cookie ? { cookie } : {}) },
      ...(payload === undefined ? {} : { payload: payload as InjectOptions['payload'] }),
    });
  return {
    cookie,
    get: (url: string) => send('GET', url),
    post: (url: string, payload?: unknown) => send('POST', url, payload ?? {}),
    patch: (url: string, payload: unknown) => send('PATCH', url, payload),
    put: (url: string, payload: unknown) => send('PUT', url, payload),
    delete: (url: string) => send('DELETE', url),
  };
}

export async function createClass(prisma: PrismaClient, name = `Class ${++counter}`) {
  const generation = await prisma.generation.create({ data: { name: `Gen ${++counter}` } });
  return prisma.class.create({ data: { name, generationId: generation.id } });
}
