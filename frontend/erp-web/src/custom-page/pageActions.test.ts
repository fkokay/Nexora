import { describe, expect, it, vi } from 'vitest';
import { actionBarOf, buildPageCommands, exportRows, movedButtonIds, type PageActionDeps } from './pageActions';

const UNBOUND = 'Bu sayfada bağlanmadı';

function makeDeps(overrides: Partial<PageActionDeps> = {}) {
  const run = { clearInputs: vi.fn(), write: vi.fn(), saveSequence: vi.fn(), refresh: vi.fn(), focus: vi.fn(), print: vi.fn(), exportTable: vi.fn(), button: vi.fn() };
  const deps: PageActionDeps = {
    rights: { view: true, insert: true, update: true, delete: true },
    busy: false,
    queryKind: (id) => ({ q1: 'insert', q2: 'update', q3: 'delete', q4: 'read' } as Record<string, string>)[id],
    inputIds: new Set(['i1', 'i2']),
    tableState: (id) => (id === 't1' ? { loading: false, rowCount: 3 } : undefined),
    buttonLabel: (id) => (id === 'b1' ? 'Onayla' : undefined),
    deleteNeedsSelection: false,
    queryAllowed: () => true,
    run,
    ...overrides,
  };
  return { deps, run };
}

describe('actionBarOf / movedButtonIds', () => {
  const components = [
    { id: 'a', type: 'heading' },
    { id: 'bar', type: 'actionBar', props: { moreButtons: ['b1', ' b2 ', 'b1', 5] } },
    { id: 'bar2', type: 'actionBar', props: { moreButtons: ['b9'] } },
  ];
  it('ilk actionBar döner; yoksa null', () => {
    expect(actionBarOf(components)?.id).toBe('bar');
    expect(actionBarOf([{ id: 'a', type: 'text' }])).toBeNull();
  });
  it('kullanılabilir eylemi olmayan düğme taşınmış sayılmaz (sayfada kalır)', () => {
    const withButtons = [
      { id: 'bar', type: 'actionBar', props: { moreButtons: ['ok', 'bos'] } },
      { id: 'ok', type: 'button', props: {} }, { id: 'bos', type: 'button', props: {} },
    ];
    expect([...movedButtonIds(withButtons, (button) => button.id === 'ok')]).toEqual(['ok']);
  });
  it('moreButtons kimlikleri tekil ve en fazla 10', () => {
    expect([...movedButtonIds(components)]).toEqual(['b1', 'b2']);
    expect(movedButtonIds([]).size).toBe(0);
  });
});

describe('buildPageCommands', () => {
  it('boş props: hepsi bağlanmadı, yenile açık, birincil yok', () => {
    const { deps } = makeDeps();
    const commands = buildPageCommands({}, deps);
    for (const id of ['save', 'delete', 'new', 'filter', 'print', 'export', 'open'] as const) {
      expect(commands[id]?.disabledReason).toBe(UNBOUND);
      expect(commands[id]?.run).toBeUndefined();
    }
    expect(commands.refresh?.run).toBeTypeOf('function');
    expect(Object.values(commands).some((spec) => !Array.isArray(spec) && spec?.primary)).toBe(false);
  });

  it('saveQuery insert + hak: birincil, run yazar', () => {
    const { deps, run } = makeDeps();
    const commands = buildPageCommands({ saveQuery: 'q1' }, deps);
    expect(commands.save?.primary).toBe(true);
    expect(commands.save?.disabledReason).toBeUndefined();
    void commands.save?.run?.();
    expect(run.write).toHaveBeenCalledWith('q1', 'save');
  });

  it('yetki yoksa nedenli soluk; update için update hakkı bakılır', () => {
    const noInsert = buildPageCommands({ saveQuery: 'q1' }, makeDeps({ rights: { insert: false, update: true } }).deps);
    expect(noInsert.save?.disabledReason).toBe('Bu işlem için yetkiniz yok');
    const update = buildPageCommands({ saveQuery: 'q2' }, makeDeps({ rights: { insert: true, update: false } }).deps);
    expect(update.save?.disabledReason).toBe('Bu işlem için yetkiniz yok');
    const noDelete = buildPageCommands({ deleteQuery: 'q3' }, makeDeps({ rights: { delete: false } }).deps);
    expect(noDelete.delete?.disabledReason).toBe('Bu işlem için yetkiniz yok');
  });

  it('busy iken save/delete "İşlem sürüyor…"', () => {
    const commands = buildPageCommands({ saveQuery: 'q1', deleteQuery: 'q3' }, makeDeps({ busy: true }).deps);
    expect(commands.save?.disabledReason).toBe('İşlem sürüyor…');
    expect(commands.delete?.disabledReason).toBe('İşlem sürüyor…');
  });

  it('silme sorgusu seçimsiz tabloya bağlıysa "Önce bir kayıt seçin"; yetki yoksa yetki nedeni', () => {
    const needs = buildPageCommands({ deleteQuery: 'q3' }, makeDeps({ deleteNeedsSelection: true }).deps);
    expect(needs.delete?.disabledReason).toBe('Önce bir kayıt seçin');
    expect(needs.delete?.run).toBeUndefined();
    expect(buildPageCommands({ deleteQuery: 'q3' }, makeDeps({ deleteNeedsSelection: true, rights: { delete: false } }).deps).delete?.disabledReason).toBe('Bu işlem için yetkiniz yok');
  });

  it('delete run yazma(delete) çağırır; yanlış türdeki sorgu bağlanmamış sayılır', () => {
    const { deps, run } = makeDeps();
    const commands = buildPageCommands({ deleteQuery: 'q3', saveQuery: 'q4' }, deps);
    void commands.delete?.run?.();
    expect(run.write).toHaveBeenCalledWith('q3', 'delete');
    expect(commands.save?.disabledReason).toBe(UNBOUND);
  });

  it('newInputs var, saveQuery yok: yeni birincil; run boşaltır ve ilkine odaklanır', () => {
    const { deps, run } = makeDeps();
    const commands = buildPageCommands({ newInputs: ['i1', 'i2', 'yok'] }, deps);
    expect(commands.new?.primary).toBe(true);
    expect(commands.save?.primary).toBeFalsy();
    void commands.new?.run?.();
    expect(run.clearInputs).toHaveBeenCalledWith(['i1', 'i2']);
    expect(run.focus).toHaveBeenCalledWith('i1');
  });

  it('saveQuery varken birincil save, new değil', () => {
    const commands = buildPageCommands({ newInputs: ['i1'], saveQuery: 'q1' }, makeDeps().deps);
    expect(commands.save?.primary).toBe(true);
    expect(commands.new?.primary).toBeFalsy();
  });

  it('filtre ve yazdır', () => {
    const { deps, run } = makeDeps();
    const commands = buildPageCommands({ focusInput: 'i2', printEnabled: true }, deps);
    void commands.filter?.run?.();
    void commands.print?.run?.();
    expect(run.focus).toHaveBeenCalledWith('i2');
    expect(run.print).toHaveBeenCalled();
    expect(buildPageCommands({ printEnabled: 'evet' }, deps).print?.disabledReason).toBe(UNBOUND);
  });

  it('exportTable: yükleniyor / hata / hazır', () => {
    expect(buildPageCommands({ exportTable: 't1' }, makeDeps({ tableState: () => ({ loading: true, rowCount: 0 }) }).deps).export?.disabledReason).toBe('Liste henüz yüklenmedi');
    expect(buildPageCommands({ exportTable: 't1' }, makeDeps({ tableState: () => ({ loading: false, error: 'Bozuk', rowCount: 0 }) }).deps).export?.disabledReason).toBe('Bozuk');
    const { deps, run } = makeDeps();
    const ready = buildPageCommands({ exportTable: 't1' }, deps);
    expect(ready.export?.disabledReason).toBeUndefined();
    void ready.export?.run?.();
    expect(run.exportTable).toHaveBeenCalledWith('t1');
  });

  it('moreButtons etiketli öğelere dönüşür', () => {
    const { deps, run } = makeDeps();
    const commands = buildPageCommands({ moreButtons: ['b1', 'yok'] }, deps);
    expect(commands.more).toHaveLength(1);
    expect(commands.more?.[0]).toMatchObject({ id: 'b1', label: 'Onayla' });
    void commands.more?.[0].run?.();
    expect(run.button).toHaveBeenCalledWith('b1');
  });

  it('hidden more button is omitted, disabled one carries reason', () => {
    const { deps, run } = makeDeps({
      buttonLabel: (id) => ({ b1: 'Onayla', b2: 'Gizli', b3: 'Kilitli', b4: 'Nedensiz' } as Record<string, string>)[id],
      buttonGate: (id) => (id === 'b2' ? { hidden: true } : id === 'b3' ? { disabled: true, disabledReason: 'Önce onaylayın' }
        : id === 'b4' ? { disabled: true } : undefined),
    });
    const commands = buildPageCommands({ moreButtons: ['b1', 'b2', 'b3', 'b4'] }, deps);
    expect(commands.more?.map((item) => item.id)).toEqual(['b1', 'b3', 'b4']);
    expect(commands.more?.[1]).toEqual({ id: 'b3', label: 'Kilitli', disabledReason: 'Önce onaylayın' });
    expect(commands.more?.[2]).toEqual({ id: 'b4', label: 'Nedensiz', disabledReason: 'Bu işlem şu anda kullanılamaz.' });
    expect(run.button).not.toHaveBeenCalled();
  });
});

describe('saveSequence', () => {
  it('save bound by saveSequence needs rights for every kind', () => {
    const { deps, run } = makeDeps();
    const commands = buildPageCommands({ saveSequence: ['q1', 'q2', 'q3'], newInputs: ['i1'] }, deps);
    expect(commands.save?.primary).toBe(true);
    expect(commands.new?.primary).toBeFalsy();
    void commands.save?.run?.();
    expect(run.saveSequence).toHaveBeenCalledTimes(1);
    expect(run.write).not.toHaveBeenCalled();
    for (const missing of ['insert', 'update', 'delete']) {
      const rights = { view: true, insert: true, update: true, delete: true, [missing]: false };
      const denied = buildPageCommands({ saveSequence: ['q1', 'q2', 'q3'] }, makeDeps({ rights }).deps);
      expect(denied.save?.disabledReason).toBe('Bu işlem için yetkiniz yok');
    }
    // Yalnız insert/update adımlı dizi silme hakkı istemez.
    expect(buildPageCommands({ saveSequence: ['q1', 'q2'] }, makeDeps({ rights: { insert: true, update: true, delete: false } }).deps).save?.run).toBeTypeOf('function');
    // Okuma ya da bilinmeyen sorgu bağlanmamış sayılır.
    expect(buildPageCommands({ saveSequence: ['q1', 'q4'] }, deps).save?.disabledReason).toBe(UNBOUND);
    expect(buildPageCommands({ saveSequence: [] }, deps).save?.disabledReason).toBe(UNBOUND);
  });
});

describe('exportRows', () => {
  const columns = [{ code: 'a', label: 'A' }, { code: 'b', label: 'B' }, { code: 'c', label: 'C' }];
  it('seçili sütun sırası, null, boolean, nesne, ham sayı', () => {
    const rows = [{ a: 1, b: null, c: true }, { a: 'x', b: { k: 1 }, c: false }, { a: undefined, b: 'y', c: 0 }];
    expect(exportRows(columns, rows, ['c', 'a'])).toEqual([['C', 'A'], ['Evet', 1], ['Hayır', 'x'], [0, null]]);
    expect(exportRows(columns, rows, [])[1]).toEqual([1, null, 'Evet']);
    expect(exportRows(columns, rows, ['b'])[2]).toEqual(['{"k":1}']);
  });
  it('olmayan seçili sütun atlanır; hiçbiri geçerli değilse tüm sütunlar', () => {
    expect(exportRows(columns, [{ a: 1, b: 2, c: 3 }], ['zz'])[0]).toEqual(['A', 'B', 'C']);
  });
});

describe('işlem yetkisi ve kayıt penceresi', () => {
  it('delete disabled when operation not allowed', () => {
    const { deps, run } = makeDeps({ queryAllowed: (id) => id !== 'q3' });
    const commands = buildPageCommands({ deleteQuery: 'q3', saveQuery: 'q1' }, deps);
    expect(commands.delete?.disabledReason).toBe('Bu işlem için yetkiniz yok');
    expect(commands.delete?.run).toBeUndefined();
    expect(commands.save?.run).toBeTypeOf('function');
    const needs = buildPageCommands({ deleteQuery: 'q3' }, makeDeps({ queryAllowed: () => false, deleteNeedsSelection: true }).deps);
    expect(needs.delete?.disabledReason).toBe('Bu işlem için yetkiniz yok');
    expect(run.write).not.toHaveBeenCalled();
  });

  it('save disabled when its single operation is not allowed; sequences are checked per step at run time', () => {
    expect(buildPageCommands({ saveQuery: 'q1' }, makeDeps({ queryAllowed: () => false }).deps).save?.disabledReason).toBe('Bu işlem için yetkiniz yok');
    expect(buildPageCommands({ saveSequence: ['q1', 'q2'] }, makeDeps({ queryAllowed: () => false }).deps).save?.run).toBeTypeOf('function');
  });

  it('no form dialog: open stays unbound', () => {
    expect(buildPageCommands({ newInputs: ['i1'] }, makeDeps().deps).open?.disabledReason).toBe(UNBOUND);
  });

  it('form dialog: aç needs a selection, then opens the dialog', () => {
    const open = vi.fn();
    const startNew = vi.fn();
    const none = buildPageCommands({ newInputs: ['i1'] }, makeDeps({ formDialog: { open, startNew, hasRecord: false } }).deps);
    expect(none.open?.disabledReason).toBe('Önce bir kayıt seçin');
    expect(none.open?.run).toBeUndefined();
    const some = buildPageCommands({ newInputs: ['i1'] }, makeDeps({ formDialog: { open, startNew, hasRecord: true } }).deps);
    void some.open?.run?.();
    expect(open).toHaveBeenCalledTimes(1);
    const loading = buildPageCommands({}, makeDeps({ formDialog: { open, startNew, hasRecord: true, recordLoading: true } }).deps);
    expect(loading.open?.disabledReason).toBe('Kayıt yükleniyor…');
    const failed = buildPageCommands({}, makeDeps({ formDialog: { open, startNew, hasRecord: true, recordFailed: true } }).deps);
    expect(failed.open?.disabledReason).toBe('Kayıt okunamadı');
    expect(failed.open?.run).toBeUndefined();
  });

  it('form dialog: yeni starts a new record in the dialog and focuses the first new input', () => {
    const open = vi.fn();
    const startNew = vi.fn();
    const { deps, run } = makeDeps({ formDialog: { open, startNew, hasRecord: true } });
    const commands = buildPageCommands({ newInputs: ['yok', 'i2', 'i1'], saveSequence: ['q1', 'q2'] }, deps);
    expect(commands.new?.primary).toBeFalsy();
    void commands.new?.run?.();
    expect(startNew).toHaveBeenCalledWith('i2');
    expect(open).not.toHaveBeenCalled();
    expect(run.clearInputs).not.toHaveBeenCalled();
    // newInputs olmadan da Yeni pencereyi açar.
    const bare = buildPageCommands({}, makeDeps({ formDialog: { open, startNew, hasRecord: false } }).deps);
    void bare.new?.run?.();
    expect(startNew).toHaveBeenLastCalledWith(undefined);
  });
});

describe('Yeni / Aç düğmeleri (newButton, openButton)', () => {
  const labels = (id: string) => ({ yeni: 'Yeni kart', ac: 'Kartı aç' } as Record<string, string>)[id];
  it('düğmeler komutun kendisidir: sayfada ayrıca çizilmez', () => {
    const components = [
      { id: 'bar', type: 'actionBar', props: { newButton: 'yeni', openButton: 'ac', afterSaveButton: 'geri', moreButtons: ['m1'] } },
      { id: 'yeni', type: 'button' }, { id: 'ac', type: 'button' }, { id: 'geri', type: 'button' }, { id: 'm1', type: 'button' },
    ];
    expect([...movedButtonIds(components)].sort()).toEqual(['ac', 'geri', 'm1', 'yeni']);
  });
  it('Yeni ve Aç düğmeyi çalıştırır; Kaydet yoksa Yeni birincildir', () => {
    const { deps, run } = makeDeps({ buttonLabel: labels });
    const commands = buildPageCommands({ newButton: 'yeni', openButton: 'ac' }, deps);
    expect(commands.new?.primary).toBe(true);
    void commands.new?.run?.();
    expect(run.button).toHaveBeenLastCalledWith('yeni');
    void commands.open?.run?.();
    expect(run.button).toHaveBeenLastCalledWith('ac');
    expect(run.clearInputs).not.toHaveBeenCalled();
  });
  it('gizli Aç düğmesi seçim bekler, pasif düğme nedenini gösterir, meşgulken çalışmaz', () => {
    const hidden = buildPageCommands({ newButton: 'yeni', openButton: 'ac' }, makeDeps({ buttonLabel: labels,
      buttonGate: (id) => (id === 'ac' ? { hidden: true } : { disabled: true, disabledReason: 'Önce depo seçin' }) }).deps);
    expect(hidden.open).toEqual({ disabledReason: 'Önce bir kayıt seçin' });
    expect(hidden.new?.disabledReason).toBe('Önce depo seçin');
    expect(hidden.new?.run).toBeUndefined();
    const busy = buildPageCommands({ openButton: 'ac' }, makeDeps({ buttonLabel: labels, busy: true }).deps);
    expect(busy.open).toEqual({ disabledReason: 'İşlem sürüyor…' });
  });
  it('etiketsiz (hakkı olmayan) düğme bağlanmamış sayılır; kayıt penceresi önce gelir', () => {
    const none = buildPageCommands({ newButton: 'yok', openButton: 'yok' }, makeDeps({ buttonLabel: labels }).deps);
    expect(none.new?.disabledReason).toBe(UNBOUND);
    expect(none.open?.disabledReason).toBe(UNBOUND);
    const open = vi.fn();
    const startNew = vi.fn();
    const both = buildPageCommands({ newButton: 'yeni', openButton: 'ac' }, makeDeps({ buttonLabel: labels, formDialog: { open, startNew, hasRecord: true } }).deps);
    void both.new?.run?.();
    void both.open?.run?.();
    expect(startNew).toHaveBeenCalled();
    expect(open).toHaveBeenCalled();
  });
});
