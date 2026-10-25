'use client';

import { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Spinner, Table, Td, Th } from '@/components/ui';
import { api, ApiError, fieldError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { Paginated, Supplier } from '@/lib/types';

function SupplierModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', contact_person: '', phone: '', email: '', payment_terms_days: '0' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const nul = (v: string) => (v.trim() === '' ? null : v.trim());
    try {
      await api('/suppliers', {
        method: 'POST',
        body: {
          name: f.name.trim(), contact_person: nul(f.contact_person), phone: nul(f.phone),
          email: nul(f.email), payment_terms_days: Number(f.payment_terms_days || 0),
        },
      });
      onSaved();
    } catch (e) { setErr(e); setSaving(false); }
  }

  return (
    <Modal title="Add supplier" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {err instanceof ApiError && !err.errors && <ErrorBox message={err.message} />}
        <Field label="Name *" error={fieldError(err, 'name')}><Input required value={f.name} onChange={set('name')} /></Field>
        <Field label="Contact person" error={fieldError(err, 'contact_person')}><Input value={f.contact_person} onChange={set('contact_person')} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" error={fieldError(err, 'phone')}><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email" error={fieldError(err, 'email')}><Input type="email" value={f.email} onChange={set('email')} /></Field>
        </div>
        <Field label="Payment terms (days)" error={fieldError(err, 'payment_terms_days')}>
          <Input type="number" min="0" value={f.payment_terms_days} onChange={set('payment_terms_days')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function SuppliersPage() {
  const { canWrite } = useAuth();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { data, loading, error, reload } = useFetch(
    () => api<Paginated<Supplier>>('/suppliers', { query: { page, per_page: 20 } }), [page],
  );

  return (
    <>
      <PageHeader title="Suppliers" actions={canWrite && <Button onClick={() => setAdding(true)}>+ Add supplier</Button>} />
      <Card>
        {error && <div className="p-4"><ErrorBox message={error} /></div>}
        {loading && !data ? <Spinner /> : data && data.data.length === 0 ? <Empty>No suppliers yet.</Empty> : data && (
          <>
            <Table>
              <thead><tr><Th>Name</Th><Th>Contact</Th><Th>Phone</Th><Th>Terms</Th><Th>Status</Th></tr></thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td>{s.contact_person ?? '-'}</Td>
                    <Td>{s.phone ?? '-'}</Td>
                    <Td>{s.payment_terms_days ? `${s.payment_terms_days} days` : 'Cash'}</Td>
                    <Td><Badge tone={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Inactive'}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.current_page} last={data.last_page} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {adding && <SupplierModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}
