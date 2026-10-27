import type { Metadata } from 'next';
import Link from 'next/link';
import { NotebookPen, Search } from 'lucide-react';
import { apiGet } from '@/lib/api/server';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { ListResponse, Reflection, StudentBook } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { ReflectionList } from '@/components/reflections/reflection-list';
import { PdfLink } from '@/components/reflections/pdf-link';

export const metadata: Metadata = { title: 'Reflections' };

const PAGE_SIZE = 15;

export default async function ReflectionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = {
    search: param(sp, 'search'),
    studentBookId: param(sp, 'book'),
    tag: param(sp, 'tag'),
    from: param(sp, 'from'),
    to: param(sp, 'to'),
  };
  const page = pageParam(sp);
  const [list, books] = await Promise.all([
    apiGet<ListResponse<Reflection>>(
      withQuery('/reflections', { ...filters, page, pageSize: PAGE_SIZE }),
    ),
    apiGet<ListResponse<StudentBook>>('/student-books?sort=title&pageSize=100'),
  ]);
  const filtered = Object.values(filters).some(Boolean);
  const hrefQuery = { ...filters, studentBookId: undefined, book: filters.studentBookId };

  return (
    <>
      <PageHeader
        title="Reflections"
        description="What you learned from your reading, and feedback from your trainer."
        actions={
          list.meta.total > 0 ? (
            <PdfLink
              label="Download PDF"
              query={{ from: filters.from, to: filters.to, studentBookId: filters.studentBookId }}
            />
          ) : undefined
        }
      />
      <form
        method="get"
        role="search"
        className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="relative col-span-2 md:col-span-1">
          <span className="sr-only">Search your notes</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="search"
            defaultValue={filters.search}
            placeholder="Search your notes"
            className="pl-9"
          />
        </label>
        <Input type="date" name="from" defaultValue={filters.from} aria-label="From date" />
        <Input type="date" name="to" defaultValue={filters.to} aria-label="To date" />
        <Select name="book" defaultValue={filters.studentBookId ?? ''} aria-label="Filter by book">
          <option value="">All books</option>
          {books.data.map((b) => (
            <option key={b.id} value={b.id}>
              {b.book.title}
            </option>
          ))}
        </Select>
        {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {filters.tag && (
        <p className="mb-3 text-sm">
          Tag <span className="font-medium">#{filters.tag}</span> ·{' '}
          <Link
            href={withQuery('/reflections', { ...hrefQuery, tag: undefined })}
            className="text-primary"
          >
            remove
          </Link>
        </p>
      )}

      {list.data.length === 0 ? (
        <EmptyState
          icon={filtered ? Search : NotebookPen}
          title={filtered ? 'No reflections match your search' : 'No reflections yet'}
          description={
            filtered
              ? undefined
              : 'After a reading session, write what you learned. You can reflect on past sessions from History.'
          }
          action={
            <Button asChild variant="outline">
              <Link href={filtered ? '/reflections' : '/history'}>
                {filtered ? 'Clear search' : 'Go to History'}
              </Link>
            </Button>
          }
        />
      ) : (
        <ReflectionList reflections={list.data} hrefFor={(r) => `/reflections/${r.id}`} />
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) => withQuery('/reflections', { ...hrefQuery, page: p })}
      />
    </>
  );
}
