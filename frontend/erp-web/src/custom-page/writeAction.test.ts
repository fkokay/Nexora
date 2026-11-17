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
