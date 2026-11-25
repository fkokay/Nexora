import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { AppliedCodeSuggestion, WorkspaceFileContent, WorkspaceFileEntry, WorkspaceFileListing, WorkspaceGitStatus } from "../types";
import { findCatalogRoot, readCatalogEntries, type CatalogFile } from "./catalogFiles";

/** `base`: `/studio/projects/<proje>/workspace-requests/<çalışma alanı>` */
export type WorkspaceRead = <T>(url: string) => Promise<T>;

const CATALOG_FOLDERS = ["veri", "eylemler"];

/** Klasörün bütün girdileri (`nextOffset` ile sayfalı liste sonuna kadar okunur). */
export async function listDirectory(read: WorkspaceRead, base: string, path: string): Promise<WorkspaceFileEntry[]> {
  const entries: WorkspaceFileEntry[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: WorkspaceFileListing = await read<WorkspaceFileListing>(`${base}/files?path=${encodeURIComponent(path)}&offset=${offset}`);
    entries.push(...page.entries);
    offset = page.nextOffset !== null && page.nextOffset > offset ? page.nextOffset : null;
  }
  return entries;
}

const hasCatalogFolder = (entries: WorkspaceFileEntry[]) => entries.some(e => e.kind === "Directory" && CATALOG_FOLDERS.includes(e.name));

/**
 * Klasör varsa girdileri, yoksa null. Varlık üst klasörlerin listesinden anlaşılır; okuma hataları (yetki, ağ)
 * yutulmaz, yukarı iletilir. Böylece okunamayan katalog boş katalog sanılıp yayınlanamaz.
 */
export async function listIfExists(read: WorkspaceRead, base: string, path: string): Promise<WorkspaceFileEntry[] | null> {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    const entries = await listDirectory(read, base, current);
    const next = current ? `${current}/${part}` : part;
    if (!entries.some(e => e.kind === "Directory" && (e.path === next || e.name === part))) return null;
    current = next;
  }
  return listDirectory(read, base, current);
}

/**
 * Katalog kökü: "Modül kodu:" varsa `modules/<kod>`; yoksa `veri/` ya da `eylemler/` içeren tek `modules/<x>` klasörü.
 * Aday yoksa ya da birden fazlaysa null.
 */
export async function detectCatalogRoot(read: WorkspaceRead, base: string, moduleCode: string): Promise<string | null> {
  if (moduleCode) return findCatalogRoot(moduleCode, [], []);
  const modules = ((await listIfExists(read, base, "modules")) ?? []).filter(e => e.kind === "Directory");
  const withCatalog: string[] = [];
  for (const dir of modules) if (hasCatalogFolder(await listDirectory(read, base, dir.path))) withCatalog.push(dir.path);
  return findCatalogRoot(null, modules.map(m => m.path), withCatalog);
}

/** `veri/` ve `eylemler/` altındaki .json ve .sql dosyaları, içerik ve sha256 ile. */
export async function loadCatalogFiles(read: WorkspaceRead, base: string, root: string): Promise<CatalogFile[]> {
  // Henüz oluşturulmamış modül klasörü (yeni modül) boş katalogdur.
  const rootEntries = (await listIfExists(read, base, root)) ?? [];
  const files: CatalogFile[] = [];
  for (const folder of rootEntries.filter(e => e.kind === "Directory" && CATALOG_FOLDERS.includes(e.name))) {
    const entries = await listDirectory(read, base, folder.path);
    for (const entry of entries.filter(e => e.kind === "File" && /\.(json|sql)$/.test(e.name))) {
      const file = await read<WorkspaceFileContent>(`${base}/file-content?path=${encodeURIComponent(entry.path)}`);
      files.push({ path: file.path, content: file.content, sha256: file.sha256 });
    }
  }
  return files;
}

/** Katalog klasörlerindeki commit edilmemiş dosyalar. Durum alınamadıysa ya da liste eksikse yayın engellenir. */
export function catalogGitState(status: WorkspaceGitStatus | null, root: string) {
  const prefixes = CATALOG_FOLDERS.map(folder => `${root}/${folder}/`);
  const changedPaths = (status?.files ?? []).map(f => f.path).filter(path => prefixes.some(p => path.startsWith(p)));
  return { changedPaths, hasUncommitted: !status || status.truncated || changedPaths.length > 0 };
}

/** Her okuma yeni bir sürüm numarası alır; görünüm formları buna göre yeniden kurar. */
let loadCount = 0;

type CatalogWorkspaceState = { key: string; version: number; root: string; files: CatalogFile[]; git: WorkspaceGitStatus | null; written: string[] };

/**
 * Çalışma alanının katalog kökünü ve dosyalarını yükler, yazmaları (apply-code-suggestion) yapar.
 * StudioProjects yalnız bunu bağlar; görünüm CatalogWorkbench'tedir.
 */
export function useCatalogWorkspace(token: string, projectId: string | null, requestId: string | null, moduleCode: string) {
  const [state, setState] = useState<CatalogWorkspaceState | null>(null);
  const [loadError, setLoadError] = useState("");
  const key = projectId && requestId ? `${projectId}/${requestId}/${moduleCode}` : "";
  const base = projectId && requestId ? `/studio/projects/${projectId}/workspace-requests/${requestId}` : "";

  const read = useCallback(<T,>(url: string) => api<T>(url, token), [token]);
  const readGit = useCallback(() => read<WorkspaceGitStatus>(`${base}/git-status`).catch(() => null), [read, base]);

  const load = useCallback(async (): Promise<CatalogWorkspaceState | null> => {
    const root = await detectCatalogRoot(read, base, moduleCode);
    if (!root) return null;
    const [files, git] = await Promise.all([loadCatalogFiles(read, base, root), readGit()]);
    return { key, version: ++loadCount, root, files, git, written: [] };
  }, [key, base, moduleCode, read, readGit]);

  useEffect(() => {
    setState(null);
    setLoadError("");
    if (!key) return;
    let active = true;
    load()
      .then(next => { if (active) setState(next); })
      .catch(e => { if (active) setLoadError((e as Error).message); });
    return () => { active = false; };
  }, [key, load]);

  const current = state && state.key === key ? state : null;

  /**
   * Dosyaları sırayla yazar. `sha256`, formun açıldığı andaki dosyanın sha'sıdır (yoksa dosya o an yoktu):
   * dosya sonradan değiştiyse sunucu eski sha hatası verir, daha yeni içerik ezilmez.
   * Yazılan dosyalar yeni sha'larıyla döner; form sonraki kaydını onlarla yapar.
   */
  const writeFiles = useCallback(async (files: CatalogFile[]): Promise<CatalogFile[]> => {
    const written: CatalogFile[] = [];
    for (const file of files) {
      const applied = await api<AppliedCodeSuggestion>(`${base}/apply-code-suggestion`, token, {
        method: "POST",
        body: JSON.stringify({
          filePath: file.path,
          expectedSha256: file.sha256 ?? "",
          proposedContent: file.content,
          approvalConfirmed: true,
          createNewFile: file.sha256 === undefined,
          manualEdit: true,
        }),
      });
      const saved = { path: file.path, content: file.content, sha256: applied.sha256 };
      written.push(saved);
      setState(s => s && {
        ...s,
        files: [...s.files.filter(f => f.path !== file.path), saved],
        written: s.written.includes(file.path) ? s.written : [...s.written, file.path],
      });
    }
    return written;
  }, [base, token]);

  /**
   * Dosyalar ve Git durumu yeniden okunur: Dosyalar görünümünde ya da başka bir yoldan yapılan değişiklikler
   * pakete ve sha'lara yansısın. Yayın penceresi açılmadan önce çağrılır; okunamazsa ya da kök artık bulunamıyorsa false döner.
   */
  const refresh = useCallback(async () => {
    if (!key) return false;
    try {
      const next = await load();
      setState(next);
      setLoadError("");
      return next !== null;
    } catch (e) {
      setLoadError((e as Error).message);
      return false;
    }
  }, [key, load]);

  if (!current) return { catalog: null, loadError, writeFiles, refresh };
  const { entries, errors } = readCatalogEntries(current.root, current.files);
  const gitState = catalogGitState(current.git, current.root);
  const changedPaths = [...new Set([...gitState.changedPaths, ...current.written])];
  return {
    catalog: {
      root: current.root, files: current.files, entries, errors, changedPaths, version: current.version,
      fileShas: Object.fromEntries(current.files.flatMap(f => (f.sha256 ? [[f.path, f.sha256]] : []))),
      hasUncommitted: gitState.hasUncommitted || current.written.length > 0,
      headCommitSha: current.git?.headCommitSha ?? null,
    },
    loadError, writeFiles, refresh,
  };
}
