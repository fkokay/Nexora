import { describe, expect, it } from 'vitest';
import { hasListSlot, layoutListTemplate, templateLevel } from './listTemplateModel';

const c = (id: string, type: string, slot?: string) => ({ id, type, props: slot ? { slot } : {} });

describe('listTemplateModel', () => {
  it('layoutListTemplate groups by slot and keeps order', () => {
    const layout = layoutListTemplate([
      c('b2', 'button', 'actions'), c('m1', 'metric', 'indicators'), c('t', 'dataTable', 'list'), c('b1', 'button', 'actions'),
      c('m2', 'metric', 'indicators'), c('f', 'filterBar', 'filters'), c('r1', 'button', 'rowActions'), c('d', 'contextPanel', 'detail'),
      c('a1', 'alert', 'above'), c('x', 'text', 'below'), c('a2', 'text', 'above'), c('yok', 'text'),
    ]);
    expect(layout.list.id).toBe('t');
    expect(layout.actions.map((x) => x.id)).toEqual(['b2', 'b1']);
    expect(layout.indicators.map((x) => x.id)).toEqual(['m1', 'm2']);
    expect(layout.filters?.id).toBe('f');
    expect(layout.rowActions.map((x) => x.id)).toEqual(['r1']);
    expect(layout.detail?.id).toBe('d');
    expect(layout.above.map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(layout.below.map((x) => x.id)).toEqual(['x']);
  });

  it('templateLevel is 2 when above or below has components', () => {
    expect(templateLevel(layoutListTemplate([c('t', 'dataTable', 'list'), c('m', 'metric', 'indicators')]))).toBe(1);
    expect(templateLevel(layoutListTemplate([c('t', 'dataTable', 'list'), c('a', 'text', 'above')]))).toBe(2);
    expect(templateLevel(layoutListTemplate([c('t', 'dataTable', 'list'), c('b', 'text', 'below')]))).toBe(2);
  });

  it('a page without a list table cannot be laid out', () => {
    expect(hasListSlot([c('m', 'metric', 'indicators'), c('t', 'dataTable', 'below')])).toBe(false);
    expect(() => layoutListTemplate([c('m', 'metric', 'indicators')])).toThrow('Liste kalıbında tam bir liste (dataTable) olmalı.');
  });

  // Pencere içeriği (`contains`, pencerenin sekmesinin işaret ettikleri ve içerikteki formCard'ların girdileri) `dialog`
  // yerindedir; hiçbir gövde yerine girmez, yalnız pencerenin içinde çizilir.
  it('dialogs are laid out apart and dialog contents enter no body slot', () => {
    const layout = layoutListTemplate([
      c('t', 'dataTable', 'list'), c('p1', 'dialog', 'dialogs'), c('x', 'text', 'below'), c('p2', 'dialog', 'dialogs'),
      { id: 'sek', type: 'tabs', props: { slot: 'dialog', tabs: ['Bilgi=tablo,bolum'] } },
      c('ozet', 'recordHeader', 'dialog'), c('tablo', 'dataTable', 'dialog'), c('bolum', 'section', 'dialog'),
      c('form', 'formCard', 'dialog'), c('girdi', 'input', 'dialog'), c('m', 'metric', 'dialog'), c('b', 'button', 'dialog'),
      c('yanlis', 'text', 'dialogs'),
    ]);
    expect(layout.dialogs.map((x) => x.id)).toEqual(['p1', 'p2']);
    const placed = [layout.list, layout.filters, layout.detail, ...layout.indicators, ...layout.actions, ...layout.rowActions, ...layout.above, ...layout.below]
      .filter((x) => x !== null).map((x) => x!.id);
    expect(placed).toEqual(['t', 'x']);
  });

  it('the list detail slot takes a context panel or a card group', () => {
    expect(layoutListTemplate([c('t', 'dataTable', 'list'), c('k', 'card', 'detail')]).detail?.id).toBe('k');
    expect(layoutListTemplate([c('t', 'dataTable', 'list'), c('d', 'contextPanel', 'detail')]).detail?.id).toBe('d');
    expect(layoutListTemplate([c('t', 'dataTable', 'list'), c('s', 'section', 'detail')]).detail).toBeNull();
    expect(layoutListTemplate([c('t', 'dataTable', 'list')]).dialogs).toEqual([]);
  });
});
