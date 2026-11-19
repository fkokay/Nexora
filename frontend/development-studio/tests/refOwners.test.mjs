// Pencere / form kartı / yan filtre paneli tasarım ekranı yardımcılarının denemeleri: `npm test` (node --test).
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

test("Stok Kartları: hareketPenceresi ve gorunumKarti değişmeden döner", () => {
  const components = stockComponents();
  assert.ok(components, "hareketPenceresi içeren tanım bulunmalı");
  const before = JSON.stringify(components);
  const dialog = components.find((component) => component.id === "hareketPenceresi");
  const filter = components.find((component) => component.id === "gorunumKarti");
  assert.deepEqual(refIds(dialog), ["hareketFormu", "izlemeSatirlari", "hareketTablosu"]);
  assert.deepEqual(refIds(filter), ["minimumAlti", "detayPaneli"]);
  for (const owner of [dialog, filter]) {
    const ids = refIds(owner);
    for (const [index, id] of ids.entries()) {
      assert.deepEqual(refLocation(components, id), { ownerId: owner.id, index });
      assert.equal(moveRef(components, owner.id, id, index), components, `${id} yerinde`);
      assert.equal(moveRef(components, owner.id, id, index + 1), components, `${id} kendi arkası`);
      assert.equal(adoptRef(components, owner.id, id, index), components, `${id} zaten üye`);
      assert.equal(insertRef(components, owner.id, id, 0), components, `${id} iki kez eklenmez`);
      assert.equal(refPlacementProblem(components, owner.id, { id, type: components.find((c) => c.id === id).type }), null);
    }
    assert.equal(removeRef(components, owner.id, "__yok__"), components);
    assert.equal(stepRef(components, ids[0], -1), components, "baştaki öne gitmez");
    assert.equal(stepRef(components, ids[ids.length - 1], 1), components, "sondaki arkaya gitmez");
  }
  // Pencereyi ileri geri sıralamak kaydı aynen geri getirir.
  const there = moveRef(components, "hareketPenceresi", "hareketFormu", 3);
  assert.deepEqual(refIds(there.find((c) => c.id === "hareketPenceresi")), ["izlemeSatirlari", "hareketTablosu", "hareketFormu"]);
  const back = moveRef(there, "hareketPenceresi", "hareketFormu", 0);
  assert.equal(JSON.stringify(back), before);
  assert.equal(JSON.stringify(components), before);
});

test("standartlardaki bütün pencere/form kartı/yan paneller için işlemsiz çağrılar aynı diziyi döndürür", () => {
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
  { id: "liste", type: "dataTable", props: { title: "Liste", searchInput: "ara", rowActions: ["satirDugmesi"] } },
  { id: "ara", type: "input", props: { inputType: "text" } },
  { id: "satirDugmesi", type: "button", props: { actionType: "query" } },
  { id: "pencere", type: "dialog", props: { title: "Pencere", contains: ["metin", "form"] } },
  { id: "diger", type: "dialog", props: { title: "Diğer", contains: ["gosterge"] } },
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

test("ekle, taşı, kaydır ve çıkar; değişmeyen bileşenler aynı nesne kalır", () => {
  const components = page();
  const added = insertRef(components, "pencere", "gosterge", 1);
  assert.deepEqual(ids(added, "pencere"), ["metin", "gosterge", "form"]);
  assert.equal(added[0], components[0]);
  assert.equal(added[5], components[5]);
  assert.deepEqual(ids(insertRef(components, "pencere", "x", 99), "pencere"), ["metin", "form", "x"], "sona eklenir");
  assert.equal(insertRef(components, "metin", "x", 0), components, "sahip türü olmayana eklenmez");
  assert.deepEqual(ids(moveRef(components, "pencere", "metin", 2), "pencere"), ["form", "metin"]);
  assert.deepEqual(ids(stepRef(components, "form", -1), "pencere"), ["form", "metin"]);
  assert.deepEqual(ids(stepRef(components, "tarih", -1), "form"), ["tarih", "ad"]);
  const removed = removeRef(components, "form", "ad");
  assert.deepEqual(removed.find((c) => c.id === "form").props.inputs, ["tarih"]);
  assert.ok(removed.some((c) => c.id === "ad"), "bileşen sayfada kalır");
  const empty = removeRef(removeRef(components, "pencere", "metin"), "pencere", "form");
  assert.deepEqual(empty.find((c) => c.id === "pencere").props.contains, [], "son üye çıkınca boş dizi kalır");
  assert.deepEqual(refLocation(components, "form"), { ownerId: "pencere", index: 1 });
  assert.equal(refLocation(components, "liste"), null);
});

test("pencere kuralları: İşlem Çubuğu/Pencere, arama kutusu, satır işlemi ve form kartı girişi alınamaz; başka pencereden taşınır", () => {
  const components = page();
  assert.ok(refPlacementProblem(components, "pencere", { type: "dialog" }));
  assert.ok(refPlacementProblem(components, "pencere", { type: "actionBar" }));
  assert.equal(refPlacementProblem(components, "pencere", { type: "tabs" }), null, "Sekmeler pencereye konabilir");
  assert.ok(refPlacementProblem(components, "pencere", { id: "pencere", type: "dialog" }));
  assert.ok(refPlacementProblem(components, "pencere", { id: "ara", type: "input" }), "arama kutusu");
  assert.ok(refPlacementProblem(components, "pencere", { id: "satirDugmesi", type: "button" }), "satır işlemi");
  assert.ok(refPlacementProblem(components, "pencere", { id: "ad", type: "input" }), "form kartı girişi");
  assert.equal(refPlacementProblem(components, "pencere", { id: "serbest", type: "input" }), null);
  const adopted = adoptRef(components, "pencere", "gosterge", 0);
  assert.deepEqual(ids(adopted, "pencere"), ["gosterge", "metin", "form"]);
  assert.deepEqual(ids(adopted, "diger"), [], "eski pencereden çıkar");
  assert.equal(adoptRef(components, "pencere", "ara", 0), components);
  assert.equal(canOwnType("dialog", "card"), true);
  assert.equal(canOwnType("formCard", "button"), false);
});

test("form kartı ve yan filtre paneli yalnız giriş alır; sınırlar uygulanır", () => {
  const components = page();
  assert.ok(refPlacementProblem(components, "form", { type: "button" }));
  assert.equal(refPlacementProblem(components, "form", { type: "input" }), null);
  assert.equal(refPlacementProblem(components, "form", { id: "serbest", type: "input" }), null);
  assert.ok(refPlacementProblem(components, "form", { id: "ara", type: "input" }), "arama kutusu");
  assert.deepEqual(ids(adoptRef(components, "form", "serbest", 1), "form"), ["ad", "serbest", "tarih"]);
  assert.ok(refPlacementProblem(components, "panel", { id: "serbest", type: "input" }), "metin girişi yan panele giremez");
  assert.ok(refPlacementProblem(components, "panel", { id: "ad", type: "input" }), "başka form kartındaki giriş");
  assert.ok(refPlacementProblem(components, "panel", { type: "input", props: { inputType: "text" } }));
  assert.equal(refPlacementProblem(components, "panel", { type: "input", props: { inputType: "select", optionsQuery: "depolar" } }), null);
  assert.deepEqual(ids(adoptRef(components, "panel", "depo", 0), "panel"), ["depo"]);
  const full = components.map((c) => c.id === "form" ? { ...c, props: { ...c.props, inputs: Array.from({ length: 12 }, (_, i) => `g${i}`) } } : c);
  assert.match(refPlacementProblem(full, "form", { type: "input" }), /12/);
  assert.equal(insertRef(full, "form", "serbest", 0), full);
  const fullDialog = components.map((c) => c.id === "pencere" ? { ...c, props: { ...c.props, contains: Array.from({ length: 20 }, (_, i) => `b${i}`) } } : c);
  assert.match(refPlacementProblem(fullDialog, "pencere", { type: "text" }), /20/);
  assert.equal(refPlacementProblem(fullDialog, "pencere", { id: "b3", type: "text" }), null, "üyeyi sıralamak sınıra takılmaz");
});
