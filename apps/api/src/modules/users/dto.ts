import { z } from 'zod';
import { GENDERS, ROLES, USER_STATUSES } from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';

/** Fields safe to return to clients (never the password hash or lockout internals). */
export const userSelect = {
  id: true,
  role: true,
  status: true,
  username: true,
  email: true,
  studentCode: true,
  fullName: true,
  gender: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  class: {
    select: { id: true, name: true, generation: { select: { id: true, name: true } } },
  },
} satisfies Prisma.UserSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export const userDtoSchema = z.object({
  id: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  username: z.string(),
  email: z.string().nullable(),
  studentCode: z.string().nullable(),
  fullName: z.string(),
  gender: z.enum(GENDERS).nullable(),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.date().nullable(),
  createdAt: z.date(),
  class: z
    .object({
      id: z.string(),
      name: z.string(),
      generation: z.object({ id: z.string(), name: z.string() }),
    })
    .nullable(),
});
