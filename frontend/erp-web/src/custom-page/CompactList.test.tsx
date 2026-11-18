import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CompactList, compactCell } from './CompactList';
import type { QueryState } from './usePageQueries';

afterEach(cleanup);

const state = (rows: Record<string, unknown>[]): QueryState => ({ rows, rowCount: rows.length, columns: [], truncated: false, loading: false, error: '', ran: true });
const cell = compactCell({ yon: { Receipt: 'Giriş', Issue: 'Çıkış' } }, { miktar: 'number' }, {}, (value) => (value == null ? '' : String(value)));

describe('CompactList', () => {
  it('bars: label, bar relative to the largest value, "—" for an unknown value', () => {
    const { container } = render(<CompactList variant="bars" title="Depo dağılımı" columns={['ad', 'miktar']} emptyText="" cell={cell} toneMap={[]} style={{}}
      state={state([{ ad: 'Merkez', miktar: 10 }, { ad: 'Şube', miktar: 5 }, { ad: 'Dış', miktar: null }])} />);
    const rows = Array.from(container.querySelectorAll('.tenant-page-compact-bar-row'));
    expect(rows.map((row) => row.querySelector('b')?.textContent)).toEqual(['10', '5', '—']);
    expect(rows.map((row) => (row.querySelector('i') as HTMLElement).style.width)).toEqual(['100%', '50%', '0%']);
    expect(container.querySelector('.tenant-page-compact-title')?.textContent).toBe('Depo dağılımı');
  });

  it('list: main text, meta line, toned value with sign; empty main falls back to the toned label', () => {
    const { container } = render(<CompactList variant="list" title="" columns={['aciklama', 'tarih', 'yon', 'miktar']} emptyText="" cell={cell}
      toneMap={[{ key: 'Giriş', tone: 'success' }, { key: 'Çıkış', tone: 'danger' }]} style={{}}
      state={state([{ aciklama: 'Sayım', tarih: '01.11.2026', yon: 'Receipt', miktar: 5 }, { aciklama: '', tarih: '02.11.2026', yon: 'Issue', miktar: 2 }])} />);
    const items = Array.from(container.querySelectorAll('li'));
    expect(items.map((item) => item.querySelector('.tenant-page-compact-main > span')?.textContent)).toEqual(['Sayım', 'Çıkış']);
    expect(items.map((item) => item.querySelector('small')?.textContent)).toEqual(['01.11.2026', '02.11.2026']);
    expect(items.map((item) => item.querySelector('b')?.textContent)).toEqual(['+5', '−2']);
  });

  it('shows the empty text', () => {
    const { container } = render(<CompactList variant="list" title="" columns={['a']} emptyText="Henüz hareket yok." cell={cell} toneMap={[]} style={{}} state={state([])} />);
    expect(container.textContent).toBe('Henüz hareket yok.');
  });
});
