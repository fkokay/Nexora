import { describe, expect, it, vi } from 'vitest';

// Saat dilimi modüller (ve Intl biçimleyicileri) yüklenmeden sabitlenir (İstanbul, yaz saati yok, UTC+3): UTC'de çalışan
// CI'da da yerel ↔ UTC dönüşümü sınanır.
vi.hoisted(() => { process.env.TZ = 'Europe/Istanbul'; });
import { formatCell, parseColumnFormats } from './cellFormat';
import { formatDateTime, parseDateTime, toIsoDateTime, toLocalInputText } from './dateTimeInput';
import { resolveKind } from './filterBarModel';
import { validateInputValue } from './inputValidation';
import { coerceParameter } from './pageBindings';


const rules = (required = false) => ({ required, upperCase: false });

describe('datetime input helpers (E1)', () => {
  it('runs in a pinned +3 zone', () => {
    expect(new Date('2026-11-21T00:00:00Z').getTimezoneOffset()).toBe(-180);
  });

  it('shows an ISO value with offset as local datetime-local text', () => {
    expect(toLocalInputText('2026-11-21T09:30:00Z')).toBe('2026-11-21T12:30');
    expect(toLocalInputText('2026-11-21T09:30:00+00:00')).toBe('2026-11-21T12:30');
    expect(toLocalInputText('2026-11-21T12:30:00+03:00')).toBe('2026-11-21T12:30');
    expect(toLocalInputText('2026-11-21T22:15:00.1234567Z')).toBe('2026-11-22T01:15');
    // Zaten yerel metin olduğu gibi kalır.
    expect(toLocalInputText('2026-11-21T12:30')).toBe('2026-11-21T12:30');
  });

  it('converts local text to UTC ISO and keeps an untouched ISO value at the same instant', () => {
    expect(toIsoDateTime('2026-11-21T12:30')).toBe('2026-11-21T09:30:00.000Z');
    expect(toIsoDateTime('2026-11-21T12:30:45')).toBe('2026-11-21T09:30:45.000Z');
    expect(toIsoDateTime('2026-11-21T09:30:45.5+00:00')).toBe('2026-11-21T09:30:45.500Z');
    // Gösterilen yerel metin geri çevrilince aynı an (dakika hassasiyeti) çıkar: kaydırma yok.
    expect(toIsoDateTime(toLocalInputText('2026-11-21T09:30:00Z'))).toBe('2026-11-21T09:30:00.000Z');
  });

  it('treats empty and invalid values as null', () => {
    for (const value of ['', '   ', null, undefined, 42, 'abc', '2026-02-31T10:00', '2026-11-21', '2026-11-21T25:00']) {
      expect(toIsoDateTime(value)).toBeNull();
      expect(toLocalInputText(value)).toBe('');
    }
    expect(parseDateTime(new Date(Number.NaN))).toBeNull();
  });

  it('coerces the datetime parameter type without dropping the time; date still slices', () => {
    expect(coerceParameter('2026-11-21T12:30', 'datetime')).toBe('2026-11-21T09:30:00.000Z');
    expect(coerceParameter('2026-11-21T09:30:00+00:00', 'datetime')).toBe('2026-11-21T09:30:00.000Z');
    expect(coerceParameter('', 'datetime')).toBeNull();
    expect(coerceParameter(null, 'datetime')).toBeNull();
    expect(coerceParameter(5, 'datetime')).toBeNull();
    expect(coerceParameter('2026-11-21T09:30:00Z', 'date')).toBe('2026-11-21');
  });

  it('validates datetime inputs', () => {
    expect(validateInputValue('datetime', rules(), '')).toBeNull();
    expect(validateInputValue('datetime', rules(true), '')).toBe('Bu alan zorunludur.');
    expect(validateInputValue('datetime', rules(), '2026-11-21T12:30')).toBeNull();
    expect(validateInputValue('datetime', rules(), '2026-11-21T09:30:00Z')).toBeNull();
    expect(validateInputValue('datetime', rules(), 'yarın')).toBe('Geçerli bir tarih ve saat girin.');
  });
});

describe('datetime format (E2)', () => {
  it('formats in tr-TR with local time', () => {
    expect(formatDateTime('2026-11-21T09:30:00Z')).toBe('21.11.2026 12:30');
    expect(formatCell('2026-11-21T09:30:00Z', 'datetime')).toBe('21.11.2026 12:30');
    expect(formatCell('2026-11-21T21:05:00+00:00', 'datetime')).toBe('22.11.2026 00:05');
  });

  it('keeps empty and unparseable values readable', () => {
    expect(formatCell(null, 'datetime')).toBe('—');
    expect(formatCell('', 'datetime')).toBe('—');
    expect(formatCell('bilinmiyor', 'datetime')).toBe('bilinmiyor');
    expect(formatDateTime('bilinmiyor')).toBeNull();
  });

  it('is an accepted column format and filters as a date', () => {
    expect(parseColumnFormats(['nextActivityAt=datetime'])).toEqual({ nextActivityAt: 'datetime' });
    expect(resolveKind({ kind: 'auto' } as never, { format: 'datetime' })).toBe('date');
  });
});
