import { Fragment, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { usePageCommands } from "../commands/CommandProvider";

export type ActionStatus = { tone: "success" | "error" | "warning"; text: string };
export type DialogSave = { label: string; busy: boolean; run: () => void };

const FIELD_SELECTOR = "input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])";
const BUSY_TEXT = "Kaydediliyor…";

const NO_DIALOG_SAVE = "Bu pencerede kaydedilecek bir şey yok";
/**
 * Açık pencerenin Ctrl+S kaydı: `form` kaynağı İşlem Çubuğu'nun `page` kaydını geçer; pencere kapanınca kayıt kalkar.
 * Kaydı olmayan pencere de pasif bir kayıt bırakır: pencere açıkken sayfanın kaydı Ctrl+S ile çalışmaz.
 */
function DialogSaveCommands({ save, root }: { save?: DialogSave; root: RefObject<HTMLDivElement | null> }) {
  usePageCommands({ save: !save ? { disabledReason: NO_DIALOG_SAVE } : save.busy ? { disabledReason: "İşlem sürüyor…" } : { run: save.run, primary: true } }, "form", root);
  return null;
}

function OpenDialog({ id, title, presentation, onClose, renderOwned, ids, save, status, returnFocus }: Omit<PageDialogProps, "open">) {
  const ref = useRef<HTMLDivElement>(null);
  const focusBack = useRef(returnFocus);
  focusBack.current = returnFocus;
  useEffect(() => {
    // Açılışta ilk alana (yoksa ilk düğmeye) odaklanılır; kapanınca odak açan öğeye döner.
    const root = ref.current;
    (root?.querySelector<HTMLElement>(`.tenant-page-dialog-body :is(${FIELD_SELECTOR})`) ?? root?.querySelector<HTMLElement>("button"))?.focus();
    return () => { if (focusBack.current?.isConnected) focusBack.current.focus(); };
  }, []);
  // Esc yalnız pencerenin kendi öğelerinden gelirse kapatır (üstte açılan onay/istem kutusu sayfa dışındadır).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    event.preventDefault();
    onClose();
  };
  const titleId = `page-dialog-${id}-title`;
  return <div className="tenant-page-dialog-backdrop">
    <div ref={ref} className={`tenant-page-dialog${presentation === "drawer" ? " is-drawer" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <header className="tenant-page-dialog-header"><h2 id={titleId}>{title}</h2></header>
      <div className="tenant-page-dialog-body">{ids.map((owned) => <Fragment key={owned}>{renderOwned(owned)}</Fragment>)}</div>
      {status && <p className={`tenant-page-action-status is-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>{status.text}</p>}
      <footer className="tenant-page-dialog-footer">
        {save ? <>
          <button type="button" className="tenant-page-button is-secondary" onClick={onClose}>Vazgeç</button>
          <button type="button" className="tenant-page-button" disabled={save.busy} onClick={save.run}>{save.busy ? BUSY_TEXT : save.label}</button>
        </> : <button type="button" className="tenant-page-button is-secondary" onClick={onClose}>Kapat</button>}
      </footer>
      <DialogSaveCommands save={save} root={ref} />
    </div>
  </div>;
}

type PageDialogProps = {
  id: string; title: string; presentation: "dialog" | "drawer"; open: boolean;
  onClose: () => void; renderOwned: (id: string) => ReactNode; ids: string[];
  save?: DialogSave; status: ActionStatus | null; returnFocus: HTMLElement | null;
};

/** Sayfa penceresi (`dialog`): görünüm içinde çizilir (portal yok); sahiplendiği bileşenler yalnız açıkken çizilir. */
export function PageDialog({ open, ...props }: PageDialogProps) {
  return open ? <OpenDialog {...props} /> : null;
}
