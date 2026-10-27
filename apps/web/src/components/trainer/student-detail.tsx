import Link from 'next/link';
import { ArrowLeft, FileDown, NotebookPen } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { apiGet } from '@/lib/api/server';
import { toChartPoints, type StudentSummary } from '@/lib/analytics';
import { formatDate, formatTime } from '@/lib/format';
import { withQuery } from '@/lib/search-params';
import type { ListResponse, ReadingSession, Reflection, StudentBook, UserDto } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/states';
import { Stat } from '@/components/analytics/stat';
import { MinutesBarChart } from '@/components/analytics/minutes-bar-chart';
import { ReadingStatusBadge } from '@/components/books/book-bits';
import { ReflectionCard } from '@/components/reflections/reflection-card';
import { PdfLink } from '@/components/reflections/pdf-link';
import { VoidSessionButton } from './void-session-button';

export const STUDENT_TABS = ['overview', 'reflections', 'sessions', 'books'] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

interface Props {
  studentId: string;
  /** Path of this page without query, e.g. /trainer/students/<id>. */
  basePath: string;
  backHref: string;
  reportsBase: string;
  tab: StudentTab;
  page: number;
  needsFeedback: boolean;
  viewerId: string;
  /** Administrators can void sessions (and see voided ones). */
  canVoid?: boolean;
}

function BookProgressList({ books }: { books: StudentBook[] }) {
  return (
    <ul className="divide-y text-sm">
      {books.map((b) => (
        <li key={b.id} className="grid gap-1.5 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-medium">{b.book.title}</span>
              <span className="text-xs text-muted-foreground">
                {b.book.author ?? 'Unknown author'} · page {b.currentPage}
                {b.totalPages ? ` of ${b.totalPages}` : ''} · last read {formatDate(b.lastReadAt)}
              </span>
            </span>
            <ReadingStatusBadge status={b.status} />
          </div>
          {b.progressPercent !== null && (
            <div className="flex items-center gap-2">
              <Progress
                value={b.progressPercent}
                label={`${b.book.title} progress`}
                className="h-1.5"
              />
              <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {b.progressPercent}%
              </span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Read-only student overview for trainers and administrators, organised in tabs. */
export async function StudentDetail({
  studentId,
  basePath,
  backHref,
  reportsBase,
  tab,
  page,
  needsFeedback,
  viewerId,
  canVoid = false,
}: Props) {
  const [{ data }, pending] = await Promise.all([
    apiGet<{ data: { student: UserDto; summary: StudentSummary } }>(
      `/trainer/students/${studentId}/summary`,
    ),
    apiGet<ListResponse<Reflection>>(
      `/reflections?studentId=${studentId}&needsFeedback=true&pageSize=1`,
    ),
  ]);
  const { student, summary: s } = data;
  const tabHref = (t: StudentTab, extra: Record<string, string | number | undefined> = {}) =>
    withQuery(basePath, { tab: t === 'overview' ? undefined : t, ...extra });
  const labels: Record<StudentTab, string> = {
    overview: 'Overview',
    reflections: `Reflections (${s.reflections.total})`,
    sessions: `Sessions (${s.sessions.total})`,
    books: 'Books',
  };

  return (
    <>
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Students
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{student.fullName}</h1>
          <p className="text-sm text-muted-foreground">
            {student.studentCode} ·{' '}
            {student.class
              ? `${student.class.name} · ${student.class.generation.name}`
              : 'No class'}
            {student.status === 'INACTIVE' && ' · account inactive'}
          </p>
        </div>
        <Button asChild variant="outline">
          <a
            href={`/api/v1${reportsBase}/sessions?studentId=${student.id}&from=${s.today.slice(0, 4)}-01-01`}
            download
          >
            <FileDown aria-hidden /> Export reading history
          </a>
        </Button>
      </div>

      <nav aria-label="Student sections" className="mb-5 flex gap-1 overflow-x-auto border-b">
        {STUDENT_TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            aria-current={t === tab ? 'page' : undefined}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
              t === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {labels[t]}
            {t === 'reflections' && pending.meta.total > 0 && (
              <span className="rounded-full bg-warning/15 px-1.5 text-xs text-warning-foreground">
                {pending.meta.total} new
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <OverviewTab
          studentId={studentId}
          summary={s}
          studentName={student.fullName}
          reflectionsHref={tabHref('reflections')}
          booksHref={tabHref('books')}
          viewerId={viewerId}
        />
      )}
      {tab === 'reflections' && (
        <ReflectionsTab
          studentId={studentId}
          page={page}
          needsFeedback={needsFeedback}
          viewerId={viewerId}
          hrefFor={(p, nf) =>
            tabHref('reflections', {
              page: p > 1 ? p : undefined,
              needsFeedback: nf ? 'true' : undefined,
            })
          }
        />
      )}
      {tab === 'sessions' && (
        <SessionsTab
          studentId={studentId}
          page={page}
          canVoid={canVoid}
          hrefFor={(p) => tabHref('sessions', { page: p })}
        />
      )}
      {tab === 'books' && <BooksTab studentId={studentId} />}
    </>
  );
}

async function OverviewTab({
  studentId,
  summary: s,
  studentName,
  reflectionsHref,
  booksHref,
  viewerId,
}: {
  studentId: string;
  summary: StudentSummary;
  studentName: string;
  reflectionsHref: string;
  booksHref: string;
  viewerId: string;
}) {
  const [current, latest] = await Promise.all([
    apiGet<ListResponse<StudentBook>>(
      `/student-books?studentId=${studentId}&status=READING&sort=recent&pageSize=3`,
    ),
    apiGet<ListResponse<Reflection>>(`/reflections?studentId=${studentId}&pageSize=2`),
  ]);
  return (
    <div className="grid gap-5">
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="This week"
          value={formatDuration(s.time.weekSeconds)}
          detail={`Goal ${s.goal.weeklyMinutes} min${s.goal.isDefault ? ' (default)' : ''}`}
          progress={{ value: s.goal.progress.weeklyPercent, label: 'Weekly goal' }}
        />
        <Stat
          label="This month"
          value={formatDuration(s.time.monthSeconds)}
          detail={`Consistency ${s.consistency.monthPercent}%`}
        />
        <Stat
          label="Reading streak"
          value={`${s.streak.current} days`}
          detail={`Longest ${s.streak.longest}`}
        />
        <Stat
          label="Books"
          value={`${s.books.reading} reading`}
          detail={`${s.books.completed} completed · last read ${formatDate(s.consistency.lastReadingDate)}`}
        />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <MinutesBarChart
              data={toChartPoints(s.last7Days, 'day', true)}
              title={`Reading minutes of ${studentName}, last 7 days`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Reading now</CardTitle>
            <Link href={booksHref} className="text-sm text-primary hover:underline">
              All books
            </Link>
          </CardHeader>
          <CardContent>
            {current.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No book in progress.</p>
            ) : (
              <BookProgressList books={current.data} />
            )}
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="latest-reflections" className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 id="latest-reflections" className="flex items-center gap-2 text-base font-semibold">
            <NotebookPen className="size-4" aria-hidden /> Latest reflections
          </h2>
          <Link href={reflectionsHref} className="text-sm text-primary hover:underline">
            All reflections
          </Link>
        </div>
        {latest.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reflections yet.</p>
        ) : (
          latest.data.map((r) => (
            <ReflectionCard key={r.id} reflection={r} reviewerId={viewerId} canGiveFeedback />
          ))
        )}
      </section>
    </div>
  );
}

const REFLECTIONS_PAGE = 10;

async function ReflectionsTab({
  studentId,
  page,
  needsFeedback,
  viewerId,
  hrefFor,
}: {
  studentId: string;
  page: number;
  needsFeedback: boolean;
  viewerId: string;
  hrefFor: (page: number, needsFeedback: boolean) => string;
}) {
  const list = await apiGet<ListResponse<Reflection>>(
    withQuery('/reflections', {
      studentId,
      page,
      pageSize: REFLECTIONS_PAGE,
      needsFeedback: needsFeedback ? 'true' : undefined,
    }),
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          {[false, true].map((nf) => (
            <Link
              key={String(nf)}
              href={hrefFor(1, nf)}
              aria-current={nf === needsFeedback ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm',
                nf === needsFeedback
                  ? 'border-primary bg-accent font-medium text-accent-foreground'
                  : 'hover:bg-muted',
              )}
            >
              {nf ? 'Needs feedback' : 'All'}
            </Link>
          ))}
        </div>
        {list.meta.total > 0 && (
          <span className="ml-auto">
            <PdfLink label="Download all (PDF)" size="sm" query={{ studentId }} />
          </span>
        )}
      </div>
      {list.data.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={needsFeedback ? 'All reflections have feedback' : 'No reflections yet'}
        />
      ) : (
        list.data.map((r) => (
          <ReflectionCard key={r.id} reflection={r} reviewerId={viewerId} canGiveFeedback />
        ))
      )}
      <Pagination
        page={page}
        pageSize={REFLECTIONS_PAGE}
        total={list.meta.total}
        hrefFor={(p) => hrefFor(p, needsFeedback)}
      />
    </div>
  );
}

const SESSIONS_PAGE = 20;

async function SessionsTab({
  studentId,
  page,
  canVoid,
  hrefFor,
}: {
  studentId: string;
  page: number;
  canVoid: boolean;
  hrefFor: (page: number) => string;
}) {
  const list = await apiGet<ListResponse<ReadingSession>>(
    `/reading-sessions?studentId=${studentId}&page=${page}&pageSize=${SESSIONS_PAGE}${canVoid ? '&includeCancelled=true' : ''}`,
  );
  if (list.data.length === 0)
    return <EmptyState icon={NotebookPen} title="No reading sessions yet" />;
  return (
    <>
      <ul className="divide-y rounded-lg border bg-card text-sm">
        {list.data.map((x) => (
          <li
            key={x.id}
            data-session-id={x.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1 basis-56">
              <span className="block truncate font-medium">{x.book.title}</span>
              <span className="text-xs text-muted-foreground">
                {formatDate(x.readingDate)} · {formatTime(x.startedAt)}
                {x.endedAt && `–${formatTime(x.endedAt)}`}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {x.source === 'MANUAL' && <Badge variant="neutral">Manual</Badge>}
              {x.durationCapped && <Badge variant="warning">Capped</Badge>}
              {x.pagesRead != null && (
                <span className="text-muted-foreground">{x.pagesRead} pages</span>
              )}
              {x.status === 'CANCELLED' ? (
                <Badge variant="destructive">Voided / discarded</Badge>
              ) : (
                <span className="font-medium tabular-nums">
                  {x.status === 'COMPLETED' ? formatDuration(x.durationSeconds) : 'In progress'}
                </span>
              )}
              {x.reflectionId && <Badge variant="outline">Reflection</Badge>}
              {canVoid && x.status !== 'CANCELLED' && (
                <VoidSessionButton
                  sessionId={x.id}
                  label={`${x.book.title}, ${formatDate(x.readingDate)}, ${x.status === 'COMPLETED' ? formatDuration(x.durationSeconds) : 'in progress'}`}
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={SESSIONS_PAGE} total={list.meta.total} hrefFor={hrefFor} />
    </>
  );
}

async function BooksTab({ studentId }: { studentId: string }) {
  const list = await apiGet<ListResponse<StudentBook>>(
    `/student-books?studentId=${studentId}&sort=recent&pageSize=100`,
  );
  if (list.data.length === 0) return <EmptyState icon={NotebookPen} title="No books yet" />;
  return (
    <Card>
      <CardContent className="pt-3">
        <BookProgressList books={list.data} />
      </CardContent>
    </Card>
  );
}
