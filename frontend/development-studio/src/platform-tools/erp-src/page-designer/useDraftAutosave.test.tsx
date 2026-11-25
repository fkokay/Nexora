// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftAutosave } from "./useDraftAutosave";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Options = Parameters<typeof useDraftAutosave>[0];
type Result = ReturnType<typeof useDraftAutosave>;

let mounted: { root: Root; host: HTMLElement }[] = [];
function renderHook(initial: Options) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const latest: { current: Result } = { current: { revision: -1, saving: false } };
  function Probe(props: Options) {
    latest.current = useDraftAutosave(props);
    return null;
  }
  act(() => root.render(<Probe {...initial} />));
  return { result: latest, rerender: (next: Options) => act(() => root.render(<Probe {...next} />)) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  mounted.forEach(({ root, host }) => {
    act(() => root.unmount());
    host.remove();
  });
  mounted = [];
  vi.useRealTimers();
});

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("useDraftAutosave", () => {
  it("bekleme süresi sonunda bir kez kaydeder", async () => {
    const save = vi.fn(async () => true);
    const { result, rerender } = renderHook({ enabled: true, changeKey: {}, save });
    rerender({ enabled: true, changeKey: {}, save });
    rerender({ enabled: true, changeKey: {}, save });
    rerender({ enabled: true, changeKey: {}, save });
    await advance(799);
    expect(save).not.toHaveBeenCalled();
    await advance(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.revision).toBe(1);
    expect(result.current.saving).toBe(false);
  });

  it("kapalıyken kaydetmez", async () => {
    const save = vi.fn(async () => true);
    const { result, rerender } = renderHook({ enabled: false, changeKey: {}, save });
    rerender({ enabled: false, changeKey: {}, save });
    await advance(2000);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.revision).toBe(0);
  });

  it("ilk değer kayıt tetiklemez", async () => {
    const save = vi.fn(async () => true);
    renderHook({ enabled: true, changeKey: {}, save });
    await advance(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it("başarısız kayıt revision artırmaz", async () => {
    const save = vi.fn(async () => false);
    const { result, rerender } = renderHook({ enabled: true, changeKey: {}, save });
    rerender({ enabled: true, changeKey: {}, save });
    await advance(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.revision).toBe(0);
  });

  it("kayıt sürerken gelen değişiklik sıraya girer", async () => {
    let active = 0;
    let overlapped = false;
    let releaseFirst: (value: boolean) => void = () => {};
    const save = vi.fn(() => {
      active++;
      if (active > 1) overlapped = true;
      const done = (value: boolean) => { active--; return value; };
      if (save.mock.calls.length === 1) return new Promise<boolean>((resolve) => { releaseFirst = (value) => resolve(done(value)); });
      return Promise.resolve(done(true));
    });
    const { result, rerender } = renderHook({ enabled: true, changeKey: {}, save });
    rerender({ enabled: true, changeKey: {}, save });
    await advance(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.saving).toBe(true);
    rerender({ enabled: true, changeKey: {}, save });
    await advance(2000);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { releaseFirst(true); });
    await advance(800);
    expect(save).toHaveBeenCalledTimes(2);
    expect(overlapped).toBe(false);
    expect(result.current.revision).toBe(2);
    expect(result.current.saving).toBe(false);
  });

  it("güncel save işlevini çağırır", async () => {
    const first = vi.fn(async () => true);
    const second = vi.fn(async () => true);
    const { rerender } = renderHook({ enabled: true, changeKey: {}, save: first });
    rerender({ enabled: true, changeKey: {}, save: first });
    rerender({ enabled: true, changeKey: {}, save: second });
    await advance(800);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
