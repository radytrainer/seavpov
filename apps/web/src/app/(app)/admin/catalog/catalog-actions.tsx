'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Archive,
  ArchiveRestore,
  Check,
  GitMerge,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { libraryBookInputSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import type { Category, LibraryBook, ListResponse } from '@/lib/types';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type In = z.input<typeof libraryBookInputSchema>;
type Out = z.output<typeof libraryBookInputSchema>;
const FIELDS = [
  'title',
  'author',
  'categoryId',
  'totalPages',
  'isbn',
  'libraryCode',
  'coverImageUrl',
] as const;

function BookForm({
  book,
  categories,
  onDone,
}: {
  book?: LibraryBook;
  categories: Category[];
  onDone: () => void;
}) {
  const router = useRouter();
  const form = useForm<In, unknown, Out>({
    resolver: zodResolver(libraryBookInputSchema),
    defaultValues: {
      title: book?.title ?? '',
      author: book?.author ?? '',
      categoryId: book?.category?.id ?? '',
      totalPages: (book?.totalPages ?? '') as number,
      isbn: book?.isbn ?? '',
      libraryCode: book?.libraryCode ?? '',
      coverImageUrl: book?.coverImageUrl ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function submit(values: Out) {
    try {
      if (book) await api.patch(`/library-books/${book.id}`, values);
      else await api.post('/library-books', values);
      toast.success(book ? 'Book updated' : 'Book added');
      onDone();
      router.refresh();
    } catch (err) {
      if (!applyFieldErrors(err, form.setError, FIELDS)) toast.error(errorMessage(err));
    }
  }

  const text = (
    name: (typeof FIELDS)[number],
    label: string,
    optional = true,
    props: React.ComponentProps<'input'> = {},
  ) => (
    <FormField id={`cb-${name}`} label={label} optional={optional} error={errors[name]?.message}>
      <Input
        {...fieldAria(`cb-${name}`, errors[name]?.message)}
        {...props}
        {...form.register(name)}
      />
    </FormField>
  );

  return (
    <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
      {text('title', 'Title', false, { className: 'khmer-safe' })}
      <div className="grid gap-4 sm:grid-cols-2">
        {text('author', 'Author')}
        <FormField id="cb-categoryId" label="Category" optional>
          <Select id="cb-categoryId" {...form.register('categoryId')}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        {text('totalPages', 'Total pages', true, { type: 'number', inputMode: 'numeric', min: 1 })}
        {text('libraryCode', 'Library book ID')}
        {text('isbn', 'ISBN')}
        {text('coverImageUrl', 'Cover image URL (https)', true, { type: 'url' })}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewCatalogBookButton({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add book
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a library book</DialogTitle>
          </DialogHeader>
          {open && <BookForm categories={categories} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MergeDialog({ book, onClose }: { book: LibraryBook; onClose: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LibraryBook[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  async function find() {
    const res = await api.get<ListResponse<LibraryBook>>(
      `/library-books?pageSize=10&search=${encodeURIComponent(search)}`,
    );
    setResults(res.data.filter((b) => b.id !== book.id && !b.archivedAt));
  }
  async function merge(target: LibraryBook) {
    setPending(target.id);
    try {
      const res = await api.post<{ data: { moved: number } }>(`/library-books/${book.id}/merge`, {
        targetId: target.id,
      });
      toast.success(`Merged. ${res.data.moved} student record(s) moved.`);
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge “{book.title}”</DialogTitle>
          <DialogDescription>
            Students’ records move to the book you choose, and this entry is archived. Use this for
            duplicate entries of the same physical book.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), find())}
            placeholder="Find the correct book"
            aria-label="Find the book to keep"
          />
          <Button variant="outline" onClick={find}>
            Search
          </Button>
        </div>
        <ul className="grid gap-1 text-sm">
          {results.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md p-1.5 hover:bg-muted"
            >
              <span className="min-w-0 truncate">
                {b.title} <span className="text-muted-foreground">{b.author}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                loading={pending === b.id}
                disabled={pending !== null}
                onClick={() => merge(b)}
              >
                Merge into this
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogActions({
  book,
  categories,
}: {
  book: LibraryBook;
  categories: Category[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | 'edit' | 'merge'>(null);

  async function patch(body: Record<string, unknown>, success: string) {
    try {
      await api.patch(`/library-books/${book.id}`, body);
      toast.success(success);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      {book.status === 'PENDING' && !book.archivedAt && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => patch({ status: 'APPROVED' }, 'Book approved')}
        >
          <Check aria-hidden /> Approve
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${book.title}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <Pencil aria-hidden /> Edit details
          </DropdownMenuItem>
          {!book.archivedAt && (
            <DropdownMenuItem onSelect={() => setDialog('merge')}>
              <GitMerge aria-hidden /> Merge duplicate…
            </DropdownMenuItem>
          )}
          {book.archivedAt ? (
            <DropdownMenuItem onSelect={() => patch({ archived: false }, 'Book restored')}>
              <ArchiveRestore aria-hidden /> Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => patch({ archived: true }, 'Book archived')}>
              <Archive aria-hidden /> Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog === 'edit'} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit book</DialogTitle>
          </DialogHeader>
          {dialog === 'edit' && (
            <BookForm book={book} categories={categories} onDone={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>
      {dialog === 'merge' && <MergeDialog book={book} onClose={() => setDialog(null)} />}
    </>
  );
}
