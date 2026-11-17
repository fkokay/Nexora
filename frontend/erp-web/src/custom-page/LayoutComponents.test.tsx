import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chipText, ContextPanel, FacetPanel, FilterChips, FormCard } from './LayoutComponents';

afterEach(cleanup);

describe('ContextPanel', () => {
  const fields = [{ code: 'Ad', label: 'Ünvan', text: 'Acme A.Ş.' }, { code: 'Bakiye', label: 'Bakiye', text: '1.250,00' }];

  it('satır seçilmediyse yönerge yazar, alan çizmez', () => {
    render(<ContextPanel title="Cari" row={null} fields={fields} style={{}} />);
    expect(screen.getByText('Bir satır seçin')).toBeTruthy();
    expect(screen.queryByText('Ünvan')).toBeNull();
  });
  it('seçili satırın alanlarını etiket ve değerle çizer', () => {
    render(<ContextPanel title="Cari" row={{ Ad: 'x' }} fields={fields} style={{}} />);
    expect(screen.getByText('Cari')).toBeTruthy();
    expect(screen.getByText('Ünvan')).toBeTruthy();
    expect(screen.getByText('Acme A.Ş.')).toBeTruthy();
    expect(screen.getByText('1.250,00')).toBeTruthy();
    expect(screen.queryByText('Bir satır seçin')).toBeNull();
  });
  it('ilgili liste yükleniyor ve hata durumlarını gösterir', () => {
    const { rerender } = render(<ContextPanel title="C" row={{}} fields={fields} related={{ title: 'Son hareketler', rows: [], loading: true }} style={{}} />);
    expect(screen.getByText('Yükleniyor…')).toBeTruthy();
    rerender(<ContextPanel title="C" row={{}} fields={fields} related={{ title: 'Son hareketler', rows: [], loading: false, error: 'Sorgu başarısız' }} style={{}} />);
    expect(screen.getByText('Sorgu başarısız')).toBeTruthy();
  });
  it('ilgili listeden en fazla 5 satır gösterir', () => {
    const rows = Array.from({ length: 8 }, (_, index) => `S${index} · ${index}`);
    const { container } = render(<ContextPanel title="C" row={{}} fields={fields} related={{ title: 'Son hareketler', rows, loading: false }} style={{}} />);
    expect(screen.getByText('Son hareketler')).toBeTruthy();
    expect(container.querySelectorAll('.tenant-page-context-related li').length).toBe(5);
  });
  it('ilgili liste boşsa Kayıt yok yazar', () => {
    render(<ContextPanel title="C" row={{}} fields={fields} related={{ title: 'Son hareketler', rows: [], loading: false }} style={{}} />);
    expect(screen.getByText('Kayıt yok')).toBeTruthy();
  });
});

describe('chipText', () => {
  it('boş değeri çipe çevirmez', () => {
    expect(chipText('', 'text')).toBeNull();
    expect(chipText(undefined, 'text')).toBeNull();
  });
  it('onay kutusu: true -> Evet, false -> null', () => {
    expect(chipText(true, 'checkbox')).toBe('Evet');
    expect(chipText(false, 'checkbox')).toBeNull();
  });
  it('tarihi gg.aa.yyyy yazar', () => {
    expect(chipText('2026-11-17', 'date')).toBe('17.11.2026');
  });
  it('seçimde seçenek etiketini, yoksa değeri yazar', () => {
    const options = [{ value: 'TR', label: 'Türkiye' }];
    expect(chipText('TR', 'select', options)).toBe('Türkiye');
    expect(chipText('DE', 'select', options)).toBe('DE');
  });
  it('diğer girişlerde metni yazar', () => {
    expect(chipText('abc', 'text')).toBe('abc');
    expect(chipText('12', 'number')).toBe('12');
  });
});

describe('FilterChips', () => {
  const chips = [{ id: 'in1', label: 'Şube', text: 'Merkez' }, { id: 'in2', label: 'Durum', text: 'Açık' }];

  it('her çipi "Etiket: değer" olarak çizer', () => {
    render(<FilterChips chips={chips} onClear={() => {}} onClearAll={() => {}} style={{}} />);
    expect(screen.getByText('Şube:')).toBeTruthy();
    expect(screen.getByText('Merkez')).toBeTruthy();
    expect(screen.getByText('Açık')).toBeTruthy();
  });
  it('✕ tek çipi, Temizle hepsini kaldırır', () => {
    const onClear = vi.fn();
    const onClearAll = vi.fn();
    render(<FilterChips chips={chips} onClear={onClear} onClearAll={onClearAll} style={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Şube süzgecini kaldır' }));
    expect(onClear).toHaveBeenCalledWith('in1');
    fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
  it('çip yoksa hiçbir şey çizmez', () => {
    const { container } = render(<FilterChips chips={[]} onClear={() => {}} onClearAll={() => {}} style={{}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('FacetPanel', () => {
  const group = (extra: Record<string, unknown> = {}) => ({
    id: 'in1', label: 'Şube', selected: '', loading: false,
    options: [{ value: 'Merkez', label: 'Merkez', count: 7 }, { value: 'Ankara', label: 'Ankara' }], ...extra,
  });
  const panel = (groups = [group()], onSelect = vi.fn()) =>
    render(<FacetPanel title="Süzgeçler" groups={groups} onSelect={onSelect} style={{}} />);

  it('başlığı yazar ve Tümü seçili başlar', () => {
    panel();
    expect(screen.getByText('Süzgeçler')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Tümü/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Merkez/ }).getAttribute('aria-checked')).toBe('false');
  });
  it('seçeneğe tıklamak onSelect çağırır, seçiliye tekrar tıklamak boşaltır', () => {
    const onSelect = vi.fn();
    const { rerender } = panel([group()], onSelect);
    fireEvent.click(screen.getByRole('radio', { name: /Merkez/ }));
    expect(onSelect).toHaveBeenLastCalledWith('in1', 'Merkez');
    rerender(<FacetPanel title="Süzgeçler" groups={[group({ selected: 'Merkez' })]} onSelect={onSelect} style={{}} />);
    expect(screen.getByRole('radio', { name: /Merkez/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Merkez/ }));
    expect(onSelect).toHaveBeenLastCalledWith('in1', '');
  });
  it('sayı varsa sağda yazar, yoksa yazmaz', () => {
    panel();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ankara' }).querySelector('.tenant-page-facet-count')).toBeNull();
  });
  it('hata ve yükleniyor durumlarını gösterir', () => {
    panel([group({ error: 'Sorgu başarısız' }), group({ id: 'in2', label: 'Tür', loading: true, options: [] })]);
    expect(screen.getByText('Sorgu başarısız')).toBeTruthy();
    expect(screen.getByText('Yükleniyor…')).toBeTruthy();
  });
  it('Temizle seçili tüm grupları boşaltır', () => {
    const onSelect = vi.fn();
    panel([group({ selected: 'Merkez' }), group({ id: 'in2', label: 'Tür', selected: 'X', options: [{ value: 'X', label: 'X' }] }), group({ id: 'in3', label: 'Üç' })], onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
    expect(onSelect.mock.calls).toEqual([['in1', ''], ['in2', '']]);
  });
});

describe('FormCard', () => {
  it('başlığı yazar ve sütun sayısına göre ızgara sınıfı verir', () => {
    const { container } = render(<FormCard title="Filtreler" columns={3} style={{}}><div>a</div></FormCard>);
    expect(screen.getByText('Filtreler')).toBeTruthy();
    expect(container.querySelector('.tenant-page-form-card-grid')!.classList.contains('is-cols-3')).toBe(true);
  });

  it('çocukları ızgara içinde çizer', () => {
    const { container } = render(<FormCard title="F" columns={2} style={{}}><div>a</div><div>b</div></FormCard>);
    expect(container.querySelector('.tenant-page-form-card-grid')!.children.length).toBe(2);
    expect(container.querySelector('.is-cols-2')).not.toBeNull();
  });

  it('başlık boşsa başlık çizmez', () => {
    const { container } = render(<FormCard title="" columns={1} style={{}}><div>a</div></FormCard>);
    expect(container.querySelector('h3')).toBeNull();
  });
});
