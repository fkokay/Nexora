import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionBarPreview } from "./CanvasPreviews";
import { BarCommandRows } from "./BarCommandRows";
import { BarLookFields } from "./BarLookFields";
import { ConditionBuilder } from "./ConditionBuilder";
import {
  barLookMap, getBarLook, getCommandCondition, hiddenCommands, isCommandHidden, parseBarLook, setBarLook, setCommandCondition, setCommandHidden,
} from "./barLook";

describe("barLook", () => {
  it("okur; bilinmeyen anahtar ve geçersiz değer atlanır, yazılmamış anahtar varsayılandır", () => {
    expect(parseBarLook(["align=center", "size=xl", "foo=1", "accent=#12ab3C", "background=red", "align=end"])).toEqual({ align: "center", accent: "#12ab3C" });
    expect(getBarLook(undefined, "density")).toBe("normal");
    expect(getBarLook(undefined, "sticky")).toBe("false");
    expect(getBarLook(undefined, "accent")).toBe("");
    expect(barLookMap(["title=false"])).toEqual({ title: "false" });
  });
  it("varsayılana eşit değer yazılmaz; boş liste undefined", () => {
    expect(setBarLook(undefined, "align", "center")).toEqual(["align=center"]);
    expect(setBarLook(["align=center"], "align", "start")).toBeUndefined();
    expect(setBarLook(["size=lg"], "separators", "true")).toEqual(["size=lg"]);
    expect(setBarLook(["size=lg"], "separators", "false")).toEqual(["size=lg", "separators=false"]);
    expect(setBarLook(["size=lg", "radius=round"], "size", "sm")).toEqual(["size=sm", "radius=round"]);
    expect(setBarLook(["accent=#112233"], "accent", undefined)).toBeUndefined();
    expect(setBarLook(undefined, "accent", "#a1b2c3")).toEqual(["accent=#A1B2C3"]);
    expect(setBarLook(undefined, "accent", "red")).toBeUndefined();
    expect(setBarLook(undefined, "size", "xl")).toBeUndefined();
  });
});

describe("hiddenCommands", () => {
  it("sabit sırada yazar; boşsa undefined", () => {
    expect(setCommandHidden(undefined, "print", true)).toEqual(["print"]);
    expect(setCommandHidden(["print"], "new", true)).toEqual(["new", "print"]);
    expect(setCommandHidden(["new", "print"], "new", false)).toEqual(["print"]);
    expect(setCommandHidden(["print"], "print", false)).toBeUndefined();
    expect(hiddenCommands(["more", "x", "new"])).toEqual(["new", "more"]);
    expect(isCommandHidden(["more"], "more")).toBe(true);
  });
});

describe("commandWhen", () => {
  it("komut başına tek öğe; koşul ilk '='den sonrasıdır", () => {
    expect(getCommandCondition(["save=a.b == 'x'"], "save")).toBe("a.b == 'x'");
    expect(getCommandCondition(["save=a == 1"], "new")).toBeUndefined();
    expect(setCommandCondition(undefined, "delete", "x != null")).toEqual(["delete=x != null"]);
    expect(setCommandCondition(["new=a == 1", "delete=x != null"], "new", "a == 2")).toEqual(["new=a == 2", "delete=x != null"]);
    expect(setCommandCondition(["new=a == 1"], "new", undefined)).toBeUndefined();
  });
});

const BOUND = { new: true, open: false, save: true, remove: true, filter: true, print: true, excel: false };

describe("ActionBarPreview", () => {
  it("varsayılan görünüm bugünkü gibi çizilir", () => {
    const plain = renderToString(<ActionBarPreview bound={BOUND} moreCount={2} style={{}} title="Stok" count="3"/>);
    expect(renderToString(<ActionBarPreview bound={BOUND} moreCount={2} style={{}} title="Stok" count="3" hidden={[]} look={{}}/>)).toBe(plain);
    expect(plain).toContain("<div class=\"pd-actionbar-wrap\"><div class=\"pd-page-title\">");
    expect(plain.match(/pd-bar-sep/g)).toHaveLength(2);
    expect(plain).toContain("+ <!-- -->Yeni");
  });
  it("hidden/look verilmeyen çubuk önceki sürümün çıktısıyla birebir aynı", () => {
    // Önceki ActionBarPreview'in (bu değişiklikten önce) aynı girdi için ürettiği HTML.
    const before = "<div class=\"pd-actionbar-wrap\" style=\"grid-column:span 12\"><div class=\"pd-actionbar\" role=\"img\" aria-label=\"İşlem Çubuğu önizlemesi: Yeni, Kaydet, Sil, Yenile, Filtre, Excel bağlı\">"
      + "<span class=\"pd-bar-btn\" title=\"Yeni · F2\" data-shortcut=\"F2\">+ <!-- -->Yeni</span><span class=\"pd-bar-btn is-off\" title=\"Bu sayfada bağlanmadı · Enter\" data-shortcut=\"Enter\">Aç</span>"
      + "<span class=\"pd-bar-btn is-primary\" title=\"Kaydet · Ctrl+S\" data-shortcut=\"Ctrl+S\">Kaydet</span><span class=\"pd-bar-btn\" title=\"Sil · Ctrl+Del\" data-shortcut=\"Ctrl+Del\">Sil</span><span class=\"pd-bar-sep\"></span>"
      + "<span class=\"pd-bar-btn\" title=\"Yenile · F5\" data-shortcut=\"F5\">Yenile</span><span class=\"pd-bar-btn\" title=\"Filtre · Ctrl+F\" data-shortcut=\"Ctrl+F\">Filtre</span><span class=\"pd-bar-sep\"></span>"
      + "<span class=\"pd-bar-btn is-off\" title=\"Bu sayfada bağlanmadı · Ctrl+P\" data-shortcut=\"Ctrl+P\">Yazdır</span><span class=\"pd-bar-btn\" title=\"Excel · Ctrl+E\" data-shortcut=\"Ctrl+E\">Excel</span><span class=\"pd-bar-grow\"></span>"
      + "<span class=\"pd-bar-btn is-more is-off\" title=\"Bu sayfada bağlanmadı · Alt+İ\" data-shortcut=\"Alt+İ\">İşlemler<!-- --> ▾</span></div><p class=\"pd-actionbar-note\">Bu çubuk ERP&#x27;de sayfanın üstündeki İşlem Çubuğu&#x27;nda görünür.</p></div>";
    const bound = { new: true, open: false, save: true, remove: true, filter: true, print: false, excel: true };
    expect(renderToString(<ActionBarPreview bound={bound} moreCount={0} style={{ gridColumn: "span 12" }}/>)).toBe(before);
  });
  it("gizli komutlar çizilmez; boşalan grubun ayırıcısı düşer", () => {
    const html = renderToString(<ActionBarPreview bound={BOUND} moreCount={2} style={{}} hidden={["refresh", "filter", "more"]}/>);
    expect(html).not.toContain("Yenile");
    expect(html).not.toContain("İşlemler");
    expect(html.match(/pd-bar-sep/g)).toHaveLength(1);
  });
  it("look öznitelikleri ve unbound=hide / title=false", () => {
    const html = renderToString(<ActionBarPreview bound={BOUND} moreCount={0} style={{}} title="Stok" look={{ align: "center", unbound: "hide", title: "false", accent: "#112233", size: "md" }}/>);
    expect(html).toContain("data-align=\"center\"");
    expect(html).not.toContain("data-size");
    expect(html).toContain("--pd-bar-accent:#112233");
    expect(html).not.toContain("pd-page-title");
    expect(html).not.toContain("Excel");
    expect(html).not.toContain("İşlemler");
    expect(html).not.toContain("is-off");
  });
});

describe("bileşenler çizilir", () => {
  it("BarLookFields, BarCommandRows ve ConditionBuilder", () => {
    expect(renderToString(<BarLookFields props={{ barLook: ["align=end"] }} onPatch={() => {}}/>)).toContain("Renk ve çerçeve");
    const rows = renderToString(<BarCommandRows props={{ hiddenCommands: ["print"], commandWhen: ["save=a == 1"] }} summaries={{ new: "Pencere açar" }}
      renderDetail={() => null} paths={[]} pageNames={["a"]} onPatch={() => {}}/>);
    expect(rows).toContain("Çubukta gizli");
    expect(rows).toContain("Koşul");
    expect(rows).toContain("Kaydettikten sonra");
    const builder = renderToString(<ConditionBuilder value="kullanici.rol == 'TenantAdmin'" onChange={() => {}} paths={[{ path: "kullanici.rol", label: "rolü" }]} pageNames={[]} prop="visibleWhen"/>);
    expect(builder).toContain("Eğer");
    expect(builder).toContain("Rolü “TenantAdmin” ise görünür.");
    const code = renderToString(<ConditionBuilder value="!(a == 1)" onChange={() => {}} paths={[]} pageNames={["a"]} prop="visibleWhen"/>);
    expect(code).toContain("Kural kurucuya dön");
    expect(code).toContain("value=\"!(a == 1)\"");
  });
});
