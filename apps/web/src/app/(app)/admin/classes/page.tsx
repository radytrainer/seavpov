import type { Metadata } from 'next';
import { apiGet } from '@/lib/api/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/states';
import { CreateNamedForm, NamedRow } from '@/components/admin/inline-forms';

export const metadata: Metadata = { title: 'Classes' };

interface Generation {
  id: string;
  name: string;
  startYear: number | null;
  archivedAt: string | null;
  _count: { classes: number };
}
interface ClassRow {
  id: string;
  name: string;
  archivedAt: string | null;
  generation: { id: string; name: string };
  _count: { students: number };
}

export default async function ClassesPage() {
  const [gens, classes] = await Promise.all([
    apiGet<{ data: Generation[] }>('/admin/generations'),
    apiGet<{ data: ClassRow[] }>('/admin/classes'),
  ]);
  const activeGens = gens.data.filter((g) => !g.archivedAt);

  return (
    <>
      <PageHeader
        title="Classes and generations"
        description="A class belongs to a generation. Archive instead of deleting to keep history."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Generations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <CreateNamedForm
              endpoint="/admin/generations"
              label="Generation"
              placeholder="e.g. Generation 2027"
            />
            <ul className="divide-y rounded-md border text-sm">
              {gens.data.map((g) => (
                <NamedRow
                  key={g.id}
                  endpoint={`/admin/generations/${g.id}`}
                  name={g.name}
                  archived={Boolean(g.archivedAt)}
                  meta={`${g._count.classes} classes`}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
            <CardDescription>
              Assign students to classes from the Users page or through CSV import.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {activeGens.length > 0 ? (
              <CreateNamedForm
                endpoint="/admin/classes"
                label="Class"
                placeholder="e.g. Class C"
                parent={{ field: 'generationId', label: 'Generation', options: activeGens }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Create a generation first.</p>
            )}
            <ul className="divide-y rounded-md border text-sm">
              {classes.data.map((c) => (
                <NamedRow
                  key={c.id}
                  endpoint={`/admin/classes/${c.id}`}
                  name={c.name}
                  archived={Boolean(c.archivedAt)}
                  meta={`${c.generation.name} · ${c._count.students} students`}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
