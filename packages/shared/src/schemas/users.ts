import { z } from 'zod';
import { GENDERS, ROLES, USER_STATUSES } from '../enums';
import { passwordSchema } from './auth';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dot, dash or underscore only')
  .transform((v) => v.toLowerCase());

export const studentCodeSchema = z
  .string()
  .trim()
  .min(1, 'Student ID is required')
  .max(32)
  .regex(/^[A-Za-z0-9-_/]+$/, 'Student ID may contain letters, numbers, - _ /')
  .transform((v) => v.toUpperCase());

const emailField = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.toLowerCase());

/** Empty strings from forms/CSV become null. */
const blankToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), schema.nullable());

export const adminCreateUserSchema = z
  .object({
    role: z.enum(ROLES),
    username: usernameSchema,
    fullName: z.string().trim().min(1, 'Full name is required').max(150),
    email: blankToNull(emailField).optional(),
    studentCode: blankToNull(studentCodeSchema).optional(),
    gender: blankToNull(z.enum(GENDERS)).optional(),
    classId: blankToNull(z.uuid()).optional(),
    /** Omit to generate a temporary password that must be changed at first login. */
    password: passwordSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'STUDENT' && !v.studentCode) {
      ctx.addIssue({ code: 'custom', path: ['studentCode'], message: 'Student ID is required' });
    }
    if (v.role !== 'STUDENT' && v.studentCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['studentCode'],
        message: 'Only students have a student ID',
      });
    }
  });
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  username: usernameSchema.optional(),
  fullName: z.string().trim().min(1).max(150).optional(),
  email: blankToNull(emailField).optional(),
  studentCode: blankToNull(studentCodeSchema).optional(),
  gender: blankToNull(z.enum(GENDERS)).optional(),
  classId: blankToNull(z.uuid()).optional(),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

/** Public student self-registration (only accepted while an administrator has enabled it). */
export const registerSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required').max(150),
  studentCode: studentCodeSchema,
  /** Optional: derived from the student ID when omitted (students can sign in with the ID). */
  username: usernameSchema.optional(),
  email: blankToNull(emailField).optional(),
  gender: blankToNull(z.enum(GENDERS)).optional(),
  classId: z.uuid('Choose your class'),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;
