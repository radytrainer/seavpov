import type { Metadata } from 'next';
import Link from 'next/link';
import { FileUp, Search, Users } from 'lucide-react';
import { apiGet } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { pageParam, param, withQuery, type RawSearchParams } from '@/lib/search-params';
import type { FilterOptions, RangeMeta, StudentRow } from '@/lib/trainer';
import type { ListResponse, PageMeta, UserDto } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState, PageHeader } from '@/components/ui/states';
import { CreateUserButton, UserRowActions } from './user-actions';
import { StudentAdminTable } from './student-admin-table';

export const metadata: Metadata = { title: 'Users' };

const PAGE_SIZE = 25;
const TABS = [
  { key: 'students', label: 'Students' },
  { key: 'trainers', label: 'Trainers' },
  { key: 'admins', label: 'Administrators' },
] as const;
type Tab = (typeof TABS)[number]['key'];

interface Counts {
  students: number;
  trainers: number;
  admins: number;
  inactiveAccounts: number;
}

/**
 * Users, organised by role. The Students tab is built for checking progress quickly: each row
 * shows recent reading against the goal, the current book, reflections waiting for feedback and
 * the assigned trainers, with one-click links to the student's progress and reflections.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === param(sp, 'tab'))?.key ?? 'students';
  const page = pageParam(sp);
  // Start the student list together with the summary requests (no request waterfall).
  const studentFilters = filtersFrom(sp);
  const studentList =
    tab === 'students'
      ? apiGet<StudentList>(
          withQuery('/trainer/students', { ...studentFilters, page, pageSize: PAGE_SIZE }),
        )
      : null;
  const [counts, options, noTrainer, encourage] = await Promise.all([
    apiGet<{ data: Counts }>('/admin/overview'),
    apiGet<{ data: FilterOptions }>('/trainer/filters'),
    apiGet<{ meta: PageMeta }>('/trainer/students?unassigned=true&pageSize=1'),
    apiGet<{ meta: PageMeta }>('/trainer/students?inactiveOnly=true&pageSize=1'),
  ]);
  const classes = options.data.classes;

  const summary = [
    { label: 'Active students', value: counts.data.students, href: '/admin/users', warn: false },
    {
      label: 'Trainers',
      value: counts.data.trainers,
      href: '/admin/users?tab=trainers',
      warn: false,
    },
    {
      label: 'Without a trainer',
      value: noTrainer.meta.total,
      href: '/admin/users?unassigned=true',
      warn: noTrainer.meta.total > 0,
    },
    {
      label: 'May need encouragement',
      value: encourage.meta.total,
      href: '/admin/users?inactiveOnly=true',
      warn: encourage.meta.total > 0,
    },
    {
      label: 'Deactivated accounts',
      value: counts.data.inactiveAccounts,
      href: '/admin/users?accountStatus=INACTIVE',
      warn: false,
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Find a student to check their progress and reflections, or manage accounts."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/users/import">
                <FileUp aria-hidden /> Import CSV
              </Link>
            </Button>
            <CreateUserButton classes={classes} />
          </>
        }
      />

      <section
        aria-label="Summary"
        className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {summary.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border bg-card px-3 py-2.5 shadow-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="block text-xs text-muted-foreground">{s.label}</span>
            <span
              className={cn(
                'text-xl font-semibold tabular-nums',
                s.warn && 'text-warning-foreground',
              )}
            >
              {s.value}
            </span>
          </Link>
        ))}
      </section>

      <nav aria-label="User groups" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'students' ? '/admin/users' : `/admin/users?tab=${t.key}`}
            aria-current={t.key === tab ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
              t.key === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'students' ? (
        <StudentsTab
          filters={studentFilters}
          list={await studentList!}
          page={page}
          options={options.data}
        />
      ) : (
        <StaffTab
          role={tab === 'trainers' ? 'TRAINER' : 'ADMIN'}
          sp={sp}
          page={page}
          classes={classes}
        />
      )}
    </>
  );
}

type StudentList = { data: StudentRow[]; meta: PageMeta & { range: RangeMeta } };

function filtersFrom(sp: RawSearchParams) {
  return {
    search: param(sp, 'search'),
    classId: param(sp, 'classId'),
    generationId: param(sp, 'generationId'),
    accountStatus: param(sp, 'accountStatus'),
    unassigned: param(sp, 'unassigned'),
    inactiveOnly: param(sp, 'inactiveOnly'),
  };
}

function StudentsTab({
  filters,
  list,
  page,
  options,
}: {
  filters: ReturnType<typeof filtersFrom>;
  list: StudentList;
  page: number;
  options: FilterOptions;
}) {
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <form
        method="get"
        role="search"
        className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-[1fr_auto_auto_auto_auto]"
      >
        <label className="relative col-span-2 lg:col-span-1">
          <span className="sr-only">Search students</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="search"
            defaultValue={filters.search}
            placeholder="Name, student ID, username or email"
            className="pl-9"
          />
        </label>
        <Select name="classId" defaultValue={filters.classId ?? ''} aria-label="Class">
          <option value="">All classes</option>
          {options.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.generation.name}
            </option>
          ))}
        </Select>
        <Select
          name="generationId"
          defaultValue={filters.generationId ?? ''}
          aria-label="Generation"
        >
          <option value="">All generations</option>
          {options.generations.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select
          name="accountStatus"
          defaultValue={filters.accountStatus ?? 'ACTIVE'}
          aria-label="Account status"
        >
          <option value="ACTIVE">Active accounts</option>
          <option value="INACTIVE">Deactivated</option>
          <option value="ALL">All accounts</option>
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-sm lg:col-span-5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="unassigned"
              value="true"
              defaultChecked={filters.unassigned === 'true'}
              className="size-4 accent-[var(--primary)]"
            />
            Without a trainer
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="inactiveOnly"
              value="true"
              defaultChecked={filters.inactiveOnly === 'true'}
              className="size-4 accent-[var(--primary)]"
            />
            May need encouragement
          </label>
          {filtered && (
            <Link href="/admin/users" className="text-primary hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </form>
      <p className="mb-3 text-xs text-muted-foreground">
        {list.meta.total} student{list.meta.total === 1 ? '' : 's'} · reading figures cover{' '}
        {formatDate(list.meta.range.from)} – {formatDate(list.meta.range.to)}
      </p>
      {list.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description="Try another search or clear the filters."
        />
      ) : (
        <StudentAdminTable rows={list.data} classes={options.classes} />
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) => withQuery('/admin/users', { ...filters, page: p })}
      />
    </>
  );
}

async function StaffTab({
  role,
  sp,
  page,
  classes,
}: {
  role: 'TRAINER' | 'ADMIN';
  sp: RawSearchParams;
  page: number;
  classes: FilterOptions['classes'];
}) {
  const tab = role === 'TRAINER' ? 'trainers' : 'admins';
  const filters = { search: param(sp, 'search'), status: param(sp, 'status') };
  const list = await apiGet<ListResponse<UserDto & { assignedStudents: number }>>(
    withQuery('/admin/users', { ...filters, role, page, pageSize: PAGE_SIZE }),
  );
  return (
    <>
      <form
        method="get"
        role="search"
        className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]"
      >
        <input type="hidden" name="tab" value={tab} />
        <Input
          name="search"
          defaultValue={filters.search}
          placeholder="Name, username or email"
          aria-label="Search"
          className="col-span-2 sm:col-span-1"
        />
        <Select name="status" defaultValue={filters.status ?? ''} aria-label="Account status">
          <option value="">All accounts</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Deactivated</option>
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {list.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title={`No ${role === 'TRAINER' ? 'trainers' : 'administrators'} found`}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                  Email
                </th>
                {role === 'TRAINER' && (
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Students
                  </th>
                )}
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Last sign-in
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Status
                </th>
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.data.map((u) => (
                <tr key={u.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium">{u.fullName}</span>
                    <span className="text-xs text-muted-foreground">@{u.username}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted-foreground sm:table-cell">
                    {u.email ?? '—'}
                  </td>
                  {role === 'TRAINER' && (
                    <td className="px-3 py-2.5 text-right tabular-nums">{u.assignedStudents}</td>
                  )}
                  <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">
                    {formatDate(u.lastLoginAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {u.status === 'ACTIVE' ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Deactivated</Badge>
                      )}
                      {u.mustChangePassword && <Badge variant="neutral">Temp. password</Badge>}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <UserRowActions user={u} classes={classes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={list.meta.total}
        hrefFor={(p) => withQuery('/admin/users', { ...filters, tab, page: p })}
      />
    </>
  );
}
