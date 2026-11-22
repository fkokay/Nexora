import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmDialog = vi.fn();
vi.mock('../confirmDialog', () => ({ confirmDialog: (options: unknown) => confirmDialog(options) }));

import { NOTHING_TO_SAVE, STEP_NOT_ALLOWED, iterationOf, runSaveSequence, stepLabel, type SequenceStep } from './saveSequence';
import { bindingPath, resolvePath } from './pageBindings';
import { VALIDATION_BLOCKED } from './inputValidation';
import { PREVIEW_ERP_WRITE_BLOCKED, PREVIEW_WRITE_WARNING } from './writeAction';
import type { PageQueryDefinition, WriteResult } from './usePageQueries';
import type { ErpOperation } from './erpOperations';

type Binding = [name: string, binding: string];
const query = (name: string, bindings: Binding[] = [], kind: PageQueryDefinition['kind'] = 'insert'): PageQueryDefinition =>
  ({ id: `id-${name}`, name, runOn: 'manual', kind, parameters: bindings.map(([parameter, binding]) => ({ name: parameter, binding, type: 'text' })) });

function step(name: string, extra: { label?: string; bindings?: Binding[]; refs?: string[]; allowed?: boolean;
  iterate?: { grid: string; list: 'eklenenSatir' | 'silinenSatir'; rows: Record<string, unknown>[] } } = {}): SequenceStep {
  return {
    query: query(name, extra.bindings), label: extra.label ?? name, allowed: extra.allowed ?? true, refs: extra.refs ?? [],
    iterate: extra.iterate ? { grid: extra.iterate.grid, list: extra.iterate.list, rows: extra.iterate.rows.map((row, index) => ({ key: `yeni-${index + 1}`, row })) } : null,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** Sayfanın yaptığı gibi: bindirmedeki bir ad, kapsamdaki nesneyle birleştirilir. */
function resolver(persisted: Record<string, unknown> = {}) {
  const overlays: Record<string, unknown>[] = [];
  const resolve = vi.fn((target: PageQueryDefinition, overlay: Record<string, unknown>) => {
    overlays.push(overlay);
    const scope: Record<string, unknown> = { ...persisted };
    for (const [key, value] of Object.entries(overlay)) scope[key] = isRecord(scope[key]) && isRecord(value) ? { ...scope[key] as Record<string, unknown>, ...value } : value;
    return Object.fromEntries(target.parameters.map((parameter) => [parameter.name, resolvePath(scope, bindingPath(parameter.binding) ?? '') ?? null]));
  });
  return { resolve, overlays };
}

type Responder = (target: PageQueryDefinition, values: Record<string, unknown>) => WriteResult | Error;
function setup(steps: SequenceStep[], extra: Partial<Parameters<typeof runSaveSequence>[0]> & { respond?: Responder; persisted?: Record<string, unknown> } = {}) {
  const { respond, persisted, ...rest } = extra;
  const write = vi.fn(async (target: PageQueryDefinition, values: Record<string, unknown>, _confirmWrite: boolean) => {
    const answer = respond ? respond(target, values) : { affectedRows: 1, sonuc: { id: `${target.name}-1` } };
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const { resolve, overlays } = resolver(persisted);
  const lock = { current: false };
  const validate = vi.fn(() => null as string | null);
  const beforeWrite = vi.fn(async (_first: PageQueryDefinition) => null as { cancel: true; message: string } | null);
  const afterWrite = vi.fn();
  const opts: Parameters<typeof runSaveSequence>[0] = {
    steps, stopOnError: true, lock, isPreview: false, confirm: { enabled: false }, successText: '', validate, beforeWrite, resolve, write,
    errorText: (cause) => (cause as Error).message, afterWrite, ...rest,
  };
  return { opts, write, resolve, overlays, lock, validate, beforeWrite, afterWrite };
}

const unitRows = [{ unitCode: 'KOLI', factorToBase: 12 }, { unitCode: 'PALET', factorToBase: 480 }];

beforeEach(() => { confirmDialog.mockReset(); confirmDialog.mockResolvedValue(true); });

describe('runSaveSequence', () => {
  it('runs steps in order and binds onceki', async () => {
    const steps = [step('olustur', { bindings: [['code', '{{kod.value}}']] }), step('fiyat', { bindings: [['id', '{{onceki.sonuc.id}}']], refs: ['onceki'] })];
    const { opts, write, lock } = setup(steps, { persisted: { kod: { value: 'TS' } }, respond: (target) => ({ affectedRows: 1, sonuc: { id: target.name === 'olustur' ? 'card-1' : 'price-1' } }) });
    const outcome = await runSaveSequence(opts);
    expect(write.mock.calls.map((call) => [call[0].name, call[1]])).toEqual([['olustur', { code: 'TS' }], ['fiyat', { id: 'card-1' }]]);
    expect(outcome).toEqual({ status: 'done', tone: 'success', message: 'İşlem tamamlandı. (2 işlem)', succeeded: 2, calls: [
      { query: 'olustur', label: 'olustur', ok: true, sonuc: { id: 'card-1' } }, { query: 'fiyat', label: 'fiyat', ok: true, sonuc: { id: 'price-1' } }] });
    expect(lock.current).toBe(false);
  });

  it('named sonuc beats persisted state', async () => {
    const steps = [step('olustur'), step('birim', { bindings: [['id', '{{olustur.sonuc.id}}']], refs: ['olustur'] })];
    const { opts, write } = setup(steps, { persisted: { olustur: { sonuc: { id: 'old' }, loading: false } }, successText: 'Kaydedildi.' });
    const outcome = await runSaveSequence(opts);
    expect(write.mock.calls[1][1]).toEqual({ id: 'olustur-1' });
    expect(outcome).toMatchObject({ message: 'Kaydedildi. (2 işlem)' });
    // Dizide çalışmayan adım kalıcı durumdan okunur.
    const second = setup([step('birim', { bindings: [['id', '{{olustur.sonuc.id}}']], refs: ['olustur'] })], { persisted: { olustur: { sonuc: { id: 'old' } } } });
    await runSaveSequence(second.opts);
    expect(second.write.mock.calls[0][1]).toEqual({ id: 'old' });
  });

  it('iterating step runs once per row with fixed onceki', async () => {
    let unit = 0;
    const steps = [
      step('olustur'),
      step('birimEkle', { bindings: [['id', '{{onceki.sonuc.id}}'], ['unitCode', '{{birim.eklenenSatir.unitCode}}']], refs: ['onceki'], iterate: { grid: 'birim', list: 'eklenenSatir', rows: unitRows } }),
      step('son', { bindings: [['id', '{{onceki.sonuc.id}}']], refs: ['onceki'] }),
    ];
    const { opts, write } = setup(steps, { respond: (target) => ({ affectedRows: 1, sonuc: { id: target.name === 'birimEkle' ? `unit-${++unit}` : `${target.name}-1` } }) });
    const outcome = await runSaveSequence(opts);
    expect(write.mock.calls.map((call) => call[1])).toEqual([{}, { id: 'olustur-1', unitCode: 'KOLI' }, { id: 'olustur-1', unitCode: 'PALET' }, { id: 'unit-2' }]);
    expect(outcome).toMatchObject({ status: 'done', tone: 'success', succeeded: 4 });
    if (outcome.status === 'done') {
      expect(outcome.calls.filter((call) => call.grid).map((call) => [call.grid, call.rowKey, call.label])).toEqual([
        ['birim', 'yeni-1', 'birimEkle (satır 1/2)'], ['birim', 'yeni-2', 'birimEkle (satır 2/2)']]);
    }
  });

  it('zero-row iterating step is skipped and not counted', async () => {
    const steps = [step('olustur'), step('birimEkle', { iterate: { grid: 'birim', list: 'eklenenSatir', rows: [] } }), step('birimSil', { iterate: { grid: 'birim', list: 'silinenSatir', rows: [] } })];
    const { opts, write } = setup(steps);
    const outcome = await runSaveSequence(opts);
    expect(write).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ tone: 'success', message: 'İşlem tamamlandı. (1 işlem)', succeeded: 1 });
    if (outcome.status === 'done') expect(outcome.calls).toHaveLength(1);
  });

  it('unallowed step with zero rows is skipped', async () => {
    const steps = [step('guncelle'), step('birimEkle', { allowed: false, iterate: { grid: 'birim', list: 'eklenenSatir', rows: [] } })];
    const { opts, write } = setup(steps);
    expect(await runSaveSequence(opts)).toMatchObject({ tone: 'success', message: 'İşlem tamamlandı. (1 işlem)' });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('unallowed step with rows fails without request', async () => {
    const steps = [step('guncelle', { label: 'Stok kartını güncelle' }),
      step('birimEkle', { label: 'Stok kartına birim ekle', allowed: false, iterate: { grid: 'birim', list: 'eklenenSatir', rows: [unitRows[0]] } })];
    const { opts, write } = setup(steps);
    const outcome = await runSaveSequence(opts);
    expect(write.mock.calls.map((call) => call[0].name)).toEqual(['guncelle']);
    expect(STEP_NOT_ALLOWED).toBe('Bu işlem için yetkiniz yok.');
    expect(outcome).toMatchObject({ tone: 'warning', succeeded: 1,
      message: 'Stok kartına birim ekle (satır 1/1) başarısız: Bu işlem için yetkiniz yok. Önceki 1 işlem kaydedildi; kalan adımlar çalıştırılmadı.' });
    // Yinelenmeyen yetkisiz adım da istek göndermez.
    const single = setup([step('sil', { label: 'Sil', allowed: false })]);
    expect(await runSaveSequence(single.opts)).toMatchObject({ tone: 'error', message: 'Sil başarısız: Bu işlem için yetkiniz yok. Hiçbir değişiklik kaydedilmedi.' });
    expect(single.write).not.toHaveBeenCalled();
  });

  it('stopOnError stops after first failure with pinned message', async () => {
    const first = setup([step('olustur', { label: 'Stok kartı oluştur' }), step('fiyat')], { respond: () => new Error('Kod zaten var') });
    const failedFirst = await runSaveSequence(first.opts);
    expect(failedFirst).toMatchObject({ status: 'done', tone: 'error', succeeded: 0, message: 'Stok kartı oluştur başarısız: Kod zaten var. Hiçbir değişiklik kaydedilmedi.' });
    expect(first.write).toHaveBeenCalledTimes(1);
    expect(first.afterWrite).not.toHaveBeenCalled();

    // İnceleme odağı 1: kart + iki birim satırı, ikinci birim başarısız.
    let calls = 0;
    const steps = [step('olustur', { label: 'Stok kartı oluştur' }),
      step('birimEkleYeni', { label: 'Stok kartına birim ekle', bindings: [['id', '{{olustur.sonuc.id}}']], refs: ['olustur'], iterate: { grid: 'birim', list: 'eklenenSatir', rows: unitRows } }),
      step('fiyat')];
    const later = setup(steps, { respond: () => (++calls === 3 ? new Error('Birim kodu tekrar ediyor') : { affectedRows: 1, sonuc: { id: `r${calls}` } }) });
    const outcome = await runSaveSequence(later.opts);
    expect(outcome).toMatchObject({ tone: 'warning', succeeded: 2,
      message: 'Stok kartına birim ekle (satır 2/2) başarısız: Birim kodu tekrar ediyor. Önceki 2 işlem kaydedildi; kalan adımlar çalıştırılmadı.' });
    expect(later.write).toHaveBeenCalledTimes(3);
    if (outcome.status === 'done') {
      expect(outcome.calls.map((call) => [call.query, call.ok, call.rowKey])).toEqual([['olustur', true, undefined], ['birimEkleYeni', true, 'yeni-1'], ['birimEkleYeni', false, 'yeni-2']]);
      expect(outcome.calls[2]).toMatchObject({ grid: 'birim', error: 'Birim kodu tekrar ediyor.' });
    }
  });

  it('continue mode lists failures and skips dependent steps', async () => {
    const steps = [step('a', { label: 'A' }), step('b', { label: 'B', refs: ['a'] }), step('c', { label: 'C' }),
      step('d', { label: 'D', refs: ['onceki'], bindings: [['id', '{{onceki.sonuc.id}}']] }), step('e', { label: 'E', refs: ['b'] }), step('f', { label: 'F', refs: ['onceki'] })];
    const { opts, write } = setup(steps, { stopOnError: false, respond: (target) => (target.name === 'a' || target.name === 'e' ? new Error('Boom') : { affectedRows: 1, sonuc: { id: `${target.name}-1` } }) });
    const outcome = await runSaveSequence(opts);
    expect(write.mock.calls.map((call) => [call[0].name, call[1]])).toEqual([['a', {}], ['c', {}], ['d', { id: 'c-1' }]]);
    expect(outcome).toMatchObject({ tone: 'warning', succeeded: 2,
      message: '2/6 işlem tamamlandı. Başarısız: A: Boom. B: bağlı olduğu adım başarısız. E: bağlı olduğu adım başarısız. F: bağlı olduğu adım başarısız.' });
    if (outcome.status === 'done') expect(outcome.calls.find((call) => call.query === 'b')).toMatchObject({ ok: false, skipped: true, error: 'bağlı olduğu adım başarısız.' });

    const none = setup([step('a', { label: 'A' }), step('c', { label: 'C' })], { stopOnError: false, respond: () => new Error('Olmadı!') });
    expect(await runSaveSequence(none.opts)).toMatchObject({ tone: 'error', succeeded: 0, message: '0/2 işlem tamamlandı. Başarısız: A: Olmadı! C: Olmadı!' });
  });

  it('validation runs once before beforeSave and blocks everything', async () => {
    const { opts, write, validate, beforeWrite, lock } = setup([step('a'), step('b')]);
    validate.mockReturnValue(VALIDATION_BLOCKED);
    expect(await runSaveSequence(opts)).toEqual({ status: 'blocked', message: VALIDATION_BLOCKED });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(beforeWrite).not.toHaveBeenCalled();
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(lock.current).toBe(false);
  });

  it('beforeSave once with first step name; cancel sends nothing', async () => {
    const steps = [step('birimEkle', { iterate: { grid: 'birim', list: 'eklenenSatir', rows: [] } }), step('guncelle'), step('fiyat')];
    const ok = setup(steps);
    await runSaveSequence(ok.opts);
    expect(ok.beforeWrite).toHaveBeenCalledTimes(1);
    expect(ok.beforeWrite.mock.calls[0][0].name).toBe('guncelle');
    expect(ok.validate.mock.invocationCallOrder[0]).toBeLessThan(ok.beforeWrite.mock.invocationCallOrder[0]);

    const cancelled = setup(steps);
    cancelled.beforeWrite.mockResolvedValue({ cancel: true, message: 'Kod bileşeni iptal etti.' });
    expect(await runSaveSequence(cancelled.opts)).toEqual({ status: 'blocked', message: 'Kod bileşeni iptal etti.' });
    expect(cancelled.write).not.toHaveBeenCalled();
    expect(cancelled.lock.current).toBe(false);

    const thrown = setup(steps);
    thrown.beforeWrite.mockRejectedValue(new Error('x'));
    expect(await runSaveSequence(thrown.opts)).toEqual({ status: 'blocked', message: 'Kod bileşeni yanıt vermedi; işlem iptal edildi.' });
  });

  it('confirm once; preview always confirms', async () => {
    const steps = [step('a'), step('b')];
    const asked = setup(steps, { confirm: { enabled: true, text: 'Kaydedilsin mi?', title: 'Kayıt', confirmLabel: 'Kaydet' } });
    await runSaveSequence(asked.opts);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Kayıt', message: 'Kaydedilsin mi?', confirmLabel: 'Kaydet', cancelLabel: 'Vazgeç', tone: 'default' }));
    expect(asked.write.mock.calls.map((call) => call[2])).toEqual([false, false]);

    confirmDialog.mockClear();
    const preview = setup(steps, { isPreview: true });
    await runSaveSequence(preview.opts);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: PREVIEW_WRITE_WARNING, tone: 'danger' }));
    expect(preview.write.mock.calls.map((call) => call[2])).toEqual([true, true]);

    confirmDialog.mockClear();
    confirmDialog.mockResolvedValue(false);
    const declined = setup(steps, { confirm: { enabled: true } });
    expect(await runSaveSequence(declined.opts)).toEqual({ status: 'cancelled' });
    expect(declined.write).not.toHaveBeenCalled();
    expect(declined.lock.current).toBe(false);
  });

  it('preview blocks ERP operation steps without asking the misleading confirm', async () => {
    const steps = [step('a'), { ...step('b'), query: { ...query('b'), operation: 'cari.olustur' } }];
    const preview = setup(steps, { isPreview: true, confirm: { enabled: true, text: 'Kaydedilsin mi?' } });
    expect(await runSaveSequence(preview.opts)).toEqual({ status: 'blocked', message: PREVIEW_ERP_WRITE_BLOCKED });
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(preview.write).not.toHaveBeenCalled();
    expect(preview.validate).not.toHaveBeenCalled();
    expect(preview.lock.current).toBe(false);
  });

  it('prompt cancel stops silently; answer reaches overlay', async () => {
    const steps = [step('ters', { bindings: [['reason', '{{tersButon.yanit}}']] })];
    const cancelled = setup(steps, { prompt: async () => null, promptName: 'tersButon', confirm: { enabled: true } });
    expect(await runSaveSequence(cancelled.opts)).toEqual({ status: 'cancelled' });
    expect(cancelled.write).not.toHaveBeenCalled();
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(cancelled.beforeWrite).toHaveBeenCalledTimes(1);

    const prompt = vi.fn(async () => 'Hatalı kayıt');
    const answered = setup(steps, { prompt, promptName: 'tersButon', confirm: { enabled: true } });
    expect(await runSaveSequence(answered.opts)).toMatchObject({ tone: 'success' });
    expect(answered.write.mock.calls[0][1]).toEqual({ reason: 'Hatalı kayıt' });
    expect(answered.overlays[0]).toMatchObject({ tersButon: { yanit: 'Hatalı kayıt' } });
    // İstem onayın yerine geçer; önizlemede uyarı onayı yine istemden sonra sorulur.
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(answered.beforeWrite.mock.invocationCallOrder[0]).toBeLessThan(prompt.mock.invocationCallOrder[0]);

    const previewPrompt = vi.fn(async () => 'Neden');
    const preview = setup(steps, { prompt: previewPrompt, promptName: 'tersButon', isPreview: true, confirm: { enabled: true, text: 'Ters kayıt?' } });
    await runSaveSequence(preview.opts);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: PREVIEW_WRITE_WARNING, tone: 'danger' }));
    expect(previewPrompt.mock.invocationCallOrder[0]).toBeLessThan(confirmDialog.mock.invocationCallOrder[0]);
  });

  it('busy lock returns busy without calling validate', async () => {
    const { opts, validate, write, lock } = setup([step('a')]);
    lock.current = true;
    expect(await runSaveSequence(opts)).toEqual({ status: 'busy' });
    expect(validate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(lock.current).toBe(true);
  });

  it('lock is held during the run', async () => {
    const { opts, lock } = setup([step('a')]);
    let held: boolean | null = null;
    opts.write = async () => { held = lock.current; return { affectedRows: 1 }; };
    await runSaveSequence(opts);
    expect(held).toBe(true);
    expect(lock.current).toBe(false);
  });

  it('nothing to save message', async () => {
    const { opts, write, validate, lock } = setup([step('birimEkle', { iterate: { grid: 'birim', list: 'eklenenSatir', rows: [] } })]);
    expect(NOTHING_TO_SAVE).toBe('Kaydedilecek bir değişiklik yok.');
    expect(await runSaveSequence(opts)).toEqual({ status: 'done', tone: 'warning', message: NOTHING_TO_SAVE, calls: [], succeeded: 0 });
    expect(await runSaveSequence({ ...opts, steps: [] })).toMatchObject({ message: NOTHING_TO_SAVE });
    expect(validate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(lock.current).toBe(false);
  });

  it('afterWrite once with adimlar; not called when no call succeeded', async () => {
    const { opts, afterWrite } = setup([step('a'), step('b')], { stopOnError: false, respond: (target) => (target.name === 'b' ? new Error('Hayır') : { affectedRows: 1, sonuc: { id: 7 } }) });
    await runSaveSequence(opts);
    expect(afterWrite).toHaveBeenCalledTimes(1);
    expect(afterWrite).toHaveBeenCalledWith({ query: 'a', sonuc: { id: 7 }, adimlar: [{ query: 'a', ok: true, sonuc: { id: 7 } }, { query: 'b', ok: false, hata: 'Hayır.' }] });

    const failed = setup([step('a')], { respond: () => new Error('Hayır') });
    await runSaveSequence(failed.opts);
    expect(failed.afterWrite).not.toHaveBeenCalled();

    const throwing = setup([step('a')]);
    throwing.afterWrite.mockImplementation(() => { throw new Error('olay'); });
    expect(await runSaveSequence(throwing.opts)).toMatchObject({ tone: 'success' });
  });

  it('iteration label uses satır i/n', async () => {
    const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const { opts } = setup([step('sil', { label: 'Birimi sil', iterate: { grid: 'birim', list: 'silinenSatir', rows } })]);
    const outcome = await runSaveSequence(opts);
    if (outcome.status !== 'done') throw new Error(outcome.status);
    expect(outcome.calls.map((call) => call.label)).toEqual(['Birimi sil (satır 1/3)', 'Birimi sil (satır 2/3)', 'Birimi sil (satır 3/3)']);
  });

  it('error text gets trailing period', async () => {
    for (const [text, expected] of [['Kod zaten var', 'Kod zaten var.'], ['Kayıt yok.', 'Kayıt yok.'], ['Olmaz!', 'Olmaz!'], ['Neden?', 'Neden?']]) {
      const { opts } = setup([step('a', { label: 'A' })], { respond: () => new Error(text) });
      expect(await runSaveSequence(opts), text).toMatchObject({ message: `A başarısız: ${expected} Hiçbir değişiklik kaydedilmedi.` });
    }
  });
});

describe('helpers', () => {
  it('stepLabel uses the operation label or the query name', () => {
    expect(stepLabel(query('olustur'), { label: 'Stok kartı oluştur' } as ErpOperation)).toBe('Stok kartı oluştur');
    expect(stepLabel(query('olustur'), undefined)).toBe('olustur');
  });

  it('iterationOf finds the grid list binding', () => {
    expect(iterationOf(query('ekle', [['id', '{{kart.rows[0].id}}'], ['unitCode', '{{birim.eklenenSatir.unitCode}}']]))).toEqual({ grid: 'birim', list: 'eklenenSatir' });
    expect(iterationOf(query('sil', [['unitId', '{{ birim.silinenSatir.id }}']]))).toEqual({ grid: 'birim', list: 'silinenSatir' });
    expect(iterationOf(query('x', [['a', '{{birim.satirlar}}'], ['b', 'eklenenSatir']]))).toBeNull();
  });
});
