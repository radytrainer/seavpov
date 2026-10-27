import type { Metadata } from 'next';
import Link from 'next/link';
import { History } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { apiGet } from '@/lib/api/server';
import { formatDate, formatTime } from '@/lib/format';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { ListResponse, ReadingSession, StudentBook } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { HistoryActions, SessionRowActions } from './history-actions';

export const metadata: Metadata = { title: 'Reading history' };

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = {
    from: param(sp, 'from'),
    to: param(sp, 'to'),
    studentBookId: param(sp, 'book'),
    source: param(sp, 'source'),
  };
  const page = pageParam(sp);
  const [sessions, books] = await Promise.all([
    apiGet<ListResponse<ReadingSession>>(
      withQuery('/reading-sessions', { ...filters, page, pageSize: PAGE_SIZE }),
    ),
    apiGet<ListResponse<StudentBook>>('/student-books?sort=title&pageSize=100'),
  ]);
  const bookOptions = books.data.map((b) => ({ id: b.id, book: b.book }));
  const filtered = Object.values(filters).some(Boolean);
  const hrefQuery = {
    from: filters.from,
    to: filters.to,
    book: filters.studentBookId,
    source: filters.source,
  };

  return (
    <>
      <PageHeader
        title="Reading history"
        description="All your reading sessions, newest first."
        actions={<HistoryActions books={bookOptions} openOnLoad={param(sp, 'add') === '1'} />}
      />

      <form
        method="get"
        className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr_auto_auto]"
      >
        <label className="grid gap-1 text-xs text-muted-foreground">
          From
          <Input type="date" name="from" defaultValue={filters.from} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" name="to" defaultValue={filters.to} />
        </label>
        <label className="col-span-2 grid gap-1 text-xs text-muted-foreground sm:col-span-1">
          Book
          <Select name="book" defaultValue={filters.studentBookId ?? ''}>
            <option value="">All books</option>
            {bookOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.book.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Type
          <Select name="source" defaultValue={filters.source ?? ''}>
            <option value="">All</option>
            <option value="TIMER">Timed</option>
            <option value="MANUAL">Manual</option>
          </Select>
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          Apply
        </Button>
      </form>

      {sessions.data.length === 0 ? (
        <EmptyState
          icon={History}
          title={filtered ? 'No sessions match these filters' : 'No reading sessions yet'}
          description={
            filtered
              ? undefined
              : 'Start the timer when you open your book, or add a session you forgot to time.'
          }
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href="/history">Clear filters</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/reading">Start reading</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate font-medium">{s.book.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(s.readingDate)} · {formatTime(s.startedAt)}
                  {s.endedAt && `–${formatTime(s.endedAt)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium tabular-nums">
                  {s.status === 'COMPLETED' ? formatDuration(s.durationSeconds) : 'In progress'}
                </span>
                {s.pagesRead != null && (
                  <span className="text-muted-foreground">{s.pagesRead} pages</span>
                )}
                {s.source === 'MANUAL' && <Badge variant="neutral">Manual</Badge>}
                {s.durationCapped && <Badge variant="warning">Capped</Badge>}
              </div>
              <div className="flex items-center gap-1">
                {s.status === 'COMPLETED' &&
                  (s.reflectionId ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/reflections/${s.reflectionId}`}>Reflection</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/reflections/new?session=${s.id}`}>Reflect</Link>
                    </Button>
                  ))}
                {s.status === 'COMPLETED' ? (
                  <SessionRowActions session={s} books={bookOptions} />
                ) : (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/reading">Open timer</Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={sessions.meta.total}
        hrefFor={(p) => withQuery('/history', { ...hrefQuery, page: p })}
      />
    </>
  );
}
