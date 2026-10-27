import { z } from 'zod';

const text = (max: number) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z.string().trim().max(max, `At most ${max} characters`).nullable(),
    )
    .optional();

export const REFLECTION_TEXT_FIELDS = [
  'whatRead',
  'learned',
  'keyIdeas',
  'application',
  'keyTakeaway',
] as const;

export const REFLECTION_LABELS = {
  whatRead: 'What did I read?',
  learned: 'What did I learn?',
  keyIdeas: 'What are the key ideas?',
  application: 'How can I apply this knowledge?',
  keyTakeaway: 'Key takeaway',
  understandingRating: 'How well did I understand it?',
} as const;

export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40, 'Tags can be at most 40 characters')
  .transform((v) => v.normalize('NFC').toLowerCase().replace(/\s+/g, ' '));

const reflectionFields = {
  whatRead: text(4000),
  learned: text(4000),
  keyIdeas: text(4000),
  application: text(4000),
  keyTakeaway: text(500),
  understandingRating: z
    .preprocess(
      (v) => (v === '' ? null : v),
      z.coerce.number().int().min(1, 'Choose 1 to 5').max(5, 'Choose 1 to 5').nullable(),
    )
    .optional(),
  tags: z
    .array(tagSchema)
    .max(10, 'At most 10 tags')
    .transform((tags) => [...new Set(tags)])
    .optional(),
};

/** Reflections may be partial, but not completely empty. */
function hasContent(v: Record<string, unknown>) {
  return (
    REFLECTION_TEXT_FIELDS.some((f) => typeof v[f] === 'string' && (v[f] as string).length > 0) ||
    v.understandingRating != null
  );
}

export const createReflectionSchema = z
  .object({ sessionId: z.uuid(), ...reflectionFields })
  .refine(hasContent, { message: 'Write at least one answer', path: ['whatRead'] });
export type CreateReflectionInput = z.infer<typeof createReflectionSchema>;

export const updateReflectionSchema = z.object(reflectionFields);
export type UpdateReflectionInput = z.infer<typeof updateReflectionSchema>;

export const feedbackSchema = z.object({
  body: z.string().trim().min(1, 'Write your feedback').max(2000, 'At most 2000 characters'),
});
