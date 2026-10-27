import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toLocalDate, type ReadingGoalInput } from '@rt/shared';
import type { PrismaClient, SystemSettings } from '../../generated/prisma/client';
import { notFound } from '../../lib/errors';
import { getSettings } from '../../lib/settings';

export const goalDto = z.object({
  id: z.string().nullable(),
  dailyMinutes: z.number(),
  weeklyMinutes: z.number(),
  daysPerWeek: z.number(),
  monthlyBooks: z.number().nullable(),
  effectiveFrom: z.string().nullable(),
  /** True when the student has not set a goal and institution defaults apply. */
  isDefault: z.boolean(),
});
export type GoalDto = z.infer<typeof goalDto>;

const goalSelect = {
  id: true,
  dailyMinutes: true,
  weeklyMinutes: true,
  daysPerWeek: true,
  monthlyBooks: true,
  effectiveFrom: true,
} as const;

export function defaultGoal(settings: SystemSettings): GoalDto {
  return {
    id: null,
    dailyMinutes: settings.defaultDailyMinutes,
    weeklyMinutes: settings.defaultWeeklyMinutes,
    daysPerWeek: settings.defaultDaysPerWeek,
    monthlyBooks: settings.defaultMonthlyBooks,
    effectiveFrom: null,
    isDefault: true,
  };
}

function toDto(row: {
  id: string;
  dailyMinutes: number;
  weeklyMinutes: number;
  daysPerWeek: number;
  monthlyBooks: number | null;
  effectiveFrom: Date;
}): GoalDto {
  return { ...row, effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10), isDefault: false };
}

/** Goal in effect on `date` (latest effective_from ≤ date), or institution defaults. */
export async function effectiveGoal(
  prisma: PrismaClient,
  studentId: string,
  settings: SystemSettings,
  date: string,
): Promise<GoalDto> {
  const row = await prisma.readingGoal.findFirst({
    where: { studentId, effectiveFrom: { lte: new Date(`${date}T00:00:00Z`) } },
    orderBy: { effectiveFrom: 'desc' },
    select: goalSelect,
  });
  return row ? toDto(row) : defaultGoal(settings);
}

export async function getGoals(app: FastifyInstance, studentId: string) {
  const settings = await getSettings(app.prisma);
  const today = toLocalDate(app.now(), settings.timeZone);
  const [current, history] = await Promise.all([
    effectiveGoal(app.prisma, studentId, settings, today),
    app.prisma.readingGoal.findMany({
      where: { studentId },
      orderBy: { effectiveFrom: 'desc' },
      take: 24,
      select: goalSelect,
    }),
  ]);
  return { current, history: history.map(toDto), defaults: defaultGoal(settings) };
}

/** Sets the goal from today on. Changing it twice on the same day updates today's row. */
export async function setGoal(app: FastifyInstance, studentId: string, input: ReadingGoalInput) {
  const settings = await getSettings(app.prisma);
  const today = toLocalDate(app.now(), settings.timeZone);
  const effectiveFrom = new Date(`${today}T00:00:00Z`);
  const data = { ...input, monthlyBooks: input.monthlyBooks ?? null };
  const row = await app.prisma.readingGoal.upsert({
    where: { studentId_effectiveFrom: { studentId, effectiveFrom } },
    update: data,
    create: { studentId, effectiveFrom, ...data },
    select: goalSelect,
  });
  return toDto(row);
}

export async function updateGoal(
  app: FastifyInstance,
  studentId: string,
  id: string,
  input: ReadingGoalInput,
) {
  const updated = await app.prisma.readingGoal.updateMany({
    where: { id, studentId },
    data: { ...input, monthlyBooks: input.monthlyBooks ?? null },
  });
  if (updated.count === 0) throw notFound('Goal');
  const row = await app.prisma.readingGoal.findUniqueOrThrow({ where: { id }, select: goalSelect });
  return toDto(row);
}

/** Effective goals for many students with a single query. */
export async function effectiveGoalsFor(
  prisma: PrismaClient,
  studentIds: string[],
  settings: SystemSettings,
  date: string,
): Promise<Map<string, GoalDto>> {
  const rows = await prisma.readingGoal.findMany({
    where: { studentId: { in: studentIds }, effectiveFrom: { lte: new Date(`${date}T00:00:00Z`) } },
    orderBy: { effectiveFrom: 'desc' },
    select: { ...goalSelect, studentId: true },
  });
  const result = new Map<string, GoalDto>();
  for (const { studentId, ...row } of rows) {
    if (!result.has(studentId)) result.set(studentId, toDto(row));
  }
  for (const id of studentIds) if (!result.has(id)) result.set(id, defaultGoal(settings));
  return result;
}
