import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/states';
import { ImportForm } from './import-form';

export const metadata: Metadata = { title: 'Import students' };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/users"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Users
      </Link>
      <PageHeader
        title="Import students from CSV"
        description="The file is checked first. Students are created only when every row is valid."
      />
      <ImportForm />
    </div>
  );
}
