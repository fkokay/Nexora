// @vitest-environment jsdom
import { act, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../WorkspaceCodeEditor", () => ({
  WorkspaceCodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="SQL" value={value} onChange={e => onChange?.(e.target.value)} />
  ),
}));
vi.mock("../../ui/confirmDialog", () => ({ confirmDialog: vi.fn() }));
vi.mock("../../platform-tools/erp-src/page-designer/erpOperations", async () => {
  const actual = await vi.importActual<object>("../../platform-tools/erp-src/page-designer/erpOperations");
  return { ...actual, loadErpOperations: vi.fn() };
});

import { confirmDialog } from "../../ui/confirmDialog";
import { loadErpOperations } from "../../platform-tools/erp-src/page-designer/erpOperations";
import { CatalogWorkbench } from "./CatalogWorkbench";
import { UNSAVED_CATALOG_EDITS, confirmDiscardCatalogEdits } from "./catalogFormModel";
import { readCatalogEntries, type CatalogFile } from "./catalogFiles";
import { button, click, field, render, type } from "./testUtils";

const root = "modules/satis";
const files: CatalogFile[] = [
  { path: `${root}/veri/cariler.json`, content: JSON.stringify({ code: "cariler", label: "Cari hesaplar", source: { sql: "cariler.sql" }, columns: [] }) },
  { path: `${root}/veri/cariler.sql`, content: "SELECT 1 AS Kod" },
  { path: `${root}/eylemler/kapat.json`, content: JSON.stringify({ code: "kapat", label: "Siparişi kapat", kind: "update", target: "row", run: { sql: "kapat.sql" } }) },
  { path: `${root}/eylemler/kapat.sql`, content: "UPDATE X SET A = 1" },
];
const { entries, errors } = readCatalogEntries(root, files);

const writeFiles = vi.fn<(files: CatalogFile[]) => Promise<void>>();
const props = () => ({
  root, entries, errors, canEdit: true, canDevelop: true, token: "t",
  changedPaths: [`${root}/veri/cariler.sql`], writeFiles, onPublish: vi.fn(),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  vi.mocked(loadErpOperations).mockResolvedValue([]);
  writeFiles.mockResolvedValue();
});

async function newDataSource(host: HTMLElement) {
  await click(host.querySelector('[aria-label="Yeni veri kaynağı"]')!);
  await type(field(host, "Görünen ad"), "Borçlu cariler");
  await type(field(host, "Kod"), "borclu");
  await type(field<HTMLTextAreaElement>(host, "SQL"), "SELECT Kod FROM Cariler");
}

describe("CatalogWorkbench", () => {
  it("tree_groups_entries_and_shows_files", async () => {
    const host = await render(<CatalogWorkbench {...props()} />);
    const groups = [...host.querySelectorAll(".sp-cw-group")];
    expect(groups.map(g => g.querySelector("h4")?.textContent)).toEqual(["Veri kaynakları+ Yeni", "Eylemler+ Yeni", "Dosyalar"]);
    expect(groups[0].textContent).toContain("Cari hesaplar");
    expect(groups[1].textContent).toContain("Siparişi kapat");
    expect(groups[2].textContent).toContain("veri/cariler.json");
    expect(groups[2].textContent).toContain("eylemler/kapat.sql");
    const cariler = [...groups[0].querySelectorAll("button")].find(b => b.textContent?.includes("Cari hesaplar"))!;
    expect(cariler.querySelector(".sp-cw-changed")).not.toBeNull();
    const kapat = [...groups[1].querySelectorAll("button")].find(b => b.textContent?.includes("Siparişi kapat"))!;
    expect(kapat.querySelector(".sp-cw-changed")).toBeNull();
    expect(button(host, "Sürüm yayınla")).toBeDefined();
  });

  it("new_data_source_save_writes_sql_then_json", async () => {
    const host = await render(<CatalogWorkbench {...props()} />);
    await newDataSource(host);
    await click(button(host, "Kaydet"));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(writeFiles).toHaveBeenCalledTimes(2);
    const [first] = writeFiles.mock.calls[0][0];
    const [second] = writeFiles.mock.calls[1][0];
    expect(first).toEqual({ path: `${root}/veri/borclu.sql`, content: "SELECT Kod FROM Cariler" });
    expect(second.path).toBe(`${root}/veri/borclu.json`);
    expect(JSON.parse(second.content)).toEqual({ code: "borclu", label: "Borçlu cariler", source: { sql: "borclu.sql" }, columns: [] });
    expect(host.textContent).toContain("Kaydedildi");
  });

  it("json_not_written_when_sql_write_fails", async () => {
    writeFiles.mockRejectedValueOnce(new Error("Bu işlem kaynak kod lisansı gerektirir."));
    const host = await render(<CatalogWorkbench {...props()} />);
    await newDataSource(host);
    await click(button(host, "Kaydet"));
    expect(writeFiles).toHaveBeenCalledTimes(1);
    expect(writeFiles.mock.calls[0][0][0].path).toBe(`${root}/veri/borclu.sql`);
    expect(host.textContent).toContain("Kaydedilemedi: Bu işlem kaynak kod lisansı gerektirir.");
  });

  it("action_form_has_no_try_button_and_writes_files", async () => {
    const host = await render(<CatalogWorkbench {...props()} />);
    await click([...host.querySelectorAll(".sp-cw-group button")].find(b => b.textContent?.includes("Siparişi kapat")));
    expect(button(host, "Dene")).toBeUndefined();
    expect(field<HTMLInputElement>(host, "Kod").disabled).toBe(true);
    await type(field<HTMLSelectElement>(host, "Tür"), "delete");
    await type(field(host, "Onay metni"), "Emin misiniz?");
    await click(button(host, "Kaydet"));
    expect(writeFiles).toHaveBeenCalledTimes(2);
    expect(writeFiles.mock.calls[0][0][0]).toEqual({ path: `${root}/eylemler/kapat.sql`, content: "UPDATE X SET A = 1" });
    const json = JSON.parse(writeFiles.mock.calls[1][0][0].content);
    expect(json).toEqual({ code: "kapat", label: "Siparişi kapat", kind: "delete", target: "row", run: { sql: "kapat.sql" }, confirm: { text: "Emin misiniz?" } });
  });

  it("selected_entry_removed_by_reload_closes_form", async () => {
    let setEntries: (v: typeof entries) => void = () => {};
    function Host() {
      const [list, set] = useState(entries);
      setEntries = set;
      return <CatalogWorkbench {...props()} entries={list} version={list.length} />;
    }
    const host = await render(<Host />);
    await click([...host.querySelectorAll(".sp-cw-group button")].find(b => b.textContent?.includes("Siparişi kapat")));
    expect(field<HTMLInputElement>(host, "Kod").value).toBe("kapat");
    await act(async () => setEntries(entries.filter(e => e.code !== "kapat")));
    expect(field<HTMLInputElement>(host, "Kod")).toBeUndefined();
    expect(host.textContent).toContain("Soldan bir yapı taşı seçin");
  });
  // Yeniden okuma (Sürüm yayınla, Yapı taşları) formu yeniden kurar: kaydedilmemiş değişiklik sorulmadan kaybolmaz.
  it("publish_with_dirty_form_asks_and_aborts_when_declined", async () => {
    const onPublish = vi.fn();
    const host = await render(<CatalogWorkbench {...props()} onPublish={onPublish} />);
    await type(field(host, "Görünen ad"), "Cari hesaplar (yeni)");
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await click(button(host, "Sürüm yayınla"));
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: UNSAVED_CATALOG_EDITS }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(field<HTMLInputElement>(host, "Görünen ad").value).toBe("Cari hesaplar (yeni)");
    await click(button(host, "Sürüm yayınla"));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("publish_with_clean_form_does_not_ask", async () => {
    const onPublish = vi.fn();
    const host = await render(<CatalogWorkbench {...props()} onPublish={onPublish} />);
    await click(button(host, "Sürüm yayınla"));
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("dirty_state_is_reported_and_cleared_by_save", async () => {
    const onDirtyChange = vi.fn();
    const onPublish = vi.fn();
    const host = await render(<CatalogWorkbench {...props()} onPublish={onPublish} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).not.toHaveBeenLastCalledWith(true);
    await type(field(host, "Görünen ad"), "Cari hesaplar (yeni)");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await click(button(host, "Kaydet"));
    expect(writeFiles).toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    vi.mocked(confirmDialog).mockClear();
    await click(button(host, "Sürüm yayınla"));
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("confirmDiscardCatalogEdits_asks_only_when_dirty", async () => {
    expect(await confirmDiscardCatalogEdits(false)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    expect(await confirmDiscardCatalogEdits(true)).toBe(false);
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: UNSAVED_CATALOG_EDITS }));
  });
});
