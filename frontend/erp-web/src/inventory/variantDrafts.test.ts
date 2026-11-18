import { describe, expect, it } from 'vitest';
import { makeVariantDrafts, variantToken } from './variantDrafts';

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

  it('empty dimensions give none', () => {
    expect(makeVariantDrafts('A', 'B', [])).toEqual([]);
    expect(makeVariantDrafts('A', 'B', [{ name: '', values: 'x' }, { name: 'Renk', values: ' , ' }])).toEqual([]);
  });

  it('token falls back to SECENEK', () => {
    expect(variantToken('***')).toBe('SECENEK');
    expect(variantToken('Şık Çiçek')).toBe('SIK-CICEK');
  });
});
