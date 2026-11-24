import { describe, expect, it } from 'vitest';
import { dialogOwnedIds, idList, ownedInputIds, parseFieldList, parseTabs, rowActionIds, tableDetailToggleIds, tabOwnedIds } from './layoutRefs';

describe('tableDetailToggleIds', () => {
  it('veri listelerinin "Detay paneli" düğmesine bağlı girişlerini verir (üst düzeyde çizilmez)', () => {
    expect([...tableDetailToggleIds([
      { id: 'liste', type: 'dataTable', props: { query: 'q', detailToggleInput: ' detayPaneli ' } },
      { id: 'diger', type: 'dataTable', props: { query: 'q', detailToggleInput: '' } },
      // Dar görünümde ve sorgusuz listede düğme çizilmez: giriş de sahiplenilmez (kendi yerinde çizilir).
      { id: 'dar', type: 'dataTable', props: { query: 'q', variant: 'list', detailToggleInput: 'dar' } },
      { id: 'rapor', type: 'dataTable', props: { source: 'x', detailToggleInput: 'rapor' } },
      { id: 'kart', type: 'formCard', props: { detailToggleInput: 'x', inputs: ['y'] } },
      { id: 'bos', type: 'dataTable' },
    ])]).toEqual(['detayPaneli']);
  });
});

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

describe('parseTabs / tabOwnedIds', () => {
  it('parseTabs drops malformed items', () => {
    expect(parseTabs(['Genel=kod,ad', 5, 'bozuk', '=x', ' Diğer = not , ,not ', 'Boş='])).toEqual([
      { label: 'Genel', ids: ['kod', 'ad'] },
      { label: 'Diğer', ids: ['not'] },
      { label: 'Boş', ids: [] },
    ]);
    expect(parseTabs('Genel=kod')).toEqual([]);
    expect(parseTabs(Array.from({ length: 10 }, (_, i) => `S${i}=a${i}`))).toHaveLength(8);
    expect(parseTabs([`S=${Array.from({ length: 25 }, (_, i) => `i${i}`).join(',')}`])[0].ids).toHaveLength(20);
  });
  it('tabOwnedIds collects ids', () => {
    const owned = tabOwnedIds([
      { id: 't', type: 'tabs', props: { tabs: ['Genel=kod,fc', 'Diğer=not'] } },
      { id: 't2', type: 'tabs', props: { tabs: ['X=liste'] } },
      { id: 'f', type: 'formCard', props: { tabs: ['Y=z'], inputs: ['kod'] } },
    ]);
    expect([...owned].sort()).toEqual(['fc', 'kod', 'liste', 'not']);
  });
});

describe('dialogOwnedIds / rowActionIds', () => {
  it('dialogOwnedIds and rowActionIds', () => {
    const components = [
      { id: 'd', type: 'dialog', props: { contains: ['a', ' b ', 'a', ...Array.from({ length: 25 }, (_, i) => `x${i}`)] } },
      { id: 'd2', type: 'dialog', props: { contains: 'a' } },
      { id: 'f', type: 'formCard', props: { contains: ['z'], rowActions: ['z'] } },
      { id: 't', type: 'dataTable', props: { rowActions: ['r1', 'r2', 'r1', 'r3', 'r4', 'r5'] } },
      { id: 't2', type: 'dataTable' },
    ];
    const dialogOwned = dialogOwnedIds(components);
    expect(dialogOwned.size).toBe(20);
    expect(dialogOwned.has('a') && dialogOwned.has('b')).toBe(true);
    expect(dialogOwned.has('z')).toBe(false);
    expect([...rowActionIds(components)]).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
  it('rowActionIds listenin "Satır açılınca" düğmesini de listeye ait sayar (üst düzeyde ayrıca çizilmez)', () => {
    const components = [
      { id: 't', type: 'dataTable', props: { rowActions: ['r1'], rowOpenAction: ' ac ' } },
      { id: 't2', type: 'dataTable', props: { rowOpenAction: '' } },
      { id: 'k', type: 'card', props: { rowOpenAction: 'baska' } },
    ];
    expect([...rowActionIds(components)]).toEqual(['r1', 'ac']);
  });
});
