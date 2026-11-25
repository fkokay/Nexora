// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newRecordTemplateDefinition } from "../pageTemplates";
import type { ModelDefinition } from "./listPanelModel";
import { addLines, addNote, chooseRecordSource, fieldKey, RECORD_SOURCE_NEEDS_KEY, recordTabs, setSectionColumns } from "./recordModel";
import { RECORD_LOCK_NOTE, RecordPanel, recordSelectionOf, type RecordSelection } from "./RecordPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
  ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("kod", "Cari kodu", { key: true, required: true }), col("unvan", "Unvan", { required: true, maxLength: 200 }), col("vade", "Vade", { type: "int" })],
};
const hareket: CatalogDataSource = {
  code: "cariHareket", label: "Cari hareketleri", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("tarih", "Tarih", { type: "date" }), col("belge", "Belge"), col("tutar", "Tutar", { type: "decimal" })],
};
const tumu: CatalogDataSource = { ...cari, code: "tumCariler", label: "Tüm cariler", parameters: [] };
const ekle: CatalogAction = { code: "cariEkle", label: "Cari ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
  parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
const guncelle: CatalogAction = { ...ekle, code: "cariGuncelle", label: "Cari güncelle", kind: "update", target: "row" };
const sil: CatalogAction = { ...ekle, code: "cariSil", label: "Cari sil", kind: "delete", target: "row", parameters: [{ name: "kod", type: "text" }] };
const ekstre: CatalogAction = { ...ekle, code: "ekstre", label: "Ekstre al", kind: "update", target: "row", parameters: [{ name: "kod", type: "text" }] };
const catalog: ActiveCatalog = { version: "1", dataSources: [cari, hareket, tumu], actions: [ekle, guncelle, sil, ekstre] };

const built = chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog);
const fieldId = (def: ModelDefinition, column: string) => def.components.find((component) => component.type === "input" && fieldKey(def, component.id) === column)!.id;
const render = (def: ModelDefinition, selection: RecordSelection, active: ActiveCatalog | null = catalog) => renderToString(
  <RecordPanel def={def} catalog={active} selection={selection} onChange={() => {}} onSelect={() => {}} onAskDeveloper={() => {}}/>);
const inOrder = (html: string, texts: string[]) => {
  const at = texts.map((text) => html.indexOf(text));
  texts.forEach((text, index) => expect(at[index], text).toBeGreaterThanOrEqual(0));
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; });
function mount(def: ModelDefinition, selection: RecordSelection, onChange: (def: ModelDefinition) => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(<RecordPanel def={def} catalog={catalog} selection={selection} onChange={onChange} onSelect={() => {}} onAskDeveloper={() => {}}/>));
  return host;
}

describe("RecordPanel", () => {
  it("page panel renders parts in mockup order without tablist", () => {
    const html = render(built, { kind: "page" });
    inOrder(html, ["Hangi kayıt gösterilsin?", "Cari kartı", "Kaydet düğmesi", "Yeni kayıtta", "Var olan kayıtta", "Sil düğmesi",
      "Öne çıkan değerler", "Başlık", "Alt satır", "Değerler", "En çok 3 değer.", "Ek eylemler", "Görünüm", "Kartın üstüne / altına ek alan", "Yazılımcıdan iste →"]);
    expect(html).toContain('aria-label="Ad"');
    expect(html).toContain("Yazılımcının hazırladığı · kayıt <b>cari kodu</b> ile okunur.");
    expect(html).not.toContain("tablist");
    expect(html).not.toContain("role=\"dialog\"");
    expect(html).not.toContain("<details open");
  });
  it("unusable source is shown faded with its reason", () => {
    const html = render(built, { kind: "page" });
    expect(html).toContain("is-dim");
    expect(html).toContain(RECORD_SOURCE_NEEDS_KEY);
  });
  it("section panel column buttons call setSectionColumns", () => {
    const onChange = vi.fn();
    const host = mount(built, { kind: "section", id: "genel" }, onChange);
    const text = host.textContent ?? "";
    inOrder(text, ["Bölüm", "Başlık", "Kolon sayısı", "Dar alanda en çok 2, telefonda 1 kolon olur. Uzun metin ve satır tablosu her zaman tam genişliktir.",
      "Görünüm", "Ne zaman görünsün?", "Bölümü kaldır", "Alanlar sol listeye döner."]);
    const three = [...host.querySelectorAll("button")].find((button) => button.textContent === "3 kolon")!;
    act(() => three.click());
    expect(onChange).toHaveBeenCalledWith(setSectionColumns(built, "genel", 3));
  });
  it("locked required toggle is disabled with note", () => {
    const host = mount(built, { kind: "field", id: fieldId(built, "unvan") }, () => {});
    const required = host.querySelector<HTMLInputElement>('input[aria-label="Zorunlu"]')!;
    expect(required.checked).toBe(true);
    expect(required.disabled).toBe(true);
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Değiştirilemez"]')!.disabled).toBe(false);
    expect(host.textContent).toContain(RECORD_LOCK_NOTE);
    inOrder(host.textContent ?? "", ["Alan", "Etiket", "Zorunlu", "Değiştirilemez", RECORD_LOCK_NOTE, "Yardım metni", "Yazılımcının hazırladığı",
      "Görünüm", "Ne zaman görünsün?", "Karttan çıkar"]);
    const free = mount(built, { kind: "field", id: fieldId(built, "vade") }, () => {});
    expect(free.querySelector<HTMLInputElement>('input[aria-label="Zorunlu"]')!.disabled).toBe(false);
    expect(free.textContent).not.toContain(RECORD_LOCK_NOTE);
  });
  it("green note lists type, key, required and max length", () => {
    expect(render(built, { kind: "field", id: fieldId(built, "unvan") })).toContain("Yazılımcının hazırladığı · Metin · zorunlu · en çok 200 karakter");
    expect(render(built, { kind: "field", id: fieldId(built, "kod") })).toContain("Yazılımcının hazırladığı · Metin · anahtar · zorunlu");
    expect(render(built, { kind: "field", id: fieldId(built, "vade") })).toContain("Yazılımcının hazırladığı · Tam sayı");
  });
  it("lines and note panels match the mockup", () => {
    const withLines = addLines(built, hareket, 0, 1);
    const linesId = withLines.components.find((component) => component.props.slot === "lines")!.id;
    inOrder(render(withLines, { kind: "lines", id: linesId }), ["Satır tablosu", "Ad", "Ne listelensin?", "Cari hareketleri</label>", "Kolonlar", "Sayfa başına",
      ">10</button>", ">25</button>", "Görünüm", "Liste boşken"]);
    const withNote = addNote(built, 0, 1, "Kredi limiti değişiklikleri finans onayına gider.");
    const noteId = recordTabs(withNote)[0].ids[1];
    inOrder(render(withNote, { kind: "note", id: noteId }), ["Açıklama metni", "Metin", "Kredi limiti değişiklikleri finans onayına gider."]);
  });
  it("panel shows no technical words", () => {
    let def = addLines(built, hareket, 0, 1);
    def = addNote(def, 0, 2, "Not");
    const linesId = def.components.find((component) => component.props.slot === "lines")!.id;
    const noteId = def.components.find((component) => component.props.slot === "note")!.id;
    const selections: RecordSelection[] = [{ kind: "page" }, { kind: "section", id: "genel" }, { kind: "field", id: fieldId(def, "kod") },
      { kind: "field", id: fieldId(def, "unvan") }, { kind: "lines", id: linesId }, { kind: "note", id: noteId }];
    for (const selection of selections) {
      const html = render(def, selection);
      for (const word of ["{{", "saveSequence", "query", "kayit.rows"]) expect(html, `${selection.kind}: ${word}`).not.toContain(word);
    }
  });
  it("explains a missing catalog and an unchosen source", () => {
    const fresh = newRecordTemplateDefinition() as unknown as ModelDefinition;
    expect(render(fresh, { kind: "page" }, null)).toContain("Etkin katalog sürümü yok");
    expect(render(fresh, { kind: "page" })).toContain("Önce hangi kaydın gösterileceğini seçin.");
  });
});

describe("recordSelectionOf", () => {
  it("maps record parts to selections and extra areas to null", () => {
    const def = addNote(addLines(built, hareket, 0, 1), 0, 2, "Not");
    const linesId = def.components.find((component) => component.props.slot === "lines")!.id;
    const noteId = def.components.find((component) => component.props.slot === "note")!.id;
    expect(recordSelectionOf(def, null)).toEqual({ kind: "page" });
    expect(recordSelectionOf(def, "genel")).toEqual({ kind: "section", id: "genel" });
    expect(recordSelectionOf(def, fieldId(def, "kod"))).toEqual({ kind: "field", id: fieldId(def, "kod") });
    expect(recordSelectionOf(def, linesId)).toEqual({ kind: "lines", id: linesId });
    expect(recordSelectionOf(def, noteId)).toEqual({ kind: "note", id: noteId });
    const summary = def.components.find((component) => component.props.slot === "summary")!.id;
    expect(recordSelectionOf(def, summary)).toEqual({ kind: "page" });
    const extra = { ...def, components: [...def.components, { id: "ek", type: "text", props: { slot: "below", text: "x" } }] };
    expect(recordSelectionOf(extra, "ek")).toBeNull();
  });
});
