import type { Metadata } from 'next';
import Link from 'next/link';
import { BookMarked, FileUp, Users } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { apiGet } from '@/lib/api/server';
import { toChartPoints } from '@/lib/analytics';
import { formatDate } from '@/lib/format';
import type { Overview } from '@/lib/trainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/states';
import { Stat } from '@/components/analytics/stat';
import { MinutesBarChart } from '@/components/analytics/minutes-bar-chart';
import { RegistrationToggle } from '@/components/admin/registration-toggle';

export const metadata: Metadata = { title: 'Administration' };

interface AdminOverview {
  students: number;
  trainers: number;
  admins: number;
  inactiveAccounts: number;
  pendingBooks: number;
  classes: number;
}

export default async function AdminHomePage() {
  const [{ data: counts }, { data: o }, { data: settings }] = await Promise.all([
    apiGet<{ data: AdminOverview }>('/admin/overview'),
    apiGet<{ data: Overview }>('/trainer/overview'),
    apiGet<{ data: { selfRegistrationEnabled: boolean } }>('/admin/settings'),
  ]);

  return (
    <>
      <PageHeader
        title="Administration"
        description={`Institution-wide reading activity, ${formatDate(o.range.from)} – ${formatDate(o.range.to)}.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/users/import">
                <FileUp aria-hidden /> Import students
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/users">
                <Users aria-hidden /> Manage users
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-5">
        <Card>
          <CardContent className="pt-5">
            <RegistrationToggle enabled={settings.selfRegistrationEnabled} />
          </CardContent>
        </Card>
        <section aria-label="Accounts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Active students"
            value={counts.students}
            detail={`${counts.classes} classes`}
          />
          <Stat
            label="Trainers"
            value={counts.trainers}
            detail={`${counts.admins} administrators`}
          />
          <Stat
            label="Students who read (7 days)"
            value={o.activeStudents}
            detail={`${o.inactiveStudents} may need encouragement`}
          />
          <Stat
            label="Total reading (7 days)"
            value={formatDuration(o.totalSeconds)}
            detail={`Avg consistency ${o.averageConsistencyPercent}%`}
          />
        </section>
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Reading across the institution</CardTitle>
              <CardDescription>Total minutes per day</CardDescription>
            </CardHeader>
            <CardContent>
              <MinutesBarChart
                data={toChartPoints(o.series, o.granularity)}
                title="Total reading minutes, all students"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookMarked className="size-4" aria-hidden /> Catalog review
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-3xl font-semibold tabular-nums">{counts.pendingBooks}</p>
              <p className="text-sm text-muted-foreground">
                Book entries submitted by students awaiting review.
              </p>
              <Button asChild variant="outline">
                <Link href="/admin/catalog?status=PENDING">Review entries</Link>
              </Button>
              {counts.inactiveAccounts > 0 && (
                <p className="text-xs text-muted-foreground">
                  {counts.inactiveAccounts} deactivated accounts.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
