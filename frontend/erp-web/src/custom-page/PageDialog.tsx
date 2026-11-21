import { Fragment, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { usePageCommands } from "../commands/CommandProvider";

export type ActionStatus = { tone: "success" | "error" | "warning"; text: string };
export type DialogSave = { label: string; busy: boolean; run: () => void };
/** Pencere genişliği (`dialog.size`); `md` bugünkü genişliktir ve DOM'a yazılmaz. */
export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

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

function OpenDialog({ id, title, presentation, size, backdropClose, onClose, renderOwned, ids, save, status, returnFocus, onNew }:Omit<PageDialogProps, "open">) {
  const ref = useRef<HTMLDivElement>(null);
  // Dışarı tıklama yalnız basma ve bırakma ikisi de arka planda olursa kapatır (pencere içinden sürükleyip dışarıda bırakmak kapatmaz).
  const backdropDown = useRef(false);
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
    // Kayıt penceresi (`actionBar.formDialog`): F2 sayfanın Yeni komutudur (kısayol kaydı açık pencerede çalışmaz).
    if (onNew && event.key === "F2" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.stopPropagation();
      event.preventDefault();
      onNew();
      return;
    }
    if (event.key !== "Escape") return;
    event.stopPropagation();
    event.preventDefault();
    onClose();
  };
  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => { backdropDown.current = event.target === event.currentTarget; };
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const startedOnBackdrop = backdropDown.current;
    backdropDown.current = false;
    // Kayıt sürerken pencere dışarı tıklamayla kapanmaz.
    if (!startedOnBackdrop || event.target !== event.currentTarget || save?.busy) return;
    onClose();
  };
  const titleId = `page-dialog-${id}-title`;
  const sizeAttr = size && size !== "md" ? size : undefined;
  return <div className="tenant-page-dialog-backdrop" onMouseDown={backdropClose ? onBackdropMouseDown : undefined} onClick={backdropClose ? onBackdropClick : undefined}>
    <div ref={ref} className={`tenant-page-dialog${presentation === "drawer" ? " is-drawer" : ""}`} data-size={sizeAttr} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
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
  /** Genişlik; verilmezse `md` (bugünkü genişlik). Çekmecede çekmece genişliğini belirler. */
  size?: DialogSize;
  /** true: arka plana tıklamak pencereyi kapatır (kayıt sürerken kapatmaz). */
  backdropClose?: boolean;
  onClose: () => void; renderOwned: (id: string) => ReactNode; ids: string[];
  save?: DialogSave; status: ActionStatus | null; returnFocus: HTMLElement | null;
  /** Kayıt penceresinde F2 (Yeni). */
  onNew?: () => void;
};

/** Sayfa penceresi (`dialog`): görünüm içinde çizilir (portal yok); sahiplendiği bileşenler yalnız açıkken çizilir. */
export function PageDialog({ open, ...props }: PageDialogProps) {
  return open ? <OpenDialog {...props} /> : null;
}
