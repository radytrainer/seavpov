import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BookCheck,
  BookOpen,
  CalendarDays,
  Clock,
  Flame,
  Library,
  NotebookPen,
  Play,
  Target,
  Timer,
} from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { apiGet, requireUser } from '@/lib/api/server';
import { minutes, toChartPoints, type StudentSummary } from '@/lib/analytics';
import { formatDate, formatTime } from '@/lib/format';
import type { ListResponse, ReadingSession, Reflection, StudentBook } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/states';
import { ChangeText, Stat } from '@/components/analytics/stat';
import { MinutesBarChart } from '@/components/analytics/minutes-bar-chart';
import { ReflectionList } from '@/components/reflections/reflection-list';
import { ReadingStatusBadge } from '@/components/books/book-bits';

export const metadata: Metadata = { title: 'Dashboard' };

function GoalRow({
  label,
  value,
  target,
  percent,
}: {
  label: string;
  value: string;
  target: string;
  percent: number | null;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value} / {target}
        </span>
      </div>
      <Progress value={percent ?? 0} label={`${label}: ${percent ?? 0}%`} />
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser('STUDENT');
  const [{ data: s }, active, sessions, books, reflections] = await Promise.all([
    apiGet<{ data: StudentSummary }>('/analytics/me'),
    apiGet<{ data: ReadingSession | null }>('/reading-sessions/active'),
    apiGet<ListResponse<ReadingSession>>('/reading-sessions?pageSize=5'),
    apiGet<ListResponse<StudentBook>>('/student-books?sort=recent&pageSize=4'),
    apiGet<ListResponse<Reflection>>('/reflections?pageSize=3'),
  ]);
  const firstName = user.fullName.split(' ')[0];
  const isNew = s.sessions.total === 0 && books.meta.total === 0;

  const startAction = active.data ? (
    <Button asChild size="lg">
      <Link href="/reading">
        <Timer aria-hidden /> Continue reading
      </Link>
    </Button>
  ) : (
    <Button asChild size="lg">
      <Link href={books.meta.total > 0 ? '/reading' : '/books'}>
        <Play aria-hidden /> Start reading
      </Link>
    </Button>
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hello, {firstName}</h1>
          <p className="text-sm text-muted-foreground">
            {active.data
              ? `You have a session in progress: ${active.data.book.title}.`
              : s.streak.current > 0
                ? `You have read ${s.streak.current} day${s.streak.current === 1 ? '' : 's'} in a row.`
                : 'Pick up your book and read a few pages today.'}
          </p>
        </div>
        {startAction}
      </div>

      {isNew ? (
        <EmptyState
          icon={Library}
          title="Welcome to your reading tracker"
          description="1. Add the physical book you borrowed from the library. 2. Start the timer when you read. 3. Write what you learned."
          action={
            <Button asChild>
              <Link href="/books">Add your first book</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          <section aria-label="Reading time" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              icon={Clock}
              label="Today"
              value={formatDuration(s.time.todaySeconds)}
              detail={`Goal ${s.goal.dailyMinutes} min`}
              progress={{ value: s.goal.progress.dailyPercent, label: 'Daily goal progress' }}
            />
            <Stat
              icon={CalendarDays}
              label="This week"
              value={formatDuration(s.time.weekSeconds)}
              detail={<ChangeText percent={s.time.weekChangePercent} period="last week" />}
              progress={{ value: s.goal.progress.weeklyPercent, label: 'Weekly goal progress' }}
            />
            <Stat
              icon={CalendarDays}
              label="This month"
              value={formatDuration(s.time.monthSeconds)}
              detail={<ChangeText percent={s.time.monthChangePercent} period="last month" />}
            />
            <Stat
              icon={Flame}
              label="Reading streak"
              value={`${s.streak.current} day${s.streak.current === 1 ? '' : 's'}`}
              detail={`Longest ${s.streak.longest} · min. ${s.minDailyMinutes} min a day`}
            />
          </section>

          <section
            aria-label="Totals"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            <Stat icon={BookOpen} label="Reading now" value={s.books.reading} />
            <Stat icon={BookCheck} label="Completed books" value={s.books.completed} />
            <Stat icon={Timer} label="Sessions" value={s.sessions.total} />
            <Stat label="Average session" value={formatDuration(s.sessions.averageSeconds)} />
            <Stat
              label="Pages read"
              value={s.pages.total}
              detail="When start and end pages are recorded"
              className="col-span-2 sm:col-span-1"
            />
          </section>

          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Last 7 days</CardTitle>
              </CardHeader>
              <CardContent>
                <MinutesBarChart
                  data={toChartPoints(s.last7Days, 'day', true)}
                  title="Reading minutes, last 7 days"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Target className="size-4" aria-hidden /> Goals
                </CardTitle>
                <Link href="/analytics#goals" className="text-sm text-primary hover:underline">
                  {s.goal.isDefault ? 'Set my goal' : 'Edit'}
                </Link>
              </CardHeader>
              <CardContent className="grid gap-4">
                <GoalRow
                  label="Today"
                  value={`${minutes(s.time.todaySeconds)} min`}
                  target={`${s.goal.dailyMinutes} min`}
                  percent={s.goal.progress.dailyPercent}
                />
                <GoalRow
                  label="This week"
                  value={`${minutes(s.time.weekSeconds)} min`}
                  target={`${s.goal.weeklyMinutes} min`}
                  percent={s.goal.progress.weeklyPercent}
                />
                <GoalRow
                  label="Reading days"
                  value={String(s.consistency.weekReadingDays)}
                  target={`${s.goal.daysPerWeek} days`}
                  percent={s.goal.progress.daysPercent}
                />
                {s.goal.monthlyBooks ? (
                  <GoalRow
                    label="Books this month"
                    value={String(s.books.completedThisMonth)}
                    target={String(s.goal.monthlyBooks)}
                    percent={s.goal.progress.monthlyBooksPercent}
                  />
                ) : null}
                {s.goal.isDefault && (
                  <p className="text-xs text-muted-foreground">
                    Using your school’s default goals.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent sessions</CardTitle>
                <Link href="/history" className="text-sm text-primary hover:underline">
                  History
                </Link>
              </CardHeader>
              <CardContent>
                {sessions.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sessions yet. Start the timer when you open your book.
                  </p>
                ) : (
                  <ul className="divide-y text-sm">
                    {sessions.data.map((x) => (
                      <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{x.book.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(x.readingDate)} · {formatTime(x.startedAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block tabular-nums">
                            {x.status === 'COMPLETED'
                              ? formatDuration(x.durationSeconds)
                              : 'In progress'}
                          </span>
                          {x.status === 'COMPLETED' && !x.reflectionId && (
                            <Link
                              href={`/reflections/new?session=${x.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              Reflect
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recently updated books</CardTitle>
                <Link href="/books" className="text-sm text-primary hover:underline">
                  My Books
                </Link>
              </CardHeader>
              <CardContent>
                {books.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No books yet.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {books.data.map((b) => (
                      <li key={b.id} className="py-2">
                        <Link
                          href={`/books/${b.id}`}
                          className="flex items-center justify-between gap-3 hover:underline"
                        >
                          <span className="min-w-0 truncate font-medium">{b.book.title}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {b.progressPercent !== null && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {b.progressPercent}%
                              </span>
                            )}
                            <ReadingStatusBadge status={b.status} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <section aria-labelledby="recent-reflections" className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2
                id="recent-reflections"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <NotebookPen className="size-4" aria-hidden /> Recent reflections
              </h2>
              <Link href="/reflections" className="text-sm text-primary hover:underline">
                All reflections
              </Link>
            </div>
            {reflections.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                After a session, write what you learned — it helps you remember.
              </p>
            ) : (
              <ReflectionList
                reflections={reflections.data}
                hrefFor={(r) => `/reflections/${r.id}`}
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
