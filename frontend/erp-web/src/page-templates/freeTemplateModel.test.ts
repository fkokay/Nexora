import { describe, expect, it } from 'vitest';
import { readPageTemplate } from './pageTemplate';
import { freeFullRow, hasFreeSlot, layoutFreeTemplate } from './freeTemplateModel';

const c = (id: string, type: string, slot?: string, props: Record<string, unknown> = {}) => ({ id, type, props: slot ? { slot, ...props } : props });
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('freeTemplateModel', () => {
  it('readPageTemplate accepts free', () => {
    expect(readPageTemplate({ template: { name: 'free' } })).toEqual({ name: 'free' });
    expect(readPageTemplate({ template: { name: 'list' } })).toEqual({ name: 'list' });
    expect(readPageTemplate({ template: { name: 'serbest' } })).toBeNull();
  });

  it('hasFreeSlot needs at least one block', () => {
    expect(hasFreeSlot([c('b1', 'section', 'block')])).toBe(true);
    expect(hasFreeSlot([c('x', 'section', 'item'), c('b', 'button', 'actions')])).toBe(false);
  });

  it('layoutFreeTemplate groups members by block and blocks by tab', () => {
    const layout = layoutFreeTemplate([
      c('a2', 'button', 'actions'), c('a1', 'button', 'actions'),
      c('t', 'tabs', 'tabs', { tabs: ['Genel=b1', 'Ayrıntı=b3,b2'] }),
      c('b1', 'section', 'block', { members: ['m2', 'm1'] }),
      c('b2', 'section', 'block', { members: ['m3'] }),
      c('b3', 'section', 'block', { members: [] }),
      c('m1', 'text', 'item'), c('m2', 'section', 'item'), c('m3', 'dataTable', 'item'),
    ]);
    expect(ids(layout.actions)).toEqual(['a2', 'a1']);
    expect(layout.tabsComponent?.id).toBe('t');
    expect(layout.tabs!.map((tab) => [tab.label, tab.blocks.map((block) => [block.block.id, ids(block.members)])])).toEqual([
      ['Genel', [['b1', ['m2', 'm1']]]],
      ['Ayrıntı', [['b3', []], ['b2', ['m3']]]],
    ]);
    expect(ids(layout.blocks.map((block) => block.block))).toEqual(['b1', 'b2', 'b3']);
  });

  it('layoutFreeTemplate without tabs keeps block order', () => {
    const layout = layoutFreeTemplate([
      c('b2', 'section', 'block', { members: ['m1'] }), c('m1', 'text', 'item'), c('b1', 'section', 'block'),
    ]);
    expect(layout.tabs).toBeNull();
    expect(layout.tabsComponent).toBeNull();
    expect(layout.blocks.map((block) => [block.block.id, ids(block.members)])).toEqual([['b2', ['m1']], ['b1', []]]);
  });

  it('unknown member id is skipped', () => {
    const layout = layoutFreeTemplate([
      c('b1', 'section', 'block', { members: ['yok', 'm1', 'b2', 7] }), c('b2', 'section', 'block'), c('m1', 'metric', 'item'),
    ]);
    // Bilinmeyen kimlik, başka bir bölüm ve metin olmayan değer üye olamaz.
    expect(ids(layout.blocks[0].members)).toEqual(['m1']);
  });

  it('full-row types: list, image and boxes with items', () => {
    expect(freeFullRow(c('x', 'dataTable', 'item'))).toBe(true);
    expect(freeFullRow(c('x', 'image', 'item'))).toBe(true);
    expect(freeFullRow(c('x', 'alert', 'item', { items: ['a', 'b'] }))).toBe(true);
    expect(freeFullRow(c('x', 'card', 'item', { items: ['a'] }))).toBe(true);
    expect(freeFullRow(c('x', 'list', 'item', { items: ['a'] }))).toBe(true);
    expect(freeFullRow(c('x', 'alert', 'item', { text: 'tek' }))).toBe(false);
    expect(freeFullRow(c('x', 'metric', 'item'))).toBe(false);
    expect(freeFullRow(c('x', 'text', 'item'))).toBe(false);
    // Yazılımcı bileşeni (katalog `code`) kendi yüksekliğiyle tam satır çizilir.
    expect(freeFullRow(c('x', 'code', 'item', { catalogComponent: 'harita' }))).toBe(true);
  });
});
