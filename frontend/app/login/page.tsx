'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { fieldError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [pharmacy, setPharmacy] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(pharmacy.trim(), email.trim(), password);
      router.replace('/dashboard');
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold text-brand-700">PharmaCore</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to your pharmacy</p>
        <form onSubmit={submit} className="space-y-4">
          {err instanceof Error && !fieldError(err, 'email') && <ErrorBox message={err.message} />}
          <Field label="Pharmacy code" hint="e.g. afya-pharmacy">
            <Input required autoFocus value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} />
          </Field>
          <Field label="Email" error={fieldError(err, 'email')}>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          New pharmacy? <Link href="/register" className="text-brand-700 underline">Create an account</Link>
        </p>
      </Card>
    </div>
  );
}
