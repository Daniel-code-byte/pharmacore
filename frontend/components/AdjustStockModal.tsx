'use client';

import { useState } from 'react';
import { api, ApiError, fieldError } from '@/lib/api';
import type { Batch } from '@/lib/types';
import { Button, ErrorBox, Field, Input, Modal, Select } from './ui';

export function AdjustStockModal({ batch, drugName, onClose, onSaved }: {
  batch: Batch; drugName: string; onClose: () => void; onSaved: () => void;
}) {
  const [change, setChange] = useState('');
  const [type, setType] = useState('adjustment');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api(`/batches/${batch.id}/adjust`, {
        method: 'POST',
        body: { quantity_change: Number(change), type, reason: reason.trim() },
      });
      onSaved();
    } catch (e) {
      setErr(e);
      setSaving(false);
    }
  }

  const fe = (k: string) => fieldError(err, k);

  return (
    <Modal title="Adjust stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {err instanceof ApiError && !err.errors && <ErrorBox message={err.message} />}
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium">{drugName}</div>
          <div className="text-slate-500">Batch {batch.batch_no} · {batch.quantity} units in stock</div>
        </div>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="adjustment">Stock count correction</option>
            <option value="expired">Expired, write off</option>
            <option value="return_out">Returned to supplier</option>
          </Select>
        </Field>
        <Field label="Quantity change *" error={fe('quantity_change')} hint="Use a negative number to remove stock, e.g. -5">
          <Input required type="number" step="1" value={change} onChange={(e) => setChange(e.target.value)} />
        </Field>
        <Field label="Reason *" error={fe('reason')}>
          <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save adjustment'}</Button>
        </div>
      </form>
    </Modal>
  );
}
