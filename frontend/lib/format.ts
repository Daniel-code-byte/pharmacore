const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 });

export const kes = (v: string | number | null | undefined) => money.format(Number(v ?? 0));

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysUntil(d: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export const scheduleLabel: Record<string, string> = {
  otc: 'OTC',
  pharmacy_only: 'Pharmacy only',
  prescription_only: 'Rx only',
  controlled: 'Controlled',
};
