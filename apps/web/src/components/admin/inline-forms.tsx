'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** "Name [+ parent select] + Add" form posting to an admin collection endpoint. */
export function CreateNamedForm({
  endpoint,
  label,
  placeholder,
  parent,
}: {
  endpoint: string;
  label: string;
  placeholder: string;
  parent?: { field: string; label: string; options: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(parent?.options[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.post(endpoint, { name, ...(parent ? { [parent.field]: parentId } : {}) });
      toast.success(`${label} added`);
      setName('');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'DUPLICATE'
          ? 'This name already exists.'
          : errorMessage(err),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:flex sm:items-start">
      {parent && (
        <Select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          aria-label={parent.label}
          className="sm:w-48"
        >
          {parent.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      )}
      <div className="grid flex-1 gap-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={`New ${label.toLowerCase()} name`}
          aria-invalid={error ? true : undefined}
          maxLength={100}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" loading={pending} disabled={!name.trim() || (parent && !parentId)}>
        Add
      </Button>
    </form>
  );
}

/** Row with inline rename and archive/restore (archiving keeps history). */
export function NamedRow({
  endpoint,
  name,
  archived,
  meta,
}: {
  endpoint: string;
  name: string;
  archived: boolean;
  meta?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>, success: string) {
    setPending(true);
    try {
      await api.patch(endpoint, body);
      toast.success(success);
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ name: value }, 'Renamed');
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Name"
            autoFocus
            maxLength={100}
          />
          <Button type="submit" size="icon" variant="ghost" loading={pending} aria-label="Save">
            <Check aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setEditing(false)}
            aria-label="Cancel"
          >
            <X aria-hidden />
          </Button>
        </form>
      ) : (
        <>
          <span className={archived ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>
            {name}
            {meta && (
              <span className="ml-2 text-xs text-muted-foreground no-underline">{meta}</span>
            )}
          </span>
          {!archived && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${name}`}
            >
              <Pencil aria-hidden />
            </Button>
          )}
          {archived ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => patch({ archived: false }, 'Restored')}
            >
              <ArchiveRestore aria-hidden /> Restore
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button size="icon" variant="ghost" aria-label={`Archive ${name}`}>
                  <Archive aria-hidden />
                </Button>
              }
              title={`Archive “${name}”?`}
              description="It will no longer be offered for new records. Existing records keep it, and you can restore it later."
              confirmLabel="Archive"
              onConfirm={() => patch({ archived: true }, 'Archived')}
            />
          )}
        </>
      )}
    </li>
  );
}
