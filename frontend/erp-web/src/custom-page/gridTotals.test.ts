import { describe, expect, it } from 'vitest';
import { conditionHolds } from './conditions';
import { parseGridColumns } from './gridState';
import { formatGridTotal, gridColumnTotals, parseGridTotals } from './gridTotals';

const columns = parseGridColumns(['accountId|Hesap|text|required', 'debit|Borç|number|min:0', 'credit|Alacak|number|min:0', 'done|Tamam|checkbox']);

describe('parseGridTotals', () => {
  it('keeps only number columns of the grid, deduplicated, in order', () => {
    expect(parseGridTotals(['credit', 'debit', 'credit', 'accountId', 'done', 'missing', 3], columns, 'list')).toEqual(['credit', 'debit']);
  });
  it('is empty for matrix mode or non-array values', () => {
    expect(parseGridTotals(['debit'], columns, 'matrix')).toEqual([]);
    expect(parseGridTotals('debit', columns, 'list')).toEqual([]);
    expect(parseGridTotals(undefined, columns, 'stage')).toEqual([]);
  });
});

describe('gridColumnTotals', () => {
  it('sums numbers and numeric text; empty and invalid cells count as 0', () => {
    const rows = [{ debit: 25000 }, { debit: '5000', credit: '' }, { credit: 30000 }, { debit: 'x' }, null];
    expect(gridColumnTotals(['debit', 'credit'], rows)).toEqual({ debit: 30000, credit: 30000 });
  });
  it('drops float noise so equal totals compare equal', () => {
    const totals = gridColumnTotals(['debit', 'credit'], [{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.3 }]);
    expect(totals).toEqual({ debit: 0.3, credit: 0.3 });
  });
  it('is 0 for every declared column when there are no rows', () => {
    expect(gridColumnTotals(['debit', 'credit'], [])).toEqual({ debit: 0, credit: 0 });
  });
});

describe('balance condition over totals (existing grammar, path vs path)', () => {
  const balanced = 'fis.toplam.debit == fis.toplam.credit && fis.toplam.debit > 0';
  const scope = (debit: number, credit: number) => ({ fis: { toplam: { debit, credit } } });
  it('holds only when both totals are equal and non-zero', () => {
    expect(conditionHolds(balanced, scope(30000, 30000), false)).toBe(true);
    expect(conditionHolds(balanced, scope(30000, 29999.99), false)).toBe(false);
    expect(conditionHolds(balanced, scope(0, 0), false)).toBe(false);
    expect(conditionHolds('fis.toplam.debit != fis.toplam.credit', scope(1, 2), false)).toBe(true);
  });
});

describe('formatGridTotal', () => {
  it('uses Turkish grouping with at least two decimals', () => {
    expect(formatGridTotal(30000)).toBe('30.000,00');
    expect(formatGridTotal(1.2345)).toBe('1,2345');
  });
});
