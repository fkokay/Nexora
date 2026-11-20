// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Code2,
  GitBranch,
  History,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { workspaceStatusTone } from "./helpers";
import type { DevelopmentProject, DevelopmentRequest, SavedArchitecturePlan, WorkspaceRequest } from "./types";
import "./workspace-requests.css";

type WorkspaceFilter = "all" | "pending" | "ready" | "other";

const workspaceStatusText: Record<string, string> = {
  PendingApproval: "Onay bekliyor",
  Approved: "Onaylandı",
  Provisioning: "Hazırlanıyor",
  ProvisioningFailed: "Başarısız",
  Cancelled: "İptal edildi",
  Ready: "Hazır",
  Rejected: "Reddedildi",
};
const statusText = (status: string) => workspaceStatusText[status] || status;

const accessLabel = (level: string) =>
  level === "TenantAdmin"
    ? "Yönetici"
    : level === "Maintainer"
      ? "Bakım sorumlusu"
      : level === "Contributor"
        ? "Katılımcı"
        : "Görüntüleyici";

export type WorkspaceRequestsScreenProps = {
  archiveWorkspaceRequest: (request: WorkspaceRequest) => Promise<void>;
  branchListError: string;
  branchesAvailable: boolean;
  branchesLoading: boolean;
  busy: boolean;
  cancelWorkspaceRequest: (request: WorkspaceRequest) => Promise<void>;
  connectProjectGitHub: () => Promise<void>;
  createWorkspaceRequest: (e: FormEvent) => Promise<void>;
  customWorkspaceBranch: boolean;
  disconnectProjectGitHub: () => Promise<void>;
  ensureWorkspaceBranch: (request: WorkspaceRequest) => Promise<void>;
  error: string;
  fileLoading: boolean;
  loadProjectBranches: (project: DevelopmentProject) => Promise<void>;
  loadWorkspaceFiles: (request: WorkspaceRequest, path: string, offset?: number) => Promise<void>;
  projectDevelopmentRequests: DevelopmentRequest[];
  provisionWorkspace: (request: WorkspaceRequest) => Promise<void>;
  reviewNote: string;
  reviewWorkspaceRequest: (request: WorkspaceRequest, outcome: "Approve" | "Reject") => Promise<void>;
  savedArchitecturePlans: SavedArchitecturePlan[];
  selectedDevelopmentRequestId: string;
  setCustomWorkspaceBranch: Dispatch<SetStateAction<boolean>>;
  setReviewNote: Dispatch<SetStateAction<string>>;
  setSelectedDevelopmentRequestId: Dispatch<SetStateAction<string>>;
  setShowPlanHistory: Dispatch<SetStateAction<boolean>>;
  setWorkspaceBranch: Dispatch<SetStateAction<string>>;
  setWorkspaceProject: Dispatch<SetStateAction<DevelopmentProject | null>>;
  workspaceBranch: string;
  workspaceBranches: string[];
  workspaceProject: DevelopmentProject;
  workspaceRequests: WorkspaceRequest[];
};

export function WorkspaceRequestsScreen({
  archiveWorkspaceRequest,
  branchListError,
  branchesAvailable,
  branchesLoading,
  busy,
  cancelWorkspaceRequest,
  connectProjectGitHub,
  createWorkspaceRequest,
  customWorkspaceBranch,
  disconnectProjectGitHub,
  ensureWorkspaceBranch,
  error,
  fileLoading,
  loadProjectBranches,
  loadWorkspaceFiles,
  projectDevelopmentRequests,
  provisionWorkspace,
  reviewNote,
  reviewWorkspaceRequest,
  savedArchitecturePlans,
  selectedDevelopmentRequestId,
  setCustomWorkspaceBranch,
  setReviewNote,
  setSelectedDevelopmentRequestId,
  setShowPlanHistory,
  setWorkspaceBranch,
  setWorkspaceProject,
  workspaceBranch,
  workspaceBranches,
  workspaceProject,
  workspaceRequests,
}: WorkspaceRequestsScreenProps) {
  const [statusFilter, setStatusFilter] = useState<WorkspaceFilter>("all");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const canCreate =
    workspaceProject.accessLevel === "TenantAdmin" ||
    workspaceProject.accessLevel === "Contributor" ||
    workspaceProject.accessLevel === "Maintainer";
  const canManage =
    workspaceProject.accessLevel === "TenantAdmin" ||
    workspaceProject.accessLevel === "Maintainer";
  const filterCounts: Record<WorkspaceFilter, number> = {
    all: workspaceRequests.length,
    pending: workspaceRequests.filter((r) => r.status === "PendingApproval")
      .length,
    ready: workspaceRequests.filter((r) => r.status === "Ready").length,
    other: workspaceRequests.filter(
      (r) => r.status !== "PendingApproval" && r.status !== "Ready",
    ).length,
  };
  const visibleRequests = workspaceRequests.filter((request) =>
    statusFilter === "all"
      ? true
      : statusFilter === "pending"
        ? request.status === "PendingApproval"
        : statusFilter === "ready"
          ? request.status === "Ready"
          : request.status !== "PendingApproval" &&
            request.status !== "Ready",
  );
  const closeReject = () => {
    setRejectingId(null);
    setReviewNote("");
  };
  const formatDate = (value: string) =>
    new Date(value).toLocaleString("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <section className="studio-workspace-screen">
      <div className="studio-workspace-page wr-page">
        <nav className="wr-nav" aria-label="Konum">
          <button
            type="button"
            className="ns-btn ns-btn-ghost ns-btn-sm"
            onClick={() => setWorkspaceProject(null)}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Projeler
          </button>
          <ChevronRight size={13} aria-hidden="true" />
          <span>{workspaceProject.name}</span>
        </nav>
        <header className="st-hero wr-hero">
          <div className="st-hero-text">
            <h1>{workspaceProject.name}</h1>
            <p className="wr-repo">
              <code>{workspaceProject.repositoryUrl.replace(/^https?:\/\//, "")}</code>
              <span aria-hidden="true">·</span>
              başlangıç dalı <code>{workspaceProject.defaultBranch}</code>
            </p>
          </div>
          <span className="ns-badge is-accent">
            {accessLabel(workspaceProject.accessLevel)}
          </span>
        </header>

        {!workspaceProject.githubAuthorized && (
          <div className="wr-banner" role="status">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>Özel depolar için GitHub App yetkilendirmesi gerekiyor.</span>
            {canManage &&
              workspaceProject.repositoryUrl.startsWith(
                "https://github.com/",
              ) && (
                <button
                  type="button"
                  className="ns-btn ns-btn-sm"
                  disabled={busy}
                  onClick={() => void connectProjectGitHub()}
                >
                  GitHub ile yetkilendir
                </button>
              )}
          </div>
        )}
        {workspaceProject.githubAuthorized && canManage && (
          <div className="wr-github-ok">
            <ShieldCheck size={14} aria-hidden="true" />
            GitHub App ile yetkilendirildi
            <button
              type="button"
              className="ns-btn ns-btn-ghost ns-btn-sm"
              disabled={busy}
              onClick={() => void disconnectProjectGitHub()}
            >
              Bağlantıyı kaldır
            </button>
          </div>
        )}
        {error && (
          <div className="st-alert is-danger" role="alert">
            {error}
          </div>
        )}

        <div className={`wr-layout${canCreate ? "" : " is-single"}`}>
          {canCreate && (
            <section className="ns-card wr-create" aria-labelledby="wr-create-title">
              <header>
                <h2 id="wr-create-title">Yeni çalışma alanı</h2>
                <p>Onay bekleyen bir talep oluşturulur.</p>
              </header>
              <form onSubmit={createWorkspaceRequest}>
                <label className="ns-field">
                  <span className="ns-field-label">Başlangıç dalı</span>
                  <select
                    aria-label="Çalışma dalı seçin"
                    value={customWorkspaceBranch ? "__custom" : workspaceBranch}
                    disabled={branchesLoading}
                    onChange={(e) => {
                      if (e.target.value === "__custom") {
                        setCustomWorkspaceBranch(true);
                        setWorkspaceBranch("");
                      } else {
                        setCustomWorkspaceBranch(false);
                        setWorkspaceBranch(e.target.value);
                      }
                    }}
                  >
                    {workspaceBranches.map((branch) => (
                      <option value={branch} key={branch}>
                        {branch}
                      </option>
                    ))}
                    <option value="__custom">Başka bir dal adı gir…</option>
                  </select>
                  {customWorkspaceBranch && (
                    <input
                      aria-label="Yeni çalışma dalı adı"
                      className="ns-mono"
                      value={workspaceBranch}
                      onChange={(e) => setWorkspaceBranch(e.target.value)}
                      required
                      maxLength={256}
                      placeholder="feature/cari-hesaplar"
                    />
                  )}
                  <small className="ns-field-hint">
                    {branchesLoading
                      ? "Dallar yükleniyor…"
                      : branchesAvailable
                        ? `${workspaceBranches.length} dal · başka bir ad da girebilirsiniz`
                        : branchListError ||
                          "Dallar alınamadı; varsayılan dalı seçin veya ad girin."}
                  </small>
                </label>
                {!branchesAvailable && !branchesLoading && (
                  <button
                    type="button"
                    className="ns-btn ns-btn-sm wr-reload"
                    disabled={busy}
                    onClick={() => void loadProjectBranches(workspaceProject)}
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    Dalları yeniden yükle
                  </button>
                )}
                <label className="ns-field">
                  <span className="ns-field-label">Bağlı talep</span>
                  <select
                    value={selectedDevelopmentRequestId}
                    onChange={(e) =>
                      setSelectedDevelopmentRequestId(e.target.value)
                    }
                  >
                    <option value="">Bağımsız çalışma alanı</option>
                    {projectDevelopmentRequests.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                  <small className="ns-field-hint">
                    Onayda ve AI araçlarında bağlam olarak görünür.
                  </small>
                </label>
                <button
                  className="ns-btn ns-btn-primary wr-submit"
                  disabled={
                    busy ||
                    !workspaceBranch.trim() ||
                    (!customWorkspaceBranch &&
                      !workspaceBranches.includes(workspaceBranch))
                  }
                >
                  {busy ? "Gönderiliyor…" : "Çalışma alanı iste"}
                </button>
              </form>
            </section>
          )}

          <section className="ns-card wr-list" aria-labelledby="wr-list-title">
            <header className="wr-list-head">
              <h2 id="wr-list-title" className="ns-sr-only">
                Çalışma alanı talepleri
              </h2>
              <div
                className="st-segmented"
                role="group"
                aria-label="Duruma göre filtrele"
              >
                {(
                  [
                    ["all", "Tümü"],
                    ["pending", "Onay bekleyen"],
                    ["ready", "Hazır"],
                    ["other", "Diğer"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={statusFilter === id}
                    onClick={() => setStatusFilter(id)}
                  >
                    {label}
                    <span>{filterCounts[id]}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ns-btn ns-btn-sm"
                onClick={() => setShowPlanHistory(true)}
              >
                <History size={14} aria-hidden="true" />
                Plan geçmişi
                <span className="wr-count">{savedArchitecturePlans.length}</span>
              </button>
            </header>
            <p className="wr-flow" aria-label="Talep akışı">
              Onay bekliyor <ChevronRight size={12} aria-hidden="true" /> Onaylandı{" "}
              <ChevronRight size={12} aria-hidden="true" /> Checkout{" "}
              <ChevronRight size={12} aria-hidden="true" /> Hazır
            </p>
            {visibleRequests.length ? (
              <ul className="wr-rows">
                {visibleRequests.map((request) => {
                  const meta = [
                    request.developmentRequestTitle
                      ? `Talep: ${request.developmentRequestTitle}`
                      : "Bağımsız",
                    formatDate(request.createdAt),
                    request.commitSha ? request.commitSha.slice(0, 7) : "",
                    request.provisionedAt
                      ? `hazırlandı ${formatDate(request.provisionedAt)}`
                      : "",
                    request.status === "PendingApproval" && !request.canReview
                      ? "farklı yetkili onayı bekleniyor"
                      : "",
                  ].filter(Boolean);
                  const rejecting = rejectingId === request.id;
                  return (
                    <li className="wr-row" key={request.id}>
                      <span className="wr-row-icon" aria-hidden="true">
                        <GitBranch size={16} />
                      </span>
                      <div className="wr-row-main">
                        <div className="wr-row-title">
                          <code>
                            {request.workspaceBranchName
                              ? `${request.branchName} → ${request.workspaceBranchName}`
                              : request.branchName}
                          </code>
                          <span
                            className={`ns-badge ${workspaceStatusTone(request.status)}`}
                          >
                            {statusText(request.status)}
                          </span>
                        </div>
                        <small>{meta.join(" · ")}</small>
                        {(request.reviewNote || request.provisioningError) && (
                          <small
                            className={
                              request.provisioningError ? "is-error" : undefined
                            }
                          >
                            {request.provisioningError || request.reviewNote}
                          </small>
                        )}
                        {rejecting && (
                          <div className="wr-reject">
                            <label className="ns-field">
                              <span className="ns-field-label">Ret gerekçesi</span>
                              <textarea
                                value={reviewNote}
                                onChange={(e) => setReviewNote(e.target.value)}
                                maxLength={500}
                                rows={2}
                                autoFocus
                                placeholder="Kısa gerekçe yazın; inceleme geçmişine kaydedilir."
                              />
                            </label>
                            <div className="wr-reject-actions">
                              <button
                                type="button"
                                className="ns-btn ns-btn-sm"
                                onClick={closeReject}
                              >
                                Vazgeç
                              </button>
                              <button
                                type="button"
                                className="ns-btn ns-btn-sm ns-btn-danger"
                                disabled={busy || !reviewNote.trim()}
                                onClick={() =>
                                  void reviewWorkspaceRequest(
                                    request,
                                    "Reject",
                                  ).then(() => setRejectingId(null))
                                }
                              >
                                Reddi onayla
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="wr-row-actions">
                        {request.status === "PendingApproval" &&
                          request.canReview &&
                          !rejecting && (
                            <>
                              <button
                                className="ns-btn ns-btn-sm ns-btn-primary"
                                disabled={busy || rejectingId !== null}
                                onClick={() => {
                                  setReviewNote("");
                                  void reviewWorkspaceRequest(
                                    request,
                                    "Approve",
                                  );
                                }}
                              >
                                Onayla
                              </button>
                              <button
                                className="ns-btn ns-btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  setReviewNote("");
                                  setRejectingId(request.id);
                                }}
                              >
                                Reddet
                              </button>
                            </>
                          )}
                        {request.status === "PendingApproval" &&
                          request.canCancel && (
                            <button
                              className="ns-btn ns-btn-sm"
                              disabled={busy}
                              onClick={() => void cancelWorkspaceRequest(request)}
                            >
                              İptal et
                            </button>
                          )}
                        {(request.status === "Approved" ||
                          request.status === "ProvisioningFailed") &&
                          canManage && (
                            <button
                              className="ns-btn ns-btn-sm ns-btn-primary"
                              disabled={busy}
                              onClick={() => void provisionWorkspace(request)}
                            >
                              {request.status === "ProvisioningFailed"
                                ? "Yeniden dene"
                                : "Checkout oluştur"}
                            </button>
                          )}
                        {request.status === "Ready" &&
                          request.workspaceBranchName === null &&
                          canManage && (
                            <button
                              className="ns-btn ns-btn-sm"
                              disabled={busy}
                              onClick={() => void ensureWorkspaceBranch(request)}
                            >
                              İzole dal oluştur
                            </button>
                          )}
                        {request.status === "Ready" && (
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm ns-btn-primary"
                            disabled={fileLoading}
                            onClick={() => void loadWorkspaceFiles(request, "")}
                          >
                            <Code2 size={14} aria-hidden="true" /> Dosyaları aç
                          </button>
                        )}
                        {request.canDelete &&
                          request.status !== "Provisioning" && (
                            <button
                              type="button"
                              className="ns-btn ns-btn-ghost ns-btn-sm wr-delete"
                              disabled={busy}
                              onClick={() => void archiveWorkspaceRequest(request)}
                              aria-label="Talebi etkin listeden sil"
                              title="Talebi etkin listeden sil"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="wr-empty">
                <b>
                  {workspaceRequests.length
                    ? "Bu filtrede talep yok"
                    : "Henüz çalışma alanı talebi yok"}
                </b>
                <small>
                  {workspaceRequests.length
                    ? "Başka bir durum seçin."
                    : canCreate
                      ? "Soldan bir başlangıç dalı seçip çalışma alanı isteyin."
                      : "Yeni talepler burada ve onay kuyruğunda görünür."}
                </small>
              </div>
            )}
          </section>
        </div>
        <p className="st-quick-note wr-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>
            Onaydan sonra Runner seçilen daldan ayrı bir yerel çalışma dalı
            açar; push, PR ve kod çalıştırma yapılmaz.
          </span>
        </p>
      </div>
    </section>
  );
}
