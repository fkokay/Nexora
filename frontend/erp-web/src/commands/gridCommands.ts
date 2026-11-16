import type { MutableRefObject } from 'react';
import type { GridExportActions } from '../AdvancedDataGrid';
import type { MenuCommand } from './types';

/** "CSV olarak dışa aktar" item for the actions menu; the grid's XLSX export stays the bar's `export`. */
export function csvExportCommand(ref: MutableRefObject<GridExportActions | null>): MenuCommand {
  return { id: 'export-csv', label: 'CSV olarak dışa aktar', run: () => ref.current?.exportCsv() };
}

/**
 * Submits a RecordFormPage the same way its own save button does: a plain save (not "Kaydet ve Yeni"),
 * with the form's own validation and gates.
 */
export function submitRecordForm(formId: string, onSaveIntent?: (stayForNext: boolean) => void): void {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) return;
  onSaveIntent?.(false);
  form.requestSubmit();
}
