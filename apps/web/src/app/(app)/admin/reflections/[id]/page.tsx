import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiGetOrNull } from '@/lib/api/server';
import type { Reflection } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import {
  FeedbackList,
  ReflectionBody,
  ReflectionMeta,
} from '@/components/reflections/reflection-view';

export const metadata: Metadata = { title: 'Reflection' };

/** Read-only reflection view for administrators. */
export default async function AdminReflectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiGetOrNull<{ data: Reflection }>(`/reflections/${id}`);
  if (!res) notFound();
  const r = res.data;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">
        {r.studentName} · {r.book.title}
      </h1>
      <div className="mb-5">
        <ReflectionMeta reflection={r} />
      </div>
      <div className="grid gap-5">
        <Card>
          <CardContent className="pt-5">
            <ReflectionBody reflection={r} />
          </CardContent>
        </Card>
        <FeedbackList reflection={r} />
      </div>
    </div>
  );
}
