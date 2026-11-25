import { describe, expect, it } from "vitest";
import { catalogGitState, detectCatalogRoot, loadCatalogFiles, type WorkspaceRead } from "./catalogWorkspace";

const B = "/studio/projects/p/workspace-requests/w";
const dir = (path: string) => ({ name: path.split("/").at(-1)!, path, kind: "Directory" as const, sizeBytes: null });
const file = (path: string) => ({ name: path.split("/").at(-1)!, path, kind: "File" as const, sizeBytes: 1 });

function reader(pages: Record<string, unknown>): WorkspaceRead {
  return async <T,>(url: string) => {
    if (!(url in pages)) throw new Error(`404 ${url}`);
    return pages[url] as T;
  };
}
const list = (path: string, offset = 0) => `${B}/files?path=${encodeURIComponent(path)}&offset=${offset}`;

describe("catalogWorkspace", () => {
  it("detects_single_module_with_catalog_folder_and_reads_paged_files", async () => {
    const read = reader({
      [list("")]: { path: "", entries: [dir("modules"), file("README.md")], nextOffset: null },
      [list("modules")]: { path: "modules", entries: [dir("modules/a"), dir("modules/b")], nextOffset: null },
      [list("modules/a")]: { path: "modules/a", entries: [file("modules/a/manifest.json")], nextOffset: null },
      [list("modules/b")]: { path: "modules/b", entries: [dir("modules/b/veri")], nextOffset: null },
      [list("modules/b/veri")]: { path: "modules/b/veri", entries: [file("modules/b/veri/x.json")], nextOffset: 1 },
      [list("modules/b/veri", 1)]: { path: "modules/b/veri", entries: [file("modules/b/veri/x.sql"), file("modules/b/veri/not.txt")], nextOffset: null },
      [`${B}/file-content?path=${encodeURIComponent("modules/b/veri/x.json")}`]: { path: "modules/b/veri/x.json", content: "{}", sizeBytes: 2, sha256: "s1" },
      [`${B}/file-content?path=${encodeURIComponent("modules/b/veri/x.sql")}`]: { path: "modules/b/veri/x.sql", content: "SELECT 1", sizeBytes: 8, sha256: "s2" },
    });
    expect(await detectCatalogRoot(read, B, "")).toBe("modules/b");
    expect(await detectCatalogRoot(read, B, "crm")).toBe("modules/crm");
    expect(await loadCatalogFiles(read, B, "modules/b")).toEqual([
      { path: "modules/b/veri/x.json", content: "{}", sha256: "s1" },
      { path: "modules/b/veri/x.sql", content: "SELECT 1", sha256: "s2" },
    ]);
    expect(await loadCatalogFiles(read, B, "modules/yok")).toEqual([]);
  });

  it("listing_errors_propagate_and_only_missing_folders_count_as_empty", async () => {
    const denied: WorkspaceRead = async <T,>(url: string) => {
      if (url === list("")) return { path: "", entries: [dir("modules")], nextOffset: null } as T;
      if (url === list("modules")) return { path: "modules", entries: [dir("modules/b")], nextOffset: null } as T;
      throw new Error("Bu işlem için yetkiniz yok.");
    };
    await expect(loadCatalogFiles(denied, B, "modules/b")).rejects.toThrow("Bu işlem için yetkiniz yok.");
    await expect(detectCatalogRoot(denied, B, "")).rejects.toThrow("Bu işlem için yetkiniz yok.");
    expect(await loadCatalogFiles(denied, B, "modules/yeni")).toEqual([]);
  });

  it("git_state_blocks_on_catalog_changes_truncation_or_missing_status", () => {
    const status = (paths: string[], truncated = false) =>
      ({ branchName: "b", headCommitSha: "h", totalChangedFiles: paths.length, truncated, files: paths.map(path => ({ path, status: "M" })) });
    expect(catalogGitState(status(["modules/b/src/lib.rs"]), "modules/b")).toEqual({ changedPaths: [], hasUncommitted: false });
    expect(catalogGitState(status(["modules/b/veri/x.sql"]), "modules/b")).toEqual({ changedPaths: ["modules/b/veri/x.sql"], hasUncommitted: true });
    expect(catalogGitState(status([], true), "modules/b").hasUncommitted).toBe(true);
    expect(catalogGitState(null, "modules/b").hasUncommitted).toBe(true);
  });
});
