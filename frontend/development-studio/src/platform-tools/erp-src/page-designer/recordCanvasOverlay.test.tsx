// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCatalog, CatalogColumn, CatalogDataSource } from "./catalogClient";
import type { CanvasBlock } from "./erpCanvasProtocol";
import { newRecordTemplateDefinition } from "./pageTemplates";
import type { ModelDefinition } from "./panel/listPanelModel";
import { RECORD_COLUMN_DRAG } from "./panel/RecordFieldList";
import { addTab, chooseRecordSource, fieldKey, recordTabs } from "./panel/recordModel";
import { RecordCanvasOverlay, RECORD_FIELD_DRAG } from "./recordCanvasOverlay";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
  ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("kod", "Cari kodu", { key: true }), col("unvan", "Unvan"), col("vade", "Vade gün", { type: "int" }), col("adres", "Adres")],
};
const catalog: ActiveCatalog = { version: "1", dataSources: [cari], actions: [] };
const base = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog);
const def = addTab(base).def;
const tabsId = def.components.find((component) => component.type === "tabs")!.id;
const [genel, ikinci] = recordTabs(def).map((tab) => tab.ids[0]);
const inputOf = (column: string) => def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column)!.id;
const inputs = (id: string) => def.components.find((component) => component.id === id)!.props.inputs as string[];

const box = (id: string, x: number, y: number, width: number, height: number): CanvasBlock => ({ id, x, y, width, height });
const blocks: CanvasBlock[] = [
  box(`${tabsId}#tab0`, 10, 40, 80, 30), box(`${tabsId}#tab1`, 90, 40, 100, 30),
  box(genel, 10, 100, 880, 200),
  ...inputs(genel).map((id, index) => box(id, 20 + (index % 2) * 440, 140 + Math.floor(index / 2) * 60, 420, 40)),
];

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); });
  mounted = [];
});
function render(ui: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(ui));
  return host;
}
function setup(over: Record<string, unknown> = {}) {
  const props = {
    blocks, def, activeTab: 0, selection: { kind: "page" } as const,
    onChange: vi.fn(), onSelect: vi.fn(), onShowTab: vi.fn(), onDropColumn: vi.fn(), onDropBlock: vi.fn(), ...over,
  };
  const outerClick = vi.fn();
  const host = render(<div onClick={outerClick}><RecordCanvasOverlay {...props}/></div>);
  const root = host.querySelector(".rco") as HTMLElement;
  return { host, root, props, outerClick };
}
const move = (el: Element, x: number, y: number) =>
  act(() => void el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y })));
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const button = (host: HTMLElement, label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
function dragEvent(type: string, x: number, y: number, data: Record<string, string>) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { clientX: number; clientY: number; dataTransfer: unknown };
  Object.assign(event, { clientX: x, clientY: y, dataTransfer: { types: Object.keys(data), getData: (key: string) => data[key] ?? "", dropEffect: "none" } });
  return event;
}

describe("RecordCanvasOverlay", () => {
  it("overlay column buttons change columns", () => {
    const { host, root, props, outerClick } = setup();
    expect(button(host, "3 kolon")).toBeNull();
    move(root, 400, 110);
    expect(button(host, "2 kolon")?.getAttribute("aria-pressed")).toBe("true");
    click(button(host, "3 kolon")!);
    const next = props.onChange.mock.calls[0][0] as ModelDefinition;
    expect(next.components.find((component) => component.id === genel)!.props.columns).toBe(3);
    // Denetim tıklaması tuvalin seçimine ulaşmaz.
    expect(outerClick).not.toHaveBeenCalled();
  });

  it("seçili bölümde kolon düğmeleri üstüne gelmeden de görünür", () => {
    const { host } = setup({ selection: { kind: "section", id: genel } });
    expect(button(host, "1 kolon")).not.toBeNull();
  });

  it("clicking a tab box sends showTab", () => {
    const { host, props, outerClick } = setup();
    click(button(host, "Yeni sekme sekmesini göster")!);
    expect(props.onShowTab).toHaveBeenCalledWith(1);
    expect(outerClick).not.toHaveBeenCalled();
  });

  it("plus section adds section to active tab", () => {
    const { host, props } = setup();
    click(button(host, "+ Bölüm ekle")!);
    const next = props.onChange.mock.calls[0][0] as ModelDefinition;
    const ids = recordTabs(next)[0].ids;
    expect(ids).toHaveLength(2);
    expect(recordTabs(next)[1].ids).toEqual([ikinci]);
    expect(props.onSelect).toHaveBeenCalledWith({ kind: "section", id: ids[1] });
  });

  it("+ Sekme yeni sekmeyi ekler ve gösterir", () => {
    const { host, props } = setup();
    const add = button(host, "+ Sekme")!;
    expect(add.style.left).toBe("196px");
    click(add);
    expect(recordTabs(props.onChange.mock.calls[0][0] as ModelDefinition)).toHaveLength(3);
    expect(props.onShowTab).toHaveBeenCalledWith(2);
  });

  it("alanın ✕'i alanı kaldırır", () => {
    const { host, root, props } = setup();
    const unvan = inputOf("unvan");
    const at = blocks.find((item) => item.id === unvan)!;
    move(root, at.x + 10, at.y + 10);
    click(button(host, "Alanı kaldır")!);
    const next = props.onChange.mock.calls[0][0] as ModelDefinition;
    expect(next.components.some((component) => component.id === unvan)).toBe(false);
  });

  it("sol listeden sürüklenen kolon bölüme sırasıyla bırakılır, çizgi görünür", () => {
    const { root, host, props } = setup();
    const over = dragEvent("dragover", 30, 150, { [RECORD_COLUMN_DRAG]: "" });
    act(() => void root.dispatchEvent(over));
    expect(over.defaultPrevented).toBe(true);
    expect(host.querySelector(".rco-marker")).not.toBeNull();
    act(() => void root.dispatchEvent(dragEvent("drop", 30, 150, { [RECORD_COLUMN_DRAG]: "adres" })));
    expect(props.onDropColumn).toHaveBeenCalledWith("adres", genel, 0);
    expect(host.querySelector(".rco-marker")).toBeNull();
  });

  it("kartta taşınan alan aynı bölümde sonraki sıraya kayar", () => {
    const { root, props } = setup();
    const first = inputs(genel)[0];
    // Üçüncü alanın (ikinci satır, sol) önü: dizide 2; alan önden çıktığı için 1.
    act(() => void root.dispatchEvent(dragEvent("drop", 30, 210, { [RECORD_FIELD_DRAG]: first })));
    const next = props.onChange.mock.calls[0][0] as ModelDefinition;
    expect((next.components.find((component) => component.id === genel)!.props.inputs as string[]).indexOf(first)).toBe(1);
  });

  it("düzenleme kapalıyken yalnız sekme geçişi kalır", () => {
    const { host, root } = setup({ disabled: true });
    move(root, 400, 110);
    expect(button(host, "2 kolon")).toBeNull();
    expect(button(host, "+ Bölüm ekle")).toBeNull();
    expect(button(host, "+ Sekme")).toBeNull();
    expect(button(host, "Genel sekmesini göster")).not.toBeNull();
  });
});
