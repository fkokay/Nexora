import type { MutableRefObject } from 'react';
import type { GridExportActions } from '../AdvancedDataGrid';
import type { MenuCommand } from './types';

/**
 * Id of the list row that holds the focus (rows carry `data-record-id`). Enter on a focused row runs the bar's Aç
 * before the row's own key handler selects it, so Aç opens the focused row rather than the previously selected one.
 */
export function focusedRecordId(): string | undefined {
  const active = document.activeElement;
  return active instanceof Element ? active.closest('[data-record-id]')?.getAttribute('data-record-id') ?? undefined : undefined;
}

/** "CSV olarak dışa aktar" item for the actions menu; the grid's XLSX export stays the bar's `export`. */
export function csvExportCommand(ref: MutableRefObject<GridExportActions | null>): MenuCommand {
  return { id: 'export-csv', label: 'CSV olarak dışa aktar', run: () => ref.current?.exportCsv() };
}

