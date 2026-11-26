// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewPageDialog from "./NewPageDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; });
function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(node));
  return host;
}
const presets = [{ id: "blank", label: "Boş sayfa", description: "" }, { id: "rapor", label: "Rapor", description: "Özet" }];

describe("NewPageDialog", () => {
  it("new page dialog offers exactly Liste, Kayıt kartı, Belge, Serbest", () => {
    const html = renderToString(<NewPageDialog mode="create" templates={presets} takenCodes={[]} onCancel={() => {}} onConfirm={() => {}}/>);
    expect([...html.matchAll(/role="radio"[^>]*>.*?<b>([^<]*)<\/b>/g)].map((match) => match[1])).toEqual(["Liste", "Kayıt kartı", "Belge", "Serbest"]);
    expect(html).not.toContain("Eski tasarımcı");
    expect(html).not.toContain("is-legacy");
    expect(html).not.toContain("Boş sayfa");

    const onConfirm = vi.fn();
    const host = mount(<NewPageDialog mode="create" templates={presets} takenCodes={[]} onCancel={() => {}} onConfirm={onConfirm}/>);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((item) => item.textContent?.startsWith("Belge"))!.click());
    // Kalıp seçilince bileşen ön ayarı sorulmaz.
    expect(host.textContent).not.toContain("Boş sayfa");
    const name = host.querySelector<HTMLInputElement>("input")!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Siparişler"); name.dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(onConfirm).toHaveBeenCalledWith({ name: "Siparişler", code: "siparisler", templateId: "blank", pageTemplate: "belge" });
  });

  it("Şablonla başla still opens for an empty templateless page", () => {
    const onConfirm = vi.fn();
    const host = mount(<NewPageDialog mode="template" templates={presets} takenCodes={[]} onCancel={() => {}} onConfirm={onConfirm}/>);
    expect(host.querySelector('[role="dialog"]')!.getAttribute("aria-label")).toBe("Şablonla başla");
    expect(host.textContent).toContain("Boş sayfa");
    expect(host.textContent).not.toContain("Sayfa kalıbı");
    act(() => [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((item) => item.textContent?.startsWith("Rapor"))!.click());
    act(() => host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(onConfirm).toHaveBeenCalledWith({ name: "", code: "", templateId: "rapor" });
  });
});
