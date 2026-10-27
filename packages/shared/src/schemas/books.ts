import { z } from 'zod';
import { CATALOG_STATUSES, READING_STATUSES } from '../enums';

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalTrimmed = (max: number) =>
  z
    .preprocess(blank, z.string().trim().max(max, `Must be at most ${max} characters`).nullable())
    .optional();

const pagesField = z.preprocess(
  (v) => (v === '' || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
  z
    .number({ error: 'Enter a number' })
    .int('Use whole pages')
    .min(1, 'Must be at least 1 page')
    .max(10_000, 'That is more pages than expected')
    .nullable(),
);

/** ISBN-10/13 with optional hyphens/spaces; stored without separators. */
export const isbnSchema = z.preprocess(
  blank,
  z
    .string()
    .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
    .refine((v) => /^(\d{9}[\dX]|\d{13})$/.test(v), 'Enter a valid 10- or 13-digit ISBN')
    .nullable(),
);

export const coverImageUrlSchema = z.preprocess(
  blank,
  z
    .url('Enter a valid URL')
    .max(500)
    .refine((v) => v.startsWith('https://'), 'Use an https:// image link')
    .nullable(),
);

export const libraryBookInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  author: optionalTrimmed(200),
  categoryId: z.preprocess(blank, z.uuid().nullable()).optional(),
  isbn: isbnSchema.optional(),
  libraryCode: optionalTrimmed(50),
  totalPages: pagesField.optional(),
  coverImageUrl: coverImageUrlSchema.optional(),
});
export type LibraryBookInput = z.infer<typeof libraryBookInputSchema>;

export const libraryBookUpdateSchema = libraryBookInputSchema.partial().extend({
  status: z.enum(CATALOG_STATUSES).optional(),
  archived: z.boolean().optional(),
});

export const studentBookCreateSchema = z
  .object({
    /** Existing catalog book… */
    libraryBookId: z.uuid().optional(),
    /** …or a new catalog entry (created as PENDING for students). */
    newBook: libraryBookInputSchema.optional(),
    status: z.enum(['PLANNED', 'READING']).default('PLANNED'),
    notes: optionalTrimmed(2000),
  })
  .refine((v) => Boolean(v.libraryBookId) !== Boolean(v.newBook), {
    message: 'Choose a catalog book or enter a new book',
    path: ['libraryBookId'],
  });
export type StudentBookCreateInput = z.infer<typeof studentBookCreateSchema>;

export const studentBookUpdateSchema = z.object({
  currentPage: z.coerce.number().int().min(0, 'Page cannot be negative').max(10_000).optional(),
  /** Overrides the catalog page count for this student's copy. */
  totalPages: pagesField.optional(),
  notes: optionalTrimmed(2000),
  archived: z.boolean().optional(),
});
export type StudentBookUpdateInput = z.infer<typeof studentBookUpdateSchema>;

export const studentBookStatusSchema = z.object({ status: z.enum(READING_STATUSES) });

export const STUDENT_BOOK_SORTS = ['recent', 'title', 'started'] as const;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

/** Key used to detect duplicate catalog entries (same title + author, case/space-insensitive). */
export function normalizedBookKey(title: string, author?: string | null): string {
  const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${norm(title)}|${author ? norm(author) : ''}`;
}

export function progressPercent(currentPage: number, totalPages: number | null): number | null {
  if (!totalPages) return null;
  return Math.min(100, Math.round((currentPage / totalPages) * 100));
}
