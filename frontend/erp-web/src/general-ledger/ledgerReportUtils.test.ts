import { describe, expect, it } from 'vitest';
import { safeSheetName } from './ledgerReportUtils';

describe('safeSheetName', () => {
  it('yasak karakterleri siler', () => {
    expect(safeSheetName('Gelir/Gider [2026]')).toBe('GelirGider 2026');
    expect(safeSheetName('a:b\\c/d?e*f[g]h')).toBe('abcdefgh');
    expect(safeSheetName('Gelir\\Gider')).toBe('GelirGider');
    expect(safeSheetName('Gelir\\Gider')).not.toContain('\\');
  });
  it('baştaki/sondaki kesmeyi atar ve 31 karaktere keser', () => {
    expect(safeSheetName("'Liste'")).toBe('Liste');
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
    expect(safeSheetName("a".repeat(30) + "'b")).toBe('a'.repeat(30));
  });
  it('boşsa Liste', () => {
    expect(safeSheetName('')).toBe('Liste');
    expect(safeSheetName('[]:')).toBe('Liste');
  });
});
