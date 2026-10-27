import type { Metadata } from 'next';
import type { RawSearchParams } from '@/lib/search-params';
import { ReportsView } from '@/components/reports/reports-view';

export const metadata: Metadata = { title: 'Reports' };

export default async function TrainerReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <ReportsView
      apiBase="/trainer/reports"
      searchParams={await searchParams}
      description="Reports about your assigned students. Preview here, then download as CSV."
    />
  );
}
