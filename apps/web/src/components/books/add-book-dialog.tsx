'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { libraryBookInputSchema } from '@rt/shared';
import { api, applyFieldErrors } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { Category, LibraryBook, ListResponse, StudentBook } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField, fieldAria } from '@/components/ui/form-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BookCover } from './book-bits';

type NewBookValues = z.input<typeof libraryBookInputSchema>;
type NewBookOutput = z.output<typeof libraryBookInputSchema>;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AddBookDialog({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 300);
  const [results, setResults] = useState<LibraryBook[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<LibraryBook | null>(null);

  useEffect(() => {
    if (!open || mode !== 'search') return;
    let cancelled = false;
    api
      .get<ListResponse<LibraryBook>>(
        `/library-books?pageSize=8${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`,
      )
      .then((res) => {
        if (!cancelled) {
          setResults(res.data);
          setSearchError(null);
        }
      })
      .catch((err) => !cancelled && setSearchError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [debounced, open, mode]);

  function finish(created: StudentBook) {
    toast.success(`Added “${created.book.title}” to My Books`);
    setOpen(false);
    router.push(`/books/${created.id}`);
    router.refresh();
  }

  function handleTrackingConflict(err: unknown): boolean {
    if (err instanceof ApiError && err.code === 'ALREADY_TRACKING') {
      const id = (err.details as { studentBookId?: string } | undefined)?.studentBookId;
      toast.info(err.message, {
        action: id ? { label: 'Open', onClick: () => router.push(`/books/${id}`) } : undefined,
      });
      return true;
    }
    return false;
  }

  async function addExisting(book: LibraryBook) {
    setAddingId(book.id);
    try {
      const res = await api.post<{ data: StudentBook }>('/student-books', {
        libraryBookId: book.id,
        status: 'READING',
      });
      finish(res.data);
    } catch (err) {
      if (!handleTrackingConflict(err)) toast.error(errorMessage(err));
    } finally {
      setAddingId(null);
    }
  }

  const form = useForm<NewBookValues, unknown, NewBookOutput>({
    resolver: zodResolver(libraryBookInputSchema),
    defaultValues: { title: '', author: '', categoryId: '', totalPages: '' as unknown as number },
  });
  const { errors, isSubmitting } = form.formState;

  async function addNew(values: NewBookOutput) {
    setDuplicate(null);
    try {
      const res = await api.post<{ data: StudentBook }>('/student-books', {
        newBook: values,
        status: 'READING',
      });
      form.reset();
      finish(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_BOOK') {
        const existing = (err.details as { existing?: LibraryBook } | undefined)?.existing;
        if (existing) setDuplicate(existing);
        else toast.error(err.message);
        return;
      }
      if (handleTrackingConflict(err)) return;
      if (
        !applyFieldErrors(err, form.setError, [
          'title',
          'author',
          'categoryId',
          'totalPages',
          'isbn',
          'libraryCode',
          'coverImageUrl',
        ])
      ) {
        toast.error(errorMessage(err));
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setMode('search');
          setDuplicate(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden /> Add book
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'search' ? 'Add a library book' : 'Add a new book'}</DialogTitle>
          <DialogDescription>
            {mode === 'search'
              ? 'Find the physical book in the school library catalog.'
              : 'Enter the details printed on the book. The librarian will review new entries.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'search' ? (
          <div className="grid gap-3">
            <label className="relative">
              <span className="sr-only">Search the catalog</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, author, ISBN or library code"
                className="pl-9"
              />
            </label>
            {searchError && (
              <p role="alert" className="text-sm text-destructive">
                {searchError}
              </p>
            )}
            <ul className="grid max-h-72 gap-1 overflow-y-auto" aria-live="polite">
              {results === null ? (
                <li className="py-4 text-center text-sm text-muted-foreground">Loading…</li>
              ) : results.length === 0 ? (
                <li className="py-4 text-center text-sm text-muted-foreground">
                  No books found{debounced ? ` for “${debounced}”` : ''}.
                </li>
              ) : (
                results.map((b) => (
                  <li
                    key={b.id}
                    className="flex min-w-0 items-center gap-3 rounded-md p-2 hover:bg-muted"
                  >
                    <BookCover url={b.coverImageUrl} title={b.title} className="w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[b.author, b.category?.name, b.totalPages && `${b.totalPages} pages`]
                          .filter(Boolean)
                          .join(' · ') || 'No details'}
                        {b.status === 'PENDING' && ' · awaiting review'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={addingId === b.id}
                      disabled={addingId !== null}
                      onClick={() => addExisting(b)}
                    >
                      Add
                    </Button>
                  </li>
                ))
              )}
            </ul>
            <Button
              variant="link"
              className="justify-self-center"
              onClick={() => {
                form.setValue('title', query);
                setMode('new');
              }}
            >
              Can’t find it? Add a new book
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(addNew)} className="grid gap-4" noValidate>
            {duplicate && (
              <div
                role="alert"
                className="grid gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
              >
                <p>
                  “{duplicate.title}”{duplicate.author ? ` by ${duplicate.author}` : ''} is already
                  in the catalog.
                </p>
                <Button
                  size="sm"
                  type="button"
                  className="justify-self-start"
                  loading={addingId === duplicate.id}
                  onClick={() => addExisting(duplicate)}
                >
                  Add the existing book
                </Button>
              </div>
            )}
            <FormField id="nb-title" label="Title" error={errors.title?.message}>
              <Input
                {...fieldAria('nb-title', errors.title?.message)}
                {...form.register('title')}
              />
            </FormField>
            <FormField id="nb-author" label="Author" optional error={errors.author?.message}>
              <Input
                {...fieldAria('nb-author', errors.author?.message)}
                {...form.register('author')}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="nb-category" label="Category" optional>
                <Select id="nb-category" {...form.register('categoryId')}>
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                id="nb-pages"
                label="Total pages"
                optional
                error={errors.totalPages?.message}
              >
                <Input
                  {...fieldAria('nb-pages', errors.totalPages?.message)}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...form.register('totalPages')}
                />
              </FormField>
              <FormField id="nb-isbn" label="ISBN" optional error={errors.isbn?.message}>
                <Input
                  {...fieldAria('nb-isbn', errors.isbn?.message)}
                  inputMode="numeric"
                  {...form.register('isbn')}
                />
              </FormField>
              <FormField
                id="nb-code"
                label="Library book ID"
                optional
                error={errors.libraryCode?.message}
              >
                <Input
                  {...fieldAria('nb-code', errors.libraryCode?.message)}
                  {...form.register('libraryCode')}
                />
              </FormField>
              <FormField
                id="nb-cover"
                label="Cover image link"
                optional
                className="sm:col-span-2"
                hint="An https:// link to a photo of the cover."
                error={errors.coverImageUrl?.message}
              >
                <Input
                  {...fieldAria('nb-cover', errors.coverImageUrl?.message, 'hint')}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  {...form.register('coverImageUrl')}
                />
              </FormField>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setMode('search')}>
                Back to search
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Add book
              </Button>
            </div>
          </form>
        )}
        <p className="text-xs text-muted-foreground">Only printed library books are tracked.</p>
      </DialogContent>
    </Dialog>
  );
}
