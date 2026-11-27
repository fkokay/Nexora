// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newRecordTemplateDefinition, newListTemplateDefinition } from "../pageTemplates";
import { moveInGroup, removeFromGroup } from "./dialogsModel";
import { GROUP_NOTE, GroupPanel } from "./GroupPanel";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { TemplateInspector } from "./TemplateInspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const c = (id: string, type: string, props: ModelComponent["props"] = {}, children?: ModelComponent[]): ModelComponent =>
  ({ id, type, name: id, props, ...(children ? { children } : {}) });
const group = () => c("durum", "section", { slot: "dialog" }, [c("rozetTaslak", "badge", { text: "Taslak" }), c("rozetAcik", "badge", { text: "Onaylı" }),
  c("belgeZinciri", "text", { text: "Zincir metni" })]);
const page = (base = newListTemplateDefinition() as unknown as ModelDefinition): ModelDefinition => ({ ...base, components: [...base.components,
  c("pencere", "dialog", { slot: "dialogs", presentation: "dialog", title: "Sipariş", contains: ["durum", "islemler"] }), group(),
  c("islemler", "card", { slot: "dialog", title: "İşlemler", description: "Siparişin işlemleri", visibleWhen: "x == 1" }, [c("yenile", "button", { text: "Yenile" })])] });

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; });
function Harness({ initial, onChange }: { initial: ModelDefinition; onChange: (def: ModelDefinition) => void }) {
  const [def, setDef] = useState(initial);
  return <GroupPanel def={def} groupId="durum" onChange={(next) => { onChange(next); setDef(next); }}/>;
}
function mount(onChange: (def: ModelDefinition) => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(<Harness initial={page()} onChange={onChange}/>));
  return host;
}
const members = (host: HTMLElement) => [...host.querySelectorAll("[data-part='group-members'] li > span:first-child")].map((item) => item.textContent);

describe("GroupPanel (taslak 12)", () => {
  it("shows title, description, when, members in order and the allowed-types note", () => {
    const html = renderToString(<GroupPanel def={page()} groupId="durum" onChange={() => {}}/>);
    for (const label of ["Grup", "Başlık", "Açıklama", "Ne zaman görünsün", "Her zaman", "Üyeler"]) expect(html).toContain(label);
    expect(GROUP_NOTE).toBe("Grup içine eklenebilenler: rozet, başlık, metin, gösterge, uyarı, düğme, form, tablo, detay paneli, sekmeler.");
    expect(html).toContain(GROUP_NOTE);
    const host = mount(() => {});
    expect(members(host)).toEqual(["Taslak", "Onaylı", "Zincir metni"]);
  });

  it("uses the given condition editor instead of Her zaman", () => {
    const html = renderToString(<GroupPanel def={page()} groupId="islemler" onChange={() => {}} visibility={<i className="kosul">koşul</i>}/>);
    expect(html).toContain("kosul");
    expect(html).not.toContain("Her zaman");
    expect(html).toContain("Siparişin işlemleri");
  });

  it("+ ekle offers only the group child types (no section, card or dialog)", () => {
    const host = mount(() => {});
    const options = [...host.querySelectorAll<HTMLOptionElement>("select[aria-label='Üye ekle'] option")].filter((option) => option.value).map((option) => option.value);
    expect(options).toEqual(["badge", "heading", "text", "metric", "alert", "button", "formCard", "dataTable", "contextPanel", "tabs"]);
  });

  it("add, remove and move members through dialogsModel", () => {
    const onChange = vi.fn();
    const host = mount(onChange);
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Onaylı yukarı']")!.click());
    expect(onChange.mock.lastCall![0]).toEqual({ ...page(), components: moveInGroup(page().components, "durum", "rozetAcik", -1) });
    expect(members(host)).toEqual(["Onaylı", "Taslak", "Zincir metni"]);
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Taslak kaldır']")!.click());
    expect(members(host)).toEqual(["Onaylı", "Zincir metni"]);
    expect(onChange.mock.lastCall![0].components).toEqual(removeFromGroup(moveInGroup(page().components, "durum", "rozetAcik", -1), "durum", "rozetTaslak"));
    const select = host.querySelector<HTMLSelectElement>("select[aria-label='Üye ekle']")!;
    act(() => { select.value = "alert"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    const kids = (onChange.mock.lastCall![0] as ModelDefinition).components.find((item) => item.id === "durum")!.children as ModelComponent[];
    expect(kids.map((item) => item.type)).toEqual(["badge", "text", "alert"]);
  });

  it("writes title and description", () => {
    const onChange = vi.fn();
    const host = mount(onChange);
    const input = [...host.querySelectorAll<HTMLLabelElement>("label")].find((label) => label.textContent?.startsWith("Başlık"))!.querySelector("input")!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Durum"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect((onChange.mock.lastCall![0] as ModelDefinition).components.find((item) => item.id === "durum")!.props.title).toBe("Durum");
  });

  it("TemplateInspector opens the group panel for a group in a window (list and record card)", () => {
    for (const def of [page(), page(newRecordTemplateDefinition() as unknown as ModelDefinition)]) {
      const component = def.components.find((item) => item.id === "durum")!;
      const record = def.template && (def.template as { name: string }).name === "record"
        ? { def, catalog: null, onChange: () => {}, onSelect: () => {} } : null;
      const html = renderToString(<TemplateInspector component={component} legacy={null} tokens={[]} onPlace={() => {}} record={record}
        list={{ definition: def, catalog: null, catalogStatus: "ready", onChange: () => {} } as never}/>);
      expect(html).toContain(GROUP_NOTE);
    }
  });
});
