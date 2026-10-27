import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { formatDuration } from '@rt/shared';
import { apiGetOrNull } from '@/lib/api/server';
import { formatDate } from '@/lib/format';
import { param, type RawSearchParams } from '@/lib/search-params';
import type { SessionResponse } from '@/lib/types';
import { PageHeader } from '@/components/ui/states';
import { ReflectionEditor } from '@/components/reflections/reflection-editor';

export const metadata: Metadata = { title: 'New reflection' };

export default async function NewReflectionPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sessionId = param(await searchParams, 'session');
  if (!sessionId) notFound();
  const res = await apiGetOrNull<SessionResponse>(`/reading-sessions/${sessionId}`);
  if (!res || res.data.status !== 'COMPLETED') notFound();
  const s = res.data;
  if (s.reflectionId) redirect(`/reflections/${s.reflectionId}/edit`);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Reflect on your reading"
        description={`${s.book.title} · ${formatDate(s.readingDate)} · ${formatDuration(s.durationSeconds)}. Answer what you can — every field is optional.`}
      />
      <ReflectionEditor sessionId={s.id} />
    </div>
  );
}
