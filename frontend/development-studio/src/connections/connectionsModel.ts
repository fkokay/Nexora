export type GitHubProject = { repositoryUrl: string; githubAuthorized: boolean };
export type GitHubRow = { title: "GitHub"; detail: string; status: "Bağlı" | "Bağlı değil" };

/** Depo bağlama ve GitHub yetkilendirmesi Firma modülü → Kod ve sürümler ekranında yapılır. */
export const MODULE_CODE_HREF = "#company-module/code";

/** `https://github.com/sahip/depo(.git)` → `sahip/depo`; GitHub adresi değilse adres olduğu gibi kalır. */
function repositoryPath(url: string): string {
  const trimmed = url.trim();
  const index = trimmed.toLowerCase().indexOf("github.com/");
  const path = index >= 0 ? trimmed.slice(index + "github.com/".length) : trimmed;
  return path.replace(/\/+$/, "").replace(/\.git$/i, "");
}

export function githubRows(projects: GitHubProject[]): GitHubRow[] {
  if (projects.length === 0) return [{ title: "GitHub", detail: "Henüz depo bağlanmadı", status: "Bağlı değil" }];
  return projects.map((project) => ({
    title: "GitHub",
    detail: repositoryPath(project.repositoryUrl),
    status: project.githubAuthorized ? "Bağlı" : "Bağlı değil",
  }));
}
