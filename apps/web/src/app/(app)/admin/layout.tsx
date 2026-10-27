import { requireUser } from '@/lib/api/server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser('ADMIN');
  return children;
}
