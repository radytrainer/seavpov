import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        description="This page does not exist or you do not have access to it."
        action={
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    </main>
  );
}
