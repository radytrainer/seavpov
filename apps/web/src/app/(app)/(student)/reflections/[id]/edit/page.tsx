import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiGetOrNull } from '@/lib/api/server';
import type { Reflection } from '@/lib/types';
import { PageHeader } from '@/components/ui/states';
import { ReflectionEditor } from '@/components/reflections/reflection-editor';
import { ReflectionMeta } from '@/components/reflections/reflection-view';

export const metadata: Metadata = { title: 'Edit reflection' };

export default async function EditReflectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await apiGetOrNull<{ data: Reflection }>(`/reflections/${id}`);
  if (!res) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Edit reflection: ${res.data.book.title}`}
        description={<ReflectionMeta reflection={res.data} />}
      />
      <ReflectionEditor sessionId={res.data.sessionId} reflection={res.data} />
    </div>
  );
}
