import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LayoutTemplate } from "lucide-react";
import LayersTree, { type LayerItem } from "./LayersTree";

const tree = (items: LayerItem[], extra: Partial<Parameters<typeof LayersTree>[0]> = {}) => renderToString(<LayersTree items={items} search="" canEdit selectedId={null} onSelect={() => {}} dropTarget={null}
  onDragStart={() => {}} onDragEnd={() => {}} onDragOver={() => {}} onDrop={() => {}} onMove={() => {}} {...extra}/>).replace(/<!-- -->/g, "");

describe("LayersTree", () => {
  it("shows the grid span only when the layer has one", () => {
    // Kalıplı sayfada ızgara genişliği danışmana gösterilmez (span verilmez); kalıpsız sayfada görünür.
    const legacy = tree([{ id: "a", label: "Liste", typeLabel: "Izgara", span: 6, icon: LayoutTemplate, children: [] }]);
    expect(legacy).toContain("Izgara · 6/12");
    const templated = tree([{ id: "b", label: "Durum", typeLabel: "Bölüm", icon: LayoutTemplate, children: [] }]);
    expect(templated).toContain("Bölüm");
    expect(templated).not.toContain("/12");
  });

  it("without reordering rows are not draggable and ↑/↓ follow canMove", () => {
    const items: LayerItem[] = ["a", "b", "c"].map((id) => ({ id, label: id, typeLabel: "Metin", icon: LayoutTemplate, children: [] }));
    expect(tree(items)).toContain('draggable="true"');
    const html = tree(items, { reorderable: false, canMove: (index, _id, delta) => index === 1 && delta === -1 });
    expect(html).not.toContain('draggable="true"');
    const disabled = [...html.matchAll(/<button[^>]*aria-label="(Yukarı|Aşağı) taşı"[^>]*>/g)].map((match) => match[0].includes("disabled"));
    // a↑ a↓ b↑ b↓ c↑ c↓: yalnız b↑ açık.
    expect(disabled).toEqual([true, true, false, true, true, true]);
  });
});
