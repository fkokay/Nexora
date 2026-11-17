import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { formatShortcut, MORE_MENU_SHORTCUT, STANDARD_SHORTCUTS } from '../commands/shortcuts';
import { ACTION_BAR_ORDER, type StandardCommandId } from '../commands/types';
import { COMMAND_LABELS } from './labels';

type Props = { locale: 'tr' | 'en'; onClose: () => void };
type Row = readonly [shortcut: string, description: string];

const STANDARD_IDS: readonly StandardCommandId[] = [...ACTION_BAR_ORDER, 'undo'];

const BAR_ROWS: readonly Row[] = [
  ...STANDARD_IDS.map((id): Row => [STANDARD_SHORTCUTS[id], COMMAND_LABELS[id]]),
  [MORE_MENU_SHORTCUT, 'İşlemler menüsü'],
];

const GLOBAL_ROWS: readonly Row[] = [
  ['Ctrl+K', 'Arama'],
  ['Ctrl+B', 'Aramayı aç / kapat'],
  ['Ctrl+W', 'Geçerli ekranı kapat'],
  ['Ctrl+Tab', 'Sonraki ekran'],
  ['Ctrl+Shift+Tab', 'Önceki ekran'],
  ['Alt+←', 'Önceki ekran'],
  ['Alt+→', 'Sonraki ekran'],
  ['F1', 'Kısayol yardımı'],
];

// Record forms (record-form/RecordForm): the keys their footer lists.
const RECORD_FORM_ROWS: readonly Row[] = [
  ['Ctrl+↑/↓', 'Önceki / sonraki bölüm'],
  ['PgUp/PgDn', 'Önceki / sonraki kayıt'],
  ['Ctrl+.', 'Bağlam panelini aç / kapat'],
  ['Esc', 'Formu kapat (Vazgeç)'],
];

// Document screens (document-page/DocumentSurface): the keys their footer lists when the page enables them.
const DOCUMENT_ROWS: readonly Row[] = [
  ['PgUp/PgDn', 'Önceki / sonraki belge'],
  ['Ctrl+.', 'Bağlam panelini aç / kapat'],
];

function Section({ title, rows, locale }: { title: string; rows: readonly Row[]; locale: 'tr' | 'en' }) {
  return (
    <section>
      <h3>{title}</h3>
      <dl>
        {rows.map(([shortcut, description]) => (
          <div key={`${shortcut}-${description}`}>
            <dt><kbd>{formatShortcut(shortcut, locale)}</kbd></dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ShortcutHelpDialog({ locale, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="nx-shortcut-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="nx-shortcut-help" role="dialog" aria-modal="true" aria-labelledby="nx-shortcut-help-title">
        <header>
          <h2 id="nx-shortcut-help-title">Kısayollar</h2>
          <button ref={closeRef} type="button" aria-label="Kapat" onClick={onClose}><X size={16} aria-hidden="true" /></button>
        </header>
        <Section title="İşlem çubuğu" rows={BAR_ROWS} locale={locale} />
        <Section title="Genel" rows={GLOBAL_ROWS} locale={locale} />
        <Section title="Kayıt formu" rows={RECORD_FORM_ROWS} locale={locale} />
        <Section title="Belge ekranı" rows={DOCUMENT_ROWS} locale={locale} />
      </div>
    </div>,
    document.body,
  );
}
