'use client';

import Link from 'next/link';
import { Badge, Card, Empty, ErrorBox, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, kes } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import { usePreferences } from '@/lib/preferences';
import type { ExpiryResponse, LowStock } from '@/lib/types';

function Stat({ label, value, tone, icon, note }: { label: string; value: string | number; tone?: string; icon: string; note: string }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-2">
        <div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
          <div className={`mt-2 text-3xl font-bold tracking-tight ${tone ?? 'text-slate-900'}`}>{value}</div>
          <div className="mt-1 text-xs text-slate-500">{note}</div>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-lg text-brand-700">{icon}</span>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { preferences } = usePreferences();
  const expiry = useFetch(() => api<ExpiryResponse>('/alerts/expiry', { query: { days: preferences.expiryWindowDays } }), [preferences.expiryWindowDays]);
  const low = useFetch(() => api<LowStock[]>('/alerts/low-stock'), []);

  const e = expiry.data;
  const l = low.data;
  const expiredCount = e?.expired.length ?? 0;
  const expiringCount = e?.expiring_soon.length ?? 0;
  const lowCount = l?.length ?? 0;
  const visibleWidgetCount = Number(preferences.showExpiryWidget) + Number(preferences.showLowStockWidget);

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-900 via-brand-700 to-brand-600 p-6 text-white shadow-xl shadow-brand-900/10 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-xl"><div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Daily overview</div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Good day. Let’s keep stock moving.</h1><p className="mt-2 text-sm text-white/75">A quick view of your branch’s inventory health and what needs attention.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/pos" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-brand-900 shadow-sm transition hover:bg-brand-50">＋ New sale</Link><Link href="/stock" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">Receive stock</Link></div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Expired batches" value={expiry.loading && !e ? '—' : expiredCount} tone={expiredCount ? 'text-red-600' : undefined} icon="⌛" note="Remove from sale" />
        <Stat label={`Expiring · ${preferences.expiryWindowDays}d`} value={expiry.loading && !e ? '—' : expiringCount} tone={expiringCount ? 'text-amber-600' : undefined} icon="◷" note="Plan before expiry" />
        <Stat label="Stock at risk" value={e ? kes(e.value_at_risk) : '—'} icon="◇" note="Cost value in branch" />
        <Stat label="Low stock" value={low.loading && !l ? '—' : lowCount} tone={lowCount ? 'text-amber-600' : undefined} icon="↓" note="At or below reorder" />
      </div>

      {(expiry.error || low.error) && <div className="mb-5"><ErrorBox message={expiry.error || low.error || 'Dashboard data could not be loaded.'} /></div>}

      <div className={`grid gap-5 ${visibleWidgetCount === 2 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
        {preferences.showExpiryWidget && (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Expiry watchlist</h2><p className="mt-0.5 text-xs text-slate-500">Expired and expiring within {preferences.expiryWindowDays} days</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700">◷</span></div>
          {expiry.loading && !e ? <Spinner /> : !e || e.expired.length + e.expiring_soon.length === 0 ? (
            <Empty>No stock is close to expiry.</Empty>
          ) : (
            <Table>
              <thead><tr><Th>Drug</Th><Th>Batch</Th><Th>Qty</Th><Th>Expiry</Th></tr></thead>
              <tbody>
                {[...e.expired, ...e.expiring_soon].slice(0, 8).map((r) => (
                  <tr key={r.batch_id}>
                    <Td className="font-medium">{r.brand_name}</Td>
                    <Td>{r.batch_no}</Td>
                    <Td>{r.quantity}</Td>
                    <Td>
                      {fmtDate(r.expiry_date)}{' '}
                      <Badge tone={Number(r.days_left) < 0 ? 'red' : Number(r.days_left) <= 30 ? 'red' : 'amber'}>
                        {Number(r.days_left) < 0 ? 'Expired' : `${r.days_left}d`}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="border-t border-slate-100 px-5 py-3 text-sm"><Link href="/stock" className="font-medium text-brand-700 hover:underline">Review inventory <span aria-hidden="true">→</span></Link></div>
        </Card>
        )}

        {preferences.showLowStockWidget && (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-900">Reorder reminders</h2><p className="mt-0.5 text-xs text-slate-500">Medicines at or below the branch reorder level</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">↓</span></div>
          {low.loading && !l ? <Spinner /> : !l || l.length === 0 ? (
            <Empty>Everything is above its reorder level.</Empty>
          ) : (
            <Table>
              <thead><tr><Th>Drug</Th><Th>In stock</Th><Th>Reorder at</Th></tr></thead>
              <tbody>
                {l.slice(0, 8).map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/drugs/${r.id}`} className="font-medium hover:underline">{r.brand_name}</Link>
                      <div className="text-xs text-slate-500">{[r.generic_name, r.strength].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td><Badge tone={r.stock_qty === 0 ? 'red' : 'amber'}>{r.stock_qty}</Badge></Td>
                    <Td>{r.reorder_level}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="border-t border-slate-100 px-5 py-3 text-sm"><Link href="/drugs" className="font-medium text-brand-700 hover:underline">View medicine catalogue <span aria-hidden="true">→</span></Link></div>
        </Card>
        )}
        {visibleWidgetCount === 0 && <Card className="p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-xl text-brand-700">✦</div><h2 className="mt-3 font-semibold">Your dashboard is clear.</h2><p className="mt-1 text-sm text-slate-500">You’ve hidden both alert panels. Turn them back on any time in Settings.</p><Link href="/settings" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">Personalise dashboard →</Link></Card>}
      </div>
    </>
  );
}
