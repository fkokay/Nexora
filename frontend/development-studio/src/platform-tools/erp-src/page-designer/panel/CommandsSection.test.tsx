// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActiveCatalog, CatalogAction, CatalogColumn, CatalogDataSource } from "../catalogClient";
import { newFreeTemplateDefinition, newListTemplateDefinition, newRecordTemplateDefinition } from "../pageTemplates";
import type { PageQuery } from "../QueriesPanel";
import {
  COMMANDS_CARD_DELETE, COMMANDS_CARD_SAVE, COMMANDS_FOOT_NOTE, COMMANDS_HIDDEN_DETAIL, COMMANDS_HIDDEN_SUMMARY, COMMANDS_NO_BAR, COMMANDS_SAVE_NEW_BAR_ONLY,
  CommandsSection, type CommandsPage,
} from "./CommandsSection";
import { commandShown, commandsBar, commandWhenChoice, deleteCommand, saveSteps, toggleCommand } from "./commandsModel";
import { fieldTokens } from "./consultantText";
import type { ModelComponent, ModelDefinition } from "./listPanelModel";
import { chooseRecordSource, deleteAction, setSaveActions } from "./recordModel";
import { recordSelectionOf } from "./templateGuards";
import { RecordPanel } from "./RecordPanel";
import { TemplateInspector } from "./TemplateInspector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const col = (code: string, label: string, extra: Partial<CatalogColumn> = {}): CatalogColumn =>
  ({ code, label, type: "text", key: false, longText: false, required: false, maxLength: null, ...extra });
const cari: CatalogDataSource = {
  code: "cariKart", label: "Cari kartı", source: "sql", erpOperation: null, parameters: [{ name: "kod", type: "text" }], opens: null,
  columns: [col("kod", "Cari kodu", { key: true, required: true }), col("unvan", "Unvan", { required: true, maxLength: 200 })],
};
const cariListe: CatalogDataSource = { ...cari, code: "cariListe", label: "Cariler", parameters: [] };
const ekle: CatalogAction = { code: "cariEkle", label: "Cari ekle", kind: "insert", target: "page", source: "sql", erpOperation: null,
  parameters: [{ name: "kod", type: "text" }, { name: "unvan", type: "text" }], confirmText: null };
const guncelle: CatalogAction = { ...ekle, code: "cariGuncelle", label: "Cari güncelle", kind: "update", target: "row" };
const sil: CatalogAction = { ...ekle, code: "cariSil", label: "Cari sil", kind: "delete", target: "row", parameters: [{ name: "kod", type: "text" }] };
const unvanGuncelle: CatalogAction = { ...guncelle, code: "unvanGuncelle", label: "Unvan güncelle" };
const catalog: ActiveCatalog = { version: "1", dataSources: [cari, cariListe], actions: [ekle, guncelle, sil, unvanGuncelle] };
const pages: CommandsPage[] = [{ code: "cari-hesaplar", name: "Cari hesaplar" }, { code: "cari-karti", name: "Cari kartı" }];

/** Studio'da kurulan kart: Kaydet düğmesi (ekle + güncelle), Sil düğmesi; Komutlar çubuğu yok. */
const built = setSaveActions(chooseRecordSource(newRecordTemplateDefinition() as unknown as ModelDefinition, cari, catalog), ekle, guncelle);
const raw = (id: string, kind: PageQuery["kind"]): PageQuery => ({ id, name: id, kind, sql: `-- ${id}`, parameters: [], runOn: "manual" });
/** Dönüştürülmüş kart: Kaydet ve Sil çubukta, standarttan gelen ham sorgularla. */
const converted = (() => {
  const buttons = new Set(built.components.filter((component) => component.type === "button").map((component) => component.id));
  const bar: ModelComponent = { id: "komutlar", type: "actionBar", props: {
    slot: "commands", saveSequence: ["kaydetSql", "guncelleSql"], sequenceWhen: ["kaydetSql=kayit.rows[0].kod == null"],
    deleteQuery: "silSql", deleteConfirmText: "{{kayit.rows[0].unvan}} silinsin mi?", newAction: "clear", newInputs: [], afterSaveAction: "page",
    afterSavePageCode: "cari-hesaplar", afterSaveTarget: "sameTab" } };
  const def: ModelDefinition = { ...built,
    queries: [...built.queries.filter((query) => query.kind === "read"), raw("kaydetSql", "insert"), raw("guncelleSql", "update"), raw("silSql", "delete")],
    components: [...built.components.filter((component) => !buttons.has(component.id)), bar] };
  const field = def.components.find((component) => component.type === "input")!;
  return { ...def, components: def.components.map((component) => component.id === "komutlar"
    ? { ...component, props: { ...component.props, newInputs: [field.id] } } : component) } as ModelDefinition;
})();
const listPage: ModelDefinition = { ...(newListTemplateDefinition() as unknown as ModelDefinition),
  queries: [{ id: "kaynak", name: "cariler", kind: "read", dataSource: "cariListe", parameters: [], runOn: "load" } as PageQuery],
  components: [
    { id: "liste", type: "dataTable", name: "liste", props: { slot: "list", query: "kaynak", columns: ["kod", "unvan"], title: "Cariler" } },
    { id: "ara", type: "input", name: "ara", props: { slot: "filters", label: "Arama kutusu" } },
    { id: "teklif", type: "button", name: "teklif", props: { slot: "actions", text: "Yeni teklif" } },
    { id: "komutlar", type: "actionBar", props: { slot: "commands", titleCount: "{{cariler.meta.totalCount}}", exportTable: "liste", focusInput: "ara",
      moreButtons: ["teklif"], openAction: "page", openPageCode: "cari-karti", openTarget: "newTab", openTable: "liste",
      openParams: ["kod={{liste.seciliSatir.kod}}"], newAction: "page", newPageCode: "cari-karti", newTarget: "sameTab" } },
  ] };

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => { mounted.forEach(({ root, host }) => { act(() => root.unmount()); host.remove(); }); mounted = []; });
function mountNode(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(node));
  return host;
}
function Harness({ initial, template, onChange }: { initial: ModelDefinition; template: "list" | "record" | "free"; onChange: (def: ModelDefinition) => void }) {
  const [def, setDef] = useState(initial);
  return <CommandsSection def={def} template={template} catalog={catalog} pages={pages} tokens={fieldTokens(def, catalog)}
    onChange={(next) => { onChange(next); setDef(next); }}/>;
}
function mount(initial: ModelDefinition, template: "list" | "record" | "free" = "record") {
  const spy = vi.fn();
  const host = mountNode(<Harness initial={initial} template={template} onChange={spy}/>);
  return { host, spy, last: () => spy.mock.calls.at(-1)![0] as ModelDefinition };
}
const rowOf = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLElement>(".pd-cmd-row")].find((row) => row.querySelector(".pd-cmd-name")?.textContent === label)!;
const openRow = (host: HTMLElement, label: string) => act(() => rowOf(host, label).querySelector<HTMLButtonElement>(".pd-cmd-row-main")!.click());
const eyeOf = (host: HTMLElement, label: string) => rowOf(host, label).querySelector<HTMLButtonElement>(".pd-cmd-eye")!;
const button = (scope: HTMLElement, text: string) => [...scope.querySelectorAll("button")].find((item) => item.textContent === text)!;
const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => act(() => {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
});
const inOrder = (text: string, texts: string[]) => {
  const at: number[] = [];
  texts.forEach((item) => { const from = at.length ? at[at.length - 1] + 1 : 0; const index = text.indexOf(item, from); expect(index, item).toBeGreaterThanOrEqual(0); at.push(index); });
};

describe("CommandsSection", () => {
  it("record page panel shows Komutlar rows in mockup order with keys", () => {
    expect(deleteAction(built)).toBe("cariSil");
    const html = renderToString(<RecordPanel def={built} catalog={catalog} selection={{ kind: "page" }} pages={pages} onChange={() => {}} onSelect={() => {}}/>);
    expect(html.indexOf("Ek eylemler")).toBeLessThan(html.indexOf('data-part="commands"'));
    const section = html.slice(html.indexOf('data-part="commands"'));
    inOrder(section, ["Komutlar", "göz = çubukta göster", ">Yeni<", "F2", ">Kaydet<", "Ctrl+S", ">Kaydet ve yeni<", "Ctrl+F2", ">Sil<", "Ctrl+Del",
      ">Yenile<", "F5", ">Yazdır<", "Ctrl+P", "Diğer menüsü", "Alt+İ", "Boş · menü çizilmez", COMMANDS_FOOT_NOTE]);
    expect(section).not.toContain(">Filtre<");

    // Aynı anda bir satır açıktır.
    const { host, spy } = mount(converted);
    expect(spy).not.toHaveBeenCalled();
    openRow(host, "Yeni");
    expect(host.textContent).toContain("Ne yapsın?");
    openRow(host, "Sil");
    expect(host.textContent).toContain("Silme eylemi");
    expect(host.textContent).not.toContain("Ne yapsın?");
    expect(host.querySelectorAll(".pd-cmd-row.is-open")).toHaveLength(1);
    openRow(host, "Sil");
    expect(host.querySelectorAll(".pd-cmd-row.is-open")).toHaveLength(0);
  });

  it("a page without a commands bar shows every eye off; the first eye brings only that command", () => {
    const barless: ModelDefinition = { ...listPage, components: listPage.components.filter((component) => component.type !== "actionBar") };
    const { host, spy, last } = mount(barless, "list");
    expect(COMMANDS_NO_BAR).toBe("Bu sayfada komut gösterilmiyor; bir komutun gözünü açınca yalnız o komut çubuğa gelir.");
    expect(host.textContent).toContain(COMMANDS_NO_BAR);
    for (const label of ["Yeni", "Düzenle · Görüntüle", "Kaydet", "Sil", "Yenile", "Filtre", "Yazdır", "Excel"]) {
      expect(eyeOf(host, label).getAttribute("aria-label"), label).toBe("Göster");
      expect(rowOf(host, label).textContent, label).toContain(COMMANDS_HIDDEN_SUMMARY);
    }
    expect(spy).not.toHaveBeenCalled();
    act(() => eyeOf(host, "Yenile").click());
    expect(commandShown(last(), "refresh")).toBe(true);
    expect(commandsBar(last())!.props.hiddenCommands).toEqual(["new", "open", "save", "delete", "filter", "print", "export"]);
    expect(eyeOf(host, "Yenile").getAttribute("aria-label")).toBe("Gizle");
    expect(eyeOf(host, "Yazdır").getAttribute("aria-label")).toBe("Göster");
    expect(host.textContent).not.toContain(COMMANDS_NO_BAR);
    // Başlıkta kayıt sayısı çubuğu kurar ama komut getirmez.
    const count = mount(barless, "list");
    act(() => count.host.querySelector<HTMLInputElement>('input[aria-label="Başlıkta kayıt sayısı"]')!.click());
    expect(commandsBar(count.last())!.props.titleCount).toBe("{{cariler.meta.totalCount}}");
    for (const id of ["new", "open", "save", "delete", "refresh", "filter", "print", "export"] as const) expect(commandShown(count.last(), id), id).toBe(false);
  });

  it("on a Studio card Kaydet and Sil are the card's buttons: eye on and locked, other eyes off", () => {
    const { host, spy } = mount(built);
    expect(commandsBar(built)).toBeNull();
    expect(COMMANDS_CARD_SAVE).toBe("Kartın Kaydet düğmesi; Komutlar'da gizlenmez.");
    expect(COMMANDS_CARD_DELETE).toBe("Kartın Sil düğmesi; Komutlar'da gizlenmez.");
    for (const [label, note] of [["Kaydet", COMMANDS_CARD_SAVE], ["Sil", COMMANDS_CARD_DELETE]] as const) {
      const eye = eyeOf(host, label);
      expect(eye.disabled, label).toBe(true);
      expect(eye.getAttribute("aria-pressed"), label).toBe("false");
      expect(eye.getAttribute("aria-label"), label).toBe(note);
      expect(rowOf(host, label).textContent, label).toContain(note);
      expect(rowOf(host, label).classList.contains("is-hidden"), label).toBe(false);
      act(() => eye.click());
    }
    expect(spy).not.toHaveBeenCalled();
    for (const label of ["Yeni", "Kaydet ve yeni", "Yenile", "Yazdır"]) expect(eyeOf(host, label).getAttribute("aria-label"), label).toBe("Göster");
    openRow(host, "Kaydet");
    expect(rowOf(host, "Kaydet").textContent).toContain("Kaydetme sırası");
    // Kaydet çubuktaysa (dönüştürülmüş kart) göz serbesttir, kart notu yoktur.
    const conv = mount(converted);
    expect(eyeOf(conv.host, "Kaydet").disabled).toBe(false);
    expect(eyeOf(conv.host, "Sil").disabled).toBe(false);
    expect(conv.host.textContent).not.toContain(COMMANDS_CARD_SAVE);
    expect(conv.host.textContent).not.toContain(COMMANDS_CARD_DELETE);
  });

  it("eye hides a command and the summary reads \"Çubukta gizli · kısayolu çalışmaz\"", () => {
    const { host, last } = mount(converted);
    act(() => eyeOf(host, "Yenile").click());
    expect(last()).toEqual(toggleCommand(converted, "refresh"));
    expect(commandShown(last(), "refresh")).toBe(false);
    expect(rowOf(host, "Yenile").textContent).toContain(COMMANDS_HIDDEN_SUMMARY);
    expect(COMMANDS_HIDDEN_SUMMARY).toBe("Çubukta gizli · kısayolu çalışmaz");
    openRow(host, "Yenile");
    expect(rowOf(host, "Yenile").textContent).toContain(COMMANDS_HIDDEN_DETAIL);
    expect(COMMANDS_HIDDEN_DETAIL).toBe("Gizli komutun ayarları korunur; göz açılınca geri gelir.");
    // Gizli Sil'in ayarları korunur.
    act(() => eyeOf(host, "Sil").click());
    act(() => eyeOf(host, "Sil").click());
    expect(commandsBar(last())!.props.deleteQuery).toBe("silSql");
  });

  it("Yalnız yeni kayıtta writes the record-key condition; Koşula göre opens the rule builder", () => {
    const { host, last } = mount(converted);
    openRow(host, "Sil");
    const row = rowOf(host, "Sil");
    inOrder(row.textContent!, ["Ne zaman görünsün?", "Her zaman", "Yalnız yeni kayıtta", "Yalnız var olan kayıtta", "Koşula göre"]);
    act(() => button(row, "Yalnız yeni kayıtta").click());
    expect(commandWhenChoice(last(), "delete")).toEqual({ choice: "new", condition: "kayit.rows[0].kod == null" });
    act(() => button(row, "Yalnız var olan kayıtta").click());
    expect(commandWhenChoice(last(), "delete")).toEqual({ choice: "edit", condition: "kayit.rows[0].kod != null" });
    expect(rowOf(host, "Sil").textContent).not.toContain("Kod olarak yaz");
    act(() => button(rowOf(host, "Sil"), "Koşula göre").click());
    expect(rowOf(host, "Sil").textContent).toContain("Kod olarak yaz");
    act(() => button(rowOf(host, "Sil"), "Her zaman").click());
    expect(commandWhenChoice(last(), "delete").choice).toBe("always");

    // Liste kalıbında kısa seçimler yoktur.
    const list = mount(listPage, "list");
    openRow(list.host, "Yenile");
    expect(rowOf(list.host, "Yenile").textContent).toContain("Koşula göre");
    expect(rowOf(list.host, "Yenile").textContent).not.toContain("Yalnız yeni kayıtta");
  });

  it("raw standard steps are listed read-only under Gelişmiş; catalog steps can be added and removed", () => {
    const conv = mount(converted);
    openRow(conv.host, "Kaydet");
    const rawRow = rowOf(conv.host, "Kaydet");

    inOrder(rawRow.textContent!, ["Kaydetme sırası", "+ Adım ekle", "Bir adım hata verirse dur",
      "Adımlar yazılımcının hazırladığı eylemlerdir; yetki ve onay sorusu ondan gelir.", "Gelişmiş", "Standarttan gelen adımlar (salt okunur)", "kaydetSql", "guncelleSql",
      "Kaydettikten sonra", "Kartın kuralı", "Ekran aç", "Hangi ekran", "Nerede", "Açılan ekranı yenile"]);
    expect(rawRow.querySelector('[aria-label="kaydetSql kaldır"]')).toBeNull();

    const studio = mount(built);
    openRow(studio.host, "Kaydet");
    let row = rowOf(studio.host, "Kaydet");
    inOrder(row.textContent!, ["Cari ekle", "Cari güncelle", "+ Adım ekle"]);
    expect(row.textContent).not.toContain("Standarttan gelen adımlar");
    const add = row.querySelector<HTMLSelectElement>('select[aria-label="Adım ekle"]')!;
    setValue(add, "unvanGuncelle");
    expect(saveSteps(studio.last()).steps.map((step) => step.label)).toEqual(["cariEkle", "cariGuncelle", "unvanGuncelle"]);
    row = rowOf(studio.host, "Kaydet");
    act(() => row.querySelector<HTMLButtonElement>('[aria-label="Unvan güncelle kaldır"]')!.click());
    expect(saveSteps(studio.last()).steps.map((step) => step.label)).toEqual(["cariEkle", "cariGuncelle"]);
    // "Kartın kuralı": kural metni.
    expect(rowOf(studio.host, "Kaydet").textContent).toContain("Var olan kayıt yeniden yüklenir, kartta kalınır. Yeni kayıtta kart, kartı açan sekmeye döner; açan yoksa form temizlenir.");
  });

  it("Kaydet düğmesi section has no Sil row; Komutlar › Sil edits the delete action and confirm text", () => {
    const html = renderToString(<RecordPanel def={built} catalog={catalog} selection={{ kind: "page" }} pages={pages} onChange={() => {}} onSelect={() => {}}/>);
    expect(html).not.toContain(">Sil düğmesi");
    const { host, last } = mount(built);
    openRow(host, "Sil");
    const row = rowOf(host, "Sil");
    inOrder(row.textContent!, ["Silme eylemi", "Onay metni", "Boşsa \"Kayıt silinsin mi?\" sorulur.", "Yeni kayıtta Sil gösterilmez."]);
    const select = row.querySelector<HTMLSelectElement>('select[aria-label="Silme eylemi"]')!;
    expect(select.value).toBe("cariSil");
    setValue(select, "");
    expect(deleteCommand(last()).owner).toBeNull();
    // Kartın Sil düğmesi kalkınca çubuksuz sayfada Sil gizli olur; göz açılınca yalnız Sil gelir ve yeniden seçilebilir.
    expect(eyeOf(host, "Sil").getAttribute("aria-label")).toBe("Göster");
    act(() => eyeOf(host, "Sil").click());
    expect(commandShown(last(), "delete")).toBe(true);
    expect(commandShown(last(), "refresh")).toBe(false);
    setValue(rowOf(host, "Sil").querySelector<HTMLSelectElement>('select[aria-label="Silme eylemi"]')!, "cariSil");
    expect(deleteCommand(last())).toMatchObject({ owner: "button", actionCode: "cariSil" });
    const confirm = rowOf(host, "Sil").querySelector<HTMLInputElement>('input[aria-label="Onay metni"]')!;
    setValue(confirm, "{Unvan} silinsin mi?");
    expect(deleteCommand(last()).confirmText).toBe("{{kayit.rows[0].unvan}} silinsin mi?");
    expect(rowOf(host, "Sil").querySelector<HTMLInputElement>('input[aria-label="Onay metni"]')!.value).toBe("{Unvan} silinsin mi?");
    // Listede alanlar seçili satırdan doldurulur.
    const list = mount(listPage, "list");
    openRow(list.host, "Sil");
    expect(rowOf(list.host, "Sil").textContent).toContain("Alanlar seçili satırdan doldurulur.");
  });

  it("Kaydet ve yeni is offered only when Kaydet is in the commands", () => {
    const studio = mount(built);
    expect(eyeOf(studio.host, "Kaydet ve yeni").disabled).toBe(true);
    expect(rowOf(studio.host, "Kaydet ve yeni").textContent).toContain(COMMANDS_SAVE_NEW_BAR_ONLY);
    expect(COMMANDS_SAVE_NEW_BAR_ONLY).toBe("Kaydet ve yeni yalnız Komutlar'daki Kaydet ile kullanılır.");
    const conv = mount(converted);
    const eye = eyeOf(conv.host, "Kaydet ve yeni");
    expect(eye.disabled).toBe(false);
    act(() => eye.click());
    expect(commandsBar(conv.last())!.props.saveAndNew).toBe(true);
    openRow(conv.host, "Kaydet ve yeni");
    expect(rowOf(conv.host, "Kaydet ve yeni").textContent).toContain("Kaydeder; başarılı olursa \"Kaydettikten sonra\" yerine Yeni'yi çalıştırır. Kaydet ya da Yeni gizliyse bu da gizlidir.");
  });

  it("list page panel opens with nothing selected and shows Filtre, Excel and Başlıkta kayıt sayısı", () => {
    const list = { definition: listPage, catalog, catalogStatus: "ready" as const, operationOf: () => undefined, isTenantAdmin: false, onChange: () => {} };
    const page = { name: "Cari hesaplar", onRename: () => {}, pages };
    for (const component of [null, listPage.components.find((item) => item.id === "komutlar")!]) {
      const html = renderToString(<TemplateInspector component={component} legacy={<i>BUGUNKU</i>} list={list} page={page} tokens={[]} onPlace={() => {}}/>);
      expect(html).not.toContain("BUGUNKU");
      inOrder(html, ["Cari hesaplar", "Liste", "Cariler veri kaynağı · 2 kolon", "Komutlar", "Düzenle · Görüntüle", "Filtre", "Excel", "Diğer menüsü",
        "1 düğme · Yeni teklif", "Başlıkta kayıt sayısı"]);
    }
    const { host, last } = mount(listPage, "list");
    const count = host.querySelector<HTMLInputElement>('input[aria-label="Başlıkta kayıt sayısı"]')!;
    expect(count.checked).toBe(true);
    act(() => count.click());
    expect(commandsBar(last())!.props.titleCount).toBeUndefined();
    openRow(host, "Kaydet");
    expect(rowOf(host, "Kaydet").textContent).toContain("Liste sayfası kaydetmez; Kaydet çubukta yoktur.");
    // Odak alanı temizlenebilir.
    openRow(host, "Filtre");
    setValue(rowOf(host, "Filtre").querySelector<HTMLSelectElement>('select[aria-label="Odaklanacak alan"]')!, "");
    expect(commandsBar(last())!.props.focusInput).toBeUndefined();
    // Ekran seçilmeden Düzenle'nin "Nerede"si yazılmaz.
    const empty = mount({ ...listPage, components: listPage.components.map((component) => component.id === "komutlar" ? { ...component, props: { slot: "commands" } } : component) }, "list");
    openRow(empty.host, "Düzenle · Görüntüle");
    expect(button(rowOf(empty.host, "Düzenle · Görüntüle"), "Yeni sekmede").disabled).toBe(true);
  });

  it("no technical terms in the section", () => {
    for (const [def, template] of [[converted, "record"], [listPage, "list"], [built, "record"]] as const) {
      const { host } = mount(def, template);
      const labels = [...host.querySelectorAll(".pd-cmd-name")].map((item) => item.textContent!);
      for (const label of labels) {
        openRow(host, label);
        host.querySelectorAll("details").forEach((details) => { details.open = true; });
        for (const word of ["actionBar", "slot", "{{", "komutlar", "commandWhen", "kayit.rows", "seciliSatir", "titleCount"])
          expect(host.innerHTML, `${template} ${label} ${word}`).not.toContain(word);
      }
    }
  });

  it("the commands bar opens the page panel in Kayıt kartı and Serbest", () => {
    const withBar: ModelDefinition = { ...built, components: [...built.components, { id: "komutlar", type: "actionBar", props: { slot: "commands" } }] };
    expect(recordSelectionOf(withBar, "komutlar")).toEqual({ kind: "page" });
    const freeBase = newFreeTemplateDefinition() as unknown as ModelDefinition;
    const free: ModelDefinition = { ...freeBase, components: [...freeBase.components, { id: "komutlar", type: "actionBar", props: { slot: "commands" } }] };
    const html = renderToString(<TemplateInspector component={free.components.at(-1)!} legacy={<i>BUGUNKU</i>} list={null} tokens={[]} onPlace={() => {}}
      free={{ def: free, catalog, onChange: () => {}, onSelect: () => {}, name: "Pano", pages }}/>);
    expect(html).not.toContain("BUGUNKU");
    inOrder(html, ["Sekmeler", "Eylemler", "Komutlar", "Filtre", "Excel"]);
  });

  it("Kaydet düğmesi is locked when Kaydet is in the commands", () => {
    const html = renderToString(<RecordPanel def={converted} catalog={catalog} selection={{ kind: "page" }} pages={pages} onChange={() => {}} onSelect={() => {}}/>);
    const save = html.slice(html.indexOf("Kaydet düğmesi"), html.indexOf("Öne çıkan değerler"));
    expect(save).toContain("Bu kartın Kaydet&#x27;i Komutlar&#x27;dadır; adımları Komutlar › Kaydet&#x27;te düzenlenir.");
    expect(save).not.toContain("bir eyleme bağlı değil");
    expect(save.match(/<select[^>]*disabled/g)).toHaveLength(2);
  });
});
