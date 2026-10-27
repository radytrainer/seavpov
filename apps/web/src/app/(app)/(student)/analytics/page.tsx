import type { Metadata } from 'next';
import Link from 'next/link';
import { addDays, formatDuration, startOfMonth, startOfWeek } from '@rt/shared';
import { apiGet } from '@/lib/api/server';
import { toChartPoints, type Goal, type StudentSummary, type Trends } from '@/lib/analytics';
import { param, type RawSearchParams } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/states';
import { ChangeText, Stat } from '@/components/analytics/stat';
import { MinutesBarChart } from '@/components/analytics/minutes-bar-chart';
import { GoalForm } from './goal-form';

export const metadata: Metadata = { title: 'My Analytics' };

const RANGES = {
  '30d': { label: 'Last 30 days', granularity: 'day' },
  '12w': { label: 'Last 12 weeks', granularity: 'week' },
  '12m': { label: 'Last 12 months', granularity: 'month' },
} as const;
type RangeKey = keyof typeof RANGES;

function rangeDates(key: RangeKey, today: string) {
  if (key === '12w') return { from: addDays(startOfWeek(today), -77), to: today };
  if (key === '12m') {
    const [y, m] = today.split('-').map(Number);
    const start = new Date(Date.UTC(y!, m! - 12, 1)).toISOString().slice(0, 10);
    return { from: startOfMonth(start), to: today };
  }
  return { from: addDays(today, -29), to: today };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const rangeKey = (param(sp, 'range') ?? '30d') as RangeKey;
  const range = RANGES[rangeKey] ?? RANGES['30d'];
  const [{ data: s }, goals] = await Promise.all([
    apiGet<{ data: StudentSummary }>('/analytics/me'),
    apiGet<{ data: { current: Goal; defaults: Goal } }>('/reading-goals'),
  ]);
  const { from, to } = rangeDates(RANGES[rangeKey] ? rangeKey : '30d', s.today);
  const { data: t } = await apiGet<{ data: Trends }>(
    `/analytics/reading-trends?from=${from}&to=${to}&granularity=${range.granularity}`,
  );
  const completedVsStarted =
    s.books.started > 0 ? Math.round((s.books.completed / s.books.started) * 100) : 0;

  return (
    <>
      <PageHeader
        title="My Analytics"
        description="Your reading habits over time. Only finished sessions count."
      />

      <nav aria-label="Time range" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <Link
            key={k}
            href={`/analytics?range=${k}`}
            aria-current={k === rangeKey ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              k === rangeKey
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'hover:bg-muted',
            )}
          >
            {RANGES[k].label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Reading time · {range.label.toLowerCase()}</CardTitle>
            <CardDescription>Minutes per {range.granularity}</CardDescription>
          </CardHeader>
          <CardContent>
            <MinutesBarChart
              data={toChartPoints(t.series, t.granularity)}
              title={`Reading minutes per ${range.granularity}, ${range.label}`}
              height={220}
            />
          </CardContent>
        </Card>

        <section aria-label="Range totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Total time"
            value={formatDuration(t.totals.seconds)}
            detail={`${t.totals.sessions} session${t.totals.sessions === 1 ? '' : 's'}`}
          />
          <Stat
            label="Reading days"
            value={t.totals.readingDays}
            detail={`Consistency ${t.totals.consistencyPercent}%`}
          />
          <Stat
            label="Average session"
            value={formatDuration(t.totals.averageSessionSeconds)}
            detail={`${t.totals.sessionsPerWeek} sessions per week`}
          />
          <Stat label="Pages read" value={t.totals.pages} />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Habits</CardTitle>
              <CardDescription>
                A reading day has at least {s.minDailyMinutes} minutes of reading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                {[
                  ['Current streak', `${s.streak.current} days`],
                  ['Longest streak', `${s.streak.longest} days`],
                  ['This month’s consistency', `${s.consistency.monthPercent}%`],
                  [
                    'This week vs last week',
                    <ChangeText key="w" percent={s.time.weekChangePercent} period="last week" />,
                  ],
                  [
                    'This month vs last month',
                    <ChangeText key="m" percent={s.time.monthChangePercent} period="last month" />,
                  ],
                  [
                    'Books completed / started',
                    `${s.books.completed} / ${s.books.started} (${completedVsStarted}%)`,
                  ],
                  [
                    'Reflections written',
                    `${s.reflections.total} (${s.reflections.completionPercent}% of sessions)`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex justify-between gap-3 border-b pb-2 last:border-0"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card id="goals" className="scroll-mt-20">
            <CardHeader>
              <CardTitle>My reading goal</CardTitle>
              <CardDescription>
                {goals.data.current.isDefault
                  ? 'You are using your school’s default goal. Set one that fits you.'
                  : `In effect since ${goals.data.current.effectiveFrom}.`}{' '}
                A steady habit matters more than long sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GoalForm goal={goals.data.current} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
