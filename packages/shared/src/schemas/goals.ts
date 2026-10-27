import { z } from 'zod';

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `Enter ${label}` })
    .int('Use a whole number')
    .min(min, `Must be at least ${min}`)
    .max(max, `Must be at most ${max}`);

/**
 * Personal reading goals. Upper limits are deliberately modest: the app encourages a steady
 * habit, not excessive reading time.
 */
export const readingGoalSchema = z.object({
  dailyMinutes: int(5, 240, 'daily minutes'),
  weeklyMinutes: int(10, 1680, 'weekly minutes'),
  daysPerWeek: int(1, 7, 'days per week'),
  monthlyBooks: z
    .preprocess((v) => (v === '' ? null : v), int(0, 20, 'books per month').nullable())
    .optional(),
});
export type ReadingGoalInput = z.infer<typeof readingGoalSchema>;
