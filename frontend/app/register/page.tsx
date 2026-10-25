'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { api, ApiError, fieldError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { LoginResponse } from '@/lib/types';

export default function RegisterPage() {
  const { setSession } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({
    pharmacy_name: '', ppb_licence_no: '', owner_name: '', email: '', phone: '', password: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<LoginResponse | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
      body.password = f.password;
      const res = await api<LoginResponse>('/register-pharmacy', { method: 'POST', body });
      setDone(res);
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-bold text-brand-700">Pharmacy created</h1>
          <p className="mt-3 text-sm text-slate-600">Your pharmacy code is</p>
          <p className="my-2 rounded-lg bg-brand-50 py-2 text-lg font-mono font-semibold">{done.tenant.slug}</p>
          <p className="mb-5 text-sm text-slate-500">Staff need this code, plus their email and password, to sign in. Keep it safe.</p>
          <Button className="w-full" onClick={() => { setSession(done); router.replace('/dashboard'); }}>
            Continue to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-brand-700">Create your pharmacy</h1>
        <p className="mb-6 text-sm text-slate-500">14-day free trial</p>
        <form onSubmit={submit} className="space-y-4">
          {err instanceof ApiError && !err.errors && <ErrorBox message={err.message} />}
          <Field label="Pharmacy name *" error={fieldError(err, 'pharmacy_name')}>
            <Input required value={f.pharmacy_name} onChange={set('pharmacy_name')} />
          </Field>
          <Field label="PPB licence number" error={fieldError(err, 'ppb_licence_no')}>
            <Input value={f.ppb_licence_no} onChange={set('ppb_licence_no')} />
          </Field>
          <Field label="Your name *" error={fieldError(err, 'owner_name')}>
            <Input required value={f.owner_name} onChange={set('owner_name')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email *" error={fieldError(err, 'email')}>
              <Input required type="email" value={f.email} onChange={set('email')} />
            </Field>
            <Field label="Phone" error={fieldError(err, 'phone')}>
              <Input value={f.phone} onChange={set('phone')} />
            </Field>
          </div>
          <Field label="Password *" error={fieldError(err, 'password')} hint="At least 8 characters">
            <Input required type="password" minLength={8} value={f.password} onChange={set('password')} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create pharmacy'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered? <Link href="/login" className="text-brand-700 underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
