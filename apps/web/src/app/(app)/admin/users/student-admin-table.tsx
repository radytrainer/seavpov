import Link from 'next/link';
import { BarChart3, MessageSquare, NotebookPen } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { formatDate } from '@/lib/format';
import type { FilterOptions, StudentRow } from '@/lib/trainer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { UserRowActions, type RowLink } from './user-actions';

function studentLinks(r: StudentRow): RowLink[] {
  const base = `/admin/students/${r.student.id}`;
  return [
    { href: base, label: 'View progress', icon: 'progress' },
    { href: `${base}?tab=reflections`, label: 'View reflections', icon: 'reflections' },
    {
      href: `/api/v1/reflections/export.pdf?studentId=${r.student.id}`,
      label: 'Download reflections (PDF)',
      icon: 'pdf',
      download: true,
    },
  ];
}

function Percent({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  return (
    <div className="flex items-center gap-2">
      <Progress value={value} label={label} className="h-1.5" />
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {value}%
      </span>
    </div>
  );
}

/** The single most important status, so rows stay compact. */
function Status({ r }: { r: StudentRow }) {
  if (r.student.status === 'INACTIVE') return <Badge variant="destructive">Deactivated</Badge>;
  if ((r.trainers?.length ?? 0) === 0) return <Badge variant="neutral">No trainer</Badge>;
  if (r.metrics.inactive) return <Badge variant="warning">May need encouragement</Badge>;
  return null;
}

function ReadingCell({ r }: { r: StudentRow }) {
  if (r.metrics.rangeSeconds === 0)
    return <span className="text-muted-foreground">No reading</span>;
  return (
    <>
      <span className="tabular-nums">{formatDuration(r.metrics.rangeSeconds)}</span>
      <Percent value={r.metrics.goalPercent} label={`Goal progress ${r.metrics.goalPercent}%`} />
      <span className="text-xs text-muted-foreground">
        {r.metrics.rangeReadingDays} day{r.metrics.rangeReadingDays === 1 ? '' : 's'} · streak{' '}
        {r.metrics.currentStreak}
      </span>
    </>
  );
}

function ReviewLink({ r }: { r: StudentRow }) {
  const n = r.metrics.awaitingFeedback;
  const total = r.metrics.reflectionsInRange;
  if (total === 0 && n === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={`/admin/students/${r.student.id}?tab=reflections`}
      className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-primary hover:underline"
    >
      <NotebookPen className="size-3.5" aria-hidden />
      {total}
      {n > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-xs font-medium text-warning-foreground">
          <MessageSquare className="size-3" aria-hidden />
          {n} to review
        </span>
      )}
    </Link>
  );
}

/** Students with progress at a glance. Desktop: table; mobile: cards. */
export function StudentAdminTable({
  rows,
  classes,
}: {
  rows: StudentRow[];
  classes: FilterOptions['classes'];
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border bg-card lg:block">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-[23%] px-3 py-2 font-medium">
                Student
              </th>
              <th scope="col" className="w-[15%] px-3 py-2 font-medium">
                Reading · goal
              </th>
              <th scope="col" className="w-[20%] px-3 py-2 font-medium">
                Current book
              </th>
              <th scope="col" className="w-[11%] px-3 py-2 font-medium">
                Last read
              </th>
              <th scope="col" className="w-[15%] px-3 py-2 font-medium">
                Reflections
              </th>
              <th scope="col" className="w-[16%] px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.student.id} className="align-top hover:bg-muted/40">
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/admin/students/${r.student.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.student.fullName}
                    </Link>
                    <Status r={r} />
                  </div>
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    title={
                      r.student.class
                        ? `${r.student.class.name} · ${r.student.class.generation.name}`
                        : undefined
                    }
                  >
                    {r.student.studentCode} · {r.student.class?.name ?? 'No class'}
                    {r.trainers && r.trainers.length > 0
                      ? ` · ${r.trainers.map((t) => t.fullName).join(', ')}`
                      : ''}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ReadingCell r={r} />
                </td>
                <td className="px-3 py-2.5">
                  {r.metrics.currentBook ? (
                    <>
                      <span className="block truncate" title={r.metrics.currentBook.title}>
                        {r.metrics.currentBook.title}
                      </span>
                      <Percent
                        value={r.metrics.currentBook.progressPercent}
                        label={`${r.metrics.currentBook.title} progress`}
                      />
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">{formatDate(r.metrics.lastReadingDate)}</td>
                <td className="px-3 py-2.5">
                  <ReviewLink r={r} />
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/students/${r.student.id}`}>
                      <BarChart3 aria-hidden /> Open
                    </Link>
                  </Button>
                  <UserRowActions user={r.student} classes={classes} links={studentLinks(r)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.student.id} className="rounded-lg border bg-card p-3 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/admin/students/${r.student.id}`} className="min-w-0">
                <span className="block truncate font-medium">{r.student.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {r.student.studentCode} · {r.student.class?.name ?? 'No class'}
                </span>
              </Link>
              <UserRowActions user={r.student} classes={classes} links={studentLinks(r)} />
            </div>
            <div className="mt-1.5">
              <Status r={r} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Reading · goal</p>
                <ReadingCell r={r} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Current book</p>
                <p className="truncate">{r.metrics.currentBook?.title ?? '—'}</p>
                {r.metrics.currentBook && (
                  <Percent
                    value={r.metrics.currentBook.progressPercent}
                    label={`${r.metrics.currentBook.title} progress`}
                  />
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
              <span>Last read {formatDate(r.metrics.lastReadingDate)}</span>
              <ReviewLink r={r} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
