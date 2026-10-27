'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, MoreHorizontal } from 'lucide-react';
import { Brand } from '@/components/brand/logo';
import { ROLE_LABELS, type Role } from '@rt/shared';
import { cn } from '@/lib/utils';
import { LogoutButton } from '@/components/auth/logout-button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NAV, isActive, type NavItem } from './nav-config';

interface ShellUser {
  fullName: string;
  role: Role;
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

function MenuSheet({
  open,
  onOpenChange,
  items,
  user,
  pathname,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: NavItem[];
  user: ShellUser;
  pathname: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none sm:max-w-none">
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <div className="px-1">
          <p className="truncate text-sm font-semibold">{user.fullName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
        </div>
        <nav aria-label="Menu" className="grid gap-1">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={() => onOpenChange(false)}
            />
          ))}
        </nav>
        <LogoutButton variant="outline" />
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = NAV[user.role];
  const isStudent = user.role === 'STUDENT';
  const mobileItems = items.filter((i) => i.mobile);
  const moreItems = items.filter((i) => !i.mobile);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Brand />
        </div>
        <nav aria-label="Main" className="grid gap-1 p-3">
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="mt-auto border-t p-3">
          <p className="truncate px-3 text-sm font-medium">{user.fullName}</p>
          <p className="px-3 text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          <LogoutButton className="mt-2 w-full justify-start" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Brand />
          </Link>
          {!isStudent && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-md p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Open menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          )}
        </header>

        <main
          id="main"
          className={cn(
            'mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 md:py-8',
            isStudent && 'pb-24 md:pb-8',
          )}
        >
          {children}
        </main>

        {/* Student mobile bottom navigation */}
        {isStudent && (
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {mobileItems.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                    active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label === 'Dashboard'
                    ? 'Home'
                    : item.label === 'My Books'
                      ? 'Books'
                      : item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
            >
              <MoreHorizontal className="size-5" aria-hidden />
              More
            </button>
          </nav>
        )}

        <MenuSheet
          open={menuOpen}
          onOpenChange={setMenuOpen}
          items={isStudent ? moreItems : items}
          user={user}
          pathname={pathname}
        />
      </div>
    </div>
  );
}
