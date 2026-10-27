import { FileDown } from 'lucide-react';
import { apiGet } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { FilterOptions, ReportData } from '@/lib/trainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/states';
import { StudentFilters } from '@/components/trainer/student-filters';

const PREVIEW_ROWS = 25;

/**
 * Report builder shared by trainers (/trainer/reports, assigned students) and administrators
 * (/admin/reports, all students). Individual reading history is exported from a student page.
 */
export async function ReportsView({
  apiBase,
  searchParams,
  description,
}: {
  apiBase: '/trainer/reports' | '/admin/reports';
  searchParams: RawSearchParams;
  description: string;
}) {
  const filters = {
    type: param(searchParams, 'type') ?? 'student-summary',
    classId: param(searchParams, 'classId'),
    generationId: param(searchParams, 'generationId'),
    from: param(searchParams, 'from'),
    to: param(searchParams, 'to'),
    granularity: param(searchParams, 'granularity') === 'month' ? 'month' : undefined,
    includeInactiveAccounts:
      param(searchParams, 'includeInactiveAccounts') === 'true' ? 'true' : undefined,
  };
  const query = {
    classId: filters.classId,
    generationId: filters.generationId,
    from: filters.from,
    to: filters.to,
    includeInactiveAccounts: filters.includeInactiveAccounts,
  };
  const [types, options] = await Promise.all([
    apiGet<{ data: { type: string; label: string }[] }>(apiBase),
    apiGet<{ data: FilterOptions }>('/trainer/filters'),
  ]);
  const available = types.data.filter((t) => t.type !== 'sessions');
  const type = available.some((t) => t.type === filters.type) ? filters.type : 'student-summary';
  // Weekly/monthly grouping only applies to the period summary.
  const typeQuery =
    type === 'period-summary' ? { ...query, granularity: filters.granularity } : query;
  const preview = await apiGet<{ data: ReportData }>(
    withQuery(`${apiBase}/${type}`, { ...typeQuery, format: 'json' }),
  );
  const report = preview.data;
  const downloadHref = withQuery(`/api/v1${apiBase}/${type}`, typeQuery);

  return (
    <>
      <PageHeader title="Reports" description={description} />
      <StudentFilters
        options={options.data}
        values={filters}
        extra={
          <>
            <label className="col-span-2 grid gap-1 text-xs text-muted-foreground md:min-w-64">
              Report
              <Select name="type" defaultValue={type}>
                {available.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
            {type === 'period-summary' && (
              <label className="grid gap-1 text-xs text-muted-foreground">
                Group by
                <Select name="granularity" defaultValue={filters.granularity ?? 'week'}>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </Select>
              </label>
            )}
            <label className="col-span-2 flex h-10 items-center gap-2 self-end text-sm md:col-span-1">
              <input
                type="checkbox"
                name="includeInactiveAccounts"
                value="true"
                defaultChecked={filters.includeInactiveAccounts === 'true'}
                className="size-4 accent-[var(--primary)]"
              />
              Include deactivated accounts
            </label>
          </>
        }
      />
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{available.find((t) => t.type === type)?.label}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatDate(report.from)} – {formatDate(report.to)} · {report.rows.length} rows
              {report.rows.length > PREVIEW_ROWS && ` (showing first ${PREVIEW_ROWS})`}
            </p>
          </div>
          <Button asChild>
            <a href={downloadHref} download>
              <FileDown aria-hidden /> Download CSV
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No data for these filters.
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-max text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    {report.headers.map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b px-2 py-2 font-medium whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                          {cell ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Reports contain reading activity and counts only — reflection text is never exported.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
