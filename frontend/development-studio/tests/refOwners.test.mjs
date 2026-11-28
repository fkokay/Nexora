// Pencere / form kartÄ± / yan filtre paneli tasarÄ±m ekranÄ± yardÄ±mcÄ±larÄ±nÄ±n denemeleri: `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  adoptRef, canOwnType, insertRef, moveRef, refIds, refLocation, refPlacementProblem, removeRef, stepRef,
} from "../src/platform-tools/erp-src/page-designer/refOwners.ts";

const here = dirname(fileURLToPath(import.meta.url));
const standardsDir = join(here, "../../../src/Hosts/AIERP.Api/SystemPages/Standards");

function componentLists(value, found = []) {
  if (Array.isArray(value)) { for (const item of value) componentLists(item, found); return found; }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (key === "components" && Array.isArray(item)) found.push(item);
    else componentLists(item, found);
  }
  return found;
}

const stockComponents = () => {
  const text = readFileSync(join(standardsDir, "inventory-stock.json"), "utf8");
  return componentLists(JSON.parse(text)).find((list) => list.some((component) => component.id === "hareketPenceresi"));
};

test("stock movement dialog keeps its form and tracking grid", () => {
  const components = stockComponents();
  assert.ok(components, "movement dialog definition exists");
  const before = JSON.stringify(components);
  const dialog = components.find((component) => component.id === "hareketPenceresi");
  assert.deepEqual(refIds(dialog), ["hareketFormu", "hareketTakipIzgarasi"]);
  const ids = refIds(dialog);
  for (const [index, id] of ids.entries()) {
    assert.deepEqual(refLocation(components, id), { ownerId: dialog.id, index });
    assert.deepEqual(moveRef(components, dialog.id, id, index), components);
    assert.deepEqual(adoptRef(components, dialog.id, id, index), components);
    assert.deepEqual(insertRef(components, dialog.id, id, 0), components);
    assert.equal(refPlacementProblem(components, dialog.id, { id, type: components.find((c) => c.id === id).type }), null);
  }
  const moved = moveRef(components, dialog.id, "hareketTakipIzgarasi", 0);
  assert.deepEqual(refIds(moved.find((component) => component.id === dialog.id)), ["hareketTakipIzgarasi", "hareketFormu"]);
  const restored = moveRef(moved, dialog.id, "hareketTakipIzgarasi", 2);
  assert.deepEqual(refIds(restored.find((component) => component.id === dialog.id)), ids);
});

test("standartlardaki bÃ¼tÃ¼n pencere/form kartÄ±/yan paneller iÃ§in iÅŸlemsiz Ã§aÄŸrÄ±lar aynÄ± diziyi dÃ¶ndÃ¼rÃ¼r", () => {
  for (const file of readdirSync(standardsDir).filter((name) => name.endsWith(".json"))) {
    for (const components of componentLists(JSON.parse(readFileSync(join(standardsDir, file), "utf8")))) {
      const before = JSON.stringify(components);
      for (const owner of components) {
        const ids = refIds(owner);
        for (const [index, id] of ids.entries()) assert.equal(moveRef(components, owner.id, id, index), components, `${file} ${owner.id}`);
      }
      assert.equal(JSON.stringify(components), before, file);
    }
  }
});

const page = () => [
  { id: "liste", type: "dataTable", props: { title: "Liste", searchInput: "ara", rowActions: ["satirDugmesi"], detailToggleInput: "detay" } },
  { id: "ara", type: "input", props: { inputType: "text" } },
  { id: "detay", type: "input", props: { inputType: "checkbox", label: "Detay paneli" } },
  { id: "satirDugmesi", type: "button", props: { actionType: "query" } },
  { id: "pencere", type: "dialog", props: { title: "Pencere", contains: ["metin", "form"] } },
  { id: "diger", type: "dialog", props: { title: "DiÄŸer", contains: ["gosterge"] } },
  { id: "metin", type: "text", props: {} },
  { id: "form", type: "formCard", props: { inputs: ["ad", "tarih"], columns: 2 } },
  { id: "ad", type: "input", props: { inputType: "text" } },
  { id: "tarih", type: "input", props: { inputType: "date" } },
  { id: "serbest", type: "input", props: { inputType: "text" } },
  { id: "depo", type: "input", props: { inputType: "select", optionsQuery: "depolar" } },
  { id: "panel", type: "facetPanel", props: { inputs: [] } },
  { id: "gosterge", type: "metric", props: {} },
  { id: "cubuk", type: "actionBar", props: {} },
];
const ids = (components, ownerId) => refIds(components.find((component) => component.id === ownerId));

test("ekle, taÅŸÄ±, kaydÄ±r ve Ã§Ä±kar; deÄŸiÅŸmeyen bileÅŸenler aynÄ± nesne kalÄ±r", () => {
  const components = page();
  const added = insertRef(components, "pencere", "gosterge", 1);
  assert.deepEqual(ids(added, "pencere"), ["metin", "gosterge", "form"]);
  assert.equal(added[0], components[0]);
  assert.equal(added[5], components[5]);
  assert.deepEqual(ids(insertRef(components, "pencere", "x", 99), "pencere"), ["metin", "form", "x"], "sona eklenir");
  assert.equal(insertRef(components, "metin", "x", 0), components, "sahip tÃ¼rÃ¼ olmayana eklenmez");
  assert.deepEqual(ids(moveRef(components, "pencere", "metin", 2), "pencere"), ["form", "metin"]);
  assert.deepEqual(ids(stepRef(components, "form", -1), "pencere"), ["form", "metin"]);
  assert.deepEqual(ids(stepRef(components, "tarih", -1), "form"), ["tarih", "ad"]);
  const removed = removeRef(components, "form", "ad");
  assert.deepEqual(removed.find((c) => c.id === "form").props.inputs, ["tarih"]);
  assert.ok(removed.some((c) => c.id === "ad"), "bileÅŸen sayfada kalÄ±r");
  const empty = removeRef(removeRef(components, "pencere", "metin"), "pencere", "form");
  assert.deepEqual(empty.find((c) => c.id === "pencere").props.contains, [], "son Ã¼ye Ã§Ä±kÄ±nca boÅŸ dizi kalÄ±r");
  assert.deepEqual(refLocation(components, "form"), { ownerId: "pencere", index: 1 });
  assert.equal(refLocation(components, "liste"), null);
});

test("pencere kurallarÄ±: Ä°ÅŸlem Ã‡ubuÄŸu/Pencere, arama kutusu, satÄ±r iÅŸlemi ve form kartÄ± giriÅŸi alÄ±namaz; baÅŸka pencereden taÅŸÄ±nÄ±r", () => {
  const components = page();
  assert.ok(refPlacementProblem(components, "pencere", { type: "dialog" }));
  assert.ok(refPlacementProblem(components, "pencere", { type: "actionBar" }));
  assert.equal(refPlacementProblem(components, "pencere", { type: "tabs" }), null, "Sekmeler pencereye konabilir");
  assert.ok(refPlacementProblem(components, "pencere", { id: "pencere", type: "dialog" }));
  assert.ok(refPlacementProblem(components, "pencere", { id: "ara", type: "input" }), "arama kutusu");
  assert.ok(refPlacementProblem(components, "pencere", { id: "satirDugmesi", type: "button" }), "satÄ±r iÅŸlemi");
  assert.match(refPlacementProblem(components, "pencere", { id: "detay", type: "input" }) ?? "", /Detay paneli/, "listenin Detay paneli dÃ¼ÄŸmesi");
  assert.match(refPlacementProblem(components, "form", { id: "detay", type: "input" }) ?? "", /Detay paneli/, "form kartÄ±na da alÄ±namaz");
  assert.ok(refPlacementProblem(components, "pencere", { id: "ad", type: "input" }), "form kartÄ± giriÅŸi");
  assert.equal(refPlacementProblem(components, "pencere", { id: "serbest", type: "input" }), null);
  const adopted = adoptRef(components, "pencere", "gosterge", 0);
  assert.deepEqual(ids(adopted, "pencere"), ["gosterge", "metin", "form"]);
  assert.deepEqual(ids(adopted, "diger"), [], "eski pencereden Ã§Ä±kar");
  assert.equal(adoptRef(components, "pencere", "ara", 0), components);
  assert.equal(canOwnType("dialog", "card"), true);
  assert.equal(canOwnType("formCard", "button"), false);
});

test("form kartÄ± ve yan filtre paneli yalnÄ±z giriÅŸ alÄ±r; sÄ±nÄ±rlar uygulanÄ±r", () => {
  const components = page();
  assert.ok(refPlacementProblem(components, "form", { type: "button" }));
  assert.equal(refPlacementProblem(components, "form", { type: "input" }), null);
  assert.equal(refPlacementProblem(components, "form", { id: "serbest", type: "input" }), null);
  assert.ok(refPlacementProblem(components, "form", { id: "ara", type: "input" }), "arama kutusu");
  assert.deepEqual(ids(adoptRef(components, "form", "serbest", 1), "form"), ["ad", "serbest", "tarih"]);
  assert.ok(refPlacementProblem(components, "panel", { id: "serbest", type: "input" }), "metin giriÅŸi yan panele giremez");
  assert.ok(refPlacementProblem(components, "panel", { id: "ad", type: "input" }), "baÅŸka form kartÄ±ndaki giriÅŸ");
  assert.ok(refPlacementProblem(components, "panel", { type: "input", props: { inputType: "text" } }));
  assert.equal(refPlacementProblem(components, "panel", { type: "input", props: { inputType: "select", optionsQuery: "depolar" } }), null);
  assert.deepEqual(ids(adoptRef(components, "panel", "depo", 0), "panel"), ["depo"]);
  const full = components.map((c) => c.id === "form" ? { ...c, props: { ...c.props, inputs: Array.from({ length: 12 }, (_, i) => `g${i}`) } } : c);
  assert.match(refPlacementProblem(full, "form", { type: "input" }), /12/);
  assert.equal(insertRef(full, "form", "serbest", 0), full);
  const fullDialog = components.map((c) => c.id === "pencere" ? { ...c, props: { ...c.props, contains: Array.from({ length: 20 }, (_, i) => `b${i}`) } } : c);
  assert.match(refPlacementProblem(fullDialog, "pencere", { type: "text" }), /20/);
  assert.equal(refPlacementProblem(fullDialog, "pencere", { id: "b3", type: "text" }), null, "Ã¼yeyi sÄ±ralamak sÄ±nÄ±ra takÄ±lmaz");
});
