'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { api, ApiError, fieldError } from '@/lib/api';
import { kes } from '@/lib/format';
import { useDebounce, useFetch } from '@/lib/hooks';
import type { Drug, MpesaSettings, Paginated, Sale } from '@/lib/types';

interface CartLine { drug: Drug; quantity: number }
interface CheckoutResult { sale?: Sale; message?: string }

export default function PosPage() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query);
  const { data, loading, error } = useFetch(
    () => api<Paginated<Drug>>('/drugs', { query: { q: debouncedQuery, per_page: 20, sellable_only: true } }),
    [debouncedQuery],
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [phone, setPhone] = useState('');
  const [prescriptionReference, setPrescriptionReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [sale, setSale] = useState<Sale | null>(null);
  const [notice, setNotice] = useState('');
  const requestId = useRef<string | null>(null);

  const totalCents = useMemo(() => cart.reduce(
    (sum, line) => sum + Math.round(Number(line.drug.selling_price) * 100) * line.quantity,
    0,
  ), [cart]);
  const mpesa = useFetch(() => api<MpesaSettings>('/settings/mpesa'), []);
  const mpesaReady = mpesa.data?.configured ?? false;
  useEffect(() => {
    if (!mpesaReady && paymentMethod === 'mpesa') setPaymentMethod('cash');
  }, [mpesaReady, paymentMethod]);
  const total = totalCents / 100;
  const cashCents = Math.round((Number(cashReceived) || 0) * 100);
  const change = Math.max(0, cashCents - totalCents) / 100;
  void mpesa;

  const addDrug = useCallback((drug: Drug) => {
    setCart((current) => {
      const found = current.find((line) => line.drug.id === drug.id);
      const quantity = (found?.quantity ?? 0) + 1;
      if (quantity > (drug.stock_qty ?? 0)) {
        setErrorMessage(`Only ${drug.stock_qty ?? 0} unexpired units of ${drug.brand_name} are available.`);
        return current;
      }
      setErrorMessage('');
      return found
        ? current.map((line) => line.drug.id === drug.id ? { ...line, quantity } : line)
        : [...current, { drug, quantity }];
    });
    setQuery('');
  }, []);

  const changeQuantity = (drugId: string, delta: number) => {
    setCart((current) => current
      .map((line) => {
        if (line.drug.id !== drugId) return line;
        const quantity = line.quantity + delta;
        if (quantity > (line.drug.stock_qty ?? 0)) {
          setErrorMessage(`Only ${line.drug.stock_qty ?? 0} unexpired units of ${line.drug.brand_name} are available.`);
          return line;
        }
        return { ...line, quantity };
      })
      .filter((line) => line.quantity > 0));
  };

  const refreshSale = useCallback(async (saleId: string) => {
    try {
      const latest = await api<Sale>(`/sales/${saleId}`);
      setSale(latest);
      if (latest.status !== 'pending') {
        setNotice('');
        if (latest.status === 'paid') {
          setCart([]);
          setCashReceived('');
          setPhone('');
          setPrescriptionReference('');
        }
        requestId.current = null;
      }
    } catch {
      // Keep the last receipt/status visible; the cashier can retry manually.
    }
  }, []);

  useEffect(() => {
    if (!sale || sale.status !== 'pending' || sale.payment_method !== 'mpesa') return;
    const timer = window.setInterval(() => { void refreshSale(sale.id); }, 4000);
    return () => window.clearInterval(timer);
  }, [sale, refreshSale]);

  async function checkout() {
    if (!cart.length || saving) return;
    setSaving(true);
    setErrorMessage('');
    setValidationErrors({});
    setNotice('');
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await api<Sale | CheckoutResult>('/sales', {
        method: 'POST',
        body: {
          client_uuid: requestId.current,
          items: cart.map(({ drug, quantity }) => ({ drug_id: drug.id, quantity })),
          payment_method: paymentMethod,
          ...(paymentMethod === 'cash' ? { amount_received: Number(cashReceived) } : { phone }),
          ...(prescriptionReference.trim() ? { prescription_reference: prescriptionReference.trim() } : {}),
        },
      });
      const response = result as Sale & CheckoutResult;
      const createdSale = response.sale ?? response;
      setSale(createdSale);
      setNotice(response.message ?? 'Sale completed. Stock has been updated.');
      if (createdSale.status === 'paid') {
        setCart([]);
        setCashReceived('');
        setPhone('');
        setPrescriptionReference('');
        requestId.current = null;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        setValidationErrors(error.errors ?? {});
      } else {
        setErrorMessage('Could not complete checkout. Please retry; the same request is safe to submit again.');
      }
    } finally {
      setSaving(false);
    }
  }

  const dismissReceipt = () => {
    setSale(null);
    setNotice('');
    setErrorMessage('');
    setValidationErrors({});
  };

  return (
    <>
      <PageHeader title="Point of sale" subtitle="Scan or search a product, add it to the basket, then take payment." />

      {errorMessage && <div className="mb-4"><ErrorBox message={errorMessage} /></div>}
      {sale && (
        <Card className={`mb-4 p-4 ${sale.status === 'failed' ? 'border-red-300' : 'border-brand-200'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                {sale.status === 'paid' ? 'Sale complete' : sale.status === 'pending' ? 'Payment pending' : 'Payment failed'}
                <Badge tone={sale.status === 'paid' ? 'green' : sale.status === 'pending' ? 'amber' : 'red'}>{sale.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">Receipt {sale.receipt_no} · {kes(sale.total)}</p>
              {notice && <p className="mt-1 text-sm text-slate-600">{notice}</p>}
              {sale.status === 'pending' && <p className="mt-1 text-xs text-slate-500">Stock is not deducted until M-Pesa confirms payment.</p>}
              {sale.status === 'paid' && sale.payment_method === 'cash' && Number(sale.change_due) > 0 && (
                <p className="mt-1 text-sm font-medium">Change due: {kes(sale.change_due)}</p>
              )}
              {sale.payments?.[0]?.reference && <p className="mt-1 text-sm">M-Pesa receipt: {sale.payments[0].reference}</p>}
            </div>
            <div className="flex gap-2">
              {sale.status === 'pending' && <Button variant="secondary" onClick={() => void refreshSale(sale.id)}>Check payment</Button>}
              <Button variant="secondary" onClick={dismissReceipt}>Close</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <div className="border-b border-slate-200 p-4">
            <Field label="Find medicine" error={fieldError({ errors: validationErrors }, 'items')} hint="Scan a barcode or search by brand/generic name. Press Enter to add the first match.">
              <Input
                autoFocus
                placeholder="Search or scan barcode…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && data?.data[0]) {
                    event.preventDefault();
                    addDrug(data.data[0]);
                  }
                }}
              />
            </Field>
          </div>
          {error && <div className="p-4"><ErrorBox message={error} /></div>}
          {loading && !data ? <Spinner /> : !debouncedQuery.trim() ? (
            <Empty>Scan a barcode or type at least two characters to find products.</Empty>
          ) : data && data.data.length === 0 ? (
            <Empty>No matching active medicines.</Empty>
          ) : data && (
            <div className="divide-y divide-slate-100">
              {data.data.map((drug) => {
                const available = drug.stock_qty ?? 0;
                const inCart = cart.find((line) => line.drug.id === drug.id)?.quantity ?? 0;
                return (
                  <button
                    key={drug.id}
                    type="button"
                    disabled={available <= inCart}
                    onClick={() => addDrug(drug)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{drug.brand_name}</span>
                      <span className="block truncate text-xs text-slate-500">{[drug.generic_name, drug.strength, drug.dosage_form].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold">{kes(drug.selling_price)}</span>
                      <span className="text-xs text-slate-500">{available - inCart} available</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="xl:sticky xl:top-4">
          <div className="border-b border-slate-200 px-4 py-3 font-semibold">Current sale <span className="text-sm font-normal text-slate-500">({cart.reduce((n, line) => n + line.quantity, 0)} items)</span></div>
          {cart.length === 0 ? <Empty>Your basket is empty.</Empty> : (
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {cart.map(({ drug, quantity }) => (
                  <tr key={drug.id}>
                    <Td><span className="block max-w-40 truncate font-medium">{drug.brand_name}</span><span className="text-xs text-slate-500">{kes(drug.selling_price)} each</span></Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <button aria-label={`Remove one ${drug.brand_name}`} className="h-7 w-7 rounded border hover:bg-slate-50" onClick={() => changeQuantity(drug.id, -1)}>−</button>
                        <span>{quantity}</span>
                        <button aria-label={`Add one ${drug.brand_name}`} className="h-7 w-7 rounded border hover:bg-slate-50" disabled={quantity >= (drug.stock_qty ?? 0)} onClick={() => changeQuantity(drug.id, 1)}>+</button>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-right">{kes(Math.round(Number(drug.selling_price) * 100) * quantity / 100)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{kes(total)}</span></div>
            {cart.some(({ drug }) => drug.schedule === 'prescription_only' || drug.schedule === 'controlled') && (
              <Field label="Prescription reference *" error={fieldError({ errors: validationErrors }, 'prescription_reference')}>
                <Input value={prescriptionReference} onChange={(event) => setPrescriptionReference(event.target.value)} placeholder="Enter prescription number" />
              </Field>
            )}
            <Field label="Payment method">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={paymentMethod === 'cash' ? 'primary' : 'secondary'} onClick={() => setPaymentMethod('cash')}>Cash</Button>
                <Button type="button" variant={paymentMethod === 'mpesa' ? 'primary' : 'secondary'} disabled={!mpesaReady} title={mpesaReady ? undefined : 'M-Pesa is not configured for this branch. Use cash or ask the owner to set it up in M-Pesa setup.'} onClick={() => setPaymentMethod('mpesa')}>M-Pesa</Button>
              </div>
              {!mpesaReady && <p className="mt-1 text-xs text-amber-700">M-Pesa is not configured for this branch — cash sales still work. A pharmacy owner or admin can set it up under Settings → M-Pesa setup.</p>}
            </Field>
            {paymentMethod === 'cash' ? (
              <>
                <Field label="Cash received (KES) *" error={fieldError({ errors: validationErrors }, 'amount_received')}>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} />
                </Field>
                {cashCents >= totalCents && totalCents > 0 && <p className="text-sm text-slate-600">Change: <strong>{kes(change)}</strong></p>}
              </>
            ) : mpesaReady ? (
              <Field label="Customer M-Pesa phone *" error={fieldError({ errors: validationErrors }, 'phone')} hint="The customer receives an STK prompt. Confirm payment on their phone.">
                <Input type="tel" inputMode="tel" placeholder="0712345678" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                M-Pesa is not configured for this branch, so this sale has been switched to cash. Enter the cash received below.
              </div>
            )}
            <Button className="w-full" disabled={!cart.length || saving || (paymentMethod === 'cash' && cashCents < totalCents) || (paymentMethod === 'mpesa' && !mpesaReady)} onClick={checkout}>
              {saving ? 'Processing…' : paymentMethod === 'cash' ? 'Complete cash sale' : 'Send M-Pesa request'}
            </Button>
            <p className="text-center text-xs text-slate-500">Prices are verified by the server. Stock deducts only when payment completes.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
