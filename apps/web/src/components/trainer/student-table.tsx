import Link from 'next/link';
import { BookOpen, ChevronRight, Flame, MessageSquare } from 'lucide-react';
import { formatDuration } from '@rt/shared';
import { formatDate } from '@/lib/format';
import type { StudentRow } from '@/lib/trainer';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

function Encourage({ row }: { row: StudentRow }) {
  return row.metrics.inactive ? <Badge variant="warning">May need encouragement</Badge> : null;
}

function CurrentBook({ row }: { row: StudentRow }) {
  const b = row.metrics.currentBook;
  if (!b) return <span className="text-muted-foreground">No book in progress</span>;
  return (
    <div className="grid min-w-0 gap-1">
      <span className="truncate" title={b.title}>
        {b.title}
      </span>
      {b.progressPercent !== null && (
        <div className="flex items-center gap-2">
          <Progress
            value={b.progressPercent}
            label={`${b.title}: ${b.progressPercent}% read`}
            className="h-1.5"
          />
          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {b.progressPercent}%
          </span>
        </div>
      )}
    </div>
  );
}

function ReadingTime({ row }: { row: StudentRow }) {
  const m = row.metrics;
  return (
    <div className="grid gap-1">
      <span className="tabular-nums">{formatDuration(m.rangeSeconds)}</span>
      {m.goalPercent !== null && (
        <div className="flex items-center gap-2">
          <Progress
            value={m.goalPercent}
            label={`Goal progress ${m.goalPercent}%`}
            className="h-1.5"
          />
          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {m.goalPercent}%
          </span>
        </div>
      )}
    </div>
  );
}

function ToReview({ row, basePath }: { row: StudentRow; basePath: string }) {
  const n = row.metrics.awaitingFeedback;
  if (n === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={`${basePath}/${row.student.id}?tab=reflections`}
      className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-warning-foreground hover:underline"
    >
      <MessageSquare className="size-3" aria-hidden /> {n} to review
    </Link>
  );
}

/**
 * Student overview list. Desktop: one table row per student; mobile: one card per student.
 * Both show the same essentials: current book progress, reading time vs. goal, habit, review.
 */
export function StudentTable({ rows, basePath }: { rows: StudentRow[]; basePath: string }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border bg-card lg:block">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-[22%] px-3 py-2 font-medium">
                Student
              </th>
              <th scope="col" className="w-[24%] px-3 py-2 font-medium">
                Current book
              </th>
              <th scope="col" className="w-[16%] px-3 py-2 font-medium">
                Reading · goal
              </th>
              <th scope="col" className="w-[9%] px-3 py-2 text-right font-medium">
                Days
              </th>
              <th scope="col" className="w-[8%] px-3 py-2 text-right font-medium">
                Streak
              </th>
              <th scope="col" className="w-[11%] px-3 py-2 font-medium">
                Last read
              </th>
              <th scope="col" className="w-[10%] px-3 py-2 font-medium">
                Reflections
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.student.id} className="align-top hover:bg-muted/40">
                <td className="px-3 py-2.5">
                  <Link
                    href={`${basePath}/${r.student.id}`}
                    className="font-medium hover:underline"
                  >
                    {r.student.fullName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {r.student.studentCode} · {r.student.class?.name ?? 'No class'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <CurrentBook row={r} />
                </td>
                <td className="px-3 py-2.5">
                  <ReadingTime row={r} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.metrics.rangeReadingDays}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.metrics.currentStreak}</td>
                <td className="px-3 py-2.5">
                  <span className="block">{formatDate(r.metrics.lastReadingDate)}</span>
                  <Encourage row={r} />
                </td>
                <td className="px-3 py-2.5">
                  <ToReview row={r} basePath={basePath} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.student.id} className="rounded-lg border bg-card p-3 shadow-xs">
            <Link
              href={`${basePath}/${r.student.id}`}
              className="flex items-start justify-between gap-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.student.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {r.student.studentCode} · {r.student.class?.name ?? 'No class'}
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2 flex min-w-0 gap-2">
                <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <CurrentBook row={r} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reading · goal</p>
                <ReadingTime row={r} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Habit</p>
                <p className="flex items-center gap-1 tabular-nums">
                  <Flame className="size-3.5 text-muted-foreground" aria-hidden />
                  {`${r.metrics.currentStreak} streak · ${r.metrics.rangeReadingDays} day${r.metrics.rangeReadingDays === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
              <span>Last read {formatDate(r.metrics.lastReadingDate)}</span>
              <span className="flex items-center gap-2">
                <Encourage row={r} />
                <ToReview row={r} basePath={basePath} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
