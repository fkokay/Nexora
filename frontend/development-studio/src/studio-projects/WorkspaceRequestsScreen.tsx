// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { ArrowLeft, ChevronRight, Code2, ShieldCheck } from "lucide-react";
import { workspaceStatusTone } from "./helpers";
import type { DevelopmentProject, DevelopmentRequest, SavedArchitecturePlan, WorkspaceRequest } from "./types";

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
  return (
    <section className="studio-workspace-screen">
      <div className="studio-workspace-page">
        <nav className="studio-workspace-nav">
          <button
            type="button"
            className="studio-workspace-back"
            onClick={() => setWorkspaceProject(null)}
          >
            <ArrowLeft size={16} /> Projelere dön
          </button>
          <span>
            Studio <ChevronRight size={13} /> Projeler{" "}
            <ChevronRight size={13} /> Çalışma alanı
          </span>
        </nav>
        <header className="studio-workspace-hero">
          <div className="studio-workspace-hero-copy">
            <p className="eyebrow">İZOLE ÇALIŞMA ALANI</p>
            <h1>{workspaceProject.name}</h1>
            <p>
              Seçtiğiniz dal başlangıç noktasıdır. Onaydan sonra Runner her
              talep için ayrı bir yerel AI çalışma dalı açar; uzak depoya
              push yapılmaz.
            </p>
            <div className="studio-workspace-meta">
              <span>
                <Code2 size={14} />
                {workspaceProject.repositoryUrl}
              </span>
              <span>
                <span className="studio-workspace-meta-dot" />
                Başlangıç dalı: <b>{workspaceProject.defaultBranch}</b>
              </span>
            </div>
          </div>
          <span className="studio-workspace-access">
            {workspaceProject.accessLevel === "TenantAdmin"
              ? "Yönetici"
              : workspaceProject.accessLevel === "Maintainer"
                ? "Bakım sorumlusu"
                : workspaceProject.accessLevel === "Contributor"
                  ? "Katılımcı"
                  : "Görüntüleyici"}
          </span>
        </header>
        <main className="studio-workspace-content">
          <section className="studio-workspace-intro">
            <div>
              <p className="eyebrow">YENİ TALEP</p>
              <h2>Çalışma alanı oluştur</h2>
              <p>
                Bir başlangıç dalı seçin ve isterseniz geliştirme talebine
                bağlayın.
              </p>
            </div>
          </section>
          {!workspaceProject.githubAuthorized && (
            <div className="boundary-note">
              <ShieldCheck size={17} />
              <span>
                <b>GitHub depo erişimi</b>
                {workspaceProject.githubAuthorized
                  ? "Bu proje GitHub App ile yetkilendirildi."
                  : "Özel depolar için GitHub App yetkilendirmesi gerekir."}
              </span>
              {(workspaceProject.accessLevel === "TenantAdmin" ||
                workspaceProject.accessLevel === "Maintainer") && (
                <div style={{ display: "flex", gap: 6 }}>
                  {!workspaceProject.githubAuthorized &&
                    workspaceProject.repositoryUrl.startsWith(
                      "https://github.com/",
                    ) && (
                      <button
                        type="button"
                        className="ns-btn ns-btn-sm small-button ns-btn-primary"
                        disabled={busy}
                        onClick={() => void connectProjectGitHub()}
                      >
                        GitHub ile yetkilendir
                      </button>
                    )}
                  {workspaceProject.githubAuthorized && (
                    <button
                      type="button"
                      className="ns-btn ns-btn-sm small-button"
                      disabled={busy}
                      onClick={() => void disconnectProjectGitHub()}
                    >
                      Bağlantıyı kaldır
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {error && <div className="alert">{error}</div>}
          <div className="studio-workspace-layout">
            {(workspaceProject.accessLevel === "TenantAdmin" ||
              workspaceProject.accessLevel === "Contributor" ||
              workspaceProject.accessLevel === "Maintainer") && (
              <section className="studio-workspace-create-card">
                <form onSubmit={createWorkspaceRequest}>
                  <label>
                    Çalışma dalı
                    <select
                      aria-label="Çalışma dalı seçin"
                      value={
                        customWorkspaceBranch ? "__custom" : workspaceBranch
                      }
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
                      <option value="__custom">
                        Başka bir dal adı gir…
                      </option>
                    </select>
                    {customWorkspaceBranch && (
                      <input
                        aria-label="Yeni çalışma dalı adı"
                        value={workspaceBranch}
                        onChange={(e) => setWorkspaceBranch(e.target.value)}
                        required
                        maxLength={256}
                        placeholder="feature/cari-hesaplar"
                      />
                    )}
                    <small>
                      {branchesLoading
                        ? "Git dalları yükleniyor…"
                        : branchesAvailable
                          ? `${workspaceBranches.length} dal seçilebilir; başka dal adı da girebilirsiniz.`
                          : branchListError ||
                            "Depo dalları şu anda alınamadı; varsayılan dalı seçebilir veya başka dal adı girebilirsiniz."}
                    </small>
                  </label>
                  {!branchesAvailable && !branchesLoading && (
                    <button
                      type="button"
                      className="ns-btn ns-btn-sm small-button"
                      disabled={busy}
                      onClick={() =>
                        void loadProjectBranches(workspaceProject)
                      }
                    >
                      Dalları yeniden yükle
                    </button>
                  )}
                  <label>
                    Bağlı geliştirme talebi
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
                    <small>
                      Seçilen talep, onay sırasında ve AI
                      Architect/Developer araçlarında bağlam olarak görünür.
                    </small>
                  </label>
                  <div className="modal-foot">
                    <span>
                      <ShieldCheck size={14} /> Onay bekleyen talep
                      oluşturulur
                    </span>
                    <button
                      className="ns-btn ns-btn-primary"
                      disabled={
                        busy ||
                        !workspaceBranch.trim() ||
                        (!customWorkspaceBranch &&
                          !workspaceBranches.includes(workspaceBranch))
                      }
                    >
                      {busy ? "Gönderiliyor…" : "Çalışma alanı iste"}{" "}
                      <span>→</span>
                    </button>
                  </div>
                </form>
              </section>
            )}
            <section className="studio-workspace-requests">
              <div className="list-toolbar">
                <div>
                  <h3>Çalışma alanı talepleri</h3>
                  <p>{workspaceRequests.length} kayıt</p>
                </div>
                <button
                  className="ns-btn ns-btn-sm small-button"
                  onClick={() => setShowPlanHistory(true)}
                >
                  Plan geçmişi ({savedArchitecturePlans.length})
                </button>
              </div>
              <div className="requests-list">
                {workspaceRequests.length ? (
                  workspaceRequests.map((request) => (
                    <article
                      className="request-row expanded workspace-request-row"
                      key={request.id}
                    >
                      <div className="request-symbol">
                        <Code2 size={17} />
                      </div>
                      <div
                        className="request-info workspace-launch-area"
                        role={
                          request.status === "Ready" ? "button" : undefined
                        }
                        tabIndex={
                          request.status === "Ready" ? 0 : undefined
                        }
                        title={
                          request.status === "Ready"
                            ? "Çalışma alanının dosyalarını aç"
                            : undefined
                        }
                        onClick={() => {
                          if (request.status === "Ready")
                            void loadWorkspaceFiles(request, "");
                        }}
                        onKeyDown={(event) => {
                          if (
                            request.status === "Ready" &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            void loadWorkspaceFiles(request, "");
                          }
                        }}
                      >
                        <div className="workspace-request-heading">
                          <b>
                            {request.workspaceBranchName
                              ? `${request.branchName} → ${request.workspaceBranchName}`
                              : request.branchName}
                          </b>
                          <span
                            className={`ns-badge ${workspaceStatusTone(request.status)}`}
                          >
                            {request.status === "PendingApproval"
                              ? "Onay bekliyor"
                              : request.status === "Approved"
                                ? "Onaylandı"
                                : request.status === "Provisioning"
                                  ? "Hazırlanıyor"
                                  : request.status === "ProvisioningFailed"
                                    ? "Başarısız"
                                    : request.status === "Cancelled"
                                      ? "İptal edildi"
                                      : request.status === "Ready"
                                        ? "Hazır"
                                        : request.status === "Rejected"
                                          ? "Reddedildi"
                                          : "Reddedildi"}
                          </span>
                        </div>
                        {request.developmentRequestTitle && (
                          <small>
                            Talep: {request.developmentRequestTitle}
                          </small>
                        )}
                        <small>
                          {new Date(request.createdAt).toLocaleString(
                            "tr-TR",
                            { dateStyle: "medium", timeStyle: "short" },
                          )}
                          {request.reviewNote
                            ? " · " + request.reviewNote
                            : ""}
                          {request.provisioningError
                            ? " · " + request.provisioningError
                            : ""}
                          {request.commitSha
                            ? " · " + request.commitSha
                            : ""}
                          {request.provisionedAt
                            ? " · " +
                              new Date(
                                request.provisionedAt,
                              ).toLocaleString("tr-TR", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : ""}
                          {request.status === "PendingApproval" &&
                          !request.canReview
                            ? " · farklı yetkili onayı bekleniyor"
                            : ""}
                        </small>
                      </div>
                      {request.status === "PendingApproval" &&
                        (request.canReview || request.canCancel) && (
                          <div style={{ display: "flex", gap: 6 }}>
                            {request.canReview && (
                              <>
                                <button
                                  className="ns-btn ns-btn-sm small-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void reviewWorkspaceRequest(
                                      request,
                                      "Approve",
                                    )
                                  }
                                >
                                  Onayla
                                </button>
                                <button
                                  className="ns-btn ns-btn-sm small-button"
                                  disabled={busy}
                                  onClick={() =>
                                    void reviewWorkspaceRequest(
                                      request,
                                      "Reject",
                                    )
                                  }
                                >
                                  Reddet
                                </button>
                              </>
                            )}
                            {request.canCancel && (
                              <button
                                className="ns-btn ns-btn-sm small-button"
                                disabled={busy}
                                onClick={() =>
                                  void cancelWorkspaceRequest(request)
                                }
                              >
                                Talebi iptal et
                              </button>
                            )}
                          </div>
                        )}
                      {request.canDelete &&
                        request.status !== "Provisioning" && (
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm small-button workspace-request-delete"
                            disabled={busy}
                            onClick={() =>
                              void archiveWorkspaceRequest(request)
                            }
                            title="Talebi etkin listeden sil"
                          >
                            Sil
                          </button>
                        )}
                      {(request.status === "Approved" ||
                        request.status === "ProvisioningFailed") &&
                        (workspaceProject.accessLevel === "TenantAdmin" ||
                          workspaceProject.accessLevel ===
                            "Maintainer") && (
                          <button
                            className="ns-btn ns-btn-sm small-button"
                            disabled={busy}
                            onClick={() => void provisionWorkspace(request)}
                          >
                            {request.status === "ProvisioningFailed"
                              ? "Yeniden dene"
                              : "Checkout oluştur"}
                          </button>
                        )}
                      {request.status === "Ready" && (
                        <div className="workspace-request-actions">
                          {request.workspaceBranchName === null &&
                            (workspaceProject.accessLevel ===
                              "TenantAdmin" ||
                              workspaceProject.accessLevel ===
                                "Maintainer") && (
                              <button
                                className="ns-btn ns-btn-sm small-button"
                                disabled={busy}
                                onClick={() =>
                                  void ensureWorkspaceBranch(request)
                                }
                              >
                                İzole dal oluştur
                              </button>
                            )}
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm small-button ns-btn-primary"
                            disabled={fileLoading}
                            onClick={() =>
                              void loadWorkspaceFiles(request, "")
                            }
                          >
                            <Code2 size={14} /> Dosyaları aç{" "}
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="empty-small">
                    <div>
                      <b>Bekleyen çalışma alanı talebi yok</b>
                      <small>Yeni talepler onay kuyruğunda görünür.</small>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
          {workspaceRequests.some(
            (x) => x.status === "PendingApproval" && x.canReview,
          ) && (
            <label className="review-note-field">
              <span>Ret gerekçesi</span>
              <small>Gerekçe inceleme geçmişine kaydedilir.</small>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Ret kararının kısa gerekçesini yazın…"
              />
            </label>
          )}
          <div className="boundary-note">
            <ShieldCheck size={17} />
            <span>
              <b>Yetkili onay</b>Yetkili onaydan sonra Runner seçilen kaynak
              dalından ayrı bir yerel çalışma dalı oluşturur. Bu dal
              şimdilik yalnız izole checkout içinde bulunur; push/PR ve kod
              çalıştırma yapılmaz.
            </span>
          </div>
        </main>
      </div>
    </section>
  );
}
