import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDialog = vi.fn();
vi.mock('../confirmDialog', () => ({ confirmDialog: (options: unknown) => confirmDialog(options) }));

import { runWriteAction } from './writeAction';
import type { PageQueryDefinition } from './usePageQueries';

const query: PageQueryDefinition = { id: 'q', name: 'Q', runOn: 'manual', kind: 'delete', parameters: [] };

function setup(extra: Partial<Parameters<typeof runWriteAction>[0]> = {}) {
  const write = vi.fn(async () => ({ affectedRows: 2 }));
  const inFlight = { current: false };
  const opts = { query, confirm: { enabled: true, title: 'Kayıt silinsin mi?', confirmLabel: 'Sil', tone: 'danger' as const }, isPreview: false, write, inFlight, ...extra };
  return { write, inFlight, opts };
}

beforeEach(() => confirmDialog.mockReset());

describe('runWriteAction', () => {
  it('Vazgeç: cancelled, yazma yok, tek uçuş serbest', async () => {
    confirmDialog.mockResolvedValue(false);
    const { write, opts, inFlight } = setup();
    expect(await runWriteAction(opts)).toEqual({ ok: false, cancelled: true });
    expect(write).not.toHaveBeenCalled();
    expect(inFlight.current).toBe(false);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kayıt silinsin mi?', confirmLabel: 'Sil', tone: 'danger', cancelLabel: 'Vazgeç' }));
  });

  it('onay sonrası yazar ve satır sayısını döner', async () => {
    confirmDialog.mockResolvedValue(true);
    const { write, opts } = setup();
    expect(await runWriteAction(opts)).toEqual({ ok: true, affectedRows: 2 });
    expect(write).toHaveBeenCalledWith(query, false);
  });

  it('onay kapalıysa sormaz', async () => {
    const { write, opts } = setup({ confirm: { enabled: false } });
    expect(await runWriteAction(opts)).toEqual({ ok: true, affectedRows: 2 });
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledOnce();
  });

  it('eşzamanlı ikinci çağrı busy', async () => {
    let release!: () => void;
    const write = vi.fn(() => new Promise<{ affectedRows: number }>((resolve) => { release = () => resolve({ affectedRows: 1 }); }));
    const { opts } = setup({ confirm: { enabled: false }, write });
    const first = runWriteAction(opts);
    expect(await runWriteAction(opts)).toEqual({ ok: false, busy: true });
    release();
    expect(await first).toEqual({ ok: true, affectedRows: 1 });
    expect(write).toHaveBeenCalledOnce();
  });

  it('önizlemede onay her zaman sorulur, uyarı eklenir ve açık onay gönderilir', async () => {
    confirmDialog.mockResolvedValue(true);
    const { write, opts } = setup({ confirm: { enabled: false }, isPreview: true });
    await runWriteAction(opts);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', message: expect.stringContaining('taslak önizlemesinde') }));
    expect(write).toHaveBeenCalledWith(query, true);
  });

  it('hata: sunucu mesajı', async () => {
    const write = vi.fn(async () => { throw Object.assign(new Error('x'), { serverError: 'Sunucu hatası' }); });
    const { opts, inFlight } = setup({ confirm: { enabled: false }, write });
    expect(await runWriteAction(opts)).toEqual({ ok: false, error: 'Sunucu hatası' });
    expect(inFlight.current).toBe(false);
  });
});

describe('runWriteAction kod bileşeni kancaları', () => {
  it('beforeSave cancel blocks write', async () => {
    const beforeWrite = vi.fn(async () => ({ cancel: true as const, message: 'Kod: iptal' }));
    const afterWrite = vi.fn();
    const { write, opts, inFlight } = setup({ confirm: { enabled: false }, beforeWrite, afterWrite });
    expect(await runWriteAction(opts)).toEqual({ ok: false, error: 'Kod: iptal' });
    expect(write).not.toHaveBeenCalled();
    expect(afterWrite).not.toHaveBeenCalled();
    expect(beforeWrite).toHaveBeenCalledWith(query);
    expect(inFlight.current).toBe(false);
  });

  it('beforeSave iptal etmezse yazar ve afterWrite sonucu alır', async () => {
    const write = vi.fn(async () => ({ affectedRows: 1, sonuc: { id: 7 } }));
    const afterWrite = vi.fn();
    const { opts } = setup({ confirm: { enabled: false }, write, beforeWrite: async () => null, afterWrite });
    expect(await runWriteAction(opts)).toEqual({ ok: true, affectedRows: 1, sonuc: { id: 7 } });
    expect(afterWrite).toHaveBeenCalledWith(query, { affectedRows: 1, sonuc: { id: 7 } });
  });

  it('beforeSave onaydan önce sorulur; iptalde onay penceresi açılmaz', async () => {
    const { opts } = setup({ beforeWrite: async () => ({ cancel: true as const, message: 'Kod: iptal' }) });
    await runWriteAction(opts);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('beforeSave hata verirse yazma iptal edilir', async () => {
    const { write, opts } = setup({ confirm: { enabled: false }, beforeWrite: async () => { throw new Error('x'); } });
    expect(await runWriteAction(opts)).toEqual({ ok: false, error: 'Kod bileşeni yanıt vermedi; işlem iptal edildi.' });
    expect(write).not.toHaveBeenCalled();
  });

  it('afterWrite hatası yazma sonucunu bozmaz', async () => {
    const { opts } = setup({ confirm: { enabled: false }, afterWrite: () => { throw new Error('x'); } });
    expect(await runWriteAction(opts)).toEqual({ ok: true, affectedRows: 2 });
  });
});

describe('runWriteAction doğrulama', () => {
  it('validate blocks before confirm and write', async () => {
    const beforeWrite = vi.fn(async () => null);
    const { write, opts, inFlight } = setup({ validate: () => 'Formda düzeltilmesi gereken alanlar var.', beforeWrite });
    expect(await runWriteAction(opts)).toEqual({ ok: false, error: 'Formda düzeltilmesi gereken alanlar var.' });
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(beforeWrite).not.toHaveBeenCalled();
    expect(inFlight.current).toBe(false);
  });

  it('validate null dönerse yazma sürer', async () => {
    const { write, opts } = setup({ confirm: { enabled: false }, validate: () => null });
    expect(await runWriteAction(opts)).toEqual({ ok: true, affectedRows: 2 });
    expect(write).toHaveBeenCalledOnce();
  });
});
