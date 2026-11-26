// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./catalogApi", async () => {
  const actual = await vi.importActual<typeof import("./catalogApi")>("./catalogApi");
  return { ...actual, listReleases: vi.fn(), activeCatalog: vi.fn(), createRelease: vi.fn(), activateRelease: vi.fn() };
});
vi.mock("../../ui/confirmDialog", () => ({ confirmDialog: vi.fn() }));

import * as api from "./catalogApi";
import { confirmDialog } from "../../ui/confirmDialog";
import { CatalogReleaseDialog } from "./CatalogReleaseDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const root = "modules/satis";
const files = [{ path: `${root}/veri/cariler.json`, content: JSON.stringify({ code: "cariler", label: "Cariler", columns: [] }) }];
const listReleases = vi.mocked(api.listReleases);
const activeCatalog = vi.mocked(api.activeCatalog);
const createRelease = vi.mocked(api.createRelease);
const activateRelease = vi.mocked(api.activateRelease);

let mounted: { root: Root; host: HTMLElement }[] = [];
async function render(ui: ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  mounted.push({ root: r, host });
  await act(async () => r.render(ui));
  return host;
}
afterEach(() => {
  mounted.forEach(({ root: r, host }) => { act(() => r.unmount()); host.remove(); });
  mounted = [];
});
beforeEach(() => {
  vi.resetAllMocks();
  listReleases.mockResolvedValue([]);
  activeCatalog.mockResolvedValue({ releaseId: null, version: null, dataSources: [], actions: [] });
});

const props = {
  token: "t", root, files, hasUncommittedCatalogChanges: false, headCommitSha: "abcdef1234567890",
  repositoryUrl: "https://git.test/r.git", canDevelop: true, onClose: () => {},
};
const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text)) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined) => { await act(async () => void el!.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
const rel = (over: Partial<api.CatalogRelease>): api.CatalogRelease => ({
  id: "r1", version: "1.2.3", status: "Active", bundleSha256: "x", sourceRepository: null, sourceCommit: "1234567890abcdef",
  createdAt: "2026-11-01T10:00:00Z", activatedAt: null, ...over,
});

describe("CatalogReleaseDialog", () => {
  it("uncommitted_changes_block_without_requests", async () => {
    const host = await render(<CatalogReleaseDialog {...props} hasUncommittedCatalogChanges />);
    expect(host.textContent).toContain("Önce değişiklikleri commit edin.");
    expect(listReleases).not.toHaveBeenCalled();
    expect(activeCatalog).not.toHaveBeenCalled();
    expect(createRelease).not.toHaveBeenCalled();
    expect(button(host, "Taslak oluştur")?.disabled ?? true).toBe(true);
  });

  it("non_developer_sees_notice_and_disabled_publish", async () => {
    const host = await render(<CatalogReleaseDialog {...props} canDevelop={false} />);
    expect(host.textContent).toContain("Yalnızca yazılımcı ya da yönetici yayınlayabilir.");
    expect(button(host, "Taslak oluştur")!.disabled).toBe(true);
    expect(createRelease).not.toHaveBeenCalled();
  });

  it("suggests_next_patch_version", async () => {
    listReleases.mockResolvedValue([rel({ version: "1.2.3" })]);
    const host = await render(<CatalogReleaseDialog {...props} />);
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("1.2.4");
  });

  it("suggests_1_0_0_without_releases", async () => {
    const host = await render(<CatalogReleaseDialog {...props} />);
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("1.0.0");
  });

  it("create_then_activate_happy_path", async () => {
    activeCatalog.mockResolvedValue({ releaseId: "old", version: "0.9.0", dataSources: [], actions: [] });
    createRelease.mockResolvedValue({ id: "new", version: "1.0.0", status: "Draft", bundleSha256: "h" });
    activateRelease.mockResolvedValue({});
    const host = await render(<CatalogReleaseDialog {...props} />);
    await click(button(host, "Taslak oluştur"));
    expect(createRelease).toHaveBeenCalledWith("t", expect.objectContaining({
      version: "1.0.0", sourceCommit: "abcdef1234567890", sourceRepository: props.repositoryUrl, sourcePath: root,
      bundle: expect.objectContaining({ schemaVersion: 1 }),
    }));
    await click(button(host, "Etkinleştir"));
    expect(activateRelease).toHaveBeenCalledWith("t", "new", "old");
  });

  it("release dialog counts components", async () => {
    const withComponents = [
      ...files,
      { path: `${root}/bilesenler/harita/bilesen.json`, content: JSON.stringify({ code: "harita", label: "Harita", settings: [] }) },
      { path: `${root}/bilesenler/harita/stil.css`, content: "" },
      { path: `${root}/bilesenler/harita/kod.js`, content: "ciz()" },
      { path: `${root}/bilesenler/takvim/bilesen.json`, content: JSON.stringify({ code: "takvim", label: "Takvim", settings: [] }) },
      { path: `${root}/bilesenler/takvim/stil.css`, content: "" },
      { path: `${root}/bilesenler/takvim/kod.js`, content: "takvim()" },
    ];
    createRelease.mockResolvedValue({ id: "new", version: "1.0.0", status: "Draft", bundleSha256: "h" });
    const host = await render(<CatalogReleaseDialog {...props} files={withComponents} />);
    expect([...host.querySelectorAll(".sp-catalog-sum > div")].map(d => d.textContent)).toEqual(["Veri kaynağı1", "Eylem0", "Bileşen2"]);
    expect(host.textContent).toContain("Danışmanın sayfaları ve ayar değerleri değişmez.");
    await click(button(host, "Taslak oluştur"));
    const bundle = createRelease.mock.calls[0][1].bundle as { components: { code: string; javascript: string }[] };
    expect(bundle.components.map(c => [c.code, c.javascript])).toEqual([["harita", "ciz()"], ["takvim", "takvim()"]]);
  });

  it("create_error_is_shown_verbatim", async () => {
    createRelease.mockRejectedValue(new api.CatalogApiError(400, "Sunucu: paket geçersiz"));
    const host = await render(<CatalogReleaseDialog {...props} />);
    await click(button(host, "Taslak oluştur"));
    expect(host.querySelector(".alert")!.textContent).toBe("Sunucu: paket geçersiz");
  });

  it("lists_read_errors_and_does_not_create", async () => {
    const bad = [{ path: `${root}/veri/x.json`, content: "{" }];
    const host = await render(<CatalogReleaseDialog {...props} files={bad} />);
    await click(button(host, "Taslak oluştur"));
    expect(host.textContent).toContain("veri/x.json: JSON okunamadı.");
    expect(createRelease).not.toHaveBeenCalled();
  });

  it("activation_conflict_lists_affected_pages_and_keeps_draft", async () => {
    createRelease.mockResolvedValue({ id: "new", version: "1.0.0", status: "Draft", bundleSha256: "h" });
    activateRelease.mockRejectedValueOnce(new api.CatalogApiError(409, "Kırılma var", [{ code: "p1", name: "Cari listesi", references: ["cariler.sehir"] }]));
    const host = await render(<CatalogReleaseDialog {...props} />);
    await click(button(host, "Taslak oluştur"));
    await click(button(host, "Etkinleştir"));
    expect(host.textContent).toContain("Bu sayfalar etkilenir");
    expect(host.textContent).toContain("Cari listesi (p1): cariler.sehir");
    expect(button(host, "Etkinleştir")).toBeTruthy();
    activateRelease.mockResolvedValueOnce({});
    await click(button(host, "Etkinleştir"));
    expect(activateRelease).toHaveBeenCalledTimes(2);
    expect(createRelease).toHaveBeenCalledTimes(1);
  });

  it("warns_when_active_catalog_comes_from_other_path", async () => {
    activeCatalog.mockResolvedValue({ releaseId: "a", version: "1.0.0", sourcePath: "modules/eski", dataSources: [], actions: [] });
    const host = await render(<CatalogReleaseDialog {...props} />);
    expect(host.textContent).toContain("Etkin katalog modules/eski klasöründen; bu yayın onun yerini alır.");
  });

  it("rollback_confirms_then_activates_superseded", async () => {
    listReleases.mockResolvedValue([rel({ id: "a", version: "1.2.3", status: "Active" }), rel({ id: "b", version: "1.1.0", status: "Superseded" })]);
    activeCatalog.mockResolvedValue({ releaseId: "a", version: "1.2.3", dataSources: [], actions: [] });
    activateRelease.mockResolvedValue({});
    vi.mocked(confirmDialog).mockResolvedValue(true);
    const host = await render(<CatalogReleaseDialog {...props} />);
    expect(host.textContent).toContain("1234567");
    expect(host.textContent).not.toContain("1234567890");
    await click(button(host, "Bu sürüme dön"));
    expect(confirmDialog).toHaveBeenCalled();
    expect(activateRelease).toHaveBeenCalledWith("t", "b", "a");
  });

  it("rollback_cancelled_does_nothing", async () => {
    listReleases.mockResolvedValue([rel({ id: "b", status: "Superseded" })]);
    vi.mocked(confirmDialog).mockResolvedValue(false);
    const host = await render(<CatalogReleaseDialog {...props} />);
    await click(button(host, "Bu sürüme dön"));
    expect(activateRelease).not.toHaveBeenCalled();
  });
  it("stale_conflict_refreshes_active_id_and_retry_sends_it", async () => {
    activeCatalog.mockResolvedValueOnce({ releaseId: "old", version: "0.9.0", dataSources: [], actions: [] })
      .mockResolvedValue({ releaseId: "newer", version: "0.9.1", dataSources: [], actions: [] });
    createRelease.mockResolvedValue({ id: "new", version: "1.0.0", status: "Draft", bundleSha256: "h" });
    activateRelease.mockRejectedValueOnce(new api.CatalogApiError(409, "Etkin sürüm değişti; yeniden deneyin."));
    const host = await render(<CatalogReleaseDialog {...props} />);
    await click(button(host, "Taslak oluştur"));
    await click(button(host, "Etkinleştir"));
    expect(activateRelease).toHaveBeenLastCalledWith("t", "new", "old");
    expect(host.textContent).toContain("Etkin sürüm değişti; yeniden deneyin.");
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("1.0.0");
    activateRelease.mockResolvedValueOnce({});
    await click(button(host, "Etkinleştir"));
    expect(activateRelease).toHaveBeenLastCalledWith("t", "new", "newer");
    expect(host.textContent).toContain("1.0.0 sürümü etkinleştirildi.");
  });

  it("previous_success_notice_is_cleared_by_next_run", async () => {
    listReleases.mockResolvedValue([rel({ id: "a", version: "1.2.3", status: "Superseded" }), rel({ id: "b", version: "1.1.0", status: "Superseded" })]);
    vi.mocked(confirmDialog).mockResolvedValue(true);
    activateRelease.mockResolvedValueOnce({}).mockRejectedValueOnce(new api.CatalogApiError(400, "Olmadı"));
    const host = await render(<CatalogReleaseDialog {...props} />);
    await click(host.querySelectorAll<HTMLButtonElement>(".sp-catalog-releases button")[1]);
    expect(host.textContent).toContain("1.1.0 sürümü etkinleştirildi.");
    await click(host.querySelectorAll<HTMLButtonElement>(".sp-catalog-releases button")[0]);
    expect(host.textContent).toContain("Olmadı");
    expect(host.textContent).not.toContain("sürümü etkinleştirildi.");
  });

  it("rollback_double_click_asks_and_activates_once", async () => {
    listReleases.mockResolvedValue([rel({ id: "b", status: "Superseded" })]);
    let answer: (value: boolean) => void = () => {};
    vi.mocked(confirmDialog).mockImplementation(() => new Promise<boolean>(resolve => { answer = resolve; }));
    let finish: () => void = () => {};
    activateRelease.mockImplementation(() => new Promise(resolve => { finish = () => resolve({}); }));
    const host = await render(<CatalogReleaseDialog {...props} />);
    const back = button(host, "Bu sürüme dön")!;
    await click(back);
    await click(back);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    await act(async () => answer(true));
    expect(activateRelease).toHaveBeenCalledTimes(1);
    // İşlem sürerken pencere kapatılamaz.
    expect(button(host, "Vazgeç")!.disabled).toBe(true);
    expect((host.querySelector('[aria-label="Kapat"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect(button(host, "Vazgeç")!.disabled).toBe(false);
  });
});
