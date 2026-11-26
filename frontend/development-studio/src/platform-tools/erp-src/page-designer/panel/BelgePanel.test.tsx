// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDocumentModel } from "../documentModelClient";
import { newBelgeTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { BELGE_FORBIDDEN, BelgePanel, type BelgePanelProps } from "./BelgePanel";
import { belgeParts } from "./belgeModel";
import { belgeTestModel } from "./belgeTestModel";
import { TemplateInspector } from "./TemplateInspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const model = parseDocumentModel(belgeTestModel)!;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
function show(props: Partial<BelgePanelProps> = {}) {
  const onChange = vi.fn();
  const def = newBelgeTemplateDefinition() as unknown as ModelDefinition;
  const el = mount(<BelgePanel def={def} model={model} catalog={null} name="Satış siparişi" onRename={() => {}} onChange={onChange} {...props}/>);
  return { onChange, el };
}
const lastDef = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)![0] as ModelDefinition;
const list = (el: HTMLElement, label: string) => el.querySelector(`ul[aria-label="${label}"]`) as HTMLElement | null;
const box = (scope: HTMLElement, label: string) => scope.querySelector(`input[type="checkbox"][aria-label="${label}"]`) as HTMLInputElement;
const click = (element: Element) => act(() => { (element as HTMLElement).click(); });

describe("Belge paneli (taslak 09)", () => {
  it("hangi belge sabittir; formül, sorgu ya da komut ayarı yoktur", () => {
    const { el } = show();
    expect(el.querySelector(".cpanel-fixed b")?.textContent).toBe("Satış siparişi");
    expect(el.textContent).toContain("kalıp seçilirken belirlendi");
    for (const word of [/formül/i, /sorgu/i, /komut/i]) expect(el.textContent).not.toMatch(word);
  });

  it("kolon işaretlemek tanımı değiştirir; zorunlu kutu kilitlidir", () => {
    const { el, onChange } = show();
    const columns = list(el, "Satır kolonları")!;
    expect(box(columns, "Birim fiyat").disabled).toBe(true);
    click(box(columns, "KDV dâhil"));
    expect(belgeParts(lastDef(onChange)).columns).toContain("isVatIncluded");
  });

  it("hesaplanan ve onaydan sonra etiketleri görünür", () => {
    const { el } = show();
    const text = list(el, "Satır kolonları")!.textContent ?? "";
    expect(text).toContain("hesaplanan");
    expect(text).toContain("onaydan sonra");
  });

  it("✎ ile etiket değişir; Enter kaydeder", () => {
    const { el, onChange } = show();
    click(el.querySelector('button[aria-label="Müşteri başlığını değiştir"]')!);
    const input = el.querySelector('input[aria-label="Müşteri etiketi"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Cari");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(belgeParts(lastDef(onChange)).fieldLabels).toEqual({ customerId: "Cari" });
  });

  it("izin yokken uyarı görünür ve seçimler düzenlenemez", () => {
    const { el } = show({ model: "forbidden" });
    expect(el.querySelector('[role="alert"]')?.textContent).toBe(BELGE_FORBIDDEN);
    expect(list(el, "Satır kolonları")).toBeNull();
  });

  it("durumdan gelen eylemler kilitli, Görünüm KDV dökümünü kapatır", () => {
    const { el, onChange } = show();
    expect([...el.querySelectorAll(".cpanel-chip.is-locked")].map((x) => x.textContent)).toEqual(["Onayla", "Onayı geri al", "İptal et"]);
    const vat = [...el.querySelectorAll('input[role="switch"]')].find((x) => x.parentElement?.textContent?.includes("KDV'yi orana göre dök"))!;
    click(vat);
    expect(belgeParts(lastDef(onChange)).vatBreakdown).toBe(false);
  });

  it("TemplateInspector belge parçasını Belge paneline yönlendirir", () => {
    const def = newBelgeTemplateDefinition() as unknown as ModelDefinition;
    const lines = def.components.find((c) => c.type === "documentLines")!;
    const el = mount(<TemplateInspector component={lines} legacy={<p>eski</p>} list={null} onPlace={() => {}}
      belge={{ def, model, catalog: null, name: "Sipariş", onRename: () => {}, onChange: () => {} }}/>);
    expect(list(el, "Satır kolonları")).not.toBeNull();
    expect(el.textContent).not.toContain("eski");
  });
});
