import { confirmDialog } from '../confirmDialog';
import { usePageCommands } from './CommandProvider';
import type { PageCommands } from './types';

/**
 * Registers page commands while it is mounted. A page that serves several screens, or that hands the bar over
 * to a detail view it opens, renders this only while it owns the bar: `page` registrations are first-wins, so
 * an always-mounted registration would hide the one of a child or detail view.
 */
export function PageCommandsSlot({ commands }: { commands: PageCommands }) {
  usePageCommands(commands);
  return null;
}

/**
 * While a document (detail) is open over a list, the list's refresh / filter and the grid's Excel would act on the
 * hidden list. A `page` registration wins over them, so the detail registers these: refresh reloads the document
 * when it has a loader, the others are disabled.
 */
export function documentOpenCommands(reload?: () => void | Promise<void>): PageCommands {
  const reason = 'Belge açıkken kullanılamaz';
  return {
    refresh: reload ? { run: reload } : { disabledReason: reason },
    filter: { disabledReason: reason },
    export: { disabledReason: reason },
  };
}

/** Yeni over a form with unsaved input asks first; resolves true when the fresh record may be started. */
export async function confirmStartNew(dirty: boolean): Promise<boolean> {
  if (!dirty) return true;
  return confirmDialog({
    title: 'Yeni kayıt',
    message: 'Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?',
    confirmLabel: 'Devam',
  });
}
