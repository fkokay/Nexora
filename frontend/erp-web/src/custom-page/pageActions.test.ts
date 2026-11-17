import { describe, expect, it, vi } from 'vitest';
import { actionBarOf, buildPageCommands, exportRows, movedButtonIds, type PageActionDeps } from './pageActions';

const UNBOUND = 'Bu sayfada bağlanmadı';

function makeDeps(overrides: Partial<PageActionDeps> = {}) {
  const run = { clearInputs: vi.fn(), write: vi.fn(), refresh: vi.fn(), focus: vi.fn(), print: vi.fn(), exportTable: vi.fn(), button: vi.fn() };
  const deps: PageActionDeps = {
    rights: { view: true, insert: true, update: true, delete: true },
    busy: false,
    queryKind: (id) => ({ q1: 'insert', q2: 'update', q3: 'delete', q4: 'read' } as Record<string, string>)[id],
    inputIds: new Set(['i1', 'i2']),
    tableState: (id) => (id === 't1' ? { loading: false, rowCount: 3 } : undefined),
    buttonLabel: (id) => (id === 'b1' ? 'Onayla' : undefined),
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
