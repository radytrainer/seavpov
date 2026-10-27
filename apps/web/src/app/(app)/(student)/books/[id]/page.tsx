import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Timer } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { apiGet, apiGetOrNull } from '@/lib/api/server';
import { formatDate, formatTime } from '@/lib/format';
import type { ListResponse, ReadingSession, Reflection, StudentBookDetail } from '@/lib/types';
import { ReflectionList } from '@/components/reflections/reflection-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BookCover, ReadingStatusBadge } from '@/components/books/book-bits';
import { BookActions } from './book-actions';

export const metadata: Metadata = { title: 'Book details' };

export default async function BookDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiGetOrNull<{ data: StudentBookDetail }>(`/student-books/${id}`);
  if (!res) notFound();
  const sb = res.data;
  const [sessions, reflections] = await Promise.all([
    apiGet<ListResponse<ReadingSession>>(`/reading-sessions?studentBookId=${id}&pageSize=5`),
    apiGet<ListResponse<Reflection>>(`/reflections?studentBookId=${id}&pageSize=5`),
  ]);
  const book = sb.book;

  const facts: [string, string][] = [
    ['Category', book.category?.name ?? '—'],
    ['Pages', sb.totalPages ? String(sb.totalPages) : '—'],
    ['Library book ID', book.libraryCode ?? '—'],
    ['ISBN', book.isbn ?? '—'],
    ['Started', formatDate(sb.startedAt)],
    ['Completed', formatDate(sb.completedAt)],
    ['Last read', formatDate(sb.lastReadAt)],
  ];

  return (
    <>
      <Link
        href="/books"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> My Books
      </Link>

      <div className="mb-5 flex gap-4">
        <BookCover url={book.coverImageUrl} title={book.title} className="w-16 sm:w-20" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{book.title}</h1>
            <ReadingStatusBadge status={sb.status} />
            {sb.archivedAt && <span className="text-xs text-muted-foreground">Archived</span>}
          </div>
          <p className="text-sm text-muted-foreground">{book.author ?? 'Unknown author'}</p>
          {book.status === 'PENDING' && (
            <p className="mt-1 text-xs text-muted-foreground">
              New catalog entry — awaiting librarian review.
            </p>
          )}
          {!sb.archivedAt && sb.status !== 'COMPLETED' && sb.status !== 'ABANDONED' && (
            <Button asChild className="mt-3">
              <Link href={`/reading?book=${sb.id}`}>
                <Timer aria-hidden />
                {sb.activeSessionId ? 'Continue reading' : 'Start reading'}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {sb.progressPercent !== null ? (
                <div className="flex items-center gap-3">
                  <Progress value={sb.progressPercent} label="Book progress" />
                  <span className="text-sm font-medium tabular-nums">{sb.progressPercent}%</span>
                </div>
              ) : null}
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Current page</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {sb.currentPage}
                    {sb.totalPages ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {sb.totalPages}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sessions</dt>
                  <dd className="text-lg font-semibold tabular-nums">{sb.stats.sessionCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Time read</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatDuration(sb.stats.totalSeconds)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent sessions</CardTitle>
              {sessions.meta.total > 5 && (
                <Link
                  href={`/history?book=${sb.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  View all {sessions.meta.total}
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {sessions.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions for this book yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {sessions.data.map((s) => (
                    <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {formatDate(s.readingDate)} · {formatTime(s.startedAt)}
                        {s.source === 'MANUAL' && (
                          <span className="text-muted-foreground"> · manual</span>
                        )}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.status === 'COMPLETED'
                          ? formatDuration(s.durationSeconds)
                          : 'In progress'}
                        {s.pagesRead != null && ` · ${s.pagesRead} pages`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="book-reflections" className="grid gap-2">
            <h2 id="book-reflections" className="text-base font-semibold">
              Reflections{reflections.meta.total > 0 && ` (${reflections.meta.total})`}
            </h2>
            {reflections.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reflections yet. After a session, write down what you learned.
              </p>
            ) : (
              <ReflectionList
                reflections={reflections.data}
                hrefFor={(r) => `/reflections/${r.id}`}
              />
            )}
            {reflections.meta.total > 5 && (
              <Link
                href={`/reflections?book=${sb.id}`}
                className="text-sm text-primary hover:underline"
              >
                View all reflections
              </Link>
            )}
          </section>

          <BookActions book={sb} />
        </div>

        <Card className="content-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
