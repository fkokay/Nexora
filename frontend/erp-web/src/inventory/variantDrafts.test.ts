import { describe, expect, it } from 'vitest';
import { countVariantDrafts, makeVariantDrafts, variantToken } from './variantDrafts';

describe('makeVariantDrafts', () => {
  it('cartesian product with tokens', () => {
    const drafts = makeVariantDrafts('TS', 'Tişört', [{ name: 'Renk', values: 'Kırmızı, Mavi' }, { name: 'Beden', values: 'S,M' }]);
    expect(drafts).toHaveLength(4);
    expect(drafts[0]).toEqual({ code: 'TS-KIRMIZI-S', name: 'Tişört · Renk: Kırmızı · Beden: S', barcode: null, attributes: { Renk: 'Kırmızı', Beden: 'S' } });
    expect(drafts.map((draft) => draft.code)).toEqual(['TS-KIRMIZI-S', 'TS-KIRMIZI-M', 'TS-MAVI-S', 'TS-MAVI-M']);
  });

  it('caps at 200', () => {
    const values = Array.from({ length: 15 }, (_, index) => `V${index}`).join(',');
    const drafts = makeVariantDrafts('A', 'B', [{ name: 'X', values }, { name: 'Y', values }]);
    expect(drafts).toHaveLength(200);
  });

  it('10×10×10 stops at 200 rows in product order; count is separate', () => {
    const values = Array.from({ length: 10 }, (_, index) => `V${index}`).join(',');
    const dimensions = [{ name: 'X', values }, { name: 'Y', values }, { name: 'Z', values }];
    const drafts = makeVariantDrafts('A', 'B', dimensions);
    expect(drafts).toHaveLength(200);
    expect(drafts[0].attributes).toEqual({ X: 'V0', Y: 'V0', Z: 'V0' });
    expect(drafts[199].attributes).toEqual({ X: 'V1', Y: 'V9', Z: 'V9' });
    expect(countVariantDrafts(dimensions)).toBe(1000);
    const square = [{ name: 'X', values }, { name: 'Y', values }];
    expect(makeVariantDrafts('A', 'B', square)).toHaveLength(100);
    expect(countVariantDrafts(square)).toBe(100);
    expect(countVariantDrafts([])).toBe(0);
  });

  it('10 dimensions × 10 values (1e10 combinations) returns the first 200 without building the product', () => {
    const values = Array.from({ length: 10 }, (_, index) => `V${index}`).join(',');
    const dimensions = Array.from({ length: 10 }, (_, index) => ({ name: `D${index}`, values }));
    const drafts = makeVariantDrafts('A', 'B', dimensions);
    expect(drafts).toHaveLength(200);
    expect(drafts[199].attributes.D7).toBe('V1');
    expect(drafts[199].attributes.D9).toBe('V9');
    expect(countVariantDrafts(dimensions)).toBe(1e10);
  });

  it('empty dimensions give none', () => {
    expect(makeVariantDrafts('A', 'B', [])).toEqual([]);
    expect(makeVariantDrafts('A', 'B', [{ name: '', values: 'x' }, { name: 'Renk', values: ' , ' }])).toEqual([]);
  });

  it('token falls back to SECENEK', () => {
    expect(variantToken('***')).toBe('SECENEK');
    expect(variantToken('Şık Çiçek')).toBe('SIK-CICEK');
  });
});
