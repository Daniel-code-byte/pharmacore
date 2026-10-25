'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, fieldError } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { usePreferences } from '@/lib/preferences';
import type { PharmacyProfile } from '@/lib/types';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';

const ACCENTS = [
  { id: 'emerald', label: 'Evergreen', color: '#059669' },
  { id: 'blue', label: 'Ocean blue', color: '#2563eb' },
  { id: 'violet', label: 'Violet', color: '#7c3aed' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
  { id: 'amber', label: 'Amber', color: '#d97706' },
] as const;

function SettingRow({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl"><h3 className="text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { preferences, updatePreferences, resetPreferences } = usePreferences();
  const { role, session, setSession } = useAuth();
  const profile = useFetch(
    () => ['owner', 'admin'].includes(role ?? '') ? api<PharmacyProfile>('/settings/pharmacy') : Promise.resolve(null),
    [role],
  );
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', address: '', kra_pin: '', ppb_licence_no: '', receipt_header: '', receipt_footer: '' });
  const [profileError, setProfileError] = useState<unknown>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setProfileForm({
      name: profile.data.name ?? '', email: profile.data.email ?? '', phone: profile.data.phone ?? '',
      address: profile.data.address ?? '', kra_pin: profile.data.kra_pin ?? '',
      ppb_licence_no: profile.data.ppb_licence_no ?? '', receipt_header: profile.data.receipt_header ?? '',
      receipt_footer: profile.data.receipt_footer ?? '',
    });
  }, [profile.data]);

  const setProfileField = (key: keyof typeof profileForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfileForm((current) => ({ ...current, [key]: event.target.value }));

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const updated = await api<PharmacyProfile>('/settings/pharmacy', { method: 'PUT', body: profileForm });
      if (session) setSession({ ...session, tenant: { ...session.tenant, name: updated.name } });
      setProfileForm({
        name: updated.name ?? '', email: updated.email ?? '', phone: updated.phone ?? '', address: updated.address ?? '',
        kra_pin: updated.kra_pin ?? '', ppb_licence_no: updated.ppb_licence_no ?? '',
        receipt_header: updated.receipt_header ?? '', receipt_footer: updated.receipt_footer ?? '',
      });
      setProfileSaved(true);
      profile.reload();
    } catch (error) { setProfileError(error); }
    finally { setSavingProfile(false); }
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    const body = new FormData();
    body.append('logo', file);
    setUploadingLogo(true);
    setProfileError(null);
    try { await api<PharmacyProfile>('/settings/pharmacy/logo', { method: 'POST', body }); profile.reload(); }
    catch (error) { setProfileError(error); }
    finally { setUploadingLogo(false); }
  }

  async function removeLogo() {
    setUploadingLogo(true);
    setProfileError(null);
    try { await api<PharmacyProfile>('/settings/pharmacy/logo', { method: 'DELETE' }); profile.reload(); }
    catch (error) { setProfileError(error); }
    finally { setUploadingLogo(false); }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="A workspace that fits how your pharmacy works." actions={<Badge tone="green">Saved for your account</Badge>} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {['owner', 'admin'].includes(role ?? '') && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-lg text-brand-700">✦</span><div><h2 className="font-semibold text-slate-900">Pharmacy identity & receipts</h2><p className="text-xs text-slate-500">Add your real-world details and put your branding on printed receipts.</p></div></div>
              </div>
              <div className="space-y-5 p-5">
                {profile.error && <ErrorBox message={profile.error} />}
                {profileError instanceof ApiError && !profileError.errors && <ErrorBox message={profileError.message} />}
                {profileSaved && <Badge tone="green">Pharmacy profile saved</Badge>}
                {fieldError(profileError, 'logo') && <ErrorBox message={fieldError(profileError, 'logo')!} />}
                {profile.loading && !profile.data ? <p className="text-sm text-slate-500">Loading pharmacy profile…</p> : profile.data && (
                  <>
                    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-2xl font-bold text-brand-700">
                        {profile.data.logo_url ? <img src={profile.data.logo_url} alt={`${profile.data.name} logo`} className="h-full w-full object-contain p-1" /> : profile.data.name.slice(0, 1).toUpperCase() || 'P'}
                      </div>
                      <div className="min-w-48 flex-1"><h3 className="text-sm font-semibold text-slate-900">Pharmacy logo</h3><p className="mt-1 text-xs text-slate-500">PNG, JPG or WebP · max 2 MB · printed on your receipts</p><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">{uploadingLogo ? 'Uploading…' : profile.data.logo_url ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploadingLogo} onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>{profile.data.logo_url && <Button variant="secondary" disabled={uploadingLogo} onClick={() => void removeLogo()}>Remove</Button>}</div></div>
                    </div>
                    <form onSubmit={saveProfile} className="space-y-4">
                      {profileError instanceof ApiError && profileError.errors && <div className="space-y-1">{Object.entries(profileError.errors).map(([key, errors]) => <p key={key} className="text-xs text-red-600">{errors[0]}</p>)}</div>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Pharmacy name *" error={fieldError(profileError, 'name')}><Input required value={profileForm.name} onChange={setProfileField('name')} /></Field>
                        <Field label="Public contact email" error={fieldError(profileError, 'email')}><Input type="email" value={profileForm.email} onChange={setProfileField('email')} /></Field>
                        <Field label="Phone" error={fieldError(profileError, 'phone')}><Input value={profileForm.phone} onChange={setProfileField('phone')} /></Field>
                        <Field label="KRA PIN" error={fieldError(profileError, 'kra_pin')}><Input value={profileForm.kra_pin} onChange={setProfileField('kra_pin')} /></Field>
                        <Field label="PPB licence number" error={fieldError(profileError, 'ppb_licence_no')}><Input value={profileForm.ppb_licence_no} onChange={setProfileField('ppb_licence_no')} /></Field>
                        <Field label="Address" error={fieldError(profileError, 'address')}><Input value={profileForm.address} onChange={setProfileField('address')} /></Field>
                      </div>
                      <Field label="Receipt welcome line" error={fieldError(profileError, 'receipt_header')} hint="Optional short message shown below your pharmacy name."><Input maxLength={160} value={profileForm.receipt_header} onChange={setProfileField('receipt_header')} placeholder="Thank you for choosing us" /></Field>
                      <Field label="Receipt footer" error={fieldError(profileError, 'receipt_footer')} hint="Add your hours, exchange policy, contact, or a thank-you note."><Textarea maxLength={240} rows={3} value={profileForm.receipt_footer} onChange={setProfileField('receipt_footer')} placeholder="Keep medicines out of reach of children. Contact us with questions." /></Field>
                      <Button type="submit" disabled={savingProfile || profile.loading}>{savingProfile ? 'Saving…' : 'Save pharmacy profile'}</Button>
                    </form>
                  </>
                )}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-lg text-brand-700">◐</span><div><h2 className="font-semibold text-slate-900">Look and feel</h2><p className="text-xs text-slate-500">Personalise your own workspace appearance.</p></div></div>
            </div>
            <div className="px-5">
              <SettingRow title="Theme" description="Choose a bright, dark, or device-matched appearance.">
                <div className="flex gap-2" role="group" aria-label="Theme">
                  {(['light', 'dark', 'system'] as const).map((theme) => (
                    <button key={theme} onClick={() => updatePreferences({ theme })} className={`rounded-xl border px-3 py-2 text-xs font-medium capitalize transition ${preferences.theme === theme ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} aria-pressed={preferences.theme === theme}>{theme === 'system' ? 'Device' : theme}</button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title="Accent colour" description="Pick the highlight colour used for buttons, links, and active states.">
                <div className="flex flex-wrap gap-2.5">
                  {ACCENTS.map((accent) => (
                    <button key={accent.id} onClick={() => updatePreferences({ accent: accent.id })} title={accent.label} aria-label={`${accent.label} accent`} aria-pressed={preferences.accent === accent.id} className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 transition ${preferences.accent === accent.id ? 'ring-2 ring-slate-500' : 'hover:scale-110'}`} style={{ backgroundColor: accent.color }}>
                      {preferences.accent === accent.id && <span className="text-sm font-bold text-white">✓</span>}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title="Display density" description="Compact mode fits more rows on smaller screens.">
                <div className="flex gap-2">
                  {(['comfortable', 'compact'] as const).map((density) => (
                    <button key={density} onClick={() => updatePreferences({ density })} className={`rounded-xl border px-3 py-2 text-xs font-medium capitalize transition ${preferences.density === density ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`} aria-pressed={preferences.density === density}>{density}</button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow title="Sidebar width" description="Collapse the navigation to icons to make more room for your work.">
                <Toggle checked={preferences.sidebarCollapsed} onChange={(sidebarCollapsed) => updatePreferences({ sidebarCollapsed })} label="Collapse sidebar" />
              </SettingRow>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-lg text-sky-700">▦</span><div><h2 className="font-semibold text-slate-900">Dashboard</h2><p className="text-xs text-slate-500">Choose what you want to see first.</p></div></div>
            </div>
            <div className="px-5">
              <SettingRow title="Expiry alert window" description="How far ahead the dashboard should highlight stock nearing expiry.">
                <Select className="min-w-44" value={preferences.expiryWindowDays} onChange={(event) => updatePreferences({ expiryWindowDays: Number(event.target.value) as 30 | 60 | 90 | 180 })}>
                  <option value={30}>Next 30 days</option><option value={60}>Next 60 days</option><option value={90}>Next 90 days</option><option value={180}>Next 180 days</option>
                </Select>
              </SettingRow>
              <SettingRow title="Expiry and waste risk" description="Show expired and soon-to-expire batches on your dashboard.">
                <Toggle checked={preferences.showExpiryWidget} onChange={(showExpiryWidget) => updatePreferences({ showExpiryWidget })} label="Show expiry widget" />
              </SettingRow>
              <SettingRow title="Reorder reminders" description="Show medicines at or below their branch reorder level.">
                <Toggle checked={preferences.showLowStockWidget} onChange={(showLowStockWidget) => updatePreferences({ showLowStockWidget })} label="Show low-stock widget" />
              </SettingRow>
            </div>
          </Card>

          {['owner', 'admin'].includes(role ?? '') && (
            <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-900">M-Pesa for this branch</h2><Badge tone="blue">Payments</Badge></div><p className="mt-1 text-sm text-slate-500">Connect a Daraja merchant account and configure the till details.</p></div>
              <Link href="/settings/mpesa" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700">Configure M-Pesa <span className="ml-2">→</span></Link>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden xl:sticky xl:top-6">
          <div className="bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Personal workspace</div>
            <h2 className="mt-2 text-xl font-bold">Your way of working.</h2>
            <p className="mt-1 text-sm text-white/75">These preferences are saved separately for your staff account on this device.</p>
          </div>
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between"><span className="text-slate-500">Theme</span><span className="font-medium capitalize">{preferences.theme}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Accent</span><span className="font-medium capitalize">{ACCENTS.find((accent) => accent.id === preferences.accent)?.label}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-500">Density</span><span className="font-medium capitalize">{preferences.density}</span></div>
            <div className="border-t border-slate-100 pt-4"><Button variant="secondary" className="w-full" onClick={resetPreferences}>Reset preferences</Button></div>
          </div>
        </Card>
      </div>
    </>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
