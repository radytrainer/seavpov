'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      message="This page could not be loaded. Check your connection and try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
