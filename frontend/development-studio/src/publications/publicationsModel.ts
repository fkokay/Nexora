import { authorizedFetch } from "../api";

export type PendingPublication = {
  pageId: string;
  code: string;
  name: string;
  screenKey: string | null;
  updatedAt: string;
  updatedByName: string | null;
};
export type PublishedRevision = {
  pageId: string;
  revisionId: string;
  revision: number;
  code: string;
  name: string;
  screenKey: string | null;
  publishedAt: string;
  changedByName: string | null;
  isCurrent: boolean;
};
export type Publications = { pending: PendingPublication[]; history: PublishedRevision[] };

/** Bir projenin canlı ortam dağıtımı (`/studio/projects/{id}/production-deployments`). */
export type ModuleDeployment = {
  id: string;
  projectId: string;
  version: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

export type PublicationRow = {
  key: string;
  title: string;
  kind: "Ekran" | "Modül sürümü";
  by: string | null;
  at: string;
  status: "Taslak" | "Yayında" | "Önceki sürüm";
  action: "publish" | "restore" | null;
};

/** Yayınlar ucunun her listede döndürdüğü en çok satır. */
export const PUBLICATIONS_TAKE = 100;

const newestFirst = (a: PublicationRow, b: PublicationRow) => Date.parse(b.at) - Date.parse(a.at);

export function pendingRows(p: Publications): PublicationRow[] {
  return p.pending
    .map((item): PublicationRow => ({
      key: `page:${item.pageId}`,
      title: item.name,
      kind: "Ekran",
      by: item.updatedByName,
      at: item.updatedAt,
      status: "Taslak",
      action: "publish",
    }))
    .sort(newestFirst);
}

/** Ekran yayınları ve (verildiyse) başarılı modül dağıtımları, en yeni önce. Modül satırlarında eylem yoktur. */
export function historyRows(p: Publications, deployments?: ModuleDeployment[]): PublicationRow[] {
  const rows: PublicationRow[] = p.history.map((item) => ({
    key: `rev:${item.revisionId}`,
    title: item.name,
    kind: "Ekran",
    by: item.changedByName,
    at: item.publishedAt,
    status: item.isCurrent ? "Yayında" : "Önceki sürüm",
    action: item.isCurrent ? null : "restore",
  }));
  const succeeded = (deployments ?? []).filter((item) => item.status === "Succeeded");
  // Sunucu gibi: her projede en son tamamlanan başarılı dağıtım canlıdaki sürümdür.
  const live = new Map<string, ModuleDeployment>();
  for (const item of succeeded) {
    const current = live.get(item.projectId);
    if (!current || deploymentTime(item) > deploymentTime(current)) live.set(item.projectId, item);
  }
  for (const item of succeeded)
    rows.push({
      key: `deploy:${item.id}`,
      title: `Firma modülü ${item.version}`.trim(),
      kind: "Modül sürümü",
      by: null,
      at: item.completedAt ?? item.createdAt,
      status: live.get(item.projectId) === item ? "Yayında" : "Önceki sürüm",
      action: null,
    });
  return rows.sort(newestFirst);
}

function deploymentTime(item: ModuleDeployment) {
  return Date.parse(item.completedAt ?? item.createdAt);
}

const generic = (status: number) => `İşlem tamamlanamadı (${status}).`;

export function restoreErrorMessage(status: number, body?: { error?: string }): string {
  if (status === 409) return "Bu ekranın açık bir taslağı var. Önce onu yayınlayın ya da silin.";
  if (status >= 500) return generic(status);
  return body?.error || generic(status);
}

export function publishErrorMessage(status: number, body?: { error?: string }): string {
  if (status >= 500) return generic(status);
  return body?.error || generic(status);
}

type ApiDeployment = { id: string; version?: string; status: string; createdAt: string; completedAt?: string | null };

/**
 * Firmanın projelerindeki canlı ortam dağıtımları. Yalnız Yazılımcı ya da Yönetici rolü olan kişi için çağrılır;
 * Danışman `/studio/projects/**` uçlarını kullanamaz. Okunamayan proje atlanır, `failed` bunu bildirir.
 */
export async function loadModuleDeployments(token: string): Promise<{ deployments: ModuleDeployment[]; failed: boolean }> {
  const response = await authorizedFetch("/studio/projects/", token);
  if (!response.ok) throw new Error(generic(response.status));
  const projects = (await response.json()) as { id: string }[];
  const results = await Promise.allSettled(
    projects.map(async (project) => {
      const res = await authorizedFetch(`/studio/projects/${project.id}/production-deployments`, token);
      if (!res.ok) throw new Error(generic(res.status));
      const items = (await res.json()) as ApiDeployment[];
      return items.map(
        (item): ModuleDeployment => ({
          id: item.id,
          projectId: project.id,
          version: item.version ?? "",
          status: item.status,
          createdAt: item.createdAt,
          completedAt: item.completedAt ?? null,
        }),
      );
    }),
  );
  const deployments = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return { deployments, failed: results.some((result) => result.status === "rejected") };
}
