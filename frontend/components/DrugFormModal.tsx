'use client';

import { useState } from 'react';
import { api, ApiError, fieldError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import type { Category, Drug } from '@/lib/types';
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea } from './ui';

const FORMS = ['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream', 'ointment', 'drops', 'inhaler', 'sachet', 'other'];

export function DrugFormModal({ drug, onClose, onSaved }: {
  drug?: Drug; onClose: () => void; onSaved: () => void;
}) {
  const cats = useFetch(() => api<Category[]>('/categories'), []);
  const [f, setF] = useState({
    brand_name: drug?.brand_name ?? '',
    generic_name: drug?.generic_name ?? '',
    strength: drug?.strength ?? '',
    dosage_form: drug?.dosage_form ?? 'tablet',
    pack_size: drug?.pack_size ?? '',
    manufacturer: drug?.manufacturer ?? '',
    barcode: drug?.barcode ?? '',
    category_id: drug?.category_id ?? '',
    schedule: drug?.schedule ?? 'otc',
    selling_price: drug ? String(Number(drug.selling_price)) : '',
    reorder_level: drug ? String(drug.reorder_level) : '10',
    dosage_notes: drug?.dosage_notes ?? '',
  });
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function addCategory() {
    if (!newCat.trim()) return;
    try {
      const c = await api<Category>('/categories', { method: 'POST', body: { name: newCat.trim() } });
      setNewCat('');
      cats.reload();
      setF((s) => ({ ...s, category_id: c.id }));
    } catch (e) { setErr(e); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const nul = (v: string) => (v.trim() === '' ? null : v.trim());
    const body = {
      brand_name: f.brand_name.trim(),
      generic_name: nul(f.generic_name),
      strength: nul(f.strength),
      dosage_form: nul(f.dosage_form),
      pack_size: nul(f.pack_size),
      manufacturer: nul(f.manufacturer),
      barcode: nul(f.barcode),
      category_id: nul(f.category_id),
      schedule: f.schedule,
      selling_price: Number(f.selling_price),
      reorder_level: Number(f.reorder_level || 0),
      dosage_notes: nul(f.dosage_notes),
    };
    try {
      if (drug) await api(`/drugs/${drug.id}`, { method: 'PUT', body });
      else await api('/drugs', { method: 'POST', body });
      onSaved();
    } catch (e) {
      setErr(e);
      setSaving(false);
    }
  }

  const fe = (k: string) => fieldError(err, k);

  return (
    <Modal title={drug ? 'Edit drug' : 'Add drug'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {err instanceof ApiError && !err.errors && <ErrorBox message={err.message} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand name *" error={fe('brand_name')}>
            <Input required value={f.brand_name} onChange={set('brand_name')} />
          </Field>
          <Field label="Generic name" error={fe('generic_name')} hint="Used to find substitutes">
            <Input value={f.generic_name} onChange={set('generic_name')} />
          </Field>
          <Field label="Strength" error={fe('strength')}>
            <Input placeholder="500mg" value={f.strength} onChange={set('strength')} />
          </Field>
          <Field label="Dosage form" error={fe('dosage_form')}>
            <Select value={f.dosage_form} onChange={set('dosage_form')}>
              {FORMS.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Pack size" error={fe('pack_size')}>
            <Input placeholder="10x10" value={f.pack_size} onChange={set('pack_size')} />
          </Field>
          <Field label="Manufacturer" error={fe('manufacturer')}>
            <Input value={f.manufacturer} onChange={set('manufacturer')} />
          </Field>
          <Field label="Barcode" error={fe('barcode')}>
            <Input value={f.barcode} onChange={set('barcode')} />
          </Field>
          <Field label="Schedule" error={fe('schedule')}>
            <Select value={f.schedule} onChange={set('schedule')}>
              <option value="otc">OTC (over the counter)</option>
              <option value="pharmacy_only">Pharmacy only</option>
              <option value="prescription_only">Prescription only</option>
              <option value="controlled">Controlled drug</option>
            </Select>
          </Field>
          <Field label="Selling price (KES) *" error={fe('selling_price')}>
            <Input required type="number" min="0" step="0.01" value={f.selling_price} onChange={set('selling_price')} />
          </Field>
          <Field label="Reorder level" error={fe('reorder_level')} hint="Low-stock alert at or below this">
            <Input type="number" min="0" value={f.reorder_level} onChange={set('reorder_level')} />
          </Field>
        </div>

        <Field label="Category" error={fe('category_id')}>
          <Select value={f.category_id} onChange={set('category_id')}>
            <option value="">None</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Input placeholder="New category…" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <Button type="button" variant="secondary" onClick={addCategory}>Add</Button>
        </div>

        <Field label="Dosage notes" error={fe('dosage_notes')}>
          <Textarea rows={2} value={f.dosage_notes} onChange={set('dosage_notes')} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save drug'}</Button>
        </div>
      </form>
    </Modal>
  );
}
