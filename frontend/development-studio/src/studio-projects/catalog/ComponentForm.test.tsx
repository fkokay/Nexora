// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../WorkspaceCodeEditor", () => ({
  WorkspaceCodeEditor: ({ path, value, onChange }: { path: string; value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label={path.split("/").at(-1)} value={value} onChange={e => onChange?.(e.target.value)} />
  ),
}));
vi.mock("../../ui/confirmDialog", () => ({ confirmDialog: vi.fn() }));

import { confirmDialog } from "../../ui/confirmDialog";
import { ComponentForm } from "./ComponentForm";
import type { CatalogEntry, CatalogFile } from "./catalogFiles";
import { button, click, field, render, type } from "./testUtils";

const root = "modules/satis";
const dir = `${root}/bilesenler/satisHaritasi`;
const entry: CatalogEntry = {
  kind: "component", code: "satisHaritasi",
  jsonPath: `${dir}/bilesen.json`, cssPath: `${dir}/stil.css`, jsPath: `${dir}/kod.js`,
  css: ".kutu{}", javascript: "ciz()",
  json: {
    code: "satisHaritasi", label: "Satış haritası", height: 320,
    settings: [
      { name: "baslik", label: "Başlık", type: "text", default: "Satışlar" },
      { name: "donem", label: "Dönem", type: "choice", options: ["Bu ay", "Bu yıl"], default: "Bu ay" },
    ],
  },
};
const writeFiles = vi.fn<(files: CatalogFile[]) => Promise<void>>();
const props = () => ({ root, entry, existingCodes: ["satisHaritasi", "cariler"], canEdit: true, writeFiles });
const settingNames = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('[aria-label="Ayar adı"]')].map(i => i.value);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  writeFiles.mockResolvedValue();
});

describe("ComponentForm", () => {
  it("ComponentForm renders settings table and code editors without tabs", async () => {
    const host = await render(<ComponentForm {...props()} />);
    expect(host.querySelector("h3")?.textContent).toBe("Satış haritası");
    expect(host.textContent).toContain("Bileşen · danışman bunu paletten “Yazılımcı bileşeni” olarak seçer.");
    const labels = [...host.querySelectorAll(".sp-cw-grid .ns-field-label")].map(l => l.textContent);
    expect(labels).toEqual(["Kod", "Danışmanın göreceği ad", "Açıklama (isteğe bağlı)", "Başlangıç yüksekliği (px)"]);
    expect(field<HTMLInputElement>(host, "Kod").disabled).toBe(true);
    expect(field<HTMLInputElement>(host, "Başlangıç yüksekliği").value).toBe("320");
    expect(host.textContent).toContain("Bileşen gerekirse kendi yüksekliğini büyütebilir (en çok 2000 px).");
    expect(host.textContent).toContain("Danışmanın dolduracağı ayarlar");
    expect(host.textContent).toContain("En çok 10 ayar. Danışman yalnız bunları görür; kodu görmez.");
    const table = host.querySelector(".sp-cw-settings")!;
    expect([...table.querySelectorAll("th")].map(th => th.textContent)).toEqual(["Ad", "Etiket", "Tür", "Seçenekler", "Varsayılan", ""]);
    expect(settingNames(host)).toEqual(["baslik", "donem"]);
    expect(field<HTMLInputElement>(host, "Seçenekler", 0)?.value).toBe("Bu ay, Bu yıl");
    expect(host.textContent).toContain('Kodda bir ayar nexora.get("ayarlar.baslik") ile okunur.');
    // Kod düzenleyicileri sekmesiz, alt alta.
    expect(host.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
    const headings = [...host.querySelectorAll("h3")].map(h => h.textContent);
    expect(headings.indexOf("Görünüş (CSS)")).toBeGreaterThan(-1);
    expect(headings.indexOf("Görünüş (CSS)")).toBeLessThan(headings.indexOf("Kod (JavaScript)"));
    expect(field<HTMLTextAreaElement>(host, "stil.css").value).toBe(".kutu{}");
    expect(field<HTMLTextAreaElement>(host, "kod.js").value).toBe("ciz()");
    expect(host.textContent).toContain("Harici kaynak (yazı tipi, görsel adresi, CDN) yüklenemez.");
    expect(host.textContent).toContain("5 / 20000 karakter");
    expect(host.textContent).toContain("Dosyalar: bilesenler/satisHaritasi/bilesen.json · stil.css · kod.js — formdan ya da doğrudan dosyadan düzenlenebilir.");
    // Önizle paneli
    expect(button(host, "Çalıştır")).toBeDefined();
    expect(host.textContent).toContain("Örnek ayar değerleri");
  });

  it("settings_can_be_added_moved_and_removed", async () => {
    const host = await render(<ComponentForm {...props()} />);
    await click(button(host, "Ayar ekle"));
    expect(settingNames(host)).toEqual(["baslik", "donem", "ayar3"]);
    await click(host.querySelectorAll('[aria-label="Ayarı yukarı taşı"]')[1]);
    expect(settingNames(host)).toEqual(["donem", "baslik", "ayar3"]);
    await click(host.querySelectorAll('[aria-label="Ayarı sil"]')[0]);
    expect(settingNames(host)).toEqual(["baslik", "ayar3"]);
  });

  it("new_component_save_writes_css_js_then_json_and_problems_block_save", async () => {
    const host = await render(<ComponentForm {...props()} entry={null} />);
    expect(host.querySelector("h3")?.textContent).toBe("Yeni bileşen");
    await type(field(host, "Kod"), "Takvim");
    await type(field(host, "Görünen ad"), "Teslimat takvimi");
    await type(field<HTMLTextAreaElement>(host, "stil.css"), ".a{background:url(x.png)}");
    expect(host.textContent).toContain("Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.");
    expect(host.textContent).toContain("CSS'te harici kaynak kullanılamaz.");
    await click(button(host, "Kaydet"));
    expect(writeFiles).not.toHaveBeenCalled();
    await type(field(host, "Kod"), "cariler");
    await type(field<HTMLTextAreaElement>(host, "stil.css"), ".a{}");
    await type(field<HTMLTextAreaElement>(host, "kod.js"), "takvim()");
    await click(button(host, "Kaydet"));
    expect(host.textContent).toContain("Bu kod katalogda zaten kullanılıyor.");
    expect(writeFiles).not.toHaveBeenCalled();
    await type(field(host, "Kod"), "takvim");
    await click(button(host, "Kaydet"));
    expect(writeFiles.mock.calls.map(c => c[0][0].path)).toEqual([
      `${root}/bilesenler/takvim/stil.css`, `${root}/bilesenler/takvim/kod.js`, `${root}/bilesenler/takvim/bilesen.json`,
    ]);
    expect(writeFiles.mock.calls[1][0][0].content).toBe("takvim()");
    expect(JSON.parse(writeFiles.mock.calls[2][0][0].content)).toEqual({ code: "takvim", label: "Teslimat takvimi", settings: [] });
    expect(host.textContent).toContain("Kaydedildi");
  });
});
