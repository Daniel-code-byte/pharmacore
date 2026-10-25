'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AdjustStockModal } from '@/components/AdjustStockModal';
import { ExpiryBadge } from '@/components/ExpiryBadge';
import { ReceiveStockModal } from '@/components/ReceiveStockModal';
import { Button, Card, Empty, ErrorBox, PageHeader, Pagination, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { kes } from '@/lib/format';
import { useFetch } from '@/lib/hooks';
import type { Batch, Paginated } from '@/lib/types';

export default function StockPage() {
  const { canWrite, canAdjust, role } = useAuth();
  const [expiring, setExpiring] = useState('');
  const [page, setPage] = useState(1);
  const [receiving, setReceiving] = useState(false);
  const [adjusting, setAdjusting] = useState<Batch | null>(null);

  const { data, loading, error, reload } = useFetch(
    () => api<Paginated<Batch>>('/batches', { query: { expiring_in: expiring, page, per_page: 20 } }),
    [expiring, page],
  );

  const showCost = role !== 'cashier';

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Every batch on the shelf, earliest expiry first"
        actions={canWrite && <Button onClick={() => setReceiving(true)}>Receive stock</Button>}
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          <span className="text-sm text-slate-600">Show</span>
          <Select className="max-w-xs" value={expiring} onChange={(e) => { setExpiring(e.target.value); setPage(1); }}>
            <option value="">All batches</option>
            <option value="0">Expired or expiring today</option>
            <option value="30">Expiring within 30 days</option>
            <option value="90">Expiring within 90 days</option>
            <option value="180">Expiring within 6 months</option>
          </Select>
        </div>

        {error && <div className="p-4"><ErrorBox message={error} /></div>}
        {loading && !data ? <Spinner /> : data && data.data.length === 0 ? (
          <Empty>No batches match.</Empty>
        ) : data && (
          <>
            <Table>
              <thead>
                <tr><Th>Drug</Th><Th>Batch</Th><Th>Expiry</Th><Th>Qty</Th>{showCost && <Th>Cost</Th>}<Th>Supplier</Th><Th /></tr>
              </thead>
              <tbody>
                {data.data.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <Link href={`/drugs/${b.drug_id}`} className="font-medium hover:underline">{b.drug?.brand_name}</Link>
                      <div className="text-xs text-slate-500">{[b.drug?.generic_name, b.drug?.strength].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td>{b.batch_no}</Td>
                    <Td><ExpiryBadge date={b.expiry_date} /></Td>
                    <Td>{b.available_quantity ?? b.quantity}</Td>
                    {showCost && <Td>{kes(b.cost_price)}</Td>}
                    <Td>{b.supplier?.name ?? '-'}</Td>
                    <Td className="text-right">
                      {canAdjust && <Button variant="ghost" onClick={() => setAdjusting(b)}>Adjust</Button>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.current_page} last={data.last_page} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {receiving && <ReceiveStockModal onClose={() => setReceiving(false)} onSaved={() => { setReceiving(false); reload(); }} />}
      {adjusting && (
        <AdjustStockModal batch={adjusting} drugName={adjusting.drug?.brand_name ?? 'Drug'}
          onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); reload(); }} />
      )}
    </>
  );
}
