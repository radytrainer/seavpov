import type { Metadata } from 'next';
import { apiGet } from '@/lib/api/server';
import type { Category } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/states';
import { CreateNamedForm, NamedRow } from '@/components/admin/inline-forms';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const { data } = await apiGet<{ data: Category[] }>('/admin/categories');
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Book categories"
        description="Categories help students and trainers filter books."
      />
      <Card>
        <CardContent className="grid gap-3 pt-5">
          <CreateNamedForm
            endpoint="/admin/categories"
            label="Category"
            placeholder="e.g. Poetry"
          />
          <ul className="divide-y rounded-md border text-sm">
            {data.map((c) => (
              <NamedRow
                key={c.id}
                endpoint={`/admin/categories/${c.id}`}
                name={c.name}
                archived={Boolean(c.archivedAt)}
                meta={`${c.bookCount ?? 0} books`}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
