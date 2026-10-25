'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdjustStockModal } from '@/components/AdjustStockModal';
import { DrugFormModal } from '@/components/DrugFormModal';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { ReceiveStockModal } from '@/components/ReceiveStockModal';
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { kes, scheduleLabel } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import type { Batch, Drug, Substitute } from '@/lib/types';

interface DrugDetail { drug: Drug; stock_qty: number; batches: Batch[] }

export default function DrugDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canWrite, canAdjust, canDelete, role } = useAuth();
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [adjusting, setAdjusting] = useState<Batch | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);

  const detail = useFetch(() => api<DrugDetail>(`/drugs/${id}`), [id]);
  const subs = useFetch(
    () => api<Substitute[]>(`/drugs/${id}/substitutes`, { query: { in_stock: inStockOnly } }),
    [id, inStockOnly],
  );

  if (detail.loading && !detail.data) return <Spinner />;
  if (detail.error) return <ErrorBox message={detail.error} />;

  const { drug, stock_qty, batches } = detail.data!;
  const showCost = role !== 'cashier';
  const refresh = () => { detail.reload(); subs.reload(); };

  async function deactivate() {
    if (!confirm(`Deactivate ${drug.brand_name}? It will be hidden from searches but sales history is kept.`)) return;
    await api(`/drugs/${drug.id}`, { method: 'DELETE' });
    router.replace('/drugs');
  }

  return (
    <>
      <Link href="/drugs" className="mb-3 inline-block text-sm text-brand-700 hover:underline">← All drugs</Link>
      <PageHeader
        title={drug.brand_name}
        subtitle={[drug.generic_name, drug.strength, drug.dosage_form].filter(Boolean).join(' · ')}
        actions={
          <>
            {canWrite && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
            {canWrite && <Button onClick={() => setReceiving(true)}>Receive stock</Button>}
            {canDelete && drug.is_active && <Button variant="ghost" onClick={deactivate}>Deactivate</Button>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">In stock</div>
          <div className="mt-1 text-2xl font-semibold">{stock_qty}</div>
          <div className="text-xs text-slate-500">Reorder at {drug.reorder_level}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Price</div>
          <div className="mt-1 text-2xl font-semibold">{kes(drug.selling_price)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Schedule</div>
          <div className="mt-2"><Badge tone={drug.schedule === 'controlled' ? 'red' : drug.requires_rx ? 'amber' : 'green'}>
            {scheduleLabel[drug.schedule]}</Badge></div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-slate-500">Category</div>
          <div className="mt-1 font-medium">{drug.category?.name ?? 'None'}</div>
          <div className="text-xs text-slate-500">{drug.manufacturer}</div></Card>
      </div>

      {drug.dosage_notes && (
        <Card className="mb-6 p-4 text-sm"><span className="font-medium">Dosage notes: </span>{drug.dosage_notes}</Card>
      )}

      <Card className="mb-6">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">Batches (earliest expiry first)</div>
        {batches.length === 0 ? <Empty>No stock in this branch.</Empty> : (
          <Table>
            <thead><tr><Th>Batch</Th><Th>Expiry</Th><Th>Qty</Th>{showCost && <Th>Cost</Th>}<Th /></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">{b.batch_no}</Td>
                  <Td><ExpiryBadge date={b.expiry_date} /></Td>
                  <Td>{b.available_quantity ?? b.quantity}</Td>
                  {showCost && <Td>{kes(b.cost_price)}</Td>}
                  <Td className="text-right">
                    {canAdjust && <Button variant="ghost" onClick={() => setAdjusting(b)}>Adjust</Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="font-semibold">Substitutes (same generic and strength)</span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            In stock only
          </label>
        </div>
        {subs.loading && !subs.data ? <Spinner /> : !subs.data || subs.data.length === 0 ? (
          <Empty>{drug.generic_name ? 'No substitutes found.' : 'Add a generic name to find substitutes.'}</Empty>
        ) : (
          <Table>
            <thead><tr><Th>Brand</Th><Th>Form</Th><Th>Price</Th><Th>In stock</Th></tr></thead>
            <tbody>
              {subs.data.map((s) => (
                <tr key={s.id}>
                  <Td><Link href={`/drugs/${s.id}`} className="font-medium hover:underline">{s.brand_name}</Link></Td>
                  <Td>{s.dosage_form}</Td>
                  <Td>{kes(s.selling_price)}
                    {Number(s.selling_price) < Number(drug.selling_price) && <span className="ml-2"><Badge tone="green">Cheaper</Badge></span>}
                  </Td>
                  <Td><Badge tone={Number(s.stock_qty) === 0 ? 'red' : 'green'}>{Number(s.stock_qty)}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && <DrugFormModal drug={drug} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
      {receiving && <ReceiveStockModal drug={drug} onClose={() => setReceiving(false)} onSaved={() => { setReceiving(false); refresh(); }} />}
      {adjusting && (
        <AdjustStockModal batch={adjusting} drugName={drug.brand_name} onClose={() => setAdjusting(null)}
          onSaved={() => { setAdjusting(null); refresh(); }} />
      )}
    </>
  );
}
