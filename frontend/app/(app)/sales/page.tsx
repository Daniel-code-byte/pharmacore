'use client';

import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Pagination, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { kes } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import type { Paginated, Sale } from '@/lib/types';

export default function SalesHistoryPage() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const list = useFetch(() => api<Paginated<Sale>>('/sales', { query: { page, per_page: 20 } }), [page]);
  const selected = useFetch(() => selectedId ? api<Sale>(`/sales/${selectedId}`) : Promise.resolve(null), [selectedId]);

  return (
    <>
      <PageHeader title="Sales history" subtitle="Receipts and payment status for this branch." actions={<a className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700" href="/pos">New sale</a>} />
      {list.error && <div className="mb-4"><ErrorBox message={list.error} /></div>}
      <Card>
        {list.loading && !list.data ? <Spinner /> : list.data?.data.length === 0 ? <Empty>No sales recorded yet.</Empty> : list.data && (
          <>
            <Table>
              <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Payment</Th><Th>Status</Th><Th className="text-right">Total</Th><Th /></tr></thead>
              <tbody>
                {list.data.data.map((sale) => (
                  <tr key={sale.id}>
                    <Td className="font-medium">{sale.receipt_no}</Td>
                    <Td>{new Date(sale.created_at).toLocaleString()}</Td>
                    <Td className="capitalize">{sale.payment_method}</Td>
                    <Td><Badge tone={sale.status === 'paid' ? 'green' : sale.status === 'pending' ? 'amber' : 'red'}>{sale.status}</Badge></Td>
                    <Td className="text-right">{kes(sale.total)}</Td>
                    <Td className="text-right"><Button variant="secondary" onClick={() => setSelectedId(sale.id)}>Receipt</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {selectedId && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
          <Card className="w-full max-w-2xl bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold">Receipt</h2>
              <Button variant="secondary" onClick={() => setSelectedId('')}>Close</Button>
            </div>
            <div className="p-5">
              {selected.error && <ErrorBox message={selected.error} />}
              {selected.loading && !selected.data ? <Spinner /> : selected.data && (
                <>
                  <div className="receipt-print">
                    <div className="mb-5 border-b border-dashed border-slate-300 pb-4 text-center">
                      {selected.data.pharmacy?.logo_url && <img src={selected.data.pharmacy.logo_url} alt="Pharmacy logo" className="mx-auto mb-2 h-16 max-w-40 object-contain" />}
                      <h3 className="text-xl font-bold">{selected.data.pharmacy?.name ?? 'PharmaCore Pharmacy'}</h3>
                      {selected.data.pharmacy?.address && <p className="mt-1 text-xs text-slate-500">{selected.data.pharmacy.address}</p>}
                      {selected.data.pharmacy?.phone && <p className="text-xs text-slate-500">Tel: {selected.data.pharmacy.phone}</p>}
                      {selected.data.pharmacy?.kra_pin && <p className="text-xs text-slate-500">KRA PIN: {selected.data.pharmacy.kra_pin}</p>}
                      {selected.data.pharmacy?.receipt_header && <p className="mt-2 text-sm">{selected.data.pharmacy.receipt_header}</p>}
                    </div>
                    <div className="mb-4 flex flex-wrap justify-between gap-2">
                      <div><div className="font-semibold">Receipt {selected.data.receipt_no}</div><div className="text-sm text-slate-500">{new Date(selected.data.paid_at ?? selected.data.created_at).toLocaleString()}</div></div>
                      <Badge tone={selected.data.status === 'paid' ? 'green' : selected.data.status === 'pending' ? 'amber' : 'red'}>{selected.data.status} · {selected.data.payment_method}</Badge>
                    </div>
                    <Table>
                      <thead><tr><Th>Medicine</Th><Th>Qty</Th><Th className="text-right">Unit price</Th><Th className="text-right">Line total</Th></tr></thead>
                      <tbody>{selected.data.items.map((item) => (
                        <tr key={item.id}><Td>{item.drug?.brand_name ?? 'Medicine'}{item.drug?.strength && <div className="text-xs text-slate-500">{item.drug.strength}</div>}</Td><Td>{item.quantity}</Td><Td className="text-right">{kes(item.unit_price)}</Td><Td className="text-right">{kes(item.line_total)}</Td></tr>
                      ))}</tbody>
                    </Table>
                    <div className="ml-auto mt-4 max-w-xs space-y-1 text-right text-sm">
                      <div className="flex justify-between"><span>Subtotal</span><span>{kes(selected.data.subtotal)}</span></div>
                      {Number(selected.data.vat_amount) > 0 && <div className="flex justify-between"><span>VAT included</span><span>{kes(selected.data.vat_amount)}</span></div>}
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-base"><span>Total</span><strong>{kes(selected.data.total)}</strong></div>
                      {selected.data.amount_received !== null && <div className="flex justify-between"><span>Cash received</span><span>{kes(selected.data.amount_received)}</span></div>}
                      {Number(selected.data.change_due) > 0 && <div className="flex justify-between"><span>Change</span><span>{kes(selected.data.change_due)}</span></div>}
                      {selected.data.payments[0]?.reference && <div className="flex justify-between"><span>M-Pesa receipt</span><span>{selected.data.payments[0].reference}</span></div>}
                    </div>
                    {selected.data.prescription_reference && <p className="mt-4 text-xs text-slate-500">Prescription reference: {selected.data.prescription_reference}</p>}
                    {selected.data.pharmacy?.receipt_footer && <p className="mt-6 whitespace-pre-wrap border-t border-dashed border-slate-300 pt-3 text-center text-xs text-slate-500">{selected.data.pharmacy.receipt_footer}</p>}
                  </div>
                  <div className="mt-5 flex justify-end print:hidden"><Button variant="secondary" onClick={() => window.print()}>Print receipt</Button></div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
