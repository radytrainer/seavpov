import { z } from 'zod';

export const uuidSchema = z.uuid();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid date');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Trims, and converts empty strings to undefined (for optional text inputs). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

/** Like optionalText but maps empty input to null so PATCH can clear a field. */
export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const requiredText = (max: number, label = 'This field') =>
  z.string().trim().min(1, `${label} is required`).max(max, `Must be at most ${max} characters`);

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}
