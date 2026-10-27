/**
 * Pure metric calculations. Definitions are documented in docs/METRICS.md; the API computes the
 * inputs (per-day totals from COMPLETED sessions) with SQL and uses these helpers so the rules
 * are unit-tested in one place.
 */
import {
  addDays,
  dateRange,
  diffDays,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  type IsoDate,
} from './dates';

export interface DayTotal {
  date: IsoDate;
  seconds: number;
  sessions: number;
  pages: number;
}

/** Days whose completed reading time meets the configured minimum. */
export function qualifyingDays(days: DayTotal[], minSeconds: number): IsoDate[] {
  return days
    .filter((d) => d.seconds >= minSeconds)
    .map((d) => d.date)
    .sort();
}

/**
 * Current streak: consecutive reading days ending today, or ending yesterday if today has no
 * qualifying reading yet (the streak is not broken until the day is over).
 * Longest streak: longest run of consecutive reading days ever.
 */
export function streaks(
  readingDays: IsoDate[],
  today: IsoDate,
): { current: number; longest: number } {
  const days = [...new Set(readingDays)].filter((d) => d <= today).sort();
  let longest = 0;
  let run = 0;
  let prev: IsoDate | null = null;
  for (const d of days) {
    run = prev !== null && diffDays(prev, d) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/** Share (0–100) of days in [from, to] that are reading days. */
export function consistencyPercent(readingDays: IsoDate[], from: IsoDate, to: IsoDate): number {
  if (to < from) return 0;
  const total = diffDays(from, to) + 1;
  const inRange = new Set(readingDays.filter((d) => d >= from && d <= to)).size;
  return Math.round((inRange / total) * 100);
}

export function percentOf(value: number, target: number | null | undefined): number | null {
  if (!target || target <= 0) return null;
  return Math.min(100, Math.round((value / target) * 100));
}

/** Change from previous to current, as a whole percentage (null when previous is 0). */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface Period {
  from: IsoDate;
  to: IsoDate;
}

export function periodBounds(today: IsoDate) {
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const prevMonthEnd = addDays(monthStart, -1);
  return {
    today: { from: today, to: today },
    week: { from: weekStart, to: addDays(weekStart, 6) },
    lastWeek: { from: addDays(weekStart, -7), to: addDays(weekStart, -1) },
    month: { from: monthStart, to: endOfMonth(today) },
    lastMonth: { from: startOfMonth(prevMonthEnd), to: prevMonthEnd },
  } satisfies Record<string, Period>;
}

export function sumInPeriod(days: DayTotal[], period: Period) {
  let seconds = 0;
  let sessions = 0;
  let pages = 0;
  for (const d of days) {
    if (d.date >= period.from && d.date <= period.to) {
      seconds += d.seconds;
      sessions += d.sessions;
      pages += d.pages;
    }
  }
  return { seconds, sessions, pages };
}

export type Granularity = 'day' | 'week' | 'month';

/** Buckets daily totals into a continuous series (empty buckets included). */
export function buildSeries(
  days: DayTotal[],
  from: IsoDate,
  to: IsoDate,
  granularity: Granularity,
  minSeconds: number,
) {
  const keyOf = (d: IsoDate) =>
    granularity === 'day' ? d : granularity === 'week' ? startOfWeek(d) : startOfMonth(d);
  const buckets = new Map<
    string,
    { period: string; seconds: number; sessions: number; pages: number; readingDays: number }
  >();
  for (const d of dateRange(from, to)) {
    const k = keyOf(d);
    if (!buckets.has(k))
      buckets.set(k, { period: k, seconds: 0, sessions: 0, pages: 0, readingDays: 0 });
  }
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    const b = buckets.get(keyOf(d.date));
    if (!b) continue;
    b.seconds += d.seconds;
    b.sessions += d.sessions;
    b.pages += d.pages;
    if (d.seconds >= minSeconds) b.readingDays += 1;
  }
  return [...buckets.values()];
}
