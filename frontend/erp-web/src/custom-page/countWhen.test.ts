import { describe, expect, it } from 'vitest';
import { countRowsWhen, countText } from './countWhen';

// Günler sabit "bugün"e göre; koşul `bugun` kökünü kapsamdan okur.
const today = '2026-03-10';
const scope = { bugun: today, bakiye: { rows: [], rowCount: 0, meta: { totalCount: 99 } } };
const rows = [
  { expiryDate: '2026-03-09' }, // dün: süresi geçmiş
  { expiryDate: '2026-03-10' }, // bugün: yaklaşıyor (alt sınır)
  { expiryDate: '2026-04-09' }, // bugün + 30: yaklaşıyor (üst sınır)
  { expiryDate: '2026-04-10' }, // bugün + 31: sayılmaz
  { expiryDate: null },         // tarihsiz: hiçbir sayaçta sayılmaz
  { expiryDate: '2025-12-31T00:00:00' },
];
const expired = 'bakiye.satir.expiryDate < bugun';
const soon = 'bakiye.satir.expiryDate >= bugun && bakiye.satir.expiryDate <= bugun + 30';

describe('countRowsWhen', () => {
  it('süresi geçmiş ve 30 gün içinde dolacak satırları sayar (eski Lot / Seri İzleme kuralı)', () => {
    expect(countRowsWhen(expired, rows, 'bakiye', scope)).toBe(2);
    expect(countRowsWhen(soon, rows, 'bakiye', scope)).toBe(2);
  });

  it('satır bindirmesi sorgunun diğer alanlarını korur', () => {
    expect(countRowsWhen('bakiye.meta.totalCount == 99 && bakiye.satir.expiryDate == null', rows, 'bakiye', scope)).toBe(1);
  });

  it('countWhen yoksa undefined, ayrıştırılamıyorsa null döner', () => {
    expect(countRowsWhen(undefined, rows, 'bakiye', scope)).toBeUndefined();
    expect(countRowsWhen('  ', rows, 'bakiye', scope)).toBeUndefined();
    expect(countRowsWhen('bakiye.satir.x <', rows, 'bakiye', scope)).toBeNull();
    expect(countText(null)).toBe('—');
  });

  it('boş sonuçta 0, sayıyı tr-TR biçiminde yazar', () => {
    expect(countRowsWhen(expired, [], 'bakiye', scope)).toBe(0);
    expect(countText(1234)).toBe('1.234');
  });
});
