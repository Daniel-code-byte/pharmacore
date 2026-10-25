'use client';

import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError, fieldError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import type { MpesaSettings } from '@/lib/types';

export default function MpesaSettingsPage() {
  const { role } = useAuth();
  const settings = useFetch(() => api<MpesaSettings>('/settings/mpesa'), []);
  const [form, setForm] = useState({ consumer_key: '', consumer_secret: '', shortcode: '', passkey: '', till: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  if (!['owner', 'admin'].includes(role ?? '')) {
    return <ErrorBox message="Only a pharmacy owner or admin can configure payment settings." />;
  }

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim() !== ''));
      await api<MpesaSettings>('/settings/mpesa', { method: 'PUT', body });
      setForm({ consumer_key: '', consumer_secret: '', shortcode: '', passkey: '', till: '' });
      setSaved(true);
      settings.reload();
    } catch (error) {
      setErr(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="M-Pesa setup" subtitle="Connect this branch's Daraja merchant account for STK Push payments." />
      {settings.loading && !settings.data ? <Spinner /> : settings.error ? <ErrorBox message={settings.error} /> : settings.data && (
        <div className="max-w-3xl space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{settings.data.branch_name}</h2>
                <p className="mt-1 text-sm text-slate-600">Daraja environment: <strong className="capitalize">{settings.data.environment}</strong></p>
              </div>
              <Badge tone={settings.data.configured ? 'green' : 'amber'}>{settings.data.configured ? 'Ready for checkout' : 'Configuration incomplete'}</Badge>
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>Consumer key: {settings.data.consumer_key_configured ? 'Configured' : 'Missing'}</div>
              <div>Consumer secret: {settings.data.consumer_secret_configured ? 'Configured' : 'Missing'}</div>
              <div>Merchant shortcode: {settings.data.merchant_shortcode || 'Missing'}</div>
              <div>Passkey: {settings.data.passkey_configured ? 'Configured' : 'Missing'}</div>
              <div>Receiving till: {settings.data.till || 'Uses shortcode'}</div>
              <div>Public callback URL: {settings.data.callback_configured ? 'Configured' : 'Missing'}</div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Daraja credentials</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">Use this merchant's Safaricom Daraja credentials. Secrets are encrypted at rest and never shown again. Leave a field blank to keep its saved value.</p>
            {err instanceof ApiError && !err.errors && <div className="mb-4"><ErrorBox message={err.message} /></div>}
            {saved && <div className="mb-4"><Badge tone="green">Settings saved</Badge></div>}
            <form onSubmit={submit} className="space-y-4">
              <Field label="Consumer key" error={fieldError(err, 'consumer_key')}>
                <Input autoComplete="off" value={form.consumer_key} onChange={update('consumer_key')} placeholder={settings.data.consumer_key_configured ? 'Saved — enter only to replace' : 'Daraja consumer key'} />
              </Field>
              <Field label="Consumer secret" error={fieldError(err, 'consumer_secret')}>
                <Input type="password" autoComplete="new-password" value={form.consumer_secret} onChange={update('consumer_secret')} placeholder={settings.data.consumer_secret_configured ? 'Saved — enter only to replace' : 'Daraja consumer secret'} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business shortcode" error={fieldError(err, 'shortcode')}>
                  <Input value={form.shortcode} onChange={update('shortcode')} placeholder={settings.data.merchant_shortcode || 'PayBill or Till shortcode'} />
                </Field>
                <Field label="Receiving till (optional)" error={fieldError(err, 'till')}>
                  <Input value={form.till} onChange={update('till')} placeholder={settings.data.till || 'Defaults to shortcode'} />
                </Field>
              </div>
              <Field label="STK passkey" error={fieldError(err, 'passkey')}>
                <Input type="password" autoComplete="new-password" value={form.passkey} onChange={update('passkey')} placeholder={settings.data.passkey_configured ? 'Saved — enter only to replace' : 'Daraja Lipa Na M-Pesa passkey'} />
              </Field>
              {fieldError(err, 'credentials') && <ErrorBox message={fieldError(err, 'credentials')!} />}
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save M-Pesa settings'}</Button>
            </form>
          </Card>

          <Card className="border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <h2 className="font-semibold">Server callback setup is also required</h2>
            <p className="mt-1">Ask your system administrator to set the callback URL in the server environment and expose it over public HTTPS. A local-only URL cannot receive Safaricom payment confirmations. Use sandbox credentials until the business is approved for production.</p>
          </Card>
        </div>
      )}
    </>
  );
}
