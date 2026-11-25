import { useCallback, useEffect, useRef, useState } from "react";
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

/** Olmayan klasör (ör. henüz veri/ içermeyen yeni modül) boş sayılır. */
const listOrEmpty = (read: WorkspaceRead, base: string, path: string) => listDirectory(read, base, path).catch(() => [] as WorkspaceFileEntry[]);
const hasCatalogFolder = (entries: WorkspaceFileEntry[]) => entries.some(e => e.kind === "Directory" && CATALOG_FOLDERS.includes(e.name));

/**
 * Katalog kökü: "Modül kodu:" varsa `modules/<kod>`; yoksa `veri/` ya da `eylemler/` içeren tek `modules/<x>` klasörü.
 * Aday yoksa ya da birden fazlaysa null.
 */
export async function detectCatalogRoot(read: WorkspaceRead, base: string, moduleCode: string): Promise<string | null> {
  if (moduleCode) return findCatalogRoot(moduleCode, [], []);
  const modules = (await listOrEmpty(read, base, "modules")).filter(e => e.kind === "Directory");
  const withCatalog: string[] = [];
  for (const dir of modules) if (hasCatalogFolder(await listOrEmpty(read, base, dir.path))) withCatalog.push(dir.path);
  return findCatalogRoot(null, modules.map(m => m.path), withCatalog);
}

/** `veri/` ve `eylemler/` altındaki .json ve .sql dosyaları, içerik ve sha256 ile. */
export async function loadCatalogFiles(read: WorkspaceRead, base: string, root: string): Promise<CatalogFile[]> {
  const rootEntries = await listOrEmpty(read, base, root);
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

type CatalogWorkspaceState = { key: string; root: string; files: CatalogFile[]; git: WorkspaceGitStatus | null; written: string[] };

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

  useEffect(() => {
    setState(null);
    setLoadError("");
    if (!key) return;
    let active = true;
    void (async () => {
      try {
        const root = await detectCatalogRoot(read, base, moduleCode);
        if (!root || !active) return;
        const [files, git] = await Promise.all([loadCatalogFiles(read, base, root), readGit()]);
        if (active) setState({ key, root, files, git, written: [] });
      } catch (e) {
        if (active) setLoadError((e as Error).message);
      }
    })();
    return () => { active = false; };
  }, [key, base, moduleCode, read, readGit]);

  const current = state && state.key === key ? state : null;
  const filesRef = useRef<CatalogFile[]>([]);
  filesRef.current = current?.files ?? [];

  /** Tek dosya yazar; dönen sha256 ve içerik durumda tutulur, sonraki kayıt eski sha ile reddedilmez. */
  const writeFiles = useCallback(async (files: CatalogFile[]) => {
    for (const file of files) {
      const existing = filesRef.current.find(f => f.path === file.path);
      const applied = await api<AppliedCodeSuggestion>(`${base}/apply-code-suggestion`, token, {
        method: "POST",
        body: JSON.stringify({
          filePath: file.path,
          expectedSha256: existing?.sha256 ?? "",
          proposedContent: file.content,
          approvalConfirmed: true,
          createNewFile: !existing,
          manualEdit: true,
        }),
      });
      const saved = { path: file.path, content: file.content, sha256: applied.sha256 };
      filesRef.current = [...filesRef.current.filter(f => f.path !== file.path), saved];
      setState(s => s && {
        ...s,
        files: [...s.files.filter(f => f.path !== file.path), saved],
        written: s.written.includes(file.path) ? s.written : [...s.written, file.path],
      });
    }
  }, [base, token]);

  /** Yayın penceresi açılmadan önce HEAD ve commit edilmemiş değişiklikler yeniden okunur. */
  const refreshGit = useCallback(async () => {
    const git = await readGit();
    setState(s => s && { ...s, git, written: [] });
  }, [readGit]);

  if (!current) return { catalog: null, loadError, writeFiles, refreshGit };
  const { entries, errors } = readCatalogEntries(current.root, current.files);
  const gitState = catalogGitState(current.git, current.root);
  const changedPaths = [...new Set([...gitState.changedPaths, ...current.written])];
  return {
    catalog: {
      root: current.root, files: current.files, entries, errors, changedPaths,
      hasUncommitted: gitState.hasUncommitted || current.written.length > 0,
      headCommitSha: current.git?.headCommitSha ?? null,
    },
    loadError, writeFiles, refreshGit,
  };
}
