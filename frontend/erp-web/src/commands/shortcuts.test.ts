import { describe, expect, it } from 'vitest';
import { formatShortcut, matchesShortcut, parseShortcut, STANDARD_SHORTCUTS, MORE_MENU_SHORTCUT, type KeyEventLike } from './shortcuts';

function ev(partial: Partial<KeyEventLike> & { key: string }): KeyEventLike {
  return { code: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...partial };
}
const m = (shortcut: string, e: KeyEventLike) => matchesShortcut(e, parseShortcut(shortcut));

describe('shortcuts', () => {
  it('Ctrl+S matches key "s" and "S", and metaKey on mac', () => {
    expect(m('Ctrl+S', ev({ key: 's', ctrlKey: true }))).toBe(true);
    expect(m('Ctrl+S', ev({ key: 'S', ctrlKey: true }))).toBe(true);
    expect(m('Ctrl+S', ev({ key: 's', metaKey: true }))).toBe(true);
    expect(m('Ctrl+S', ev({ key: 's' }))).toBe(false);
  });

  it('Ctrl+S matches code "KeyS" when key is a non-Latin letter', () => {
    expect(m('Ctrl+S', ev({ key: 'ы', code: 'KeyS', ctrlKey: true }))).toBe(true);
    expect(m('Ctrl+S', ev({ key: 'ы', code: 'KeyA', ctrlKey: true }))).toBe(false);
  });

  it('Ctrl+S does not match with altKey (AltGr = Ctrl+Alt)', () => {
    expect(m('Ctrl+S', ev({ key: 's', ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('F2 / F5 / F1 match by key', () => {
    expect(m('F2', ev({ key: 'F2' }))).toBe(true);
    expect(m('F5', ev({ key: 'F5' }))).toBe(true);
    expect(m('F1', ev({ key: 'F1' }))).toBe(true);
    expect(m('F2', ev({ key: 'F5' }))).toBe(false);
  });

  it('Enter does not match Shift+Enter', () => {
    expect(m('Enter', ev({ key: 'Enter' }))).toBe(true);
    expect(m('Enter', ev({ key: 'Enter', shiftKey: true }))).toBe(false);
  });

  it('chord without ctrl does not match when ctrl or meta is pressed', () => {
    expect(m('F2', ev({ key: 'F2', ctrlKey: true }))).toBe(false);
    expect(m('F2', ev({ key: 'F2', metaKey: true }))).toBe(false);
  });

  it('Ctrl+Delete matches key "Delete"', () => {
    expect(m('Ctrl+Delete', ev({ key: 'Delete', ctrlKey: true }))).toBe(true);
    expect(m('Ctrl+Delete', ev({ key: 'Delete' }))).toBe(false);
  });

  it('Alt+İ matches TR-Q, US and shifted variants', () => {
    expect(m(MORE_MENU_SHORTCUT, ev({ key: 'i', code: 'Quote', altKey: true }))).toBe(true);
    expect(m(MORE_MENU_SHORTCUT, ev({ key: 'i', code: 'KeyI', altKey: true }))).toBe(true);
    expect(m(MORE_MENU_SHORTCUT, ev({ key: 'İ', altKey: true, shiftKey: true }))).toBe(true);
  });

  it('Alt+İ does not match {key:"ı",code:"KeyI",altKey} (TR-Q dotless ı)', () => {
    expect(m(MORE_MENU_SHORTCUT, ev({ key: 'ı', code: 'KeyI', altKey: true }))).toBe(false);
  });

  it('Alt+İ matches {key:"ˆ",code:"KeyI",altKey} (Mac dead key, code fallback)', () => {
    expect(m(MORE_MENU_SHORTCUT, ev({ key: 'ˆ', code: 'KeyI', altKey: true }))).toBe(true);
  });

  it('formatShortcut maps Delete to Del and leaves others unchanged', () => {
    expect(formatShortcut('Ctrl+Delete', 'tr')).toBe('Ctrl+Del');
    expect(formatShortcut('Ctrl+Delete', 'en')).toBe('Ctrl+Del');
    expect(formatShortcut('Ctrl+S', 'tr')).toBe('Ctrl+S');
    expect(formatShortcut('F2', 'en')).toBe('F2');
    expect(formatShortcut('Alt+İ', 'tr')).toBe('Alt+İ');
    expect(formatShortcut('Enter', 'en')).toBe('Enter');
  });

  it('STANDARD_SHORTCUTS has the agreed values', () => {
    expect(STANDARD_SHORTCUTS).toEqual({
      new: 'F2', open: 'Enter', view: 'Shift+Enter', save: 'Ctrl+S', delete: 'Ctrl+Delete', refresh: 'F5',
      filter: 'Ctrl+F', print: 'Ctrl+P', export: 'Ctrl+E', undo: 'Ctrl+Z',
    });
  });
});
