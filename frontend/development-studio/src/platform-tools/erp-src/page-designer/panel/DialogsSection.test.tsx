// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCatalog } from "../catalogClient";
import { newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import { DialogsSection } from "./DialogsSection";
import { FreePanel } from "./FreePanel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { RecordPanel } from "./RecordPanel";
import { TemplateInspector } from "./TemplateInspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const c = (id: string, type: string, props: ModelComponent["props"] = {}, children?: ModelComponent[]): ModelComponent =>
  ({ id, type, name: id, props, ...(children ? { children } : {}) });
const q = (id: string, kind: PageQuery["kind"], extra: Partial<PageQuery> = {}): PageQuery => ({ id, name: id, kind, sql: `-- ${id}`, parameters: [], runOn: kind === "read" ? "load" : "manual", ...extra });
const catalog: ActiveCatalog = { version: "1", dataSources: [], actions: [
  { code: "teslimGuncelle", label: "Teslim tarihini güncelle", kind: "update", target: "page", source: "sql", erpOperation: null, parameters: [], confirmText: null }] };

const page = (): ModelDefinition => ({ ...(newListTemplateDefinition() as unknown as ModelDefinition),
  queries: [q("siparisler", "read"), q("siparis", "read"), q("kaydet", "update", { action: "teslimGuncelle" } as Partial<PageQuery>), q("ekle", "insert")],
  components: [
    c("liste", "dataTable", { slot: "list", query: "siparisler", rowActions: ["acDugmesi"], rowOpenAction: "acDugmesi", openParam: "orderId" }),
    c("acDugmesi", "button", { slot: "rowActions", text: "Aç", actionType: "openDialog", dialogId: "siparisPenceresi" }),
    c("komutlar", "actionBar", { slot: "commands", openButton: "acDugmesi" }),
    c("siparisPenceresi", "dialog", { slot: "dialogs", presentation: "dialog", size: "xl", title: "Satış siparişi", contains: ["ozet", "durum", "sekmeler"] }),
    c("ozet", "recordHeader", { slot: "dialog", title: "Kayıt özeti" }),
    c("durum", "section", { slot: "dialog", title: "Durum" }, [c("rozet", "badge", { text: "Taslak" })]),
    c("sekmeler", "tabs", { slot: "dialog", tabs: ["Bilgiler=kalem"] }),
    c("kalem", "dataTable", { slot: "dialog", query: "siparis" }),
    c("notPenceresi", "dialog", { slot: "dialogs", title: "Not", size: "sm", saveQuery: "kaydet", contains: ["metin"] }),
    c("metin", "text", { slot: "dialog", text: "Not" }),
    c("notDugmesi", "button", { slot: "actions", text: "Not ekle", actionType: "openDialog", dialogId: "notPenceresi" }),
  ] });

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; });
function Harness({ initial, onChange, onShowDialog }: { initial: ModelDefinition; onChange?: (def: ModelDefinition) => void; onShowDialog?: (id: string | null) => void }) {
  const [def, setDef] = useState(initial);
  return <DialogsSection def={def} catalog={catalog} onShowDialog={onShowDialog} onChange={(next) => { onChange?.(next); setDef(next); }}/>;
}
function mount(initial = page(), handlers: { onChange?: (def: ModelDefinition) => void; onShowDialog?: (id: string | null) => void } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(<Harness initial={initial} {...handlers}/>));
  return host;
}
const rowOf = (host: HTMLElement, title: string) =>
  [...host.querySelectorAll<HTMLButtonElement>("[data-part='dialog-row']")].find((row) => row.textContent?.includes(title))!;
const byLabel = <T extends Element>(host: HTMLElement, label: string) => host.querySelector<T>(`[aria-label="${label}"]`)!;
function setValue(element: HTMLSelectElement, value: string) {
  act(() => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("DialogsSection (taslak 12)", () => {
  it("lists every window with its size and kind", () => {
    const html = renderToString(<DialogsSection def={page()} catalog={catalog} onChange={() => {}}/>);
    expect(html).toContain("Pencereler");
    expect(html).toContain("Satış siparişi");
    expect(html).toContain("Çok büyük · görünüm");
    expect(html).toContain("Küçük · form");
    expect(html).toContain("+ Pencere ekle");
    expect(html).not.toContain("Pencere ayarları");
  });

  it("selecting a window shows its settings and asks the canvas to open it; deselecting closes it", () => {
    const onShowDialog = vi.fn();
    const host = mount(page(), { onShowDialog });
    act(() => rowOf(host, "Satış siparişi").click());
    expect(onShowDialog).toHaveBeenLastCalledWith("siparisPenceresi");
    const text = host.textContent!;
    for (const label of ["Pencere ayarları", "Başlık", "Boyut", "Kaydet eylemi", "Kaydedince kapat", "Açılışta alanları temizle", "Kayıttan sonra yenilenecek veriler", "İçerik (sırası)"])
      expect(text).toContain(label);
    const sizes = [...byLabel<HTMLElement>(host, "Boyut").querySelectorAll("button")].map((button) => button.textContent);
    expect(sizes).toEqual(["Küçük", "Orta", "Büyük", "Çok büyük"]);
    expect(text).not.toContain("Tam ekran");
    expect(text).not.toContain("Çekmece");
    expect(byLabel<HTMLSelectElement>(host, "Kaydet eylemi").selectedOptions[0].textContent).toBe("Yok (görünüm penceresi)");
    expect([...host.querySelectorAll("[data-part='dialog-contents'] li")].map((item) => item.textContent?.replace(/[↑↓]/g, ""))).toEqual(["Kayıt özeti", "Durum", "sekmeler"]);
    expect(text).toContain("Açan düğmeler: Görüntüle (komut), sayfa bağlantısı orderId");
    act(() => rowOf(host, "Satış siparişi").click());
    expect(onShowDialog).toHaveBeenLastCalledWith(null);
    expect(host.textContent).not.toContain("Pencere ayarları");
  });

  it("writes the window settings", () => {
    const onChange = vi.fn();
    const host = mount(page(), { onChange });
    act(() => rowOf(host, "Not").click());
    const dialog = () => (onChange.mock.lastCall![0] as ModelDefinition).components.find((item) => item.id === "notPenceresi")!.props;
    expect(host.textContent).toContain("Açan düğmeler: Not ekle");
    expect(byLabel<HTMLSelectElement>(host, "Kaydet eylemi").selectedOptions[0].textContent).toBe("Teslim tarihini güncelle");
    act(() => [...byLabel<HTMLElement>(host, "Boyut").querySelectorAll("button")].find((button) => button.textContent === "Büyük")!.click());
    expect(dialog().size).toBe("lg");
    act(() => byLabel<HTMLInputElement>(host, "Kaydedince kapat").click());
    expect(dialog().closeOnSave).toBe(false);
    act(() => byLabel<HTMLInputElement>(host, "Açılışta alanları temizle").click());
    expect(dialog().resetOnOpen).toBe(false);
    setValue(byLabel<HTMLSelectElement>(host, "Kayıttan sonra yenilenecek veriler"), "siparisler");
    expect(dialog().refreshQueries).toEqual(["siparisler"]);
    setValue(byLabel<HTMLSelectElement>(host, "Kaydet eylemi"), "");
    expect(dialog().saveQuery).toBeUndefined();
    expect(rowOf(host, "Not").textContent).toContain("görünüm");
  });

  it("reorders the contents with the arrows", () => {
    const onChange = vi.fn();
    const host = mount(page(), { onChange });
    act(() => rowOf(host, "Satış siparişi").click());
    act(() => host.querySelector<HTMLButtonElement>("[data-part='dialog-contents'] button[aria-label='Durum aşağı']")!.click());
    const def = onChange.mock.lastCall![0] as ModelDefinition;
    expect(def.components.find((item) => item.id === "siparisPenceresi")!.props.contains).toEqual(["ozet", "sekmeler", "durum"]);
    expect(def.components.some((item) => item.id === "kalem")).toBe(true);
  });

  it("+ Pencere ekle adds an empty view window and opens it", () => {
    const onChange = vi.fn();
    const onShowDialog = vi.fn();
    const host = mount(page(), { onChange, onShowDialog });
    act(() => [...host.querySelectorAll("button")].find((button) => button.textContent === "+ Pencere ekle")!.click());
    const def = onChange.mock.lastCall![0] as ModelDefinition;
    const added = def.components.filter((item) => item.type === "dialog").at(-1)!;
    expect(added.props).toMatchObject({ slot: "dialogs", title: "Yeni pencere", size: "lg" });
    expect(onShowDialog).toHaveBeenLastCalledWith(added.id);
    expect(rowOf(host, "Yeni pencere").textContent).toContain("Büyük · görünüm");
  });

  it("is read-only when disabled", () => {
    const onChange = vi.fn();
    const html = renderToString(<DialogsSection def={page()} catalog={catalog} disabled onChange={onChange}/>);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\+ Pencere ekle/);
  });

  it("sits in the list, record and free page panels after Komutlar", () => {
    const list = renderToString(<TemplateInspector component={null} legacy={null} tokens={[]} onPlace={() => {}}
      list={{ definition: page(), catalog, catalogStatus: "ready", onChange: () => {} } as never} page={{ name: "Siparişler", pages: [] }}/>);
    expect(list.indexOf("Pencereler")).toBeGreaterThan(list.indexOf("Komutlar"));
    expect(list).toContain("Çok büyük · görünüm");
    const free = renderToString(<FreePanel def={newFreeTemplateDefinition() as unknown as ModelDefinition} selection={{ kind: "page" }} catalog={catalog} onChange={() => {}} onSelect={() => {}}/>);
    expect(free.indexOf("Pencereler")).toBeGreaterThan(free.indexOf("Komutlar"));
    const record = renderToString(<RecordPanel def={newRecordTemplateDefinition() as unknown as ModelDefinition} catalog={catalog} selection={{ kind: "page" }} onChange={() => {}} onSelect={() => {}}/>);
    expect(record.indexOf("Pencereler")).toBeGreaterThan(record.indexOf("Komutlar"));
  });
});
