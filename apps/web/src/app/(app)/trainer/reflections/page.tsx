import type { Metadata } from 'next';
import Link from 'next/link';
import { NotebookPen } from 'lucide-react';
import { apiGet, requireUser } from '@/lib/api/server';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { FilterOptions } from '@/lib/trainer';
import type { ListResponse, Reflection } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { ReflectionCard } from '@/components/reflections/reflection-card';

export const metadata: Metadata = { title: 'Review reflections' };

const PAGE_SIZE = 10;

/**
 * Review queue: reflections are shown in full with an inline feedback box, so trainers can read
 * and respond without opening each one.
 */
export default async function TrainerReflectionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser('TRAINER');
  const sp = await searchParams;
  const filters = {
    search: param(sp, 'search'),
    needsFeedback: param(sp, 'needsFeedback') ?? (param(sp, 'all') ? undefined : 'true'),
    classId: param(sp, 'classId'),
  };
  const all = filters.needsFeedback !== 'true';
  const page = pageParam(sp);
  const [list, options] = await Promise.all([
    apiGet<ListResponse<Reflection>>(
      withQuery('/reflections', {
        search: filters.search,
        classId: filters.classId,
        needsFeedback: all ? undefined : 'true',
        page,
        pageSize: PAGE_SIZE,
      }),
    ),
    apiGet<{ data: FilterOptions }>('/trainer/filters'),
  ]);
  const items = list.data;
  const hrefBase = { search: filters.search, classId: filters.classId };
  const tabs = [
    { label: 'Needs feedback', href: withQuery('/trainer/reflections', hrefBase), active: !all },
    {
      label: 'All reflections',
      href: withQuery('/trainer/reflections', { ...hrefBase, all: '1' }),
      active: all,
    },
  ];

  return (
    <>
      <PageHeader
        title="Reflections"
        description="Read what your students learned and encourage them with feedback."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              t.active
                ? 'border-primary bg-accent font-medium text-accent-foreground'
                : 'hover:bg-muted',
            )}
          >
            {t.label}
          </Link>
        ))}
        <form
          method="get"
          role="search"
          className="flex w-full flex-wrap gap-2 md:ml-auto md:w-auto"
        >
          {all && <input type="hidden" name="all" value="1" />}
          <Select
            name="classId"
            defaultValue={filters.classId ?? ''}
            aria-label="Class"
            className="md:w-44"
          >
            <option value="">All classes</option>
            {options.data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.generation.name}
              </option>
            ))}
          </Select>
          <Input
            name="search"
            defaultValue={filters.search}
            placeholder="Search text"
            aria-label="Search reflections"
            className="min-w-0 flex-1 md:w-48"
          />
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={all ? 'No reflections found' : 'All caught up'}
          description={all ? undefined : 'Every reflection has feedback. Well done!'}
        />
      ) : (
        <div className="grid gap-4">
          {items.map((r) => (
            <ReflectionCard
              key={r.id}
              reflection={r}
              showStudent
              studentHref={`/trainer/students/${r.studentId}?tab=reflections`}
              reviewerId={user.id}
              canGiveFeedback
            />
          ))}
        </div>
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) =>
          withQuery('/trainer/reflections', { ...hrefBase, all: all ? '1' : undefined, page: p })
        }
      />
    </>
  );
}
