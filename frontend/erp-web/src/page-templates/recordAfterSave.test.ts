import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetOpener, openerOf, openWorkspacePage, pageParamsOf, requestClosePage, setPageParams } from '../pageNavigation';
import { useWorkspaceTabs } from '../useWorkspaceTabs';
import { afterRecordDelete, afterRecordSave } from './recordAfterSave';

// Kayıt kartında Kaydet ve Sil sonrası: karar ve açan sekme deposu; çalışma alanında karttan açan listeye dönüş.

const LIST = 'custom-page:liste';
const CARD = 'custom-page:kart';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => {
  cleanup();
  for (const page of [LIST, CARD, 'reports']) { setPageParams(page, {}); forgetOpener(page); }
});

describe('afterRecordSave', () => {
  it('existing record reloads', () => {
    expect(afterRecordSave({ isNew: false, keyParam: 'kod', typedKey: 'C-1', opener: LIST })).toEqual({ kind: 'reload' });
  });
  it('new record with typed key reopens with that key', () => {
    expect(afterRecordSave({ isNew: true, keyParam: 'kod', typedKey: ' C-2 ', opener: LIST })).toEqual({ kind: 'reopen', param: 'kod', value: 'C-2' });
  });
  it('new record with system key goes back to the opener', () => {
    expect(afterRecordSave({ isNew: true, keyParam: 'id', typedKey: null, opener: LIST })).toEqual({ kind: 'backToOpener', opener: LIST });
    // Anahtar parametresi bilinmeyen kartta yazılan anahtarla yeniden açılamaz.
    expect(afterRecordSave({ isNew: true, keyParam: null, typedKey: 'C-2', opener: LIST })).toEqual({ kind: 'backToOpener', opener: LIST });
  });
  it('new record without opener clears the form', () => {
    expect(afterRecordSave({ isNew: true, keyParam: 'id', typedKey: '  ', opener: undefined })).toEqual({ kind: 'clear' });
  });
});

describe('afterRecordDelete', () => {
  it('goes back to the opener', () => { expect(afterRecordDelete(LIST)).toEqual({ kind: 'backToOpener', opener: LIST }); });
  it('closes the tab without opener', () => { expect(afterRecordDelete(undefined)).toEqual({ kind: 'close' }); });
});

describe('açan sekme', () => {
  it('openWorkspacePage records opener and openerOf returns it', () => {
    openWorkspacePage({ page: CARD, params: { kod: 'C-1' }, replace: true, from: LIST });
    expect(openerOf(CARD)).toBe(LIST);
    expect(openerOf(LIST)).toBeUndefined();
    // Parametreleri koruyan açılış (açana dönüş) açanı kaydetmez ve parametreleri yazmaz.
    setPageParams(LIST, { q: 'akdeniz' });
    openWorkspacePage({ page: LIST, params: {}, replace: false, from: CARD, keepParams: true, refresh: true });
    expect(openerOf(LIST)).toBeUndefined();
    expect(pageParamsOf(LIST)).toEqual({ q: 'akdeniz' });
  });

  function workspace() {
    return renderHook(() => useWorkspaceTabs({
      standaloneStudio: false, embeddedStudioTool: false, tenantId: undefined, platformSession: false, locale: 'tr', pageResults: [],
      onSelectModule: () => {},
    }));
  }
  const backToOpener = () => {
    requestClosePage(CARD);
    openWorkspacePage({ page: LIST, params: {}, replace: false, from: CARD, refresh: true, keepParams: true, notice: 'Kaydedildi.' });
  };

  it('back to opener keeps the list tab params', () => {
    const { result } = workspace();
    act(() => { setPageParams(LIST, { q: 'akdeniz' }); result.current.setPage(LIST); });
    act(() => { result.current.setPage('reports'); });
    act(() => { openWorkspacePage({ page: CARD, params: {}, replace: false, from: LIST }); });
    act(() => { result.current.setDirtyTabs(new Set([CARD])); });
    expect(result.current.page).toBe(CARD);
    act(backToOpener);
    expect(result.current.moduleTabs.map((tab) => tab.id)).toEqual([LIST, 'reports']);
    expect(result.current.page).toBe(LIST);
    expect(result.current.pendingCloseTab).toBeNull();
    expect(result.current.dirtyTabs.has(CARD)).toBe(false);
    expect(result.current.notice).toBe('Kaydedildi.');
    expect(pageParamsOf(LIST)).toEqual({ q: 'akdeniz' });
    expect(openerOf(LIST)).toBeUndefined();
    expect(openerOf(CARD)).toBeUndefined();
  });

  it('back to an opener the card replaced reopens it with its params', () => {
    const { result } = workspace();
    act(() => { setPageParams(LIST, { q: 'akdeniz' }); result.current.setPage(LIST); });
    act(() => { openWorkspacePage({ page: CARD, params: {}, replace: true, from: LIST }); });
    expect(result.current.moduleTabs.map((tab) => tab.id)).toEqual([CARD]);
    expect(openerOf(CARD)).toBe(LIST);
    act(backToOpener);
    expect(result.current.moduleTabs.map((tab) => tab.id)).toEqual([LIST]);
    expect(result.current.page).toBe(LIST);
    expect(pageParamsOf(LIST)).toEqual({ q: 'akdeniz' });
    expect(openerOf(LIST)).toBeUndefined();
  });

  it('close request closes the tab without asking and hands over to its opener', () => {
    const { result } = workspace();
    act(() => { result.current.setPage(LIST); });
    act(() => { result.current.setPage('reports'); });
    act(() => { openWorkspacePage({ page: CARD, params: { kod: 'C-1' }, replace: false, from: LIST }); });
    act(() => { result.current.setDirtyTabs(new Set([CARD])); });
    act(() => { requestClosePage(CARD); });
    expect(result.current.moduleTabs.map((tab) => tab.id)).toEqual([LIST, 'reports']);
    expect(result.current.page).toBe(LIST);
    expect(result.current.pendingCloseTab).toBeNull();
    expect(pageParamsOf(CARD)).toEqual({});
    expect(openerOf(CARD)).toBeUndefined();
  });

  it('a full workspace can go back to a replaced opener', () => {
    const { result } = workspace();
    const others = Array.from({ length: 11 }, (_, index) => `custom-page:diger${index}`);
    act(() => { setPageParams(LIST, { q: 'akdeniz' }); result.current.setPage(LIST); });
    for (const page of others) act(() => { result.current.setPage(page); });
    act(() => { result.current.setPage(LIST); });
    act(() => { openWorkspacePage({ page: CARD, params: {}, replace: true, from: LIST }); });
    expect(result.current.moduleTabs).toHaveLength(12);
    act(backToOpener);
    expect(result.current.moduleTabs.map((tab) => tab.id)).toEqual([...others, LIST]);
    expect(result.current.page).toBe(LIST);
  });
});
