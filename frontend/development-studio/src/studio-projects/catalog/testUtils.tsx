import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); });
  mounted = [];
});

export async function render(ui: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(ui));
  return host;
}

export const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find(b => b.textContent?.trim().includes(text)) as HTMLButtonElement | undefined;

export const click = async (el: Element | undefined) => {
  if (!el) throw new Error("öğe bulunamadı");
  await act(async () => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

export const field = <T extends HTMLElement = HTMLInputElement>(host: HTMLElement, label: string, index = 0) =>
  host.querySelectorAll<T>(`[aria-label="${label}"]`)[index];

export async function type(el: HTMLElement | undefined, value: string) {
  if (!el) throw new Error("alan bulunamadı");
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

export const flush = () => act(async () => { await Promise.resolve(); });
