'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  BarChart3,
  FileDown,
  KeyRound,
  NotebookPen,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  UserMinus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { GENDERS, ROLES, ROLE_LABELS } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { FilterOptions } from '@/lib/trainer';
import type { ListResponse, UserDto } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField, fieldAria } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ClassOption = FilterOptions['classes'][number];

const formSchema = z.object({
  role: z.enum(ROLES),
  fullName: z.string().trim().min(1, 'Full name is required').max(150),
  username: z
    .string()
    .trim()
    .min(3, 'At least 3 characters')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, . _ - only'),
  studentCode: z.string().trim().max(32),
  email: z.union([z.literal(''), z.email('Enter a valid email')]),
  gender: z.string(),
  classId: z.string(),
});
type Values = z.infer<typeof formSchema>;
const FIELDS = [
  'role',
  'fullName',
  'username',
  'studentCode',
  'email',
  'gender',
  'classId',
] as const;

function TemporaryPasswordNotice({ password, username }: { password: string; username: string }) {
  return (
    <div role="status" className="grid gap-2 rounded-md border bg-accent p-3 text-sm">
      <p>
        Temporary password for <span className="font-medium">@{username}</span> (shown only once).
        The user must change it at first sign-in.
      </p>
      <code className="justify-self-start rounded bg-card px-2 py-1 font-mono text-base select-all">
        {password}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start"
        onClick={() => navigator.clipboard?.writeText(password).then(() => toast.success('Copied'))}
      >
        Copy
      </Button>
    </div>
  );
}

function UserForm({
  user,
  classes,
  onDone,
}: {
  user?: UserDto;
  classes: ClassOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [temp, setTemp] = useState<{ password: string; username: string } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      role: user?.role ?? 'STUDENT',
      fullName: user?.fullName ?? '',
      username: user?.username ?? '',
      studentCode: user?.studentCode ?? '',
      email: user?.email ?? '',
      gender: user?.gender ?? '',
      classId: user?.class?.id ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: 'role' });

  async function submit(v: Values) {
    const body = {
      ...v,
      studentCode: v.role === 'STUDENT' ? v.studentCode : '',
      classId: v.role === 'STUDENT' ? v.classId : '',
    };
    try {
      if (user) {
        await api.patch(`/admin/users/${user.id}`, body);
        toast.success('User updated');
        onDone();
      } else {
        const res = await api.post<{ data: UserDto; meta: { temporaryPassword?: string } }>(
          '/admin/users',
          body,
        );
        toast.success('User created');
        if (res.meta.temporaryPassword)
          setTemp({ password: res.meta.temporaryPassword, username: res.data.username });
        else onDone();
      }
      router.refresh();
    } catch (err) {
      if (!applyFieldErrors(err, form.setError, FIELDS)) toast.error(errorMessage(err));
    }
  }

  if (temp) {
    return (
      <div className="grid gap-4">
        <TemporaryPasswordNotice password={temp.password} username={temp.username} />
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="u-role" label="Role" error={errors.role?.message}>
          <Select {...fieldAria('u-role', errors.role?.message)} {...form.register('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="u-name" label="Full name" error={errors.fullName?.message}>
          <Input
            {...fieldAria('u-name', errors.fullName?.message)}
            className="khmer-safe"
            {...form.register('fullName')}
          />
        </FormField>
        <FormField id="u-username" label="Username" error={errors.username?.message}>
          <Input
            {...fieldAria('u-username', errors.username?.message)}
            autoCapitalize="none"
            {...form.register('username')}
          />
        </FormField>
        <FormField id="u-email" label="Email" optional error={errors.email?.message}>
          <Input
            {...fieldAria('u-email', errors.email?.message)}
            type="email"
            {...form.register('email')}
          />
        </FormField>
        {role === 'STUDENT' && (
          <>
            <FormField id="u-code" label="Student ID" error={errors.studentCode?.message}>
              <Input
                {...fieldAria('u-code', errors.studentCode?.message)}
                {...form.register('studentCode')}
              />
            </FormField>
            <FormField id="u-class" label="Class" optional error={errors.classId?.message}>
              <Select
                {...fieldAria('u-class', errors.classId?.message)}
                {...form.register('classId')}
              >
                <option value="">No class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.generation.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </>
        )}
        <FormField id="u-gender" label="Gender" optional>
          <Select id="u-gender" {...form.register('gender')}>
            <option value="">Not specified</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {!user && (
        <p className="text-xs text-muted-foreground">
          A temporary password is generated and shown once.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {user ? 'Save changes' : 'Create user'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateUserButton({ classes }: { classes: ClassOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> New user
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
          </DialogHeader>
          {open && <UserForm classes={classes} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssignmentsDialog({
  trainer,
  classes,
  onClose,
}: {
  trainer: UserDto;
  classes: ClassOption[];
  onClose: () => void;
}) {
  const [assigned, setAssigned] = useState<UserDto[] | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserDto[]>([]);
  const [classId, setClassId] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await api.get<{ data: UserDto[] }>(`/admin/trainers/${trainer.id}/students`);
    setAssigned(res.data);
  }
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: UserDto[] }>(`/admin/trainers/${trainer.id}/students`)
      .then((res) => !cancelled && setAssigned(res.data))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [trainer.id]);

  async function find() {
    if (!search.trim()) return;
    const res = await api.get<ListResponse<UserDto>>(
      `/admin/users?role=STUDENT&status=ACTIVE&pageSize=10&search=${encodeURIComponent(search)}`,
    );
    setResults(res.data);
  }

  async function add(body: { studentIds?: string[]; classId?: string }) {
    setBusy(true);
    try {
      const res = await api.post<{ data: { added: number } }>(
        `/admin/trainers/${trainer.id}/students`,
        body,
      );
      toast.success(`${res.data.added} student(s) assigned`);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(studentId: string) {
    try {
      await api.delete(`/admin/trainers/${trainer.id}/students/${studentId}`);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const assignedIds = new Set(assigned?.map((s) => s.id));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Students of {trainer.fullName}</DialogTitle>
          <DialogDescription>Trainers can only see students assigned to them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            aria-label="Class to assign"
          >
            <option value="">Assign a whole class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.generation.name}
              </option>
            ))}
          </Select>
          <Button variant="outline" disabled={!classId || busy} onClick={() => add({ classId })}>
            Assign class
          </Button>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), find())}
            placeholder="Find a student by name or ID"
            aria-label="Find a student"
          />
          <Button variant="outline" onClick={find}>
            Search
          </Button>
        </div>
        {results.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {results.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-md p-1.5 hover:bg-muted"
              >
                <span>
                  {s.fullName} <span className="text-muted-foreground">{s.studentCode}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={assignedIds.has(s.id) || busy}
                  onClick={() => add({ studentIds: [s.id] })}
                >
                  {assignedIds.has(s.id) ? 'Assigned' : 'Assign'}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="max-h-64 overflow-y-auto border-t pt-3">
          <p className="mb-2 text-sm font-medium">Assigned ({assigned?.length ?? '…'})</p>
          <ul className="grid gap-1 text-sm">
            {assigned?.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {s.fullName} <span className="text-muted-foreground">{s.class?.name}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(s.id)}
                  aria-label={`Remove ${s.fullName}`}
                >
                  <UserMinus aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const LINK_ICONS = { progress: BarChart3, reflections: NotebookPen, pdf: FileDown } as const;

export interface RowLink {
  href: string;
  label: string;
  /** Icon name (server components cannot pass icon components to client components). */
  icon: keyof typeof LINK_ICONS;
  /** Plain download link (e.g. PDF) instead of client navigation. */
  download?: boolean;
}

export function UserRowActions({
  user,
  classes,
  links = [],
}: {
  user: UserDto;
  classes: ClassOption[];
  /** Shortcuts shown at the top of the menu (e.g. student progress / reflections). */
  links?: RowLink[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | 'edit' | 'status' | 'reset' | 'assign'>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deactivate = user.status === 'ACTIVE';

  async function toggleStatus() {
    setBusy(true);
    try {
      await api.patch(`/admin/users/${user.id}`, { status: deactivate ? 'INACTIVE' : 'ACTIVE' });
      toast.success(deactivate ? 'Account deactivated' : 'Account activated');
      setDialog(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    try {
      const res = await api.post<{ data: { temporaryPassword: string } }>(
        `/admin/users/${user.id}/reset-password`,
      );
      setTemp(res.data.temporaryPassword);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.fullName}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {links.map((l) => {
            const Icon = LINK_ICONS[l.icon];
            return (
              <DropdownMenuItem key={l.href} asChild>
                {l.download ? (
                  <a href={l.href} download>
                    <Icon aria-hidden /> {l.label}
                  </a>
                ) : (
                  <Link href={l.href}>
                    <Icon aria-hidden /> {l.label}
                  </Link>
                )}
              </DropdownMenuItem>
            );
          })}
          {links.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <Pencil aria-hidden /> Edit
          </DropdownMenuItem>
          {user.role === 'TRAINER' && (
            <DropdownMenuItem onSelect={() => setDialog('assign')}>
              <Users aria-hidden /> Assigned students
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDialog('reset')}>
            <KeyRound aria-hidden /> Reset password
          </DropdownMenuItem>
          <DropdownMenuItem destructive={deactivate} onSelect={() => setDialog('status')}>
            <Power aria-hidden /> {deactivate ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'edit'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit {user.fullName}</DialogTitle>
          </DialogHeader>
          {dialog === 'edit' && (
            <UserForm user={user} classes={classes} onDone={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'status'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{deactivate ? 'Deactivate account?' : 'Activate account?'}</DialogTitle>
            <DialogDescription>
              {deactivate
                ? `${user.fullName} will be signed out and cannot sign in. Their reading history is kept and the account can be activated again.`
                : `${user.fullName} will be able to sign in again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={deactivate ? 'destructive' : 'default'}
              loading={busy}
              onClick={toggleStatus}
            >
              {deactivate ? 'Deactivate' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === 'reset'}
        onOpenChange={(v) => {
          if (!v) {
            setDialog(null);
            setTemp(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {temp
                ? 'Give this temporary password to the user in person.'
                : `${user.fullName} will be signed out everywhere and must choose a new password.`}
            </DialogDescription>
          </DialogHeader>
          {temp ? (
            <TemporaryPasswordNotice password={temp} username={user.username} />
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button loading={busy} onClick={resetPassword}>
                Reset password
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {dialog === 'assign' && (
        <AssignmentsDialog trainer={user} classes={classes} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
