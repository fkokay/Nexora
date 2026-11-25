import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cardFields, listMode, useListMode, visibleColumns } from "./listResponsive";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("listMode thresholds", () => {
  it("maps widths to modes", () => {
    expect(listMode(721)).toBe("full");
    expect(listMode(600)).toBe("narrow");
    expect(listMode(400)).toBe("cards");
  });
  it("treats exactly 720 as full and exactly 480 as narrow", () => {
    expect(listMode(720)).toBe("full");
    expect(listMode(719.9)).toBe("narrow");
    expect(listMode(480)).toBe("narrow");
    expect(listMode(479.9)).toBe("cards");
    expect(listMode(0)).toBe("cards");
  });
});

describe("cardFields", () => {
  const numeric = new Set(["Tutar", "Bakiye"]);
  it("picks title, two sub fields and first numeric", () => {
    expect(cardFields(["Ad", "Şehir", "Tür", "Tutar", "Not"], numeric)).toEqual({
      title: "Ad", sub: ["Şehir", "Tür"], amount: "Tutar",
    });
  });
  it("skips a numeric column among the sub fields", () => {
    expect(cardFields(["Ad", "Tutar", "Şehir", "Tür"], numeric)).toEqual({
      title: "Ad", sub: ["Şehir"], amount: "Tutar",
    });
  });
  it("handles fewer than three columns", () => {
    expect(cardFields(["Ad"], numeric)).toEqual({ title: "Ad", sub: [], amount: null });
    expect(cardFields(["Ad", "Şehir"], numeric)).toEqual({ title: "Ad", sub: ["Şehir"], amount: null });
    expect(cardFields([], numeric)).toEqual({ title: "", sub: [], amount: null });
  });
  it("keeps a numeric title column as title and takes the next numeric as amount", () => {
    expect(cardFields(["Tutar", "Şehir", "Bakiye"], numeric)).toEqual({
      title: "Tutar", sub: ["Şehir"], amount: "Bakiye",
    });
  });
});

describe("visibleColumns", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `K${i + 1}`);
  it("full and cards give all, narrow gives first four", () => {
    expect(visibleColumns(twenty, "full")).toHaveLength(20);
    expect(visibleColumns(twenty, "cards")).toHaveLength(20);
    expect(visibleColumns(twenty, "narrow")).toEqual(["K1", "K2", "K3", "K4"]);
    expect(visibleColumns(["a", "b"], "narrow")).toEqual(["a", "b"]);
  });
});

describe("useListMode", () => {
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const mode = useListMode(ref);
    return createElement("div", { ref, "data-testid": "box" }, mode);
  }

  it("follows ResizeObserver widths", () => {
    let callback: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    class MockRO {
      constructor(cb: ResizeObserverCallback) { callback = cb; }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", MockRO);
    const { unmount } = render(createElement(Probe));
    expect(screen.getByTestId("box").textContent).toBe("full");
    const emit = (width: number) => act(() => {
      callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    emit(600);
    expect(screen.getByTestId("box").textContent).toBe("narrow");
    emit(400);
    expect(screen.getByTestId("box").textContent).toBe("cards");
    emit(900);
    expect(screen.getByTestId("box").textContent).toBe("full");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("defaults to full without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(createElement(Probe));
    expect(screen.getByTestId("box").textContent).toBe("full");
  });
});
