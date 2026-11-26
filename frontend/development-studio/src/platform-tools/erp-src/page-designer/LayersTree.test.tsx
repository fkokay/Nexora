import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LayoutTemplate } from "lucide-react";
import LayersTree, { type LayerItem } from "./LayersTree";

const tree = (items: LayerItem[]) => renderToString(<LayersTree items={items} search="" canEdit selectedId={null} onSelect={() => {}} dropTarget={null}
  onDragStart={() => {}} onDragEnd={() => {}} onDragOver={() => {}} onDrop={() => {}} onMove={() => {}}/>).replace(/<!-- -->/g, "");

describe("LayersTree", () => {
  it("shows the grid span only when the layer has one", () => {
    // Kalıplı sayfada ızgara genişliği danışmana gösterilmez (span verilmez); kalıpsız sayfada görünür.
    const legacy = tree([{ id: "a", label: "Liste", typeLabel: "Izgara", span: 6, icon: LayoutTemplate, children: [] }]);
    expect(legacy).toContain("Izgara · 6/12");
    const templated = tree([{ id: "b", label: "Durum", typeLabel: "Bölüm", icon: LayoutTemplate, children: [] }]);
    expect(templated).toContain("Bölüm");
    expect(templated).not.toContain("/12");
  });
});
