import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { apiGet } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { ListResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Audit log' };

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; username: string } | null;
}

const ENTITY_TYPES = [
  'user',
  'trainer',
  'class',
  'generation',
  'category',
  'library_book',
  'reading_session',
  'reflection',
  'settings',
  'report',
];
const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = {
    action: param(sp, 'action'),
    entityType: param(sp, 'entityType'),
    from: param(sp, 'from'),
    to: param(sp, 'to'),
  };
  const page = pageParam(sp);
  const list = await apiGet<ListResponse<AuditEntry>>(
    withQuery('/admin/audit-logs', { ...filters, page, pageSize: PAGE_SIZE }),
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Important administrative actions and edits. Private reflection text is never recorded here."
      />
      <form
        method="get"
        className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <Input
          name="action"
          defaultValue={filters.action}
          placeholder="Action, e.g. user. or settings"
          aria-label="Action"
          className="col-span-2 md:col-span-1"
        />
        <Select name="entityType" defaultValue={filters.entityType ?? ''} aria-label="Record type">
          <option value="">All records</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={filters.from} aria-label="From" />
        <Input type="date" name="to" defaultValue={filters.to} aria-label="To" />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>
      {list.data.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No entries" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card text-sm">
          {list.data.map((e) => (
            <li key={e.id} className="grid gap-1 p-3 sm:grid-cols-[11rem_1fr]">
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDateTime(e.createdAt)}
              </span>
              <div className="min-w-0">
                <p>
                  <span className="font-mono text-xs font-medium">{e.action}</span>{' '}
                  <span className="text-muted-foreground">
                    by{' '}
                    {e.actor ? `${e.actor.fullName} (@${e.actor.username})` : 'system / anonymous'}
                    {e.ip && ` · ${e.ip}`}
                  </span>
                </p>
                {e.metadata != null && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Details
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                      {e.entityType}
                      {e.entityId ? ` ${e.entityId}` : ''}
                      {'\n'}
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) => withQuery('/admin/audit', { ...filters, page: p })}
      />
    </>
  );
}
