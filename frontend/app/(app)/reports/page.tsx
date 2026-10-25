'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, kes } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import type { SalesReport } from '@/lib/types';

function Metric({ title, value, note, icon }: { title: string; value: string; note: string; icon: string }) {
  return <Card className="p-5"><div className="flex items-start justify-between"><div><div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</div><div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div><span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-lg text-brand-700">{icon}</span></div></Card>;
}

export default function ReportsPage() {
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const report = useFetch(() => api<SalesReport>('/reports/sales', { query: { days } }), [days]);
  const data = report.data;
  const maxRevenue = Math.max(1, ...(data?.daily.map((row) => row.revenue) ?? [1]));

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['Date', 'Receipt count', 'Revenue (KES)', 'Units sold'],
      ...data.daily.map((row) => [row.date, row.sales_count, row.revenue.toFixed(2), row.units_sold]),
      [],
      ['Top medicines'],
      ['Medicine', 'Generic', 'Units sold', 'Revenue (KES)'],
      ...data.top_products.map((product) => [product.brand_name, product.generic_name ?? '', product.units_sold, product.revenue.toFixed(2)]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pharmacore-sales-${data.period.from}-to-${data.period.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Sales reports" subtitle="See what sells, when customers buy, and how payment is collected." actions={(
        <div className="flex flex-wrap gap-2">
          <Select className="min-w-40" aria-label="Report period" value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)}>
            <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </Select>
          <Button variant="secondary" disabled={!data} onClick={exportCsv}>Export CSV</Button>
        </div>
      )} />
      {report.error && <div className="mb-5"><ErrorBox message={report.error} /></div>}
      {report.loading && !data ? <Spinner /> : data && (
        <>
          <p className="mb-4 text-xs text-slate-500">{fmtDate(data.period.from)} – {fmtDate(data.period.to)} · paid sales for this branch</p>
          <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric title="Sales revenue" value={kes(data.summary.revenue)} note="Paid receipts only" icon="↗" />
            <Metric title="Transactions" value={data.summary.sales_count.toLocaleString()} note="Completed payments" icon="▧" />
            <Metric title="Units sold" value={data.summary.units_sold.toLocaleString()} note="Dispensed line items" icon="✚" />
            <Metric title="Average sale" value={kes(data.summary.average_sale)} note="Revenue per receipt" icon="◉" />
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
            <Card className="p-5">
              <div className="mb-5"><h2 className="font-semibold text-slate-900">Daily sales</h2><p className="text-xs text-slate-500">Revenue by payment completion date</p></div>
              {data.daily.every((row) => row.revenue === 0) ? <Empty>No paid sales during this period yet. <Link className="text-brand-700 underline" href="/pos">Start a sale</Link></Empty> : (
                <div className="flex h-56 items-end gap-1.5 border-b border-slate-200 px-1 sm:gap-2">
                  {data.daily.map((row) => {
                    const height = row.revenue > 0 ? Math.max(5, (row.revenue / maxRevenue) * 100) : 0;
                    return <div key={row.date} title={`${fmtDate(row.date)} · ${kes(row.revenue)} · ${row.sales_count} sales`} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                      <span className="mb-1 hidden whitespace-nowrap text-[10px] text-slate-500 group-hover:block">{row.revenue > 0 ? kes(row.revenue) : ''}</span>
                      <div className="w-full max-w-10 rounded-t-md bg-brand-500 transition-colors group-hover:bg-brand-700" style={{ height: `${height}%`, minHeight: row.revenue > 0 ? 5 : 0 }} />
                      {(days === 7 || new Date(`${row.date}T00:00:00`).getDate() === 1 || row.date === data.period.to) && <span className="mt-2 truncate text-[9px] text-slate-500">{new Date(`${row.date}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>}
                    </div>;
                  })}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4"><h2 className="font-semibold text-slate-900">Payment mix</h2><p className="text-xs text-slate-500">How completed sales were paid</p></div>
              {data.payment_methods.length === 0 ? <Empty>No payment data yet.</Empty> : <div className="space-y-4">
                {data.payment_methods.map((method) => {
                  const share = data.summary.revenue > 0 ? Math.round((method.amount / data.summary.revenue) * 100) : 0;
                  return <div key={method.method}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium capitalize">{method.method}</span><span>{kes(method.amount)} · {share}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} /></div>
                    <div className="mt-1 text-xs text-slate-500">{method.sales_count} transaction{method.sales_count === 1 ? '' : 's'}</div>
                  </div>;
                })}
                {data.summary.vat > 0 && <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">VAT included in sales: <strong className="text-slate-700">{kes(data.summary.vat)}</strong></div>}
              </div>}
            </Card>
          </div>

          <Card>
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Best-selling medicines</h2><p className="mt-0.5 text-xs text-slate-500">Ranked by units sold in this period</p></div>
            {data.top_products.length === 0 ? <Empty>No paid products in this period yet.</Empty> : <Table>
              <thead><tr><Th>#</Th><Th>Medicine</Th><Th>Units</Th><Th className="text-right">Revenue</Th></tr></thead>
              <tbody>{data.top_products.map((product, index) => <tr key={product.drug_id}>
                <Td><Badge tone={index === 0 ? 'green' : 'gray'}>{index + 1}</Badge></Td>
                <Td><Link href={`/drugs/${product.drug_id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{product.brand_name}</Link><div className="text-xs text-slate-500">{product.generic_name ?? 'No generic name'}</div></Td>
                <Td>{product.units_sold}</Td><Td className="text-right font-medium">{kes(product.revenue)}</Td>
              </tr>)}</tbody>
            </Table>}
          </Card>
        </>
      )}
    </>
  );
}
