// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api", () => ({ api: vi.fn() }));

import { api } from "../../api";
import { useCatalogWorkspace } from "./catalogWorkspace";
import { flush, render } from "./testUtils";

const B = "/studio/projects/p/workspace-requests/w";
const R = "modules/crm";
const list = (path: string) => `${B}/files?path=${encodeURIComponent(path)}&offset=0`;
const dir = (path: string) => ({ name: path.split("/").at(-1)!, path, kind: "Directory", sizeBytes: null });
const file = (path: string) => ({ name: path.split("/").at(-1)!, path, kind: "File", sizeBytes: 1 });

let content = { json: "s-json-1", sql: "s-sql-1" };
const applied: Record<string, unknown>[] = [];
function serve(url: string, init?: RequestInit): unknown {
  if (url === list("")) return { path: "", entries: [dir("modules")], nextOffset: null };
  if (url === list("modules")) return { path: "modules", entries: [dir(R)], nextOffset: null };
  if (url === list(R)) return { path: R, entries: [dir(`${R}/veri`)], nextOffset: null };
  if (url === list(`${R}/veri`)) return { path: `${R}/veri`, entries: [file(`${R}/veri/c.json`), file(`${R}/veri/c.sql`)], nextOffset: null };
  if (url.includes("file-content")) {
    const path = decodeURIComponent(url.split("path=")[1]);
    const json = path.endsWith(".json");
    return { path, content: json ? '{"code":"c","label":"C","source":{"sql":"c.sql"}}' : "SELECT 1", sizeBytes: 1, sha256: json ? content.json : content.sql };
  }
  if (url.endsWith("/git-status")) return { branchName: "b", headCommitSha: "h", totalChangedFiles: 0, truncated: false, files: [] };
  if (url.endsWith("/apply-code-suggestion")) {
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    applied.push(body);
    return { filePath: body.filePath, sha256: `new-${String(body.filePath)}` };
  }
  throw new Error(`beklenmeyen ${url}`);
}

let hook: ReturnType<typeof useCatalogWorkspace>;
function Probe() { hook = useCatalogWorkspace("t", "p", "w", "crm"); return null; }

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (url: string, _token?: string, init?: RequestInit) => serve(url, init) as never);
  content = { json: "s-json-1", sql: "s-sql-1" };
  applied.length = 0;
});

describe("useCatalogWorkspace", () => {
  it("writes_with_given_expected_sha_and_creates_files_without_one", async () => {
    await render(<Probe />);
    await flush(); await flush();
    expect(hook.catalog?.fileShas).toEqual({ [`${R}/veri/c.json`]: "s-json-1", [`${R}/veri/c.sql`]: "s-sql-1" });
    let written: unknown;
    await act(async () => {
      written = await hook.writeFiles([
        { path: `${R}/veri/c.sql`, content: "SELECT 2", sha256: "s-sql-1" },
        { path: `${R}/veri/d.sql`, content: "SELECT 3" },
      ]);
    });
    expect(applied).toEqual([
      { filePath: `${R}/veri/c.sql`, expectedSha256: "s-sql-1", proposedContent: "SELECT 2", approvalConfirmed: true, createNewFile: false, manualEdit: true },
      { filePath: `${R}/veri/d.sql`, expectedSha256: "", proposedContent: "SELECT 3", approvalConfirmed: true, createNewFile: true, manualEdit: true },
    ]);
    expect(written).toEqual([
      { path: `${R}/veri/c.sql`, content: "SELECT 2", sha256: `new-${R}/veri/c.sql` },
      { path: `${R}/veri/d.sql`, content: "SELECT 3", sha256: `new-${R}/veri/d.sql` },
    ]);
    expect(hook.catalog?.fileShas[`${R}/veri/c.sql`]).toBe(`new-${R}/veri/c.sql`);
  });

  it("refresh_between_seed_and_save_sends_seeded_sha", async () => {
    await render(<Probe />);
    await flush(); await flush();
    const seeded = hook.catalog!.fileShas[`${R}/veri/c.sql`];
    const version = hook.catalog!.version;
    content = { json: "s-json-2", sql: "s-sql-2" };
    let ok = false;
    await act(async () => { ok = await hook.refresh(); });
    expect(ok).toBe(true);
    expect(hook.catalog!.fileShas[`${R}/veri/c.sql`]).toBe("s-sql-2");
    expect(hook.catalog!.version).not.toBe(version);
    await act(async () => { await hook.writeFiles([{ path: `${R}/veri/c.sql`, content: "x", sha256: seeded }]); });
    expect(applied[0].expectedSha256).toBe("s-sql-1");
  });

  it("refresh_reports_failure_and_load_error_when_listing_is_denied", async () => {
    await render(<Probe />);
    await flush(); await flush();
    vi.mocked(api).mockImplementation(async (url: string) => {
      if (url === list(R)) throw new Error("Bu işlem için yetkiniz yok.");
      return serve(url) as never;
    });
    let ok = true;
    await act(async () => { ok = await hook.refresh(); });
    expect(ok).toBe(false);
    expect(hook.loadError).toBe("Bu işlem için yetkiniz yok.");
  });
});
