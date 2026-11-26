import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import { ListFooter } from "../list-page/ListFooter";
import { ListPageHeader } from "../list-page/ListPageHeader";
import "./page-templates.css";

export type ShellAction = {
  id: string;
  label: string;
  kind: "primary" | "normal" | "danger";
  disabled?: boolean;
  disabledReason?: string;
  /** `opener`: tıklanan düğme (menüden çalışınca "⋯" düğmesi); açılan pencere kapanınca odak ona döner. */
  run: (opener?: HTMLElement) => void;
  /** Düğmenin hemen önüne konan görünmez işaret (Studio tuvalinde seçim için); menüde çizilmez. */
  anchor?: ReactNode;
};

/** Ana düğme en solda, `normal`'lar aralarında, `danger` en sağda. */
export function orderShellActions(actions: ShellAction[]): { left: ShellAction[]; right: ShellAction[] } {
  return {
    left: [...actions.filter((a) => a.kind === "primary"), ...actions.filter((a) => a.kind === "normal")],
    right: actions.filter((a) => a.kind === "danger"),
  };
}

const BUTTON_PAD = 32;
const CHAR_WIDTH = 8;
const GAP = 8;
const SEARCH_WIDTH = 240;
const MORE_WIDTH = 44;
const widthOf = (action: ShellAction) => BUTTON_PAD + action.label.length * CHAR_WIDTH + GAP;

/** Sığmayan `normal` ve `danger` düğmeleri ayırır; `primary` hiçbir zaman menüye girmez. Genişlik bilinmiyorsa hepsi görünür. */
function splitByWidth(actions: ShellAction[], width: number | null, hasSearch: boolean) {
  const { left, right } = orderShellActions(actions);
  if (width === null) return { shownLeft: left, shownRight: right, overflow: [] as ShellAction[] };
  const primary = left.filter((a) => a.kind === "primary");
  let budget = width - primary.reduce((sum, a) => sum + widthOf(a), 0) - (hasSearch ? SEARCH_WIDTH : 0);
  const rest = [...left.filter((a) => a.kind !== "primary"), ...right];
  if (rest.reduce((sum, a) => sum + widthOf(a), 0) > budget) budget -= MORE_WIDTH;
  const shown = new Set<string>();
  for (const action of rest) {
    if (budget >= widthOf(action)) { shown.add(action.id); budget -= widthOf(action); } else break;
  }
  return {
    shownLeft: left.filter((a) => a.kind === "primary" || shown.has(a.id)),
    shownRight: right.filter((a) => shown.has(a.id)),
    overflow: rest.filter((a) => !shown.has(a.id)),
  };
}

function ActionButton({ action }: { action: ShellAction }) {
  return <>{action.anchor}<button type="button" className={`page-shell-action page-shell-action--${action.kind} ${action.kind === "primary" ? "primary" : "secondary"}`}
    disabled={action.disabled} title={action.disabled ? action.disabledReason : undefined} onClick={(event) => action.run(event.currentTarget)}>{action.label}</button></>;
}

/**
 * Kayıt kartının başlık yeri (taslak 08: konum satırından hemen sonra özet): başlık yalnız ekran okuyucuya görünür. Çalışma
 * alanının işlem çubuğu yuvası yine bu sayfada kaydedilir ki çubuk ve çalışma alanının ikinci konum satırı sayfanın üstüne
 * düşmesin; yuva öğesinin kendisi CSS ile gizlidir (`.page-shell.is-record .nx-action-bar-slot`). Gizleyen `hidden` niteliği ya
 * da gizli bir ata olamaz: `ActionBarSlot` onları görmez sayar ve çubuğu çalışma alanının yerine geri koyar.
 */
function RecordTitle({ title }: { title: string }) {
  const { slotRef } = useSlotBreadcrumb();
  return <>
    <h1 className="page-shell-sr-title">{title}</h1>
    <ActionBarSlot slotRef={slotRef} />
  </>;
}

/**
 * Kalıplı sayfaların ortak kabuğu: başlık ve konum satırı, işlem çubuğu, alt bilgi. `head`: başlık ile işlem çubuğu arasında
 * çizilen içerik (Kayıt kartının ek alanı ve kayıt özeti). `variant: "record"`: görünen başlık satırı, çalışma alanının konum
 * satırı ve işlem çubuğu çizilmez; başlık özettedir.
 */
export function PageShell({ title, crumbs, count, actions, search, head, footer, children, variant = "list" }: {
  title: string; crumbs: string[]; count?: number | null; actions: ShellAction[]; search?: ReactNode; head?: ReactNode; footer?: ReactNode; children?: ReactNode;
  variant?: "list" | "record";
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[entries.length - 1]?.contentRect.width;
      if (typeof next === "number") setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { shownLeft, shownRight, overflow } = splitByWidth(actions, width, search != null);
  useEffect(() => { if (!overflow.length) setMenuOpen(false); }, [overflow.length]);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  // Menü dışına tıklama ya da Escape menüyü kapatır.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  return <div className={`page-shell list-v2${variant === "record" ? " is-record" : ""}`}>
    {crumbs.length > 0 && <nav className="page-shell-crumbs" aria-label="Konum">{crumbs.map((crumb, index) => <span key={`${index}:${crumb}`}>{crumb}</span>)}</nav>}
    {variant === "record" ? <RecordTitle title={title} /> : <ListPageHeader title={title} count={count} />}
    {head}
    <div className="page-shell-bar" ref={barRef} role="toolbar" aria-label="İşlemler">
      <div className="page-shell-bar-left">{shownLeft.map((action) => <ActionButton key={action.id} action={action} />)}</div>
      {search != null && <div className="page-shell-bar-search">{search}</div>}
      <div className="page-shell-bar-right">
        {overflow.length > 0 && <div className="page-shell-more" ref={moreRef}>
          <button type="button" ref={moreButtonRef} className="secondary" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Diğer işlemler" onClick={() => setMenuOpen((open) => !open)}>⋯</button>
          {menuOpen && <div className="page-shell-menu" role="menu">{overflow.map((action) => <button key={action.id} type="button" role="menuitem" className={`page-shell-menu-item page-shell-menu-item--${action.kind}`}
            disabled={action.disabled} title={action.disabled ? action.disabledReason : undefined} onClick={() => { setMenuOpen(false); moreButtonRef.current?.focus(); action.run(moreButtonRef.current ?? undefined); }}>{action.label}</button>)}</div>}
        </div>}
        {shownRight.map((action) => <ActionButton key={action.id} action={action} />)}
      </div>
    </div>
    <div className="page-shell-body">{children}</div>
    {footer != null && <ListFooter>{footer}</ListFooter>}
  </div>;
}
