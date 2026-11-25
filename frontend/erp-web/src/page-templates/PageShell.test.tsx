import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPageTemplate } from "./pageTemplate";
import { orderShellActions, PageShell, type ShellAction } from "./PageShell";

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
});
