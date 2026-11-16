// Studio proje ekranlarının saf yardımcıları: etiketler, rota ve sınırlar.

export const maxManualWorkspaceFileBytes = 900 * 1024;

export function projectAccessLabel(level: string) {
  return level === "TenantAdmin"
    ? "Yönetici"
    : level === "Maintainer"
      ? "Bakım sorumlusu"
      : level === "Contributor"
        ? "Katılımcı"
        : "Görüntüleyici";
}
export function deploymentStatusLabel(status: string) {
  switch (status) {
    case "Succeeded":
      return "Başarılı";
    case "Failed":
      return "Başarısız";
    case "Running":
    case "InProgress":
      return "Çalışıyor";
    case "Queued":
    case "Pending":
      return "Sırada";
    case "Superseded":
      return "Önceki sürüm";
    case "Deleted":
    case "Removed":
      return "Silindi";
    default:
      return status;
  }
}
export function workspaceStatusTone(status: string) {
  switch (status) {
    case "Ready":
      return "is-success";
    case "Approved":
    case "Provisioning":
      return "is-info";
    case "PendingApproval":
      return "is-warning";
    case "ProvisioningFailed":
    case "Rejected":
      return "is-danger";
    default:
      return "";
  }
}

export function linkedDevelopmentContext(
  title: string | null,
  description: string | null,
) {
  return [title, description].filter(Boolean).join("\n\n").slice(0, 2000);
}


export function updateWorkspaceRoute(
  projectId?: string,
  requestId?: string,
  directoryPath?: string,
  openFilePath?: string,
) {
  const url = new URL(window.location.href);
  if (projectId && requestId) {
    url.searchParams.set("studioProject", projectId);
    url.searchParams.set("studioWorkspace", requestId);
    if (directoryPath) url.searchParams.set("studioPath", directoryPath);
    else url.searchParams.delete("studioPath");
    if (openFilePath) url.searchParams.set("studioFile", openFilePath);
    else url.searchParams.delete("studioFile");
  } else {
    url.searchParams.delete("studioProject");
    url.searchParams.delete("studioWorkspace");
    url.searchParams.delete("studioPath");
    url.searchParams.delete("studioFile");
  }
  window.history.replaceState(null, "", url.toString());
}
