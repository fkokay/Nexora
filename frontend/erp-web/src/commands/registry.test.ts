import { describe, expect, it, vi } from 'vitest';
import { createCommandRegistry, RESERVED_BROWSER_CHORDS } from './registry';
import { offersCommand } from './types';
import { takeRecordView } from './recordView';

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { cancelable: true, ...init });
}
const idle = { typing: false, modalOpen: false };

describe('command registry', () => {
  it('adds Görüntüle next to an Aç that has none: same action, arming the read-only record form; Düzenle disarms', () => {
    const r = createCommandRegistry();
    const open = vi.fn();
    r.register('a', 'list', { open: { run: open } });
    r.setActiveView('a');
    void r.getActive()!.view!.run!();
    expect(open).toHaveBeenCalledTimes(1);
    expect(takeRecordView()).toBe(true);
    void r.getActive()!.view!.run!();
    void r.getActive()!.open!.run!();
    expect(open).toHaveBeenCalledTimes(3);
    expect(takeRecordView()).toBe(false);
    // Bekleyen Aç'ın nedeni Görüntüle'de de görünür; kendi Görüntüle'si olan kaynakta bir şey eklenmez.
    r.register('b', 'list', { open: { disabledReason: 'Önce bir kayıt seçin' } });
    r.setActiveView('b');
    expect(r.getActive()!.view).toEqual({ disabledReason: 'Önce bir kayıt seçin', run: undefined });
    const own = { hidden: true };
    r.register('c', 'page', { open: { run: open }, view: own });
    r.setActiveView('c');
    expect(r.getActive()!.view).toBe(own);
    // Shift+Enter Görüntüle'yi çalıştırır.
    r.setActiveView('a');
    expect(r.handleKeyDown(key({ key: 'Enter', shiftKey: true }), idle)).toBe(true);
    expect(takeRecordView()).toBe(true);
  });

  it('dispatches only to the active view', () => {
    const r = createCommandRegistry();
    const a = vi.fn();
    const b = vi.fn();
    r.register('a', 'page', { save: { run: a } });
    r.register('b', 'page', { save: { run: b } });
    r.setActiveView('b');
    expect(r.handleKeyDown(key({ key: 's', ctrlKey: true }), idle)).toBe(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('merges sources per command: page overrides list overrides grid', () => {
    const r = createCommandRegistry();
    const gridExport = vi.fn();
    const listFilter = vi.fn();
    const listRefresh = vi.fn();
    const pageNew = vi.fn();
    const gridFilter = vi.fn();
    r.register('v', 'grid', { export: { run: gridExport }, filter: { run: gridFilter } });
    r.register('v', 'list', { filter: { run: listFilter }, refresh: { run: listRefresh } });
    r.register('v', 'page', { new: { run: pageNew }, more: [{ id: 'x', label: 'X' }] });
    r.setActiveView('v');
    const active = r.getActive()!;
    expect(active.export?.run).toBe(gridExport);
    expect(active.filter?.run).toBe(listFilter);
    expect(active.refresh?.run).toBe(listRefresh);
    expect(active.new?.run).toBe(pageNew);
    expect(active.more).toEqual([{ id: 'x', label: 'X' }]);
  });

  it('more comes only from the page source', () => {
    const r = createCommandRegistry();
    r.register('v', 'list', { more: [{ id: 'l', label: 'L' }], refresh: { run: () => {} } });
    r.setActiveView('v');
    expect(r.getActive()!.more).toBeUndefined();
  });

  it('unregister removes only that source', () => {
    const r = createCommandRegistry();
    const list = vi.fn();
    const page = vi.fn();
    r.register('v', 'list', { refresh: { run: list } });
    const off = r.register('v', 'page', { new: { run: page } });
    r.setActiveView('v');
    off();
    const active = r.getActive()!;
    expect(active.new).toBeUndefined();
    expect(active.refresh?.run).toBe(list);
  });

  it('does not run a disabled command but still prevents default for reserved chords', () => {
    const r = createCommandRegistry();
    const run = vi.fn();
    r.register('v', 'page', { print: { run, disabledReason: 'Yok' } });
    r.setActiveView('v');
    const e = key({ key: 'p', ctrlKey: true });
    expect(r.handleKeyDown(e, idle)).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it('prevents browser defaults for reserved chords even when the command is absent', () => {
    const r = createCommandRegistry();
    r.register('v', 'page', {});
    r.setActiveView('v');
    const e = key({ key: 'F5' });
    expect(r.handleKeyDown(e, idle)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(RESERVED_BROWSER_CHORDS).toContain('F5');
  });

  it('leaves reserved browser chords alone while no workspace view is active (outside the shell)', () => {
    const r = createCommandRegistry();
    for (const init of [{ key: 'F5' }, { key: 'p', ctrlKey: true }, { key: 's', ctrlKey: true }]) {
      const e = key(init);
      expect(r.handleKeyDown(e, idle)).toBe(false);
      expect(e.defaultPrevented).toBe(false);
    }
    // Leaving the shell clears the active view again.
    r.setActiveView('v');
    expect(r.handleKeyDown(key({ key: 'F5' }), idle)).toBe(true);
    r.setActiveView(undefined);
    const e = key({ key: 'F5' });
    expect(r.handleKeyDown(e, idle)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it('announces a mounted action bar until it detaches', () => {
    const r = createCommandRegistry();
    const listener = vi.fn();
    r.subscribe(listener);
    expect(r.hasActionBar()).toBe(false);
    const detach = r.attachActionBar();
    expect(r.hasActionBar()).toBe(true);
    detach();
    detach();
    expect(r.hasActionBar()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not touch non-reserved chords without a command', () => {
    const r = createCommandRegistry();
    r.setActiveView('v');
    const e = key({ key: 'F2' });
    expect(r.handleKeyDown(e, idle)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it('typing guard', () => {
    const r = createCommandRegistry();
    const fns = { open: vi.fn(), undo: vi.fn(), delete: vi.fn(), save: vi.fn(), new: vi.fn(), filter: vi.fn() };
    r.register('v', 'page', {
      open: { run: fns.open }, undo: { run: fns.undo }, delete: { run: fns.delete },
      save: { run: fns.save }, new: { run: fns.new }, filter: { run: fns.filter },
    });
    r.setActiveView('v');
    const typing = { typing: true, modalOpen: false };
    for (const init of [
      { key: 'Enter' }, { key: 'z', ctrlKey: true }, { key: 'a', ctrlKey: true }, { key: 'Delete', ctrlKey: true },
    ]) {
      const e = key(init);
      expect(r.handleKeyDown(e, typing)).toBe(false);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(fns.open).not.toHaveBeenCalled();
    expect(fns.undo).not.toHaveBeenCalled();
    expect(fns.delete).not.toHaveBeenCalled();
    for (const init of [{ key: 's', ctrlKey: true }, { key: 'F2' }, { key: 'f', ctrlKey: true }]) {
      expect(r.handleKeyDown(key(init), typing)).toBe(true);
    }
    expect(fns.save).toHaveBeenCalled();
    expect(fns.new).toHaveBeenCalled();
    expect(fns.filter).toHaveBeenCalled();
  });

  it('Enter opens when idle', () => {
    const r = createCommandRegistry();
    const open = vi.fn();
    r.register('v', 'list', { open: { run: open } });
    r.setActiveView('v');
    expect(r.handleKeyDown(key({ key: 'Enter' }), idle)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Enter does not open when focus is on a button', () => {
    const r = createCommandRegistry();
    const open = vi.fn();
    r.register('v', 'list', { open: { run: open } });
    r.setActiveView('v');
    const e = key({ key: 'Enter' });
    expect(r.handleKeyDown(e, { ...idle, onInteractive: true })).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('suppresses page commands while a modal is open', () => {
    const r = createCommandRegistry();
    const save = vi.fn();
    const inModal = vi.fn();
    const outModal = vi.fn();
    r.register('v', 'page', { save: { run: save } });
    r.setActiveView('v');
    r.registerGlobal({ id: 'palette', shortcut: 'Ctrl+K', run: inModal, allowInModal: true });
    r.registerGlobal({ id: 'other', shortcut: 'Ctrl+B', run: outModal });
    const modal = { typing: false, modalOpen: true };
    const e = key({ key: 's', ctrlKey: true });
    expect(r.handleKeyDown(e, modal)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(r.handleKeyDown(key({ key: 'b', ctrlKey: true }), modal)).toBe(false);
    expect(outModal).not.toHaveBeenCalled();
    expect(r.handleKeyDown(key({ key: 'k', ctrlKey: true }), modal)).toBe(true);
    expect(inModal).toHaveBeenCalledTimes(1);
  });

  it('a modal of the active view dispatches only Ctrl+S (save)', () => {
    const r = createCommandRegistry();
    const save = vi.fn();
    const add = vi.fn();
    r.register('v', 'page', { save: { run: save }, new: { run: add } });
    r.setActiveView('v');
    const viewModal = { typing: true, modalOpen: true, modalInActiveView: true };
    const e = key({ key: 's', ctrlKey: true });
    expect(r.handleKeyDown(e, viewModal)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(r.handleKeyDown(key({ key: 'F2' }), viewModal)).toBe(false);
    expect(add).not.toHaveBeenCalled();
    // A document-level modal (confirm dialog) keeps blocking save.
    expect(r.handleKeyDown(key({ key: 's', ctrlKey: true }), { typing: false, modalOpen: true, modalInActiveView: false })).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a disabled save in a view modal still swallows Ctrl+S', () => {
    const r = createCommandRegistry();
    const save = vi.fn();
    r.register('v', 'page', { save: { run: save, disabledReason: 'Kaydediliyor…' } });
    r.setActiveView('v');
    const e = key({ key: 's', ctrlKey: true });
    expect(r.handleKeyDown(e, { typing: false, modalOpen: true, modalInActiveView: true })).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('form source: the latest open form wins, its menu comes first and its primary is the only one', () => {
    const r = createCommandRegistry();
    const embedded = vi.fn();
    const dialog = vi.fn();
    r.register('v', 'page', { new: { run: () => {}, primary: true }, more: [{ id: 'p', label: 'P' }] });
    r.register('v', 'form', { save: { run: embedded, primary: true }, more: [{ id: 'e', label: 'E' }] });
    const closeDialog = r.register('v', 'form', { save: { run: dialog, primary: true } });
    r.setActiveView('v');
    expect(r.getActive()?.save?.run).toBe(dialog);
    expect(r.getActive()?.new?.primary).toBe(false);
    expect(r.getActive()?.more?.map((item) => item.id)).toEqual(['p']);
    closeDialog();
    expect(r.getActive()?.save?.run).toBe(embedded);
    expect(r.getActive()?.more?.map((item) => item.id)).toEqual(['e', 'p']);
  });

  it('form source: an empty form slot (inactive form commands) never beats an older form with commands', () => {
    const r = createCommandRegistry();
    const save = vi.fn();
    r.register('v', 'form', { save: { run: save, primary: true } });
    const removeEmpty = r.register('v', 'form', {});
    r.setActiveView('v');
    expect(r.getActive()?.save?.run).toBe(save);
    removeEmpty();
    expect(r.getActive()?.save?.run).toBe(save);
  });

  it('Alt+İ runs the "open more menu" global', () => {
    const r = createCommandRegistry();
    const run = vi.fn();
    r.registerGlobal({ id: 'more', shortcut: 'Alt+İ', run });
    expect(r.handleKeyDown(key({ key: 'İ', altKey: true }), idle)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('global commands run regardless of active view and respect allowWhileTyping', () => {
    const r = createCommandRegistry();
    const k = vi.fn();
    const b = vi.fn();
    r.registerGlobal({ id: 'palette', shortcut: 'Ctrl+K', run: k, allowWhileTyping: true });
    r.registerGlobal({ id: 'rail', shortcut: 'Ctrl+B', run: b });
    const typing = { typing: true, modalOpen: false };
    expect(r.handleKeyDown(key({ key: 'k', ctrlKey: true }), typing)).toBe(true);
    expect(r.handleKeyDown(key({ key: 'b', ctrlKey: true }), typing)).toBe(false);
    expect(r.handleKeyDown(key({ key: 'b', ctrlKey: true }), idle)).toBe(true);
    expect(k).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unregistering a global removes it', () => {
    const r = createCommandRegistry();
    const run = vi.fn();
    const off = r.registerGlobal({ id: 'g', shortcut: 'Ctrl+K', run });
    off();
    expect(r.handleKeyDown(key({ key: 'k', ctrlKey: true }), idle)).toBe(false);
  });

  it('subscribe notifies on register, unregister and setActiveView', () => {
    const r = createCommandRegistry();
    const listener = vi.fn();
    const unsub = r.subscribe(listener);
    const off = r.register('v', 'page', { save: { run: () => {} } });
    expect(listener).toHaveBeenCalledTimes(1);
    r.setActiveView('v');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    expect(listener).toHaveBeenCalledTimes(3);
    unsub();
    r.setActiveView('w');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('getActive returns the same reference until something changes', () => {
    const r = createCommandRegistry();
    expect(r.getActive()).toBeUndefined();
    r.register('v', 'page', { save: { run: () => {} } });
    r.setActiveView('v');
    const first = r.getActive();
    expect(r.getActive()).toBe(first);
    r.register('v', 'list', { refresh: { run: () => {} } });
    expect(r.getActive()).not.toBe(first);
  });

  it('does not await async commands', () => {
    const r = createCommandRegistry();
    const run = vi.fn(() => new Promise<void>(() => {}));
    r.register('v', 'page', { save: { run } });
    r.setActiveView('v');
    expect(r.handleKeyDown(key({ key: 's', ctrlKey: true }), idle)).toBe(true);
    expect(run).toHaveBeenCalled();
  });

  it('keeps registrations of a view and source ordered: first wins, next takes over', () => {
    const r = createCommandRegistry();
    const first = vi.fn();
    const second = vi.fn();
    r.setActiveView('v');
    const removeFirst = r.register('v', 'grid', { export: { run: first } });
    r.register('v', 'grid', { export: { run: second } });
    r.getActive()?.export?.run?.();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    removeFirst();
    r.getActive()?.export?.run?.();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('a slot keeps its position when its commands are replaced', () => {
    const r = createCommandRegistry();
    const first = vi.fn();
    const firstV2 = vi.fn();
    const second = vi.fn();
    r.setActiveView('v');
    const slot = r.openSlot('v', 'list');
    slot.set({ filter: { run: first } });
    r.register('v', 'list', { filter: { run: second } });
    slot.set({ filter: { run: firstV2 } });
    r.getActive()?.filter?.run?.();
    expect(firstV2).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('notifies subscribers and keeps getActive stable between changes on handover', () => {
    const r = createCommandRegistry();
    const listener = vi.fn();
    r.setActiveView('v');
    const removeFirst = r.register('v', 'grid', { export: { run: vi.fn() } });
    r.register('v', 'grid', { export: { run: vi.fn() } });
    r.subscribe(listener);
    const before = r.getActive();
    expect(r.getActive()).toBe(before);
    removeFirst();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(r.getActive()).not.toBe(before);
    expect(r.getActive()).toBe(r.getActive());
  });

  describe('hidden commands (İşlem Çubuğu hiddenCommands / commandWhen)', () => {
    it('a hidden page spec stops the page > list > grid fallback', () => {
      const r = createCommandRegistry();
      const gridExport = vi.fn();
      const listRefresh = vi.fn();
      r.register('v', 'grid', { export: { run: gridExport } });
      r.register('v', 'list', { refresh: { run: listRefresh }, filter: { run: vi.fn() } });
      r.register('v', 'page', { export: { hidden: true }, refresh: { hidden: true } });
      r.setActiveView('v');
      const active = r.getActive()!;
      expect(active.export).toEqual({ hidden: true });
      expect(active.refresh).toEqual({ hidden: true });
      expect(offersCommand(active, 'export')).toBe(false);
      expect(offersCommand(active, 'refresh')).toBe(false);
      expect(offersCommand(active, 'filter')).toBe(true);
    });

    it("a hidden command's shortcut does nothing and its browser chord stays prevented", () => {
      const r = createCommandRegistry();
      const listRefresh = vi.fn();
      const gridExport = vi.fn();
      const print = vi.fn();
      r.register('v', 'grid', { export: { run: gridExport } });
      r.register('v', 'list', { refresh: { run: listRefresh } });
      r.register('v', 'page', { refresh: { hidden: true }, print: { hidden: true, run: print }, export: { hidden: true } });
      r.setActiveView('v');
      for (const init of [{ key: 'F5' }, { key: 'p', ctrlKey: true }, { key: 'e', ctrlKey: true }]) {
        const event = key(init);
        expect(r.handleKeyDown(event, idle)).toBe(true);
        expect(event.defaultPrevented).toBe(true);
      }
      expect(listRefresh).not.toHaveBeenCalled();
      expect(gridExport).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();
    });

    it('a hidden Kaydet does not save from a page dialog either', () => {
      const r = createCommandRegistry();
      const save = vi.fn();
      r.register('v', 'page', { save: { hidden: true, run: save } });
      r.setActiveView('v');
      const event = key({ key: 's', ctrlKey: true });
      expect(r.handleKeyDown(event, { typing: false, modalOpen: true, modalInActiveView: true })).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(save).not.toHaveBeenCalled();
    });

    it("a record form's own spec still outranks the page's hidden one; commands the form leaves out stay hidden", () => {
      const r = createCommandRegistry();
      const formSave = vi.fn();
      r.register('v', 'grid', { export: { run: vi.fn() } });
      r.register('v', 'page', { save: { hidden: true }, export: { hidden: true }, moreHidden: true });
      r.register('v', 'form', { save: { run: formSave, primary: true }, besideList: true });
      r.setActiveView('v');
      const active = r.getActive()!;
      expect(active.save?.run).toBe(formSave);
      expect(offersCommand(active, 'save')).toBe(true);
      expect(active.export).toEqual({ hidden: true });
      expect(active.moreHidden).toBe(true);
      r.register('v', 'form', { more: [{ id: 'f', label: 'F' }] });
      // A form that brings its own İşlemler items keeps the menu.
      expect(r.getActive()!.moreHidden).toBeUndefined();
    });

    it('moreHidden and look come only from the effective page source of the active view', () => {
      const r = createCommandRegistry();
      r.register('v', 'list', { refresh: { run: vi.fn() }, moreHidden: true, look: { align: 'end' } });
      r.register('w', 'page', { refresh: { run: vi.fn() }, moreHidden: true, look: { align: 'center', size: 'lg' } });
      r.setActiveView('v');
      expect(r.getActive()!.moreHidden).toBeUndefined();
      expect(r.getActive()!.look).toBeUndefined();
      r.setActiveView('w');
      expect(r.getActive()!.moreHidden).toBe(true);
      expect(r.getActive()!.look).toEqual({ align: 'center', size: 'lg' });
    });
  });
});
