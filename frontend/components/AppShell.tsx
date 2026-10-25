'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { usePreferences } from '@/lib/preferences';
import type { PharmacyBranding } from '@/lib/types';
import { Spinner } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/pos', label: 'Point of sale', icon: '$' },
  { href: '/sales', label: 'Sales history', icon: '▧' },
  { href: '/reports', label: 'Reports', icon: '▤' },
  { href: '/drugs', label: 'Drugs', icon: '✚' },
  { href: '/stock', label: 'Stock', icon: '▤' },
  { href: '/suppliers', label: 'Suppliers', icon: '⛟' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

const TITLES: Record<string, string> = {
  '/dashboard': 'Your pharmacy at a glance',
  '/pos': 'A quicker checkout experience',
  '/sales': 'Receipts and payment tracking',
  '/reports': 'Understand sales and demand',
  '/drugs': 'Medicine catalogue',
  '/stock': 'Inventory and expiry control',
  '/suppliers': 'Your supplier directory',
  '/settings': 'Make PharmaCore yours',
  '/settings/mpesa': 'Connect branch payments',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, ready, logout } = useAuth();
  const { preferences, updatePreferences } = usePreferences();
  const branding = useFetch(() => api<PharmacyBranding>('/pharmacy/branding'), [session?.tenant.id]);
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const collapsed = preferences.sidebarCollapsed;

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);

  useEffect(() => setOpen(false), [path]);

  const pageTitle = TITLES[path] ?? 'Pharmacy operations';

  if (!ready || !session) return <Spinner />;

  return (
    <div className="min-h-screen lg:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-slate-900">
          {branding.data?.logo_url ? <img src={branding.data.logo_url} alt="" className="h-8 w-8 rounded-xl bg-white object-contain" /> : <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">P</span>}
          <span className="truncate">{branding.data?.name ?? session.tenant.name}</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="text-2xl leading-none" aria-label="Menu">☰</button>
      </header>

      <aside className={`${open ? 'block' : 'hidden'} ${collapsed ? 'lg:w-[5.5rem]' : 'lg:w-64'} w-full border-r border-slate-800/10 bg-slate-950 text-slate-300 transition-[width] duration-200 lg:fixed lg:inset-y-0 lg:z-20 lg:block`}>
        <div className={`flex h-16 items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden font-bold tracking-tight text-white">
            {branding.data?.logo_url ? <img src={branding.data.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-0.5" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-lg text-white shadow-lg shadow-brand-900/40">P</span>}
            {!collapsed && <span className="truncate">{branding.data?.name ?? session.tenant.name}</span>}
          </Link>
          <button onClick={() => updatePreferences({ sidebarCollapsed: !collapsed })} className="hidden rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:block" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <div className={`mx-3 mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3 ${collapsed ? 'hidden' : ''}`}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</div>
          <div className="truncate text-sm font-semibold text-white">{branding.data?.name ?? session.tenant.name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs capitalize text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{session.user.role.replace('_', ' ')} account
          </div>
        </div>

        <div className={`px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 ${collapsed ? 'sr-only' : ''}`}>Workspace</div>
        <nav className="max-h-[calc(100vh-21rem)] space-y-1 overflow-y-auto px-3 pb-2" aria-label="Main navigation">
          {NAV.filter((n) => (n.href !== '/pos' || session.user.role !== 'stock_clerk')
            && (n.href !== '/reports' || ['owner', 'admin', 'pharmacist'].includes(session.user.role))).map((n) => {
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <Link
                key={n.href}
                href={n.href}
                title={collapsed ? n.label : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-brand-600 font-semibold text-white shadow-lg shadow-brand-900/25' : 'text-slate-400 hover:bg-white/[0.07] hover:text-white'} ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-base ${active ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-slate-400 group-hover:text-white'}`}>{n.icon}</span>
                {!collapsed && <span>{n.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={`absolute bottom-0 left-0 right-0 border-t border-white/10 p-3 ${collapsed ? 'lg:flex lg:justify-center' : ''}`}>
          <div className={`mb-2 flex items-center gap-3 rounded-xl px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">{session.user.full_name.slice(0, 1).toUpperCase()}</span>
            {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium text-white">{session.user.full_name}</div><div className="truncate text-[10px] text-slate-500">{session.user.email}</div></div>}
          </div>
          <button onClick={logout} title={collapsed ? 'Sign out' : undefined} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-400 transition hover:bg-white/[0.07] hover:text-white ${collapsed ? 'lg:w-auto' : ''}`}>
            <span className="inline-block w-7 text-center">⎋</span>{!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 p-4 pt-6 sm:p-8 lg:pt-5 ${collapsed ? 'lg:ml-[5.5rem]' : 'lg:ml-64'}`}>
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-6 hidden items-center justify-between border-b border-slate-200/80 pb-4 lg:flex">
            <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-brand-700">{branding.data?.name ?? session.tenant.name}</p><p className="mt-1 text-sm text-slate-500">{pageTitle}</p></div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Workspace ready</div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
