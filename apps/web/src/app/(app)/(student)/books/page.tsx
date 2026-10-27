import type { Metadata } from 'next';
import Link from 'next/link';
import { Library, Search } from 'lucide-react';
import { READING_STATUSES, READING_STATUS_LABELS } from '@rt/shared';
import { apiGet } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { Category, ListResponse, StudentBook } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { BookCover, ReadingStatusBadge } from '@/components/books/book-bits';
import { AddBookDialog } from '@/components/books/add-book-dialog';

export const metadata: Metadata = { title: 'My Books' };

const PAGE_SIZE = 12;

export default async function MyBooksPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = {
    search: param(sp, 'search'),
    status: param(sp, 'status'),
    categoryId: param(sp, 'categoryId'),
    sort: param(sp, 'sort') ?? 'recent',
    archived: param(sp, 'archived') === 'true' ? 'true' : undefined,
  };
  const page = pageParam(sp);
  const [books, categories] = await Promise.all([
    apiGet<ListResponse<StudentBook>>(
      withQuery('/student-books', { ...filters, page, pageSize: PAGE_SIZE }),
    ),
    apiGet<{ data: Category[] }>('/categories'),
  ]);
  const filtered = Boolean(filters.search || filters.status || filters.categoryId);

  return (
    <>
      <PageHeader
        title={filters.archived ? 'Archived books' : 'My Books'}
        description="The physical books you are reading or plan to read."
        actions={<AddBookDialog categories={categories.data} />}
      />

      <form
        method="get"
        role="search"
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="relative">
          <span className="sr-only">Search by title or author</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="search"
            defaultValue={filters.search}
            placeholder="Search title or author"
            className="pl-9"
          />
        </label>
        <Select name="status" defaultValue={filters.status ?? ''} aria-label="Filter by status">
          <option value="">All statuses</option>
          {READING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {READING_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          name="categoryId"
          defaultValue={filters.categoryId ?? ''}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={filters.sort} aria-label="Sort by">
          <option value="recent">Recently read</option>
          <option value="title">Title</option>
          <option value="started">Start date</option>
        </Select>
        {filters.archived && <input type="hidden" name="archived" value="true" />}
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {books.data.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Search}
            title="No books match these filters"
            action={
              <Button asChild variant="outline">
                <Link href={filters.archived ? '/books?archived=true' : '/books'}>
                  Clear filters
                </Link>
              </Button>
            }
          />
        ) : filters.archived ? (
          <EmptyState icon={Library} title="No archived books" />
        ) : (
          <EmptyState
            icon={Library}
            title="No books yet"
            description="Add the physical book you are reading from the library to start tracking your sessions."
            action={<AddBookDialog categories={categories.data} />}
          />
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {books.data.map((sb) => (
            <li key={sb.id}>
              <Link
                href={`/books/${sb.id}`}
                className="flex gap-3 rounded-lg border bg-card p-3 shadow-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <BookCover url={sb.book.coverImageUrl} title={sb.book.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-snug">{sb.book.title}</p>
                    <ReadingStatusBadge status={sb.status} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {sb.book.author ?? 'Unknown author'}
                  </p>
                  {sb.progressPercent !== null ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={sb.progressPercent} label={`Progress of ${sb.book.title}`} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {sb.progressPercent}%
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Page {sb.currentPage}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sb.lastReadAt ? `Last read ${formatDate(sb.lastReadAt)}` : 'Not read yet'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={books.meta.total}
        hrefFor={(p) => withQuery('/books', { ...filters, page: p })}
      />

      <p className="mt-6 text-center text-sm">
        <Link
          href={filters.archived ? '/books' : '/books?archived=true'}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          {filters.archived ? 'Back to My Books' : 'View archived books'}
        </Link>
      </p>
    </>
  );
}
