import { describe, expect, it } from 'vitest';
import { idList, ownedInputIds, parseFieldList } from './layoutRefs';

describe('idList', () => {
  it('tekil, boş olmayan metinleri sırayla verir', () => {
    expect(idList(['a', 'a', ' ', 5, 'b'])).toEqual(['a', 'b']);
  });
  it('en fazla max kimlik verir', () => {
    expect(idList(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
  it('dizi olmayanı boş sayar', () => {
    expect(idList('a')).toEqual([]);
    expect(idList(undefined)).toEqual([]);
  });
});

describe('ownedInputIds', () => {
  it('formCard ve facetPanel girişlerini birleştirir', () => {
    const owned = ownedInputIds([
      { id: 'f', type: 'formCard', props: { inputs: ['i1', 'i2'] } },
      { id: 'p', type: 'facetPanel', props: { inputs: ['i3', 'i1'] } },
    ]);
    expect([...owned].sort()).toEqual(['i1', 'i2', 'i3']);
  });
  it('filterChips ve contextPanel girişleri sahiplenmez', () => {
    const owned = ownedInputIds([
      { id: 'c', type: 'filterChips', props: { inputs: ['i1'] } },
      { id: 'x', type: 'contextPanel', props: { inputs: ['i2'] } },
      { id: 'g', type: 'formCard' },
    ]);
    expect(owned.size).toBe(0);
  });
});

describe('parseFieldList', () => {
  it('sütun=Etiket girdilerini ayrıştırır, bozukları atlar', () => {
    expect(parseFieldList(['Tutar=Tutar (TL)', 'bozuk'])).toEqual([{ code: 'Tutar', label: 'Tutar (TL)' }]);
  });
  it('etikette = geçebilir', () => {
    expect(parseFieldList(['a=b=c'])).toEqual([{ code: 'a', label: 'b=c' }]);
  });
  it('dizi olmayanı boş sayar', () => {
    expect(parseFieldList(null)).toEqual([]);
  });
});
