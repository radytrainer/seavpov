import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { apiGet } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { FilterOptions, RangeMeta, StudentRow } from '@/lib/trainer';
import type { PageMeta } from '@/lib/types';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { StudentFilters } from '@/components/trainer/student-filters';
import { StudentTable } from '@/components/trainer/student-table';

export const metadata: Metadata = { title: 'Students' };

const PAGE_SIZE = 25;

export default async function TrainerStudentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = {
    search: param(sp, 'search'),
    classId: param(sp, 'classId'),
    generationId: param(sp, 'generationId'),
    from: param(sp, 'from'),
    to: param(sp, 'to'),
    inactiveOnly: param(sp, 'inactiveOnly'),
  };
  const page = pageParam(sp);
  const [list, options] = await Promise.all([
    apiGet<{ data: StudentRow[]; meta: PageMeta & { range: RangeMeta } }>(
      withQuery('/trainer/students', { ...filters, page, pageSize: PAGE_SIZE }),
    ),
    apiGet<{ data: FilterOptions }>('/trainer/filters'),
  ]);

  return (
    <>
      <PageHeader
        title="Students"
        description={`Your assigned students. Figures cover ${formatDate(list.meta.range.from)} – ${formatDate(list.meta.range.to)}.`}
      />
      <StudentFilters options={options.data} values={filters} showSearch showInactive />
      {list.data.length === 0 ? (
        <EmptyState icon={Users} title="No students found" description="Try different filters." />
      ) : (
        <StudentTable rows={list.data} basePath="/trainer/students" />
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) => withQuery('/trainer/students', { ...filters, page: p })}
      />
    </>
  );
}
