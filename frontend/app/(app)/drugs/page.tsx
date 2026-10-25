'use client';

import Link from 'next/link';
import { useState } from 'react';
import { DrugFormModal } from '@/components/DrugFormModal';
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Pagination, Spinner, Table, Td, Th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { kes, scheduleLabel } from '@/lib/format';
import { useDebounce, useFetch } from '@/lib/hooks';
import type { Drug, Paginated } from '@/lib/types';

const tone = { otc: 'green', pharmacy_only: 'blue', prescription_only: 'amber', controlled: 'red' } as const;

export default function DrugsPage() {
  const { canWrite } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounce(q);

  const { data, loading, error, reload } = useFetch(
    () => api<Paginated<Drug>>('/drugs', { query: { q: dq, page, per_page: 20 } }),
    [dq, page],
  );

  return (
    <>
      <PageHeader
        title="Drugs"
        subtitle="Search by brand, generic name or barcode"
        actions={canWrite && <Button onClick={() => setAdding(true)}>+ Add drug</Button>}
      />

      <Card>
        <div className="border-b border-slate-200 p-4">
          <Input placeholder="Search drugs…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>

        {error && <div className="p-4"><ErrorBox message={error} /></div>}
        {loading && !data ? <Spinner /> : data && data.data.length === 0 ? (
          <Empty>No drugs found.</Empty>
        ) : data && (
          <>
            <Table>
              <thead>
                <tr><Th>Drug</Th><Th>Type</Th><Th>Price</Th><Th>In stock</Th></tr>
              </thead>
              <tbody>
                {data.data.map((d) => (
                  <tr key={d.id} className={d.is_active ? '' : 'opacity-50'}>
                    <Td>
                      <Link href={`/drugs/${d.id}`} className="font-medium text-slate-900 hover:underline">{d.brand_name}</Link>
                      <div className="text-xs text-slate-500">
                        {[d.generic_name, d.strength, d.dosage_form].filter(Boolean).join(' · ')}
                      </div>
                    </Td>
                    <Td><Badge tone={tone[d.schedule]}>{scheduleLabel[d.schedule]}</Badge></Td>
                    <Td>{kes(d.selling_price)}</Td>
                    <Td>
                      <Badge tone={(d.stock_qty ?? 0) === 0 ? 'red' : (d.stock_qty ?? 0) <= d.reorder_level ? 'amber' : 'green'}>
                        {d.stock_qty ?? 0}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.current_page} last={data.last_page} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {adding && <DrugFormModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}
