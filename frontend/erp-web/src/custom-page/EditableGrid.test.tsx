import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableGrid } from './EditableGrid';
import { emptyGridState, gridReducer, parseGridColumns, type GridAction, type GridState } from './gridState';

afterEach(cleanup);

const columns = parseGridColumns(['unitCode|Birim|text|required,upperCase', 'factorToBase|Katsayı|number|required']);
const source = [{ id: 'u1', unitCode: 'KUTU', factorToBase: 12 }, { id: 'u2', unitCode: 'KOLI', factorToBase: 48 }];

function grid(overrides: Partial<Parameters<typeof EditableGrid>[0]> = {}, state: GridState = emptyGridState('k')) {
  const dispatch = vi.fn<(action: GridAction) => void>();
  const view = render(<EditableGrid id="birimler" title="Birimler" mode="stage" columns={columns} state={state} sourceRows={source} rowKey="id"
    dispatch={dispatch} errors={{}} fixedRowLabel="" addLabel="Satır ekle" maxRows={50} disabled={false} disabledReason="" loading={false} style={{}} {...overrides} />);
  return { dispatch, ...view };
}

describe('EditableGrid', () => {
  it('stage shows source rows read-only and new rows editable', () => {
    const state = gridReducer(emptyGridState('k'), { type: 'add' }, { mode: 'stage', maxRows: 50 });
    const { dispatch } = grid({}, state);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('KUTU')).toBeTruthy();
    expect(screen.queryByLabelText('Birim (satır 1)')).toBeNull();
    const cell = screen.getByLabelText('Birim (satır 3)') as HTMLInputElement;
    expect(screen.getByText('Yeni')).toBeTruthy();
    fireEvent.change(cell, { target: { value: 'pk' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'edit', key: 'yeni-1', code: 'unitCode', value: 'PK' });
    fireEvent.click(screen.getByRole('button', { name: 'Satır ekle' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'add' });
  });

  it('remove marks Silinecek and Geri al restores', () => {
    const { dispatch, rerender } = grid();
    const first = screen.getAllByRole('row')[1];
    fireEvent.click(within(first).getByRole('button', { name: 'Satırı sil' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'remove', key: 'u1' });
    const removed = gridReducer(emptyGridState('k'), { type: 'remove', key: 'u1' }, { mode: 'stage', maxRows: 50 });
    rerender(<EditableGrid id="birimler" title="Birimler" mode="stage" columns={columns} state={removed} sourceRows={source} rowKey="id"
      dispatch={dispatch} errors={{}} fixedRowLabel="" addLabel="Satır ekle" maxRows={50} disabled={false} disabledReason="" loading={false} style={{}} />);
    const row = screen.getAllByRole('row')[1];
    expect(row.className).toContain('is-removed');
    expect(within(row).getByText('Silinecek')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Geri al' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'undoRemove', key: 'u1' });
  });

  it('fixed row label first and not removable', () => {
    grid({ fixedRowLabel: 'ADET (temel birim)' });
    const rows = screen.getAllByRole('row');
    expect(rows[1].textContent).toContain('ADET (temel birim)');
    expect(within(rows[1]).queryByRole('button')).toBeNull();
  });

  it('add disabled at maxRows', () => {
    let state = emptyGridState('k');
    for (let i = 0; i < 2; i += 1) state = gridReducer(state, { type: 'add' }, { mode: 'list', maxRows: 2 });
    grid({ mode: 'list', maxRows: 2, sourceRows: [] }, state);
    expect((screen.getByRole('button', { name: 'Satır ekle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('En fazla 2 satır eklenebilir.')).toBeTruthy();
  });

  it('cell error shown with aria-invalid', () => {
    const state = gridReducer(emptyGridState('k'), { type: 'add' }, { mode: 'list', maxRows: 50 });
    grid({ mode: 'list', sourceRows: [], errors: { 'yeni-1': { unitCode: 'Bu alan zorunludur.' } } }, state);
    const cell = screen.getByLabelText('Birim (satır 1)');
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Bu alan zorunludur.')).toBeTruthy();
    expect(screen.getByLabelText('Katsayı (satır 1)').getAttribute('aria-invalid')).toBeNull();
  });

  it('matrix shows variant count and 200 note', () => {
    const state = gridReducer(emptyGridState('k'), { type: 'add' }, { mode: 'matrix', maxRows: 50 });
    const { rerender, dispatch } = grid({ mode: 'matrix', columns: [], sourceRows: [], matrixPreviewCount: 4 }, state);
    expect(screen.getByLabelText('Özellik adı (satır 1)')).toBeTruthy();
    expect(screen.getByLabelText('Değerler (satır 1)')).toBeTruthy();
    expect(screen.getByText('4 varyant oluşturulacak')).toBeTruthy();
    rerender(<EditableGrid id="v" title="Varyantlar" mode="matrix" columns={[]} state={state} sourceRows={[]} rowKey="id" dispatch={dispatch} errors={{}}
      fixedRowLabel="" addLabel="Satır ekle" maxRows={50} disabled={false} disabledReason="" loading={false} matrixPreviewCount={240} style={{}} />);
    expect(screen.getByText('En fazla 200 varyant oluşturulabilir; ilk 200 kullanılacak.')).toBeTruthy();
  });

  it('disabled grid shows reason', () => {
    const state = gridReducer(emptyGridState('k'), { type: 'add' }, { mode: 'stage', maxRows: 50 });
    grid({ disabled: true, disabledReason: 'Önce kartı kaydedin.' }, state);
    expect(screen.getByText('Önce kartı kaydedin.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Satır ekle' }) as HTMLButtonElement).disabled).toBe(true);
    for (const button of screen.getAllByRole('button', { name: 'Satırı sil' })) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Birim (satır 3)') as HTMLInputElement).disabled).toBe(true);
  });
});
