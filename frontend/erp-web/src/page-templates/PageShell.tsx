import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import { tooltipText, useActionTooltip } from "../action-bar/ActionTooltip";
import { useOptionalCommandRegistry, ViewKeyContext } from "../commands/CommandProvider";
import { formatShortcut, MORE_MENU_SHORTCUT } from "../commands/shortcuts";
import { ListFooter } from "../list-page/ListFooter";
import { ListPageHeader } from "../list-page/ListPageHeader";
import "./page-templates.css";

/** "⋯" menüsünün `Diğer` kısmındaki bir öğe (eski çubuğun İşlemler menüsü: `moreButtons`, CSV). */
export type ShellMenuItem = { id: string; label: string; shortcut?: string; disabledReason?: string; run: () => void };

export type ShellAction = {
  /** Kabuktaki kimlik (React anahtarı, genişlik bölüşümü); komut düğmelerinde ad alanlıdır (`cmd:save`). */
  id: string;
  /** Komut düğmesinin komut kimliği (`save`, `save-and-new`): `data-command` budur; sayfa düğmesinde yoktur. */
  command?: string;
  label: string;
  kind: "primary" | "normal" | "danger";
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Komutun kısayolu (ör. "Ctrl+S"): düğmede rozet yoktur; üzerine gelince ya da odakta "<Etiket> · <Kısayol>", pasifken
   * "<Neden> · <Kısayol>" ipucu çıkar. Kısayollu pasif düğme `aria-disabled`'dır ki ipucu fareyle de görünsün.
   */
  shortcut?: string;
  /** `opener`: tıklanan düğme (menüden çalışınca "⋯" düğmesi); açılan pencere kapanınca odak ona döner. */
  run: (opener?: HTMLElement) => void;
  /** Düğmenin hemen önüne konan görünmez işaret (Studio tuvalinde seçim için); menüde çizilmez. */
  anchor?: ReactNode;
};

/**
 * Komutlu kabuğun ek ayarları (kalıplı sayfanın `commands` çubuğu varken): tek "⋯" menüsünün `Diğer` kısmı ve çubuğun tuval
 * işareti. Çubuğu olmayan kalıplı sayfa bunu vermez; kabuk o zaman Alt+İ'yi üstlenmez (Karar 5).
 */
export type ShellCommandsProps = { menu: ShellMenuItem[]; moreMenuHidden: boolean; barAnchor?: ReactNode };

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
function splitByWidth(actions: ShellAction[], width: number | null, hasSearch: boolean, hasMenu: boolean) {
  const { left, right } = orderShellActions(actions);
  if (width === null) return { shownLeft: left, shownRight: right, overflow: [] as ShellAction[] };
  const primary = left.filter((a) => a.kind === "primary");
  let budget = width - primary.reduce((sum, a) => sum + widthOf(a), 0) - (hasSearch ? SEARCH_WIDTH : 0);
  const rest = [...left.filter((a) => a.kind !== "primary"), ...right];
  // "⋯" düğmesi `Diğer` öğeleri için zaten çiziliyorsa yeri baştan ayrılır.
  if (hasMenu || rest.reduce((sum, a) => sum + widthOf(a), 0) > budget) budget -= MORE_WIDTH;
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

const actionClass = (action: ShellAction) => `page-shell-action page-shell-action--${action.kind} ${action.kind === "primary" ? "primary" : "secondary"}`;

function ActionButton({ action }: { action: ShellAction }) {
  if (action.shortcut) return <CommandButton action={action} shortcut={action.shortcut} />;
  return <>{action.anchor}<button type="button" className={actionClass(action)}
    disabled={action.disabled} title={action.disabled ? action.disabledReason : undefined} onClick={(event) => action.run(event.currentTarget)}>{action.label}</button></>;
}

/** Kısayollu (komut) düğme: ipucu ortak çubuktaki gibidir; pasifken `aria-disabled` (fare ve odak ipucunu yine gösterir). */
function CommandButton({ action, shortcut }: { action: ShellAction; shortcut: string }) {
  const tip = useActionTooltip<HTMLButtonElement>(tooltipText(action.label, formatShortcut(shortcut, "tr"), action.disabled ? action.disabledReason : undefined));
  return <>{action.anchor}<button ref={tip.anchorRef} type="button" className={actionClass(action)} data-command={action.command ?? action.id}
    aria-keyshortcuts={shortcut} aria-disabled={action.disabled ? "true" : undefined} aria-describedby={tip.describedBy} {...tip.handlers}
    onClick={(event) => { if (!action.disabled) action.run(event.currentTarget); }}>{action.label}</button>{tip.tooltip}</>;
}

/** "⋯" düğmesi; kabuk Alt+İ'yi üstlendiyse ipucu "Diğer işlemler · Alt+İ". */
function MoreButton({ buttonRef, open, claimed, onToggle }: { buttonRef: { current: HTMLButtonElement | null }; open: boolean; claimed: boolean; onToggle: () => void }) {
  const tip = useActionTooltip<HTMLButtonElement>(claimed && !open ? tooltipText("Diğer işlemler", formatShortcut(MORE_MENU_SHORTCUT, "tr")) : "");
  const setRef = useCallback((node: HTMLButtonElement | null) => { buttonRef.current = node; tip.anchorRef.current = node; }, [buttonRef, tip.anchorRef]);
  return <>
    <button type="button" ref={setRef} className="secondary" aria-haspopup="menu" aria-expanded={open} aria-label="Diğer işlemler"
      aria-keyshortcuts={claimed ? MORE_MENU_SHORTCUT : undefined} aria-describedby={tip.describedBy} {...tip.handlers} onClick={onToggle}>⋯</button>
    {tip.tooltip}
  </>;
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
 *
 * `menu` (komutlu kabuk, bkz. `shellCommandActions`): tek "⋯" menüsü önce sığmayan düğmeleri, sonra ayraç ve `Diğer`
 * başlığıyla bu öğeleri gösterir; `moreMenuHidden` `Diğer` kısmını kaldırır, taşanlar kalır. `menu` verilmişken ve "⋯"
 * çiziliyken kabuk kendi görünümünün Alt+İ'sini üstlenir (`claimMoreMenu`); arka plandaki görünümün kabuğu yanıt vermez.
 */
export function PageShell({ title, crumbs, count, actions, search, head, footer, children, variant = "list", menu, moreMenuHidden = false, barAnchor }: {
  title: string; crumbs: string[]; count?: number | null; actions: ShellAction[]; search?: ReactNode; head?: ReactNode; footer?: ReactNode; children?: ReactNode;
  variant?: "list" | "record"; menu?: ShellMenuItem[]; moreMenuHidden?: boolean;
  /** Çubuğun başına konan görünmez işaret (Studio tuvali: sayfanın komut çubuğu bileşeni). */
  barAnchor?: ReactNode;
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
  const others = moreMenuHidden ? [] : menu ?? [];
  const { shownLeft, shownRight, overflow } = splitByWidth(actions, width, search != null, others.length > 0);
  const hasMore = overflow.length > 0 || others.length > 0;
  useEffect(() => { if (!hasMore) setMenuOpen(false); }, [hasMore]);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Alt+İ ile açılınca odak ilk öğeye gider (eski çubuğun İşlemler menüsü gibi).
  const focusFirst = useRef(false);
  useLayoutEffect(() => {
    if (!menuOpen || !focusFirst.current) return;
    focusFirst.current = false;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [menuOpen]);
  const registry = useOptionalCommandRegistry();
  const viewKey = useContext(ViewKeyContext);
  const claimed = registry != null && menu !== undefined && hasMore;
  const toggleFromKey = useCallback(() => {
    setMenuOpen((open) => { focusFirst.current = !open; return !open; });
  }, []);
  useEffect(() => (claimed ? registry!.claimMoreMenu(viewKey, toggleFromKey) : undefined), [claimed, registry, viewKey, toggleFromKey]);
  const closeAndRun = (run: () => void) => { setMenuOpen(false); moreButtonRef.current?.focus(); run(); };
  // Menü dışına tıklama ya da Escape menüyü kapatır; odak menüdeyse Escape onu "⋯" düğmesine geri verir (eski İşlemler gibi).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMenuOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const focused = !!menuRef.current?.contains(document.activeElement);
      setMenuOpen(false);
      if (focused) { event.preventDefault(); moreButtonRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  // Eski İşlemler menüsünün tuşları: oklar öğeler arasında (sonda başa döner), Home/End uçlara gider, Tab menüyü kapatır.
  // Pasif öğe odak almaz, atlanır.
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const focusAt = (next: number) => { event.preventDefault(); entries[(next + entries.length) % entries.length]?.focus(); };
    if (event.key === "Tab") setMenuOpen(false);
    else if (!entries.length) return;
    else if (event.key === "ArrowDown") focusAt(index + 1);
    else if (event.key === "ArrowUp") focusAt(index < 0 ? entries.length - 1 : index - 1);
    else if (event.key === "Home") focusAt(0);
    else if (event.key === "End") focusAt(entries.length - 1);
  };

  return <div className={`page-shell list-v2${variant === "record" ? " is-record" : ""}`}>
    {crumbs.length > 0 && <nav className="page-shell-crumbs" aria-label="Konum">{crumbs.map((crumb, index) => <span key={`${index}:${crumb}`}>{crumb}</span>)}</nav>}
    {variant === "record" ? <RecordTitle title={title} /> : <ListPageHeader title={title} count={count} />}
    {head}
    <div className="page-shell-bar" ref={barRef} role="toolbar" aria-label="İşlemler">
      <div className="page-shell-bar-left">{barAnchor}{shownLeft.map((action) => <ActionButton key={action.id} action={action} />)}</div>
      {search != null && <div className="page-shell-bar-search">{search}</div>}
      <div className="page-shell-bar-right">
        {hasMore && <div className="page-shell-more" ref={moreRef}>
          <MoreButton buttonRef={moreButtonRef} open={menuOpen} claimed={claimed} onToggle={() => setMenuOpen((open) => !open)} />
          {menuOpen && <div className="page-shell-menu" role="menu" ref={menuRef} onKeyDown={onMenuKeyDown}>
            {overflow.map((action) => <button key={action.id} type="button" role="menuitem" className={`page-shell-menu-item page-shell-menu-item--${action.kind}`}
              disabled={action.disabled} title={action.disabled ? action.disabledReason : undefined} aria-keyshortcuts={action.shortcut}
              onClick={() => closeAndRun(() => action.run(moreButtonRef.current ?? undefined))}>
              {action.shortcut ? <><span>{action.label}</span><kbd>{formatShortcut(action.shortcut, "tr")}</kbd></> : action.label}
            </button>)}
            {overflow.length > 0 && others.length > 0 && <div role="separator" className="page-shell-menu-separator" />}
            {others.length > 0 && <div role="presentation" className="page-shell-menu-heading">Diğer</div>}
            {others.map((item) => <button key={`more:${item.id}`} type="button" role="menuitem" className="page-shell-menu-item"
              disabled={item.disabledReason !== undefined} title={item.disabledReason} aria-keyshortcuts={item.shortcut} onClick={() => closeAndRun(item.run)}>
              {item.shortcut ? <><span>{item.label}</span><kbd>{formatShortcut(item.shortcut, "tr")}</kbd></> : item.label}
            </button>)}
          </div>}
        </div>}
        {shownRight.map((action) => <ActionButton key={action.id} action={action} />)}
      </div>
    </div>
    <div className="page-shell-body">{children}</div>
    {footer != null && <ListFooter>{footer}</ListFooter>}
  </div>;
}
