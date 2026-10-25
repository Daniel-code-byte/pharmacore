'use client';

import { useState } from 'react';
import { api, ApiError, fieldError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import type { Drug, Paginated, Supplier } from '@/lib/types';
import { DrugPicker } from './DrugPicker';
import { Button, ErrorBox, Field, Input, Modal, Select } from './ui';

export function ReceiveStockModal({ drug: initial, onClose, onSaved }: {
  drug?: Pick<Drug, 'id' | 'brand_name'>; onClose: () => void; onSaved: () => void;
}) {
  const [drug, setDrug] = useState<Pick<Drug, 'id' | 'brand_name'> | undefined>(initial);
  const suppliers = useFetch(() => api<Paginated<Supplier>>('/suppliers', { query: { per_page: 100 } }), []);
  const [f, setF] = useState({ supplier_id: '', batch_no: '', expiry_date: '', cost_price: '', quantity: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!drug) return;
    setSaving(true);
    setErr(null);
    try {
      await api('/batches', {
        method: 'POST',
        body: {
          drug_id: drug.id,
          supplier_id: f.supplier_id || null,
          batch_no: f.batch_no.trim(),
          expiry_date: f.expiry_date,
          cost_price: Number(f.cost_price),
          quantity: Number(f.quantity),
        },
      });
      onSaved();
    } catch (e) {
      setErr(e);
      setSaving(false);
    }
  }

  const fe = (k: string) => fieldError(err, k);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <Modal title="Receive stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {err instanceof ApiError && !err.errors && <ErrorBox message={err.message} />}

        {drug ? (
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm">
            <span className="font-medium">{drug.brand_name}</span>
            {!initial && <button type="button" className="text-brand-700 underline" onClick={() => setDrug(undefined)}>Change</button>}
          </div>
        ) : (
          <Field label="Drug *"><DrugPicker onSelect={(d) => setDrug({ id: d.id, brand_name: d.brand_name })} /></Field>
        )}

        <Field label="Supplier" error={fe('supplier_id')}>
          <Select value={f.supplier_id} onChange={set('supplier_id')}>
            <option value="">Not specified</option>
            {suppliers.data?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Batch number *" error={fe('batch_no')}>
            <Input required value={f.batch_no} onChange={set('batch_no')} />
          </Field>
          <Field label="Expiry date *" error={fe('expiry_date')}>
            <Input required type="date" min={tomorrow} value={f.expiry_date} onChange={set('expiry_date')} />
          </Field>
          <Field label="Cost price (KES) *" error={fe('cost_price')}>
            <Input required type="number" min="0" step="0.01" value={f.cost_price} onChange={set('cost_price')} />
          </Field>
          <Field label="Quantity *" error={fe('quantity')}>
            <Input required type="number" min="1" step="1" value={f.quantity} onChange={set('quantity')} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !drug}>{saving ? 'Saving…' : 'Receive stock'}</Button>
        </div>
      </form>
    </Modal>
  );
}
