import { requireUser } from '@/lib/api/server';

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireUser('TRAINER');
  return children;
}
