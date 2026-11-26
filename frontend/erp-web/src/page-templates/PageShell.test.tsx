import { act as rtlAct, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "../action-bar/ActionBar";
import { TOOLTIP_DELAY_MS } from "../action-bar/ActionTooltip";
import { CommandProvider, usePageCommands } from "../commands/CommandProvider";
import { KeepAliveViews } from "../WorkspaceComponents";
import { readPageTemplate } from "./pageTemplate";
import { orderShellActions, PageShell, type ShellAction, type ShellMenuItem } from "./PageShell";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const act = (id: string, label: string, kind: ShellAction["kind"]): ShellAction => ({ id, label, kind, run: () => {} });

describe("page templates", () => {
  it("orderShellActions puts primary first and danger last", () => {
    const { left, right } = orderShellActions([act("a", "a", "normal"), act("sil", "sil", "danger"), act("yeni", "yeni", "primary"), act("b", "b", "normal")]);
    expect(left.map((x) => x.id)).toEqual(["yeni", "a", "b"]);
    expect(right.map((x) => x.id)).toEqual(["sil"]);
  });

  it("readPageTemplate returns null for missing or unknown template", () => {
    expect(readPageTemplate(null)).toBeNull();
    expect(readPageTemplate({})).toBeNull();
    expect(readPageTemplate({ template: "list" })).toBeNull();
    expect(readPageTemplate({ template: { name: "grid" } })).toBeNull();
    expect(readPageTemplate({ template: { name: "list" } })).toEqual({ name: "list" });
  });

  it("PageShell renders title, count, crumbs and footer", () => {
    render(<PageShell title="Cari Hesaplar" crumbs={["Satış", "Cari"]} count={42} actions={[act("yeni", "Yeni", "primary")]} footer={<span>alt bilgi</span>}><p>içerik</p></PageShell>);
    expect(screen.getByRole("heading", { name: "Cari Hesaplar" })).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("Satış")).toBeTruthy();
    expect(screen.getByText("alt bilgi")).toBeTruthy();
    expect(screen.getByText("içerik")).toBeTruthy();
  });

  it("PageShell never hides the primary action in the overflow menu", () => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
      unobserve() {}
    });
    render(<PageShell title="T" crumbs={[]} actions={[act("yeni", "Yeni kayıt", "primary"), act("a", "Dışa aktar", "normal"), act("sil", "Sil", "danger")]} search={<input aria-label="ara" />}>x</PageShell>);
    expect(screen.getByRole("button", { name: "Yeni kayıt" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dışa aktar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    expect(screen.getByRole("menuitem", { name: "Dışa aktar" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sil" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Yeni kayıt" })).toBeNull();
  });

  const stubWidth = (width: number) => vi.stubGlobal("ResizeObserver", class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() { this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    disconnect() {}
    unobserve() {}
  });

  it("PageShell shows the normal actions that fit and moves the rest to the menu", () => {
    stubWidth(200);
    render(<PageShell title="T" crumbs={[]} actions={[act("yeni", "Yeni", "primary"), act("a", "A", "normal"), act("b", "B", "normal"), act("c", "C", "normal")]}>x</PageShell>);
    expect(screen.getByRole("button", { name: "Yeni" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "B" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["B", "C"]);
  });

  it("PageShell closes the overflow menu on outside click and on Escape", () => {
    stubWidth(100);
    render(<div><p>dışarı</p><PageShell title="T" crumbs={[]} actions={[act("yeni", "Yeni kayıt", "primary"), act("a", "Dışa aktar", "normal")]}>x</PageShell></div>);
    const more = screen.getByRole("button", { name: "Diğer işlemler" });
    fireEvent.click(more);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByText("dışarı"));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(more);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it('PageShell passes the clicked button as opener, and the "⋯" trigger when run from the menu', () => {
    stubWidth(100);
    const runs: (HTMLElement | undefined)[] = [];
    const run = (opener?: HTMLElement) => { runs.push(opener); };
    render(<PageShell title="T" crumbs={[]} actions={[{ id: 'yeni', label: 'Yeni kayıt', kind: 'primary', run }, { id: 'a', label: 'Dışa aktar', kind: 'normal', run }]}>x</PageShell>);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni kayıt' }));
    expect(runs[0]).toBe(screen.getByRole('button', { name: 'Yeni kayıt' }));
    const more = screen.getByRole('button', { name: 'Diğer işlemler' });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dışa aktar' }));
    expect(runs[1]).toBe(more);
    expect(document.activeElement).toBe(more);
  });

  const tip = (el: HTMLElement) => {
    fireEvent.mouseEnter(el);
    rtlAct(() => { vi.advanceTimersByTime(TOOLTIP_DELAY_MS); });
    const shown = screen.getByRole("tooltip");
    expect(el.getAttribute("aria-describedby")).toBe(shown.id);
    const text = shown.textContent;
    fireEvent.mouseLeave(el);
    return text;
  };

  it('PageShell shows "Kaydet · Ctrl+S" on hover and "Önce bir kayıt seçin · Enter" on a disabled Düzenle', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      render(<PageShell title="T" crumbs={[]} menu={[]} actions={[
        { id: "save", label: "Kaydet", kind: "primary", shortcut: "Ctrl+S", run: () => {} },
        { id: "open", label: "Düzenle", kind: "normal", shortcut: "Enter", disabled: true, disabledReason: "Önce bir kayıt seçin", run },
        { id: "delete", label: "Sil", kind: "danger", shortcut: "Ctrl+Delete", run: () => {} },
      ]}>x</PageShell>);
      const save = screen.getByRole("button", { name: "Kaydet" });
      expect(save.textContent).toBe("Kaydet");
      expect(save.getAttribute("aria-keyshortcuts")).toBe("Ctrl+S");
      expect(tip(save)).toBe("Kaydet · Ctrl+S");
      const edit = screen.getByRole("button", { name: "Düzenle" });
      expect(edit.getAttribute("aria-disabled")).toBe("true");
      expect(tip(edit)).toBe("Önce bir kayıt seçin · Enter");
      fireEvent.click(edit);
      expect(run).not.toHaveBeenCalled();
      expect(tip(screen.getByRole("button", { name: "Sil" }))).toBe("Sil · Ctrl+Del");
    } finally {
      vi.useRealTimers();
    }
  });

  const commandActions = (): ShellAction[] => [
    { id: "save", label: "Kaydet", kind: "primary", shortcut: "Ctrl+S", run: () => {} },
    { id: "new", label: "Yeni", kind: "normal", shortcut: "F2", run: () => {} },
    { id: "refresh", label: "Yenile", kind: "normal", shortcut: "F5", run: () => {} },
    { id: "delete", label: "Sil", kind: "danger", shortcut: "Ctrl+Delete", run: () => {} },
  ];
  const menuItems = (teklif = vi.fn()): ShellMenuItem[] => [
    { id: "teklif", label: "Yeni teklif", run: teklif },
    { id: "csv", label: "CSV olarak dışa aktar", run: () => {} },
  ];
  const itemLabel = (item: HTMLElement) => item.querySelector("span")?.textContent ?? item.textContent;

  it("overflow and Diğer share one ⋯ menu", () => {
    stubWidth(100);
    const teklif = vi.fn();
    render(<PageShell title="T" crumbs={[]} actions={commandActions()} menu={menuItems(teklif)}>x</PageShell>);
    expect(screen.getAllByRole("button", { name: "Diğer işlemler" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    const menu = screen.getByRole("menu");
    expect(Array.from(menu.children).map((el) => el.getAttribute("role") === "separator" ? "|" : el.getAttribute("role") === "menuitem" ? itemLabel(el as HTMLElement) : el.textContent))
      .toEqual(["Yeni", "Yenile", "Sil", "|", "Diğer", "Yeni teklif", "CSV olarak dışa aktar"]);
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    expect(screen.getByRole("menuitem", { name: /Sil/ }).textContent).toContain("Ctrl+Del");
    fireEvent.click(screen.getByRole("menuitem", { name: "Yeni teklif" }));
    expect(teklif).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the ⋯ menu keeps the legacy İşlemler keys: arrows move, Escape closes and returns focus to ⋯", () => {
    stubWidth(100);
    render(<CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={["v"]}><ShellView menu={[...menuItems(), { id: "pasif", label: "Pasife al", disabledReason: "Yetkiniz yok", run: () => {} }]} /></KeepAliveViews>
    </CommandProvider>);
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    const items = screen.getAllByRole("menuitem").filter((item) => !(item as HTMLButtonElement).disabled);
    expect(document.activeElement).toBe(items[0]);
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    // The disabled item is skipped; ArrowDown wraps to the first one.
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    const more = screen.getByRole("button", { name: "Diğer işlemler" });
    expect(document.activeElement).toBe(more);
    // Tıklamayla açılan menüde de odak ilk öğededir ve oklar çalışır.
    fireEvent.click(more);
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[1]);
  });

  it("a command button keeps its command id in data-command", () => {
    render(<PageShell title="T" crumbs={[]} menu={[]} actions={[{ id: "cmd:save", command: "save", label: "Kaydet", kind: "primary", shortcut: "Ctrl+S", run: () => {} }]}>x</PageShell>);
    expect(screen.getByRole("button", { name: "Kaydet" }).getAttribute("data-command")).toBe("save");
  });

  it("the ⋯ menu shows Diğer alone when everything fits", () => {
    render(<PageShell title="T" crumbs={[]} actions={commandActions()} menu={menuItems()}>x</PageShell>);
    expect(screen.getByRole("button", { name: "Yeni" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Diğer işlemler" }));
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.getByText("Diğer")).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Yeni teklif", "CSV olarak dışa aktar"]);
  });

  function ShellView({ menu, moreMenuHidden, narrow = true }: { menu: ShellMenuItem[]; moreMenuHidden?: boolean; narrow?: boolean }) {
    usePageCommands({ refresh: { run: () => {} }, shell: true });
    return <PageShell title="T" crumbs={[]} actions={narrow ? commandActions() : commandActions().slice(0, 1)} menu={menu} moreMenuHidden={moreMenuHidden}>x</PageShell>;
  }

  it("Alt+İ opens the ⋯ menu; moreMenuHidden hides Diğer but keeps overflow", () => {
    stubWidth(100);
    const tree = (moreMenuHidden: boolean) => <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={["v"]}><ShellView menu={menuItems()} moreMenuHidden={moreMenuHidden} /></KeepAliveViews>
    </CommandProvider>;
    const { rerender } = render(tree(false));
    expect(screen.queryByRole("toolbar", { name: "İşlemler çubuğu" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
    expect(screen.getByText("Diğer")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    expect(screen.queryByRole("menu")).toBeNull();
    rerender(tree(true));
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.queryByText("Diğer")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Yeni teklif" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Yenile/ })).toBeTruthy();
  });

  it("Alt+İ does nothing when the shell has no ⋯ menu", () => {
    render(<CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={["v"]}><ShellView menu={menuItems()} moreMenuHidden narrow={false} /></KeepAliveViews>
    </CommandProvider>);
    expect(screen.queryByRole("button", { name: "Diğer işlemler" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a shell in a background view does not answer Alt+İ", () => {
    const tree = (activeKey: string) => <CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey={activeKey} openKeys={["a", "b"]}>
        {activeKey === "a" ? <ShellView menu={[{ id: "a-item", label: "A menüsü", run: () => {} }]} narrow={false} />
          : <ShellView menu={[{ id: "b-item", label: "B menüsü", run: () => {} }]} narrow={false} />}
      </KeepAliveViews>
    </CommandProvider>;
    const { rerender } = render(tree("a"));
    rerender(tree("b"));
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    // The background view is `hidden`: query hidden elements too, so an opened background menu would be seen.
    expect(screen.getAllByRole("menu", { hidden: true })).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "B menüsü" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "A menüsü", hidden: true })).toBeNull();
  });

  it("a legacy shell without a menu does not claim Alt+İ", () => {
    stubWidth(100);
    render(<CommandProvider>
      <ActionBar locale="tr" />
      <KeepAliveViews activeKey="v" openKeys={["v"]}><PageShell title="T" crumbs={[]} actions={[act("yeni", "Yeni kayıt", "primary"), act("a", "Dışa aktar", "normal")]}>x</PageShell></KeepAliveViews>
    </CommandProvider>);
    expect(screen.getByRole("button", { name: "Diğer işlemler" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "İ", altKey: true });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
