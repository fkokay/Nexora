// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasBlock } from "./erpCanvasProtocol";
import { FREE_PALETTE_REFUSED, FREE_SECTIONS_PLACE } from "./freeCanvasHit";
import { FreeCanvasOverlay, FREE_BLOCK_DRAG, FREE_ITEM_DRAG, PALETTE_DRAG } from "./freeCanvasOverlay";
import { newFreeTemplateDefinition } from "./pageTemplates";
import { consultantPaletteKey } from "./panel/consultantPalette";
import { addBlock, addItem, addTab, FREE_BLOCK_FULL, freeBlocks, freeTabs, MAX_BLOCK_MEMBERS } from "./panel/freeModel";
import type { ModelDefinition } from "./panel/listPanelModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = <T extends object>(result: T | { reason: string }): T => {
  if ("reason" in result) throw new Error(`beklenmeyen neden: ${result.reason}`);
  return result;
};
const box = (id: string, x: number, y: number, width: number, height: number): CanvasBlock => ({ id, x, y, width, height });
const members = (def: ModelDefinition, id: string) => def.components.find((component) => component.id === id)!.props.members as string[];

let base = newFreeTemplateDefinition() as unknown as ModelDefinition;
const first = freeBlocks(base)[0].id;
const ids: string[] = [];
for (const kind of ["text", "indicator"] as const) { const added = ok(addItem(base, kind, { blockId: first })); base = added.def; ids.push(added.itemId); }
const secondAdded = ok(addBlock(base, first));
const def = secondAdded.def;
const second = secondAdded.blockId;
const [text, metric] = ids;
const blocks: CanvasBlock[] = [
  box(first, 0, 0, 800, 200), box(text, 10, 40, 380, 60), box(metric, 410, 40, 380, 60),
  box(second, 0, 220, 800, 100),
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
  const props = { blocks, def, paletteKey: vi.fn(() => null as string | null), onChange: vi.fn(), onSelect: vi.fn(), onRefuse: vi.fn(), ...over };
  const host = render(<FreeCanvasOverlay {...props}/>);
  return { host, root: host.querySelector(".fco") as HTMLElement, props };
}
function dragEvent(type: string, x: number, y: number, data: Record<string, string>) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { clientX: number; clientY: number; dataTransfer: unknown };
  Object.assign(event, { clientX: x, clientY: y, dataTransfer: { types: Object.keys(data), getData: (key: string) => data[key] ?? "", setData: vi.fn(), dropEffect: "none", effectAllowed: "all" } });
  return event;
}
const fire = (el: Element, event: Event) => { act(() => void el.dispatchEvent(event)); return event; };
const lastChange = (props: { onChange: ReturnType<typeof vi.fn> }) => props.onChange.mock.calls.at(-1)![0] as ModelDefinition;

describe("FreeCanvasOverlay", () => {
  it("bileşeni bölüm içinde taşır; bırakma çizgisi görünür ve bırakınca kalkar", () => {
    const { root, host, props } = setup();
    const data = { [FREE_ITEM_DRAG]: metric };
    expect(fire(root, dragEvent("dragover", 50, 60, data)).defaultPrevented).toBe(true);
    expect(host.querySelector(".fco-marker")).not.toBeNull();
    fire(root, dragEvent("drop", 50, 60, data));
    expect(members(lastChange(props), first)).toEqual([metric, text]);
    expect(props.onSelect).toHaveBeenCalledWith(metric);
    expect(host.querySelector(".fco-marker")).toBeNull();
  });

  it("bileşeni başka bölüme taşır; tek bölümde kalır", () => {
    const { root, props } = setup();
    fire(root, dragEvent("drop", 100, 250, { [FREE_ITEM_DRAG]: text }));
    const next = lastChange(props);
    expect(members(next, first)).toEqual([metric]);
    expect(members(next, second)).toEqual([text]);
  });

  it("paletten bırakılan bileşen bölümün o sırasına girer ve seçilir", () => {
    const { root, props } = setup({ paletteKey: () => consultantPaletteKey("image") });
    const data = { [PALETTE_DRAG]: consultantPaletteKey("image") };
    fire(root, dragEvent("drop", 500, 60, data));
    const next = lastChange(props);
    const added = members(next, first)[1];
    expect(next.components.find((component) => component.id === added)!.type).toBe("image");
    expect(props.onSelect).toHaveBeenCalledWith(added);
  });

  it("paletten Bölümler bölümler arasına yeni bölüm açar", () => {
    const { root, props } = setup({ paletteKey: () => consultantPaletteKey("sections") });
    fire(root, dragEvent("drop", 100, 50, { [PALETTE_DRAG]: consultantPaletteKey("sections") }));
    const order = freeBlocks(lastChange(props)).map((block) => block.id);
    expect(order).toHaveLength(3);
    expect(order.slice(1)).toEqual([first, second]);
  });

  it("dolu bölüme bırakma gerekçeyle reddedilir; çizgi kırmızı ve nedeni yazılı", () => {
    let full = def;
    for (let index = members(full, first).length; index < MAX_BLOCK_MEMBERS; index++) full = ok(addItem(full, "text", { blockId: first })).def;
    const outsider = ok(addItem(full, "text", { blockId: second }));
    const { root, host, props } = setup({ def: outsider.def });
    const data = { [FREE_ITEM_DRAG]: outsider.itemId };
    // Sürükleme kaplamadan başlar: taşınan bileşen bilinir.
    fire(host.querySelector(`.fco-item[data-id="${outsider.itemId}"]`) ?? root, dragEvent("dragstart", 0, 0, {}));
    expect(fire(root, dragEvent("dragover", 50, 60, data)).defaultPrevented).toBe(true);
    expect(host.querySelector(".fco-refusal")?.textContent).toBe(FREE_BLOCK_FULL);
    fire(root, dragEvent("drop", 50, 60, data));
    expect(props.onRefuse).toHaveBeenCalledWith(FREE_BLOCK_FULL);
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("bölümü sürükleyerek sıralar; sekmeli sayfada sekme düğmesine bırakınca o sekmeye taşır", () => {
    const { root, props } = setup();
    fire(root, dragEvent("drop", 100, 30, { [FREE_BLOCK_DRAG]: second }));
    expect(freeBlocks(lastChange(props)).map((block) => block.id)).toEqual([second, first]);

    const tabbed = ok(addTab(def)).def;
    const tabsId = tabbed.components.find((component) => component.type === "tabs")!.id;
    const tabBlocks = [box(`${tabsId}#tab0`, 0, 0, 80, 30), box(`${tabsId}#tab1`, 80, 0, 100, 30), ...blocks.map((b) => ({ ...b, y: b.y + 40 }))];
    const other = setup({ def: tabbed, blocks: tabBlocks });
    fire(other.root, dragEvent("drop", 100, 15, { [FREE_BLOCK_DRAG]: first }));
    const next = lastChange(other.props);
    expect(freeTabs(next)!.map((tab) => tab.blockIds)).toEqual([[second], [freeTabs(tabbed)![1].blockIds[0], first]]);
    expect(other.props.onSelect).toHaveBeenCalledWith(first);
  });

  it("üstüne gelinen bileşende tür etiketi, bölümde 'Bölüm'", () => {
    const { root, host } = setup();
    act(() => void root.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 450, clientY: 60 })));
    expect(host.querySelector(".fco-tag")?.textContent).toBe("Gösterge");
    act(() => void root.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 300 })));
    expect(host.querySelector(".fco-tag")?.textContent).toBe("Bölüm");
  });

  it("düzenleme kapalıyken sürükleme yok, bırakma kabul edilmez", () => {
    const { root, host, props } = setup({ disabled: true });
    expect(host.querySelector(".fco-item")).toBeNull();
    expect(fire(root, dragEvent("dragover", 50, 60, { [FREE_ITEM_DRAG]: metric })).defaultPrevented).toBe(false);
    fire(root, dragEvent("drop", 50, 60, { [FREE_ITEM_DRAG]: metric }));
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("paletten bölüm dışına bırakma kabul edilir ama gerekçeyle reddedilir", () => {
    const { root, host, props } = setup({ paletteKey: () => consultantPaletteKey("text") });
    const data = { [PALETTE_DRAG]: consultantPaletteKey("text") };
    expect(fire(root, dragEvent("dragover", 100, 600, data)).defaultPrevented).toBe(true);
    expect(host.querySelector(".fco-refusal")?.textContent).toBe(FREE_PALETTE_REFUSED);
    fire(root, dragEvent("drop", 100, 600, data));
    expect(props.onRefuse).toHaveBeenCalledWith(FREE_PALETTE_REFUSED);
    expect(props.onChange).not.toHaveBeenCalled();
    const sections = setup({ paletteKey: () => consultantPaletteKey("sections") });
    fire(sections.root, dragEvent("drop", 900, 50, { [PALETTE_DRAG]: consultantPaletteKey("sections") }));
    expect(sections.props.onRefuse).toHaveBeenCalledWith(FREE_SECTIONS_PLACE);
  });

  it("Katmanlar'dan ya da başka yerden gelen sürükleme yok sayılır", () => {
    const { root, props } = setup();
    expect(fire(root, dragEvent("dragover", 50, 60, { "application/x-nexora-index": "0" })).defaultPrevented).toBe(false);
    expect(props.onChange).not.toHaveBeenCalled();
  });
});
