import { describe, expect, it } from 'vitest';
import { readPageTemplate } from './pageTemplate';
import { layoutRecordTemplate, recordKeyParam, recordTemplateLevel } from './recordTemplateModel';

const c = (id: string, type: string, slot?: string, props: Record<string, unknown> = {}) => ({ id, type, props: slot ? { slot, ...props } : props });

describe('recordTemplateModel', () => {
  it('readPageTemplate accepts record and list, rejects card', () => {
    expect(readPageTemplate({ template: { name: 'record' } })).toEqual({ name: 'record' });
    expect(readPageTemplate({ template: { name: 'list' } })).toEqual({ name: 'list' });
    expect(readPageTemplate({ template: { name: 'card' } })).toBeNull();
  });

  it('layoutRecordTemplate groups tabs and keeps tab order', () => {
    const layout = layoutRecordTemplate([
      c('h', 'recordHeader', 'summary'), c('b2', 'button', 'actions'), c('b1', 'button', 'actions'),
      c('t', 'tabs', 'tabs', { tabs: ['Genel=s1,n1', 'Satırlar=l1'] }),
      c('l1', 'dataTable', 'lines'), c('n1', 'text', 'note'), c('s1', 'formCard', 'section'),
      c('f1', 'input', 'field'), c('a', 'alert', 'above'), c('z', 'text', 'below'),
    ]);
    expect(layout.summary?.id).toBe('h');
    expect(layout.actions.map((x) => x.id)).toEqual(['b2', 'b1']);
    expect(layout.tabs?.id).toBe('t');
    expect(layout.tabList.map((tab) => [tab.label, tab.blocks.map((x) => x.id)])).toEqual([['Genel', ['s1', 'n1']], ['Satırlar', ['l1']]]);
    expect(layout.above.map((x) => x.id)).toEqual(['a']);
    expect(layout.below.map((x) => x.id)).toEqual(['z']);
    expect(recordTemplateLevel(layout)).toBe(2);
  });

  it('missing tab id is skipped; level 1 without above/below', () => {
    const layout = layoutRecordTemplate([c('t', 'tabs', 'tabs', { tabs: ['Genel=s1,yok', 'Boş='] }), c('s1', 'formCard', 'section')]);
    expect(layout.tabList).toEqual([{ label: 'Genel', blocks: [expect.objectContaining({ id: 's1' })] }, { label: 'Boş', blocks: [] }]);
    expect(recordTemplateLevel(layout)).toBe(1);
  });

  it('recordKeyParam finds the page parameter bound to the record query', () => {
    const components = [c('s1', 'formCard', 'section', { recordKey: '{{kart.rows[0].id}}' })];
    const queries = [{ id: 'q1', name: 'kart', parameters: [{ name: 'id', binding: '{{sayfa.parametre.kayit}}' }] }];
    expect(recordKeyParam(components, queries)).toBe('kayit');
    expect(recordKeyParam(components, [{ id: 'kart', parameters: [{ name: 'id', binding: '{{sayfa.parametre.k2}}' }] }])).toBe('k2');
  });

  it('recordKeyParam returns null without recordKey', () => {
    expect(recordKeyParam([c('s1', 'formCard', 'section')], [{ id: 'kart', parameters: [{ name: 'id', binding: '{{sayfa.parametre.k}}' }] }])).toBeNull();
    expect(recordKeyParam([c('s1', 'formCard', 'section', { recordKey: '{{kart.rows[0].id}}' })], [{ id: 'kart', parameters: [{ name: 'id', binding: '{{x.value}}' }] }])).toBeNull();
  });

  it('dialogs are laid out apart and dialog contents enter no body slot', () => {
    const layout = layoutRecordTemplate([
      c('h', 'recordHeader', 'summary'), c('t', 'tabs', 'tabs', { tabs: ['Genel=s1'] }), c('s1', 'formCard', 'section'),
      c('p', 'dialog', 'dialogs', { contains: ['ozet', 'sek'] }),
      c('ozet', 'recordHeader', 'dialog'), c('sek', 'tabs', 'dialog', { tabs: ['Bilgi=tablo,form,not'] }),
      c('tablo', 'dataTable', 'dialog'), c('form', 'formCard', 'dialog', { inputs: ['girdi'] }), c('girdi', 'input', 'dialog'),
      c('not', 'text', 'dialog'), c('b', 'button', 'dialog'),
    ]);
    expect(layout.dialogs.map((x) => x.id)).toEqual(['p']);
    expect(layout.summary?.id).toBe('h');
    expect(layout.tabs?.id).toBe('t');
    expect(layout.tabList.map((tab) => tab.blocks.map((x) => x.id))).toEqual([['s1']]);
    expect([...layout.actions, ...layout.above, ...layout.below]).toEqual([]);
  });
});
