import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageBadge, QueryTable } from '../TenantCustomPage';
import { parseColumnFormats, parseToneMap } from './cellFormat';
import type { QueryState } from './usePageQueries';

afterEach(cleanup);

const state = (rows: Record<string, unknown>[], columns: { code: string; label: string; dataType?: string }[], truncated = false): QueryState =>
  ({ rows, rowCount: rows.length, columns, truncated, loading: false, error: '', ran: true });

type TableOptions = { formats?: string[]; toneMap?: string[]; totals?: string[]; density?: 'dense' | 'comfort' };
const table = (s: QueryState, o: TableOptions = {}) => render(
  <QueryTable state={s} columns={[]} title="T" description="" style={{}}
    formats={parseColumnFormats(o.formats)} toneMap={parseToneMap(o.toneMap)} totals={o.totals ?? []} density={o.density ?? 'dense'} />,
);

describe('QueryTable biçimleri', () => {
  const statusCols = [{ code: 'Durum', label: 'Durum' }];

  it('status hücresi eşleşen değerde ton sınıfı alır', () => {
    const { container } = table(state([{ Durum: 'Aktif' }], statusCols), { formats: ['Durum=status'], toneMap: ['Aktif=success'] });
    const tag = container.querySelector('td .tenant-page-tag');
    expect(tag?.textContent).toBe('Aktif');
    expect(tag?.classList.contains('tone-success')).toBe(true);
  });

  it('eşleşmeyen status değeri nötr etiket olur', () => {
    const { container } = table(state([{ Durum: 'Beklemede' }], statusCols), { formats: ['Durum=status'], toneMap: ['Aktif=success'] });
    const tag = container.querySelector('td .tenant-page-tag');
    expect(tag?.textContent).toBe('Beklemede');
    expect(Array.from(tag!.classList).some((name) => name.startsWith('tone-'))).toBe(false);
  });

  it('money biçimi sayıyı yazar ve sağa hizalar', () => {
    const { container } = table(state([{ Tutar: 1234.5 }], [{ code: 'Tutar', label: 'Tutar' }]), { formats: ['Tutar=money'] });
    const cell = container.querySelector('tbody td')!;
    expect(cell.textContent).toBe('1.234,50');
    expect(cell.classList.contains('num')).toBe(true);
  });

  it('totals alt satırı yalnız sayısal değerleri toplar', () => {
    const { container } = table(state([{ Tutar: 10 }, { Tutar: 'x' }, { Tutar: 5.5 }], [{ code: 'Tutar', label: 'Tutar' }]), { totals: ['Tutar'] });
    const foot = container.querySelector('tfoot tr')!;
    expect(foot.textContent).toContain('15,5');
    const { container: other } = table(state([{ Tutar: 10 }, { Tutar: 'x' }, { Tutar: 5.5 }], [{ code: 'Ad', label: 'Ad' }, { code: 'Tutar', label: 'Tutar' }]), { totals: ['Tutar'] });
    const cells = other.querySelectorAll('tfoot td');
    expect(cells[0].textContent).toBe('Toplam · 3 kayıt');
    expect(cells[1].textContent).toBe('15,5');
  });

  it('kesilmiş sonuçta toplam etiketi ilk satırları belirtir', () => {
    const { container } = table(state([{ Tutar: 1 }, { Tutar: 2 }, { Tutar: 3 }], [{ code: 'Ad', label: 'Ad' }, { code: 'Tutar', label: 'Tutar' }], true), { totals: ['Tutar'] });
    expect(container.querySelector('tfoot td')!.textContent).toBe('Toplam · ilk 3 satır');
  });

  it('totals yoksa alt satır çizilmez', () => {
    const { container } = table(state([{ Tutar: 1 }], [{ code: 'Tutar', label: 'Tutar' }]));
    expect(container.querySelector('tfoot')).toBeNull();
  });

  it('comfort yoğunluğu is-comfort sınıfı ekler', () => {
    const { container } = table(state([{ Durum: 'a' }], statusCols), { density: 'comfort' });
    expect(container.querySelector('table')!.classList.contains('is-comfort')).toBe(true);
    const { container: dense } = table(state([{ Durum: 'a' }], statusCols));
    expect(dense.querySelector('table')!.classList.contains('is-comfort')).toBe(false);
  });
});

describe('PageBadge', () => {
  it('toneMap eşleşmesi variant değerini geçer', () => {
    const { container } = render(<PageBadge text="pasif" variant="success" toneMap={['Pasif=danger']} />);
    expect(container.querySelector('.tenant-page-badge')!.classList.contains('tone-danger')).toBe(true);
  });
  it('eşleşme yoksa variant geri dönüş tonudur', () => {
    const { container } = render(<PageBadge text="Aktif" variant="success" toneMap={['Pasif=danger']} />);
    expect(container.querySelector('.tenant-page-badge')!.classList.contains('tone-success')).toBe(true);
  });
});
