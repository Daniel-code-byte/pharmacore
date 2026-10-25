'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import type { Drug, Paginated } from '@/lib/types';
import { Input } from './ui';

export function DrugPicker({ onSelect }: { onSelect: (d: Drug) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [results, setResults] = useState<Drug[]>([]);

  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return; }
    let alive = true;
    api<Paginated<Drug>>('/drugs', { query: { q: dq, per_page: 8 } })
      .then((r) => alive && setResults(r.data))
      .catch(() => alive && setResults([]));
    return () => { alive = false; };
  }, [dq]);

  return (
    <div className="relative">
      <Input autoFocus placeholder="Search drug by name or barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
              >
                <span className="font-medium">{d.brand_name}</span>{' '}
                <span className="text-slate-500">{[d.generic_name, d.strength].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
