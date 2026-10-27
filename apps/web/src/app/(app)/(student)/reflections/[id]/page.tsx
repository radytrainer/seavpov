import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { apiGetOrNull } from '@/lib/api/server';
import type { Reflection } from '@/lib/types';
import { PdfLink } from '@/components/reflections/pdf-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  FeedbackList,
  ReflectionBody,
  ReflectionMeta,
} from '@/components/reflections/reflection-view';

export const metadata: Metadata = { title: 'Reflection' };

export default async function ReflectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiGetOrNull<{ data: Reflection }>(`/reflections/${id}`);
  if (!res) notFound();
  const r = res.data;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/reflections"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Reflections
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            <Link href={`/books/${r.book.studentBookId}`} className="hover:underline">
              {r.book.title}
            </Link>
          </h1>
          <ReflectionMeta reflection={r} />
        </div>
        <div className="flex gap-2">
          <PdfLink reflectionId={r.id} label="PDF" />
          <Button asChild variant="outline">
            <Link href={`/reflections/${r.id}/edit`}>
              <Pencil aria-hidden /> Edit
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-5">
        <Card>
          <CardContent className="pt-5">
            <ReflectionBody
              reflection={r}
              tagHref={(t) => `/reflections?tag=${encodeURIComponent(t)}`}
            />
          </CardContent>
        </Card>
        <FeedbackList reflection={r} />
      </div>
    </div>
  );
}
