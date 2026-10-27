import {
  BarChart3,
  BookMarked,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Library,
  NotebookPen,
  School,
  Settings,
  Tags,
  Timer,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@rt/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar (students). */
  mobile?: boolean;
  /** Match only the exact path (for section roots). */
  exact?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  STUDENT: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: true },
    { href: '/books', label: 'My Books', icon: Library, mobile: true },
    { href: '/reading', label: 'Read', icon: Timer, mobile: true },
    { href: '/history', label: 'History', icon: History, mobile: true },
    { href: '/reflections', label: 'Reflections', icon: NotebookPen },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/profile', label: 'Profile', icon: User },
  ],
  TRAINER: [
    { href: '/trainer', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/trainer/students', label: 'Students', icon: Users },
    { href: '/trainer/reflections', label: 'Reflections', icon: NotebookPen },
    { href: '/trainer/reports', label: 'Reports', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
  ],
  ADMIN: [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/classes', label: 'Classes', icon: School },
    { href: '/admin/catalog', label: 'Book catalog', icon: BookMarked },
    { href: '/admin/categories', label: 'Categories', icon: Tags },
    { href: '/admin/reports', label: 'Reports', icon: FileText },
    { href: '/admin/audit', label: 'Audit log', icon: ClipboardList },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
    { href: '/profile', label: 'Profile', icon: User },
  ],
};

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
