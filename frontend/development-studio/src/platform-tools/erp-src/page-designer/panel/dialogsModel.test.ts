import { describe, expect, it } from "vitest";
import {
  addDialog, addToGroup, DIALOG_PART_TYPES, dialogOwners, dialogsOf, GROUP_CHILD_TYPES, dialogOpeners, groupAddableTypes, isGroup, moveInGroup, removeDialog, removeFromGroup, setDialogContents,
} from "./dialogsModel";
import type { ModelComponent } from "./listPanelModel";

const c = (id: string, type: string, props: ModelComponent["props"] = {}, children?: ModelComponent[]): ModelComponent =>
  ({ id, type, name: id, props, ...(children ? { children } : {}) });

/** `sales-orders` biçimi: sekme `kalemTablosu`'nu ve `teslimBolumu`'nu işaret eder (ikisi `contains`'ta değil); bölümün formu `teslimTarihi`'ni taşır. */
const salesOrders = (): ModelComponent[] => [
  c("liste", "dataTable", { slot: "list", query: "siparisler", rowOpenAction: "acDugmesi", openParam: "orderId" }),
  c("acDugmesi", "button", { slot: "rowActions", text: "Aç", actionType: "openDialog", dialogId: "pencere" }),
  c("pencere", "dialog", { slot: "dialogs", presentation: "dialog", size: "xl", title: "Satış siparişi", contains: ["ozet", "durum", "sekmeler"] }),
  c("ozet", "recordHeader", { slot: "dialog", title: "Özet" }),
  c("durum", "section", { slot: "dialog" }, [c("rozet", "badge", { text: "Taslak" }), c("zincir", "text", { text: "Zincir" })]),
  c("sekmeler", "tabs", { slot: "dialog", tabs: ["Bilgiler=kalemTablosu,teslimBolumu", "Geçmiş=irsaliyeler"] }),
  c("kalemTablosu", "dataTable", { slot: "dialog", query: "kalemler" }),
  c("teslimBolumu", "section", { slot: "dialog", title: "Teslim tarihi", visibleWhen: "x == 1" },
    [c("teslimFormu", "formCard", { inputs: ["teslimTarihi"] }), c("teslimKaydet", "button", { text: "Kaydet" })]),
  c("teslimTarihi", "input", { slot: "dialog", inputType: "date" }),
  c("irsaliyeler", "dataTable", { slot: "dialog", query: "sevkler" }),
];

describe("dialogsModel", () => {
  it("dialogOwners: contains ∪ the window's tabs ids ∪ inputs of the window's form cards (server DialogOwners)", () => {
    const owners = dialogOwners(salesOrders());
    expect([...owners.entries()].sort()).toEqual([
      ["durum", "pencere"], ["irsaliyeler", "pencere"], ["kalemTablosu", "pencere"], ["ozet", "pencere"], ["sekmeler", "pencere"],
      ["teslimBolumu", "pencere"], ["teslimTarihi", "pencere"]]);
    expect(dialogsOf(salesOrders()).map((item) => item.id)).toEqual(["pencere"]);
  });
  it("dialogOwners: an id two windows claim belongs to neither", () => {
    const components = [c("a", "dialog", { contains: ["x", "y"] }), c("b", "dialog", { contains: ["x"] }), c("x", "text"), c("y", "text")];
    expect([...dialogOwners(components).entries()]).toEqual([["y", "a"]]);
  });
  it("dialogOwners: tabs child of a contained group and a top-level form card's inputs", () => {
    const components = [c("p", "dialog", { contains: ["g", "f"] }),
      c("g", "card", {}, [c("t", "tabs", { tabs: ["A=m", "B="] })]), c("f", "formCard", { inputs: ["i1", "i2"] }), c("m", "metric"), c("i1", "input"), c("i2", "input")];
    expect([...dialogOwners(components).keys()].sort()).toEqual(["f", "g", "i1", "i2", "m"]);
  });

  it("addDialog → removeDialog returns to the starting definition", () => {
    const start = salesOrders();
    const { components, dialogId } = addDialog(start);
    const dialog = components.find((item) => item.id === dialogId)!;
    expect(dialog.type).toBe("dialog");
    const textId = (dialog.props.contains as string[])[0];
    expect(dialog.props).toEqual({ slot: "dialogs", presentation: "dialog", size: "lg", title: "Yeni pencere", contains: [textId] });
    expect(components.find((item) => item.id === textId)).toMatchObject({ type: "text", props: { slot: "dialog", text: "Pencere içeriği" } });
    expect(new Set(components.map((item) => item.id)).size).toBe(components.length);
    expect(removeDialog(components, dialogId)).toEqual(start);
  });
  it("removeDialog removes the window and only what it alone owns (tab targets and form inputs too)", () => {
    const left = removeDialog(salesOrders(), "pencere");
    expect(left.map((item) => item.id)).toEqual(["liste", "acDugmesi"]);
    const shared = [c("a", "dialog", { contains: ["x", "y"] }), c("b", "dialog", { contains: ["x"] }), c("x", "text"), c("y", "text")];
    expect(removeDialog(shared, "a").map((item) => item.id)).toEqual(["b", "x"]);
  });

  it("setDialogContents reorders contains; tab-referenced content stays", () => {
    const next = setDialogContents(salesOrders(), "pencere", ["sekmeler", "ozet", "durum"]);
    expect(next.find((item) => item.id === "pencere")!.props.contains).toEqual(["sekmeler", "ozet", "durum"]);
    expect(next.map((item) => item.id)).toEqual(salesOrders().map((item) => item.id));
    expect(dialogOwners(next).get("teslimBolumu")).toBe("pencere");
    // Bir kimlik çıkarılsa da sekmenin işaret ettiği içerik silinmez.
    const dropped = setDialogContents(salesOrders(), "pencere", ["ozet", "sekmeler"]);
    expect(dropped.some((item) => item.id === "kalemTablosu")).toBe(true);
    expect(dropped.find((item) => item.id === "pencere")!.props.contains).toEqual(["ozet", "sekmeler"]);
    // Bilinmeyen ya da başka pencereye ait kimlik eklenmez; aynı sıra aynı nesneyi döndürür.
    const same = salesOrders();
    expect(setDialogContents(same, "pencere", ["ozet", "durum", "sekmeler"])).toBe(same);
    expect(setDialogContents(same, "pencere", ["ozet", "yok", "durum", "sekmeler", "ozet"])).toBe(same);
  });

  it("group children: add / remove / move only the allowed types", () => {
    expect([...GROUP_CHILD_TYPES].sort()).toEqual(["alert", "badge", "button", "contextPanel", "dataTable", "formCard", "heading", "metric", "tabs", "text"]);
    expect(DIALOG_PART_TYPES.has("editableGrid")).toBe(false);
    const start = salesOrders();
    const group = () => start.find((item) => item.id === "durum")!;
    expect(isGroup(group())).toBe(true);
    expect(isGroup(start.find((item) => item.id === "ozet")!)).toBe(false);
    for (const type of ["section", "card", "dialog", "steps"]) expect(addToGroup(start, "durum", type)).toBe(start);
    const added = addToGroup(start, "durum", "button");
    const kids = added.find((item) => item.id === "durum")!.children as ModelComponent[];
    expect(kids.map((item) => item.type)).toEqual(["badge", "text", "button"]);
    expect(start.some((item) => item.id === kids[2].id)).toBe(false);
    expect(kids[2].id).not.toBe("durum");
    const moved = moveInGroup(added, "durum", kids[2].id, -1);
    expect((moved.find((item) => item.id === "durum")!.children as ModelComponent[]).map((item) => item.type)).toEqual(["badge", "button", "text"]);
    expect(moveInGroup(start, "durum", "rozet", -1)).toBe(start);
    const removed = removeFromGroup(added, "durum", kids[2].id);
    expect(removed).toEqual(start);
    expect(addToGroup(start, "ozet", "badge")).toBe(start);
  });

  it("+ ekle creates only server-valid members: standalone types, a table bound to the first read query; never empty form/tabs/detail panel", () => {
    const start = salesOrders();
    const read = [{ id: "kalemler", name: "kalemler", kind: "read" as const, parameters: [], runOn: "load" as const },
      { id: "sevkler", name: "sevkler", kind: "read" as const, parameters: [], runOn: "load" as const }];
    expect(groupAddableTypes([])).toEqual(["badge", "heading", "text", "metric", "alert", "button"]);
    expect(groupAddableTypes(read)).toEqual(["badge", "heading", "text", "metric", "alert", "button", "dataTable"]);
    const added = (type: string, queries = read) => {
      const kids = addToGroup(start, "durum", type, queries).find((item) => item.id === "durum")!.children as ModelComponent[];
      return kids.length > 2 ? { type: kids[2].type, props: kids[2].props } : null;
    };
    expect(added("badge")).toEqual({ type: "badge", props: { text: "Rozet" } });
    expect(added("heading")).toEqual({ type: "heading", props: { text: "Başlık" } });
    expect(added("text")).toEqual({ type: "text", props: { text: "Metin" } });
    expect(added("metric")).toEqual({ type: "metric", props: { title: "Gösterge", value: "—" } });
    expect(added("alert")).toEqual({ type: "alert", props: { text: "Uyarı" } });
    expect(added("button")).toEqual({ type: "button", props: { text: "Düğme" } });
    expect(added("dataTable")).toEqual({ type: "dataTable", props: { title: "Tablo", query: "kalemler" } });
    expect(added("dataTable", [])).toBeNull();
    for (const type of ["formCard", "tabs", "contextPanel"]) expect(added(type)).toBeNull();
  });

  it("new ids do not collide with query ids or names", () => {
    const queries = [{ id: "pencere", name: "pencereMetni", kind: "read" as const, parameters: [], runOn: "load" as const },
      { id: "q2", name: "badge", kind: "read" as const, parameters: [], runOn: "load" as const }];
    const { components, dialogId } = addDialog(salesOrders(), queries);
    const textId = (components.find((item) => item.id === dialogId)!.props.contains as string[])[0];
    for (const id of [dialogId, textId]) expect(["pencere", "pencereMetni"]).not.toContain(id);
    const kids = addToGroup(salesOrders(), "durum", "badge", queries).find((item) => item.id === "durum")!.children as ModelComponent[];
    expect(kids[2].id).not.toBe("badge");
  });

  it("dialogOpeners lists bound buttons (command name), and openParam links", () => {
    const components = [...salesOrders(), c("komutlar", "actionBar", { slot: "commands", openButton: "acDugmesi" }),
      c("grup", "card", { slot: "dialog" }, [c("icDugme", "button", { text: "Tekrar aç", actionType: "openDialog", dialogId: "pencere" })])];
    const def = { schemaVersion: 2 as const, queries: [], components };
    expect(dialogOpeners(def, "pencere")).toEqual(["Görüntüle (komut)", "Tekrar aç", "sayfa bağlantısı orderId"]);
    expect(dialogOpeners(def, "yok")).toEqual([]);
  });
});
