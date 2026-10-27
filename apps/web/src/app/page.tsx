import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/server';
import { homeForRole } from '@/lib/navigation';

/** Entry point: send each role to its home page. */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  redirect(user.mustChangePassword ? '/change-password' : homeForRole(user.role));
}
