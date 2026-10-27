import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare, Users } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { apiGet, requireUser } from '@/lib/api/server';
import { toChartPoints } from '@/lib/analytics';
import { formatDate } from '@/lib/format';
import { param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { FilterOptions, Overview, StudentRow } from '@/lib/trainer';
import type { ListResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { Stat } from '@/components/analytics/stat';
import { MinutesBarChart } from '@/components/analytics/minutes-bar-chart';
import { StudentFilters } from '@/components/trainer/student-filters';
import { StudentTable } from '@/components/trainer/student-table';

export const metadata: Metadata = { title: 'Trainer overview' };

export default async function TrainerHomePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser('TRAINER');
  const sp = await searchParams;
  const filters = {
    classId: param(sp, 'classId'),
    generationId: param(sp, 'generationId'),
    from: param(sp, 'from'),
    to: param(sp, 'to'),
  };
  const [{ data: o }, options, encourage] = await Promise.all([
    apiGet<{ data: Overview }>(withQuery('/trainer/overview', filters)),
    apiGet<{ data: FilterOptions }>('/trainer/filters'),
    apiGet<ListResponse<StudentRow>>(
      withQuery('/trainer/students', { ...filters, inactiveOnly: 'true', pageSize: 5 }),
    ),
  ]);
  const granularity = o.granularity;

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(' ')[0]}`}
        description={`Reading activity of your students, ${formatDate(o.range.from)} – ${formatDate(o.range.to)}.`}
      />
      <StudentFilters options={options.data} values={filters} />

      {o.students === 0 ? (
        <EmptyState
          icon={Users}
          title="No students assigned"
          description="Ask an administrator to assign students or a class to you."
        />
      ) : (
        <div className="grid gap-5">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Students"
              value={o.students}
              detail={`${o.activeStudents} read in this period`}
            />
            <Stat
              label="Total reading"
              value={formatDuration(o.totalSeconds)}
              detail={`${formatDuration(o.averageSecondsPerStudent)} per student`}
            />
            <Stat
              label="Average consistency"
              value={`${o.averageConsistencyPercent}%`}
              detail="Share of days with reading"
            />
            <Stat
              label="May need encouragement"
              value={o.inactiveStudents}
              detail={`No reading in ${o.range.inactiveAfterDays} days`}
            />
          </section>

          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Class reading trend</CardTitle>
                <CardDescription>
                  Total minutes read by your students per {granularity}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MinutesBarChart
                  data={toChartPoints(o.series, granularity)}
                  title="Total reading minutes of assigned students"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-4" aria-hidden /> Reflections to review
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-3xl font-semibold tabular-nums">{o.pendingFeedback}</p>
                <p className="text-sm text-muted-foreground">Reflections without feedback yet.</p>
                <Button asChild variant="outline">
                  <Link href="/trainer/reflections?needsFeedback=true">Review reflections</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <section aria-labelledby="encourage" className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 id="encourage" className="text-base font-semibold">
                Students who may need encouragement
              </h2>
              <Link
                href={withQuery('/trainer/students', { ...filters, inactiveOnly: 'true' })}
                className="text-sm text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {encourage.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone has read recently. 🎉</p>
            ) : (
              <StudentTable rows={encourage.data} basePath="/trainer/students" />
            )}
          </section>
        </div>
      )}
    </>
  );
}
