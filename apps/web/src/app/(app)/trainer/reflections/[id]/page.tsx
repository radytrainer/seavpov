import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiGetOrNull, requireUser } from '@/lib/api/server';
import type { Reflection } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FeedbackList,
  ReflectionBody,
  ReflectionMeta,
} from '@/components/reflections/reflection-view';
import { FeedbackForm } from '@/components/reflections/feedback-form';

export const metadata: Metadata = { title: 'Reflection' };

export default async function TrainerReflectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser('TRAINER');
  const { id } = await params;
  const res = await apiGetOrNull<{ data: Reflection }>(`/reflections/${id}`);
  if (!res) notFound();
  const r = res.data;
  const mine = r.feedback.find((f) => f.trainer.id === user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/trainer/reflections?needsFeedback=true"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Reflections
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">
        <Link href={`/trainer/students/${r.studentId}`} className="hover:underline">
          {r.studentName}
        </Link>{' '}
        · {r.book.title}
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
        <Card>
          <CardHeader>
            <CardTitle>{mine ? 'Edit your feedback' : 'Give feedback'}</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackForm reflectionId={r.id} feedback={mine} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
