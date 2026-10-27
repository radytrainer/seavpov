import type { Metadata } from 'next';
import type { RawSearchParams } from '@/lib/search-params';
import { ReportsView } from '@/components/reports/reports-view';

export const metadata: Metadata = { title: 'Reports' };

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ReportsView
      apiBase="/admin/reports"
      searchParams={await searchParams}
      description="Institution-wide reports. Preview here, then download as CSV. Exports are recorded in the audit log."
    />
  );
}
