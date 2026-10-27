import { z } from 'zod';

const page = z.coerce
  .number({ error: 'Enter a page number' })
  .int('Use a whole page number')
  .min(0, 'Page cannot be negative')
  .max(10_000);

const optionalPage = z.preprocess((v) => (v === '' ? null : v), page.nullable()).optional();

const note = z
  .preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(2000, 'At most 2000 characters').nullable(),
  )
  .optional();

const timestamp = z.iso.datetime({ offset: true, error: 'Enter a valid date and time' });

function pagesInOrder(v: { startPage?: number | null; endPage?: number | null }) {
  return v.startPage == null || v.endPage == null || v.endPage >= v.startPage;
}
const pageOrderIssue = {
  path: ['endPage'],
  message: 'End page must be the same as or after the start page',
};

export const startSessionSchema = z.object({
  studentBookId: z.uuid(),
  /** Defaults to the book's current page. */
  startPage: optionalPage,
});
export type StartSessionInput = z.infer<typeof startSessionSchema>;

export const finishSessionSchema = z.object({
  endPage: optionalPage,
  note,
  /** Also mark the book as completed. */
  markBookCompleted: z.boolean().optional(),
});
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;

export const manualSessionSchema = z
  .object({
    studentBookId: z.uuid(),
    startedAt: timestamp,
    endedAt: timestamp,
    startPage: optionalPage,
    endPage: optionalPage,
    note,
  })
  .refine((v) => new Date(v.endedAt) > new Date(v.startedAt), {
    path: ['endedAt'],
    message: 'End time must be after the start time',
  })
  .refine(pagesInOrder, pageOrderIssue);
export type ManualSessionInput = z.infer<typeof manualSessionSchema>;

export const updateSessionSchema = z
  .object({
    startPage: optionalPage,
    endPage: optionalPage,
    note,
    /** Manual sessions only: timed sessions keep their server-recorded timestamps. */
    startedAt: timestamp.optional(),
    endedAt: timestamp.optional(),
  })
  .refine(pagesInOrder, pageOrderIssue);
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
