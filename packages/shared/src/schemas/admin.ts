import { z } from 'zod';
import { isValidTimeZone } from '../dates';

export const generationInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  startYear: z
    .preprocess(
      (v) => (v === '' ? null : v),
      z.coerce.number().int().min(1990).max(2100).nullable(),
    )
    .optional(),
});

export const classInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  generationId: z.uuid('Choose a generation'),
});

const int = (min: number, max: number) =>
  z.coerce
    .number({ error: 'Enter a number' })
    .int('Use a whole number')
    .min(min, `At least ${min}`)
    .max(max, `At most ${max}`);

export const settingsSchema = z
  .object({
    institutionName: z.string().trim().min(1).max(150),
    timeZone: z
      .string()
      .refine(isValidTimeZone, 'Unknown time zone (use an IANA name such as Asia/Phnom_Penh)'),
    minDailyMinutes: int(1, 120),
    defaultDailyMinutes: int(5, 240),
    defaultWeeklyMinutes: int(10, 1680),
    defaultDaysPerWeek: int(1, 7),
    defaultMonthlyBooks: z.preprocess((v) => (v === '' ? null : v), int(0, 20).nullable()),
    maxSessionMinutes: int(30, 600),
    manualEntryMaxDays: int(0, 60),
    inactiveAfterDays: int(1, 60),
    selfRegistrationEnabled: z.boolean(),
  })
  .partial();
export type SettingsInput = z.infer<typeof settingsSchema>;
