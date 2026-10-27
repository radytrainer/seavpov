import type { Metadata } from 'next';
import { requireUser } from '@/lib/api/server';
import { pageParam, param, type RawSearchParams } from '@/lib/search-params';
import { STUDENT_TABS, StudentDetail, type StudentTab } from '@/components/trainer/student-detail';

export const metadata: Metadata = { title: 'Student' };

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser('ADMIN');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const requested = param(sp, 'tab') as StudentTab | undefined;
  const tab = requested && STUDENT_TABS.includes(requested) ? requested : 'overview';
  return (
    <StudentDetail
      studentId={id}
      basePath={`/admin/students/${id}`}
      backHref="/admin/users?role=STUDENT"
      reportsBase="/admin/reports"
      tab={tab}
      page={pageParam(sp)}
      needsFeedback={param(sp, 'needsFeedback') === 'true'}
      viewerId={user.id}
      canVoid
    />
  );
}
