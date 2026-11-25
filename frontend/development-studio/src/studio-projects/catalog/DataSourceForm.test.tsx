// @vitest-environment jsdom
import { act, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../WorkspaceCodeEditor", () => ({
  WorkspaceCodeEditor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="SQL" value={value} onChange={e => onChange?.(e.target.value)} />
  ),
}));
vi.mock("../../ui/confirmDialog", () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("./catalogApi", async () => {
  const actual = await vi.importActual<typeof import("./catalogApi")>("./catalogApi");
  return { ...actual, storePreview: vi.fn(), runPreview: vi.fn() };
});

import * as api from "./catalogApi";
import { confirmDialog } from "../../ui/confirmDialog";
import { DataSourceForm } from "./DataSourceForm";
import type { CatalogEntry } from "./catalogFiles";
import { button, click, field, render, type } from "./testUtils";

const root = "modules/satis";
const entry: CatalogEntry = {
  kind: "dataSource", code: "cariler", jsonPath: `${root}/veri/cariler.json`, sqlPath: `${root}/veri/cariler.sql`,
  sql: "SELECT Kod, Bakiye, SonOdeme FROM Cariler WHERE Sehir = @sehir",
  json: {
    code: "cariler", label: "Cari hesaplar", source: { sql: "cariler.sql" },
    parameters: [{ name: "sehir", type: "text" }],
    columns: [{ code: "Kod", label: "Cari kodu", type: "text", key: true }],
    opens: "cariKarti",
  },
};
const storePreview = vi.mocked(api.storePreview);
const runPreview = vi.mocked(api.runPreview);
const props = () => ({
  root, entry, existingCodes: ["cariler"], canEdit: true, canDevelop: true, token: "t",
  operations: [], writeFiles: vi.fn(async () => {}),
});
const columnCodes = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLInputElement>('[aria-label="Kolon kodu"]')].map(i => i.value);

beforeEach(() => {
  vi.resetAllMocks();
  storePreview.mockResolvedValue({ id: "p1" });
});

describe("DataSourceForm", () => {
  it("preview_detects_new_columns_with_mapped_types", async () => {
    runPreview.mockResolvedValue({
      columns: [
        { code: "Kod", label: "Kod", dataType: "text" },
        { code: "Bakiye", label: "Bakiye", dataType: "decimal" },
        { code: "SonOdeme", label: "SonOdeme", dataType: "date" },
      ],
      rows: [{ Kod: "C-1", Bakiye: 10.5, SonOdeme: "2026-12-02" }],
      rowCount: 1, truncated: false,
    });
    const host = await render(<DataSourceForm {...props()} />);
    await type(field(host, "Deneme değeri"), "Antalya");
    await click(button(host, "Önizle"));

    const bundle = storePreview.mock.calls[0][1] as { dataSources: Record<string, unknown>[] };
    expect(bundle.dataSources[0].source).toEqual({ sql: entry.sql });
    expect(runPreview).toHaveBeenCalledWith("t", "p1", "cariler", { sehir: "Antalya" });
    expect(columnCodes(host)).toEqual(["Kod", "Bakiye", "SonOdeme"]);
    const types = [...host.querySelectorAll<HTMLSelectElement>('[aria-label="Kolon tipi"]')].map(s => s.value);
    expect(types).toEqual(["text", "decimal", "date"]);
    const rows = [...host.querySelectorAll(".sp-cw-columns tbody tr")];
    expect(rows[0].querySelector(".sp-cw-tag")).toBeNull();
    expect(rows[1].querySelector(".sp-cw-tag")?.textContent).toBe("yeni");
    expect(host.querySelector(".sp-cw-result")?.textContent).toContain("C-1");
  });

  it("preview_error_keeps_columns_and_shows_server_message", async () => {
    runPreview.mockResolvedValueOnce({
      columns: [{ code: "Kod", label: "Kod", dataType: "text" }], rows: [["C-1"]], rowCount: 1, truncated: false,
    });
    const host = await render(<DataSourceForm {...props()} />);
    await click(button(host, "Önizle"));
    expect(host.querySelector(".sp-cw-result")?.textContent).toContain("C-1");

    runPreview.mockRejectedValueOnce(new api.CatalogApiError(400, "'sehir' parametresi eksik."));
    await click(button(host, "Önizle"));
    expect(host.textContent).toContain("'sehir' parametresi eksik.");
    expect(columnCodes(host)).toEqual(["Kod"]);
    expect(host.querySelector(".sp-cw-result")?.textContent).toContain("C-1");
  });

  it("non_developer_preview_button_disabled_with_notice", async () => {
    const host = await render(<DataSourceForm {...props()} canDevelop={false} />);
    expect(button(host, "Önizle")!.disabled).toBe(true);
    expect(host.textContent).toContain("Yalnızca yazılımcı ya da yönetici önizleyebilir.");
    await click(button(host, "Önizle"));
    expect(storePreview).not.toHaveBeenCalled();
  });

  it("save_sends_sha_seeded_at_open_even_after_newer_shas_arrive", async () => {
    vi.mocked(confirmDialog).mockResolvedValue(true);
    const writeFiles = vi.fn(async (files: { path: string; content: string; sha256?: string }[]) =>
      files.map(f => ({ ...f, sha256: `after-${f.path}` })));
    let setShas: (v: Record<string, string>) => void = () => {};
    function Host() {
      const [shas, set] = useState<Record<string, string>>({ [entry.sqlPath!]: "seed-sql", [entry.jsonPath]: "seed-json" });
      setShas = set;
      return <DataSourceForm {...props()} writeFiles={writeFiles} fileShas={shas} />;
    }
    const host = await render(<Host />);
    await act(async () => setShas({ [entry.sqlPath!]: "newer-sql", [entry.jsonPath]: "newer-json" }));
    await click(button(host, "Kaydet"));
    expect(writeFiles.mock.calls.map(c => c[0][0].sha256)).toEqual(["seed-sql", "seed-json"]);
    await click(button(host, "Kaydet"));
    expect(writeFiles.mock.calls.slice(2).map(c => c[0][0].sha256)).toEqual([`after-${entry.sqlPath}`, `after-${entry.jsonPath}`]);
  });
});
