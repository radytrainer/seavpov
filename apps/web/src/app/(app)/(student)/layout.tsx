import { requireUser } from '@/lib/api/server';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireUser('STUDENT');
  return children;
}
