// Kart içi tasarım yardımcılarının denemeleri: `npm test` (node --test; TypeScript türleri node tarafından atılır).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  adoptIntoCard, applyFlat, cardLocation, ejectCardChild, findComponent, flatWithCardTabs, flattenComponents, insertCardChild, mapComponents,
  moveCardChild, pruneCardTabs, removeComponent, stepCardChild, updateComponent, withCardTabs,
} from "../src/platform-tools/erp-src/page-designer/cardChildren.ts";

const here = dirname(fileURLToPath(import.meta.url));
const standardsDir = join(here, "../../../src/Hosts/AIERP.Api/SystemPages/Standards");

/** Standart dosyalarındaki bütün `components` dizileri (tanım hangi anahtarda olursa olsun). */
function componentLists(value, found = []) {
  if (Array.isArray(value)) { for (const item of value) componentLists(item, found); return found; }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    if (key === "components" && Array.isArray(item)) found.push(item);
    else componentLists(item, found);
  }
  return found;
}

const page = () => [
  { id: "liste", type: "dataTable", props: { title: "Liste" } },
  { id: "kart", type: "card", props: { title: "Kart", width: 4 }, children: [
    { id: "ac", type: "button", props: { text: "Aç" } },
    { id: "durum", type: "badge", props: { text: "Yeterli" } },
    { id: "sekmeler", type: "tabs", props: { tabs: ["Özet=bakiye,eksik", "Depolar="] } },
  ] },
  { id: "bakiye", type: "metric", props: { title: "Bakiye" } },
];

test("standartlar değişmeden döner (kart çocukları ve sekme listeleri aynı nesne)", () => {
  const files = readdirSync(standardsDir).filter((file) => file.endsWith(".json"));
  assert.ok(files.length > 0);
  let cards = 0;
  for (const file of files) {
    const text = readFileSync(join(standardsDir, file), "utf8");
    for (const components of componentLists(JSON.parse(text))) {
      const before = JSON.stringify(components);
      cards += components.filter((component) => Array.isArray(component.children)).length;
      assert.equal(mapComponents(components, (component) => component), components, file);
      assert.equal(updateComponent(components, "__yok__", (component) => ({ ...component })), components, file);
      assert.equal(removeComponent(components, "__yok__"), components, file);
      assert.equal(pruneCardTabs(components), components, file);
      assert.equal(withCardTabs(components, (flat) => flat), components, file);
      assert.equal(applyFlat(components, [...flatWithCardTabs(components)]), components, file);
      assert.equal(JSON.stringify(components), before, file);
    }
  }
  assert.ok(cards > 0, "çocuklu kart içeren standart bulunmalı");
});

test("çocuk her düzeyde bulunur ve güncellenir; diğerleri aynı nesne kalır", () => {
  const components = page();
  assert.equal(findComponent(components, "durum")?.type, "badge");
  assert.deepEqual(cardLocation(components, "durum"), { cardId: "kart", index: 1 });
  assert.equal(cardLocation(components, "bakiye"), null);
  const next = updateComponent(components, "durum", (component) => ({ ...component, props: { ...component.props, text: "Eksik" } }));
  assert.equal(findComponent(next, "durum").props.text, "Eksik");
  assert.equal(next[0], components[0]);
  assert.equal(next[2], components[2]);
  assert.equal(next[1].children[0], components[1].children[0]);
  assert.deepEqual(flattenComponents(components).map((component) => component.id), ["liste", "kart", "ac", "durum", "sekmeler", "bakiye"]);
});

test("ekle, taşı, kaydır, çıkar ve al", () => {
  const components = page();
  const added = insertCardChild(components, "kart", { id: "yeni", type: "heading", props: {} }, 1);
  assert.deepEqual(added[1].children.map((child) => child.id), ["ac", "yeni", "durum", "sekmeler"]);
  assert.equal(insertCardChild(components, "liste", { id: "x", type: "text", props: {} }, 0), components, "kart olmayana eklenmez");
  const moved = moveCardChild(components, "ac", 3);
  assert.deepEqual(moved[1].children.map((child) => child.id), ["durum", "sekmeler", "ac"]);
  assert.equal(moveCardChild(components, "ac", 1), components, "yerinde bırakmak değişiklik değildir");
  assert.deepEqual(stepCardChild(components, "durum", -1)[1].children.map((child) => child.id), ["durum", "ac", "sekmeler"]);
  assert.equal(stepCardChild(components, "ac", -1), components);
  const ejected = ejectCardChild(components, "durum");
  assert.deepEqual(ejected.map((component) => component.id), ["liste", "kart", "durum", "bakiye"]);
  assert.deepEqual(ejected[1].children.map((child) => child.id), ["ac", "sekmeler"]);
  const adopted = adoptIntoCard(components, "kart", "bakiye", 0);
  assert.deepEqual(adopted.map((component) => component.id), ["liste", "kart"]);
  assert.equal(adopted[1].children[0].id, "bakiye");
  assert.equal(adoptIntoCard(components, "kart", "kart", 0), components);
});

test("son çocuk silinince boş children yazılmaz", () => {
  const components = [{ id: "kart", type: "card", props: {}, children: [{ id: "a", type: "text", props: {} }] }];
  const next = removeComponent(components, "a");
  assert.equal("children" in next[0], false);
  assert.deepEqual(next[0], { id: "kart", type: "card", props: {} });
});

test("kart içindeki Sekmeler düz görünümde düzenlenir ve yerine yazılır", () => {
  const components = page();
  const result = withCardTabs(components, (flat) => flat.map((component) => component.id === "sekmeler"
    ? { ...component, props: { ...component.props, tabs: ["Özet=bakiye", "Depolar=liste"] } } : component));
  assert.deepEqual(findComponent(result, "sekmeler").props.tabs, ["Özet=bakiye", "Depolar=liste"]);
  assert.equal(result[0], components[0]);
  assert.equal(result[1].children[0], components[1].children[0]);
  assert.equal(withCardTabs(components, () => null), null);
});

test("silinen üst düzey bileşen kart sekmesinden kalkar", () => {
  const components = page();
  // "eksik" sayfada yok: sekmeden kalkar; "bakiye" kalır.
  const pruned = pruneCardTabs(components);
  assert.deepEqual(findComponent(pruned, "sekmeler").props.tabs, ["Özet=bakiye", "Depolar="]);
  const clean = pruneCardTabs(pruned);
  assert.equal(clean, pruned);
  const withoutMetric = pruneCardTabs(removeComponent(pruned, "bakiye"));
  assert.deepEqual(findComponent(withoutMetric, "sekmeler").props.tabs, ["Özet=", "Depolar="]);
});

test("sayfadaki Sekmeler'in aldığı bileşen kart sekmesinden kalkar (tek sahip)", () => {
  const components = [...page(), { id: "ust", type: "tabs", props: { tabs: ["Genel=bakiye"] } }];
  const pruned = pruneCardTabs(components);
  assert.deepEqual(findComponent(pruned, "sekmeler").props.tabs, ["Özet=", "Depolar="]);
  assert.equal(pruned[3], components[3]);
});

test("iki kart sekmesi aynı bileşeni alamaz (ilk sahip kazanır)", () => {
  const copy = { id: "sekmeler2", type: "tabs", props: { tabs: ["Özet=bakiye"] } };
  const withCopy = insertCardChild(page(), "kart", copy, 99);
  const pruned = pruneCardTabs(withCopy);
  assert.deepEqual(findComponent(pruned, "sekmeler").props.tabs, ["Özet=bakiye", "Depolar="]);
  assert.deepEqual(findComponent(pruned, "sekmeler2").props.tabs, ["Özet="]);
});
