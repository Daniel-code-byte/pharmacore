import { Badge } from './ui';
import { daysUntil, fmtDate } from '@/lib/format';

export function ExpiryBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  const tone = d < 0 ? 'red' : d <= 30 ? 'red' : d <= 90 ? 'amber' : 'green';
  const text = d < 0 ? `Expired ${Math.abs(d)}d ago` : d === 0 ? 'Expires today' : `${d}d left`;
  return (
    <div className="flex flex-col items-start gap-1">
      <span>{fmtDate(date)}</span>
      <Badge tone={tone}>{text}</Badge>
    </div>
  );
}
