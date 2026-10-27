import type { Metadata } from 'next';
import Link from 'next/link';
import { BookMarked } from 'lucide-react';
import { apiGet } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { Category, LibraryBook, ListResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { BookCover } from '@/components/books/book-bits';
import { CatalogActions, NewCatalogBookButton } from './catalog-actions';

export const metadata: Metadata = { title: 'Book catalog' };

const PAGE_SIZE = 25;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = { search: param(sp, 'search'), status: param(sp, 'status') };
  const page = pageParam(sp);
  const [list, categories] = await Promise.all([
    apiGet<ListResponse<LibraryBook>>(
      withQuery('/library-books', { ...filters, page, pageSize: PAGE_SIZE }),
    ),
    apiGet<{ data: Category[] }>('/categories'),
  ]);
  const tabs = [
    { label: 'All books', value: undefined },
    { label: 'Awaiting review', value: 'PENDING' },
  ];

  return (
    <>
      <PageHeader
        title="Book catalog"
        description="Physical books in the school library. Review entries students submit, fix details or merge duplicates."
        actions={<NewCatalogBookButton categories={categories.data} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={withQuery('/admin/catalog', { search: filters.search, status: t.value })}
            aria-current={filters.status === t.value ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              filters.status === t.value
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'hover:bg-muted',
            )}
          >
            {t.label}
          </Link>
        ))}
        <form method="get" role="search" className="ml-auto flex w-full gap-2 sm:w-auto">
          {filters.status && <input type="hidden" name="status" value={filters.status} />}
          <Input
            name="search"
            defaultValue={filters.search}
            placeholder="Title, author, ISBN, code"
            aria-label="Search catalog"
            className="sm:w-64"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>
      {list.data.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title={filters.status ? 'Nothing to review' : 'No books found'}
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {list.data.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 p-3">
              <BookCover url={b.coverImageUrl} title={b.title} className="w-9" />
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-medium">{b.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    b.author,
                    b.category?.name,
                    b.totalPages && `${b.totalPages} p.`,
                    b.libraryCode,
                    b.isbn && `ISBN ${b.isbn}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  · added {formatDate(b.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {b.status === 'PENDING' && <Badge variant="warning">Awaiting review</Badge>}
                {b.archivedAt && <Badge variant="neutral">Archived</Badge>}
                <CatalogActions book={b} categories={categories.data} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) => withQuery('/admin/catalog', { ...filters, page: p })}
      />
    </>
  );
}
