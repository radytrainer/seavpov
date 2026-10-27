import type { Metadata } from 'next';
import { apiGet } from '@/lib/api/server';
import { param, type RawSearchParams } from '@/lib/search-params';
import type { ListResponse, ReadingSession, StudentBook } from '@/lib/types';
import { PageHeader } from '@/components/ui/states';
import { ReadingTimer } from '@/components/reading/reading-timer';

export const metadata: Metadata = { title: 'Read' };

export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const [active, books] = await Promise.all([
    apiGet<{ data: ReadingSession | null; meta: { serverNow: string } }>(
      '/reading-sessions/active',
    ),
    apiGet<ListResponse<StudentBook>>('/student-books?sort=recent&pageSize=50'),
  ]);
  const readable = books.data.filter((b) => b.status !== 'COMPLETED' && b.status !== 'ABANDONED');

  return (
    <>
      <PageHeader
        title="Reading session"
        description="Time your reading of a physical book. The timer keeps running if you close this page."
      />
      <ReadingTimer
        initialSession={active.data}
        books={readable}
        preselectedBookId={param(sp, 'book')}
      />
    </>
  );
}
