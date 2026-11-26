import { describe, expect, it } from "vitest";
import type { CanvasBlock } from "./erpCanvasProtocol";
import type { ModelComponent, ModelDefinition } from "./panel/listPanelModel";
import { recordDropAt, recordDropMarker } from "./recordCanvasHit";

const field = (id: string): ModelComponent => ({ id, type: "input", name: id, props: { slot: "field", label: id } });
const section = (id: string, inputs: string[]): ModelComponent => ({ id, type: "formCard", name: id, props: { slot: "section", title: id, columns: 3, inputs } });
// s1: ERP alanları okuma sırasıyla çizer (aşağıdaki kutular: a b c / d); h koşulla gizli, kutusu yok. Sıra `inputs` dizisindedir.
export const def: ModelDefinition = {
  schemaVersion: 2, queries: [],
  components: [
    { id: "t", type: "tabs", name: "t", props: { slot: "tabs", tabs: ["Genel=s1,s2,l1", "Diğer=s3"] } },
    section("s1", ["a", "h", "b", "c", "d"]), section("s2", ["e"]), section("s3", []),
    field("a"), field("h"), field("b"), field("c"), field("d"), field("e"),
    { id: "l1", type: "dataTable", name: "l1", props: { slot: "lines" } },
  ],
};
const box = (id: string, x: number, y: number, width: number, height: number): CanvasBlock => ({ id, x, y, width, height });
export const blocks: CanvasBlock[] = [
  box("t", 0, 40, 900, 600), box("t#tab0", 10, 40, 80, 30), box("t#tab1", 90, 40, 80, 30),
  box("s1", 10, 100, 880, 200),
  box("a", 20, 140, 280, 40), box("b", 310, 140, 280, 40), box("c", 600, 140, 280, 40), box("d", 20, 200, 280, 40),
  box("s2", 10, 320, 880, 100), box("e", 20, 360, 280, 40),
  box("l1", 10, 440, 880, 150),
];

describe("recordDropAt", () => {
  it("recordDropAt picks section under pointer and index by reading order", () => {
    expect(recordDropAt(blocks, def, 0, { x: 30, y: 150 }, "field")).toEqual({ kind: "field", sectionId: "s1", index: 0 });
    expect(recordDropAt(blocks, def, 0, { x: 500, y: 150 }, "field")).toEqual({ kind: "field", sectionId: "s1", index: 3 });
    expect(recordDropAt(blocks, def, 0, { x: 850, y: 150 }, "field")).toEqual({ kind: "field", sectionId: "s1", index: 4 });
    // İkinci satır: d'nin önü / arkası.
    expect(recordDropAt(blocks, def, 0, { x: 30, y: 210 }, "field")).toEqual({ kind: "field", sectionId: "s1", index: 4 });
    expect(recordDropAt(blocks, def, 0, { x: 600, y: 210 }, "field")).toEqual({ kind: "field", sectionId: "s1", index: 5 });
    // Bölüm başlığının üstü: ilk alanın önü.
    expect(recordDropAt(blocks, def, 0, { x: 600, y: 110 }, "field")).toEqual({ kind: "field", sectionId: "s1", index: 0 });
    expect(recordDropAt(blocks, def, 0, { x: 500, y: 380 }, "field")).toEqual({ kind: "field", sectionId: "s2", index: 1 });
  });

  it("recordDropAt returns block position between sections for lines", () => {
    expect(recordDropAt(blocks, def, 0, { x: 400, y: 310 }, "block")).toEqual({ kind: "block", tabIndex: 0, index: 1 });
    expect(recordDropAt(blocks, def, 0, { x: 400, y: 120 }, "block")).toEqual({ kind: "block", tabIndex: 0, index: 0 });
    expect(recordDropAt(blocks, def, 0, { x: 400, y: 560 }, "block")).toEqual({ kind: "block", tabIndex: 0, index: 3 });
    expect(recordDropAt(blocks, def, 0, { x: 400, y: 900 }, "block")).toEqual({ kind: "block", tabIndex: 0, index: 3 });
  });

  it("recordDropAt null outside any section", () => {
    expect(recordDropAt(blocks, def, 0, { x: 400, y: 310 }, "field")).toBeNull();
    expect(recordDropAt(blocks, def, 0, { x: 400, y: 500 }, "field")).toBeNull();
    // Etkin sekmede olmayan bölüm (s3 Diğer'de) hedef olmaz; sekme yoksa blok da bırakılmaz.
    expect(recordDropAt([...blocks, box("s3", 10, 700, 880, 50)], def, 0, { x: 400, y: 720 }, "field")).toBeNull();
    expect(recordDropAt(blocks, def, 5, { x: 400, y: 310 }, "block")).toBeNull();
    expect(recordDropAt(blocks, { ...def, components: def.components.filter((c) => c.type !== "tabs") }, 0, { x: 400, y: 310 }, "block")).toBeNull();
    // Kartın yanı: blok kutularının dışında.
    expect(recordDropAt(blocks, def, 0, { x: 2000, y: 310 }, "block")).toBeNull();
  });

  it("boş bölüme ve boş sekmeye bırakılır", () => {
    const empty = [box("s3", 10, 100, 880, 80)];
    expect(recordDropAt(empty, def, 1, { x: 300, y: 140 }, "field")).toEqual({ kind: "field", sectionId: "s3", index: 0 });
    expect(recordDropAt([], def, 1, { x: 300, y: 140 }, "block")).toEqual({ kind: "block", tabIndex: 1, index: 1 });
  });
});

describe("recordDropMarker", () => {
  it("alanın önüne dikey, bloklar arasına yatay çizgi", () => {
    expect(recordDropMarker(blocks, def, { kind: "field", sectionId: "s1", index: 1 })).toEqual({ x: 308, y: 140, width: 3, height: 40 });
    expect(recordDropMarker(blocks, def, { kind: "field", sectionId: "s1", index: 5 })).toEqual({ x: 301, y: 200, width: 3, height: 40 });
    expect(recordDropMarker(blocks, def, { kind: "block", tabIndex: 0, index: 1 })).toEqual({ x: 10, y: 309, width: 880, height: 3 });
    expect(recordDropMarker(blocks, def, { kind: "block", tabIndex: 0, index: 3 })).toEqual({ x: 10, y: 594, width: 880, height: 3 });
    // Gizli h'nin yeri: sonraki görünen alan (b) önü.
    expect(recordDropMarker(blocks, def, { kind: "field", sectionId: "s1", index: 2 })).toEqual({ x: 308, y: 140, width: 3, height: 40 });
    expect(recordDropMarker([box("s3", 10, 100, 880, 80)], def, { kind: "field", sectionId: "s3", index: 0 })).toEqual({ x: 18, y: 108, width: 3, height: 64 });
    expect(recordDropMarker(blocks, def, null)).toBeNull();
  });
});
