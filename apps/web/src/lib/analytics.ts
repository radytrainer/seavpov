// Types and formatting for analytics responses.
import type { MinutesPoint } from '@/components/analytics/minutes-bar-chart';

export interface SeriesPoint {
  period: string;
  seconds: number;
  sessions: number;
  pages: number;
  readingDays: number;
}

export interface StudentSummary {
  today: string;
  timeZone: string;
  minDailyMinutes: number;
  time: {
    todaySeconds: number;
    weekSeconds: number;
    monthSeconds: number;
    lastWeekSeconds: number;
    lastMonthSeconds: number;
    weekChangePercent: number | null;
    monthChangePercent: number | null;
    totalSeconds: number;
  };
  sessions: { total: number; averageSeconds: number; thisWeek: number };
  pages: { total: number; thisWeek: number; thisMonth: number };
  books: {
    reading: number;
    planned: number;
    completed: number;
    started: number;
    completedThisMonth: number;
  };
  streak: { current: number; longest: number };
  consistency: { weekReadingDays: number; monthPercent: number; lastReadingDate: string | null };
  reflections: { total: number; completionPercent: number };
  goal: Goal & {
    progress: {
      dailyPercent: number | null;
      weeklyPercent: number | null;
      daysPercent: number | null;
      monthlyBooksPercent: number | null;
    };
  };
  last7Days: SeriesPoint[];
}

export interface Goal {
  id: string | null;
  dailyMinutes: number;
  weeklyMinutes: number;
  daysPerWeek: number;
  monthlyBooks: number | null;
  effectiveFrom: string | null;
  isDefault: boolean;
}

export interface Trends {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  series: SeriesPoint[];
  totals: {
    seconds: number;
    sessions: number;
    pages: number;
    readingDays: number;
    averageSessionSeconds: number;
    sessionsPerWeek: number;
    consistencyPercent: number;
  };
}

const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};
const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
const weekday = fmt({ weekday: 'short' });
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const full = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthYear = fmt({ month: 'long', year: 'numeric' });
const monthShort = fmt({ month: 'short' });

export function toChartPoints(
  series: SeriesPoint[],
  granularity: Trends['granularity'],
  short = false,
): MinutesPoint[] {
  return series.map((p) => {
    const d = utc(p.period);
    const minutes = Math.round(p.seconds / 60);
    if (granularity === 'month') {
      return { label: monthShort.format(d), fullLabel: monthYear.format(d), minutes };
    }
    if (granularity === 'week') {
      return { label: dayMonth.format(d), fullLabel: `Week of ${full.format(d)}`, minutes };
    }
    return {
      label: short ? weekday.format(d) : dayMonth.format(d),
      fullLabel: full.format(d),
      minutes,
    };
  });
}

export function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}
