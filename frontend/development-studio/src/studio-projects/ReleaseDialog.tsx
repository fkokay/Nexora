// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { Box, X, GitBranch, Info, CheckCircle2, CircleX, CircleMinus, RefreshCw, ShieldCheck, Layers, FileCode, Code2 } from "lucide-react";
import { WebImageUpdate } from "../WebImageUpdate";
import { deploymentStatusLabel } from "./helpers";
import type { DevelopmentProject, ProductionApproval, PublishedPullRequest, PullRequestDraft, ReleaseCandidate, ReleaseDeployment, ReleasePackage, ReleaseVersion, StagingDeploymentOperation, Tenant, WorkspaceGitStatus, WorkspaceRequest, WorkspaceTestRunStatus } from "./types";

export type ReleaseDialogProps = {
  assignReleaseVersion: (candidate: ReleaseCandidate) => Promise<void>;
  commitApprovedWorkspaceChanges: () => Promise<void>;
  createPullRequestDraft: (candidate: ReleaseCandidate) => Promise<void>;
  createReleaseCandidate: () => Promise<void>;
  createReleasePackage: (version: ReleaseVersion) => Promise<void>;
  deployProduction: (approval: ProductionApproval) => Promise<void>;
  deployStaging: (pkg: { id: string; version: string; commitSha: string; }, rollbackTargetDeploymentId?: string) => Promise<void>;
  destroyStaging: (deployment: ReleaseDeployment) => Promise<void>;
  downloadReleasePackage: (pkg: ReleasePackage) => Promise<void>;
  error: string;
  gitDiffLoading: boolean;
  gitStatusLoading: boolean;
  gitStatusWorkspace: WorkspaceRequest;
  importGitHubReviewComments: (candidate: ReleaseCandidate) => Promise<void>;
  loadWorkspaceGitStatus: (request: WorkspaceRequest, refreshGithub?: boolean) => Promise<void>;
  markGitHubPullRequestReady: (candidate: ReleaseCandidate) => Promise<void>;
  openWorkspaceGitDiff: (path: string) => Promise<void>;
  productionApprovals: ProductionApproval[];
  productionDeployments: ReleaseDeployment[];
  publishPullRequest: (candidate: ReleaseCandidate) => Promise<void>;
  publishedPullRequest: PublishedPullRequest | null;
  pullRequestDraft: { candidateId: string; draft: PullRequestDraft; } | null;
  pullRequestDraftLoading: boolean;
  pullRequestPublishLoading: boolean;
  pullRequestReadyLoading: string | null;
  releaseCandidateSaving: boolean;
  releaseCandidates: ReleaseCandidate[];
  releaseDeploymentLoading: boolean;
  releaseDeployments: ReleaseDeployment[];
  releasePackageDownloadLoading: string | null;
  releasePackageLoading: string | null;
  releasePackages: ReleasePackage[];
  releaseTestEvidence: WorkspaceTestRunStatus | null;
  releaseVersions: ReleaseVersion[];
  requestGitHubReviewers: (candidate: ReleaseCandidate) => Promise<void>;
  requestProductionApproval: (deployment: ReleaseDeployment) => Promise<void>;
  restoreProductionDatabase: (deployment: ReleaseDeployment) => Promise<void>;
  reviewProductionApproval: (approval: ProductionApproval, decision: "Approved" | "Rejected") => Promise<void>;
  reviewReleaseCandidate: (candidate: ReleaseCandidate, decision: "Approved" | "Rejected") => Promise<void>;
  setGitStatusWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setWorkspaceGitStatus: Dispatch<SetStateAction<WorkspaceGitStatus | null>>;
  stagingCredentials: StagingDeploymentOperation | null;
  submitGitHubReview: (candidate: ReleaseCandidate, event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES") => Promise<void>;
  syncGitHubReviewComments: (candidate: ReleaseCandidate) => Promise<void>;
  tenant: Tenant;
  token: string;
  workspaceCommitLoading: boolean;
  workspaceGitStatus: WorkspaceGitStatus | null;
  workspaceProject: DevelopmentProject | null;
};

export function ReleaseDialog({
  assignReleaseVersion,
  commitApprovedWorkspaceChanges,
  createPullRequestDraft,
  createReleaseCandidate,
  createReleasePackage,
  deployProduction,
  deployStaging,
  destroyStaging,
  downloadReleasePackage,
  error,
  gitDiffLoading,
  gitStatusLoading,
  gitStatusWorkspace,
  importGitHubReviewComments,
  loadWorkspaceGitStatus,
  markGitHubPullRequestReady,
  openWorkspaceGitDiff,
  productionApprovals,
  productionDeployments,
  publishPullRequest,
  publishedPullRequest,
  pullRequestDraft,
  pullRequestDraftLoading,
  pullRequestPublishLoading,
  pullRequestReadyLoading,
  releaseCandidateSaving,
  releaseCandidates,
  releaseDeploymentLoading,
  releaseDeployments,
  releasePackageDownloadLoading,
  releasePackageLoading,
  releasePackages,
  releaseTestEvidence,
  releaseVersions,
  requestGitHubReviewers,
  requestProductionApproval,
  restoreProductionDatabase,
  reviewProductionApproval,
  reviewReleaseCandidate,
  setGitStatusWorkspace,
  setWorkspaceGitStatus,
  stagingCredentials,
  submitGitHubReview,
  syncGitHubReviewComments,
  tenant,
  token,
  workspaceCommitLoading,
  workspaceGitStatus,
  workspaceProject,
}: ReleaseDialogProps) {
  return (
    <Dialog
  onClose={() => { setGitStatusWorkspace(null);
          setWorkspaceGitStatus(null); }}
  className="studio-git-status-modal"
  backdropClassName="studio-git-status-backdrop"
  labelledBy="studio-git-status-title"
>
        <div className="modal-head">
          <span className="studio-git-status-mark"><Box size={28} /></span>
          <div>
            <p className="eyebrow">SÜRÜM YAYINI</p>
            <h2 id="studio-git-status-title">
              {workspaceProject?.name}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Kapat"
            onClick={() => {
              setGitStatusWorkspace(null);
              setWorkspaceGitStatus(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          Sürümünüzü hazırlayın, onaylayın ve ERP web uygulamasına yayınlayın.
        </p>
        {error && <div className="alert">{error}</div>}
        {gitStatusLoading ? (
          <div className="empty-small">Git durumu okunuyor…</div>
        ) : (
          workspaceGitStatus && (
            <>
              {(() => {
                const clean =
                  workspaceGitStatus.totalChangedFiles === 0 &&
                  !workspaceGitStatus.truncated;
                const testCurrent =
                  releaseTestEvidence?.status === "Passed" &&
                  releaseTestEvidence.success === true &&
                  releaseTestEvidence.commitSha ===
                    workspaceGitStatus.headCommitSha &&
                  !releaseTestEvidence.hasUncommittedChanges;
                const ready = clean && testCurrent;
                const canManage =
                  workspaceProject?.accessLevel === "TenantAdmin" ||
                  workspaceProject?.accessLevel === "Maintainer";
                const alreadySaved =
                  !!releaseTestEvidence &&
                  releaseCandidates.some(
                    (item) => item.testJobId === releaseTestEvidence.jobId,
                  );
                return (
                  <>
                    <section className="panel studio-release-readiness">
                      <div className="panel-heading">
                        <span className="studio-release-icon"><GitBranch size={24} /></span>
                        <div>
                          <b>
                            {ready
                              ? "Kontroller tamamlandı"
                              : "Hazırlık koşulları tamamlanmadı"}
                          </b>
                          <small>
                            Commit{" "}
                            {workspaceGitStatus.headCommitSha.slice(0, 12)}
                          </small>
                        </div>
                        <Info size={18} />
                      </div>
                      <div className="requests-list">
                        <article className={`request-row ${clean ? "is-passed" : "is-failed"}`}>
                          {clean ? <CheckCircle2 size={22} /> : <CircleX size={22} />}
                          <div className="request-info">
                            <b>
                              {clean
                                ? "Çalışma ağacı temiz"
                                : "Çalışma ağacında değişiklik var veya liste kesildi"}
                            </b>
                            <small>
                              {workspaceGitStatus.totalChangedFiles} değişen
                              dosya
                              {workspaceGitStatus.truncated
                                ? " · durum listesi eksik"
                                : ""}
                            </small>
                          </div>
                        </article>
                        <article className={`request-row ${testCurrent ? "is-passed" : "is-pending"}`}>
                          {testCurrent ? <CheckCircle2 size={22} /> : <CircleMinus size={22} />}
                          <div className="request-info">
                            <b>
                              {testCurrent
                                ? "Aynı commit için test başarılı"
                                : "Güncel commit için başarılı test kanıtı yok"}
                            </b>
                            <small>
                              {releaseTestEvidence
                                ? `${releaseTestEvidence.targetPath} · HEAD ${releaseTestEvidence.commitSha.slice(0, 12)}`
                                : "Bu commit için sunucuda başarılı test sonucu bulunamadı"}
                            </small>
                          </div>
                        </article>
                      </div>
                      {ready && canManage && !alreadySaved && (
                        <div className="modal-foot">
                          <span>
                            Test kanıtı sunucuda yeniden doğrulanır.
                          </span>
                          <button
                            className="ns-btn ns-btn-primary"
                            disabled={releaseCandidateSaving}
                            onClick={() => void createReleaseCandidate()}
                          >
                            {releaseCandidateSaving
                              ? "Kaydediliyor…"
                              : "Sürüm adayını kaydet"}
                          </button>
                        </div>
                      )}
                      {!clean &&
                        canManage &&
                        workspaceGitStatus.totalChangedFiles > 0 && (
                          <div className="modal-foot">
                            <span>
                              Yalnız güncel Studio onay kayıtları commit
                              edilebilir.
                            </span>
                            <button
                              className="ns-btn"
                              disabled={
                                workspaceCommitLoading ||
                                workspaceGitStatus.truncated
                              }
                              onClick={() =>
                                void commitApprovedWorkspaceChanges()
                              }
                            >
                              <RefreshCw size={16} />
                              {workspaceCommitLoading
                                ? "Commit ve otomatik test…"
                                : "Commit et ve testi otomatik çalıştır"}
                            </button>
                          </div>
                        )}
                    </section>

                    {releaseCandidates.length > 0 && (
                      <section
                        className="panel release-main-panel"
                        style={{ marginBottom: 14 }}
                      >
                        <div className="panel-heading">
                          <div>
                            <b>Sürüm ve yayın</b>
                            <small>
                              Onaylı sürümünüzü web uygulamasına yayınlayın.
                            </small>
                          </div>
                          <button className="ns-btn ns-btn-sm small-button" disabled={gitStatusLoading} onClick={() => gitStatusWorkspace && void loadWorkspaceGitStatus(gitStatusWorkspace, true)}>
                            <RefreshCw size={14} /> Durumu yenile
                          </button>
                        </div>
                        <div className="requests-list">
                          {releaseCandidates.map((candidate) => (
                            <article
                              className="request-row studio-release-candidate"
                              key={candidate.id}
                            >
                              <div className="request-symbol">
                                <ShieldCheck size={17} />
                              </div>
                              <div className="request-info">
                                <div className="release-version-heading">
                                  <div><span className="release-kicker">UYGULAMA YAYINI</span><h3>Sürüm {releaseVersions.find(item => item.releaseCandidateId === candidate.id)?.version ?? "adayı"}</h3></div>
                                  <div className="release-status-badges">
                                    <span className={candidate.decision === "Approved" ? "release-badge success" : "release-badge"}>{candidate.decision === "Approved" ? "Onaylandı" : candidate.decision === "Rejected" ? "Reddedildi" : "Onay bekliyor"}</span>
                                    {candidate.githubPullRequestUrl && <a className="release-badge" href={candidate.githubPullRequestUrl} target="_blank" rel="noreferrer">PR #{candidate.githubPullRequestNumber} · {candidate.githubPullRequestState === "merged" ? "Birleştirildi" : candidate.githubPullRequestState === "draft" ? "Taslak" : candidate.githubPullRequestState === "open" ? "Açık" : candidate.githubPullRequestState}</a>}
                                  </div>
                                </div>
                                <details className="release-details release-evidence"><summary>Commit ve doğrulama bilgileri</summary><div className="release-details-body">

                                <b>
                                  {candidate.branchName} ·{" "}
                                  {candidate.commitSha.slice(0, 12)}
                                </b>
                                <small>
                                  {candidate.testTargetPath} · test{" "}
                                  {new Date(
                                    candidate.testCompletedAt,
                                  ).toLocaleString("tr-TR", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}
                                </small>
                                <small>
                                  Aday{" "}
                                  {new Date(
                                    candidate.createdAt,
                                  ).toLocaleString("tr-TR", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}{" "}
                                  · SHA-256{" "}
                                  {candidate.testSnapshotSha256.slice(
                                    0,
                                    12,
                                  )}
                                </small>
                                <small>
                                  {candidate.decision === "Approved"
                                    ? "Onaylandı"
                                    : candidate.decision === "Rejected"
                                      ? "Reddedildi"
                                      : "Yetkili incelemesi bekliyor"}
                                  {candidate.reviewedAt
                                    ? ` · ${new Date(candidate.reviewedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}`
                                    : ""}
                                </small>
                                {candidate.reviewNote && (
                                  <small>
                                    Karar notu: {candidate.reviewNote}
                                  </small>
                                )}
                                {candidate.githubPullRequestUrl && (
                                  <small>
                                    GitHub PR #
                                    {candidate.githubPullRequestNumber} |{" "}
                                    {candidate.githubPullRequestState} |{" "}
                                    <a
                                      href={candidate.githubPullRequestUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      GitHub’da aç
                                    </a>
                                  </small>
                                )}
                                {releaseVersions.find(
                                  (item) =>
                                    item.releaseCandidateId ===
                                    candidate.id,
                                ) && (
                                  <small>
                                    SemVer:{" "}
                                    {
                                      releaseVersions.find(
                                        (item) =>
                                          item.releaseCandidateId ===
                                          candidate.id,
                                      )!.version
                                    }{" "}
                                    · atanan commit{" "}
                                    {releaseVersions
                                      .find(
                                        (item) =>
                                          item.releaseCandidateId ===
                                          candidate.id,
                                      )!
                                      .commitSha.slice(0, 12)}
                                  </small>
                                )}
                                </div></details>
                                {releaseVersions.find(
                                  (item) =>
                                    item.releaseCandidateId ===
                                    candidate.id,
                                ) &&
                                  (() => {
                                    const version = releaseVersions.find(
                                      (item) =>
                                        item.releaseCandidateId ===
                                        candidate.id,
                                    )!;
                                    const pkg = releasePackages.find(
                                      (item) =>
                                        item.releaseVersionId ===
                                        version.id,
                                    );
                                    return (
                                      <section
                                        className="panel release-package-card"
                                        style={{
                                          gridColumn: "1 / -1",
                                          marginTop: 8,
                                        }}
                                      >
                                        <div className="panel-heading">
                                          <div>
                                            <b>
                                              Yayın paketi
                                            </b>
                                            <small>
                                              Onaylı committen oluşturulan sürüm dosyaları.
                                            </small>
                                          </div>
                                          {!pkg &&
                                            (workspaceProject?.accessLevel ===
                                              "Maintainer" ||
                                              workspaceProject?.accessLevel ===
                                                "TenantAdmin") && (
                                              <button
                                                className="ns-btn ns-btn-sm small-button"
                                                disabled={
                                                  releasePackageLoading !==
                                                  null || candidate.githubPullRequestState === "draft"
                                                }
                                                onClick={() =>
                                                  void createReleasePackage(
                                                    version,
                                                  )
                                                }
                                              >
                                                {releasePackageLoading ===
                                                version.id
                                                  ? "Paket oluşturuluyor…"
                                                  : "Paket oluştur"}
                                              </button>
                                            )}
                                        </div>
                                        {!pkg && candidate.githubPullRequestState === "draft" && (
                                          <div className="boundary-note" style={{ flexWrap: "wrap", gap: 10 }}>
                                            <Info size={17} />
                                            <span style={{ flex: "1 1 220px" }}><b>GitHub PR #{candidate.githubPullRequestNumber} taslak durumunda</b>Commit GitHub’a gönderildi. Paket oluşturmadan önce PR’yi incelemeye hazır duruma alın.</span>
                                            <button className="ns-btn ns-btn-sm small-button" disabled={pullRequestReadyLoading === candidate.id} onClick={() => void markGitHubPullRequestReady(candidate)}>
                                              {pullRequestReadyLoading === candidate.id ? "Hazırlanıyor…" : "PR’yi incelemeye hazırla"}
                                            </button>
                                          </div>
                                        )}
                                        {pkg && (
                                          <div className="request-row">
                                            <div className="request-info">
                                              <b>
                                                {pkg.fileName} ·{" "}
                                                {(
                                                  pkg.sizeBytes /
                                                  1024 /
                                                  1024
                                                ).toFixed(2)}{" "}
                                                MiB
                                              </b>
                                              <details className="release-details"><summary>Paket doğrulama bilgileri</summary>
                                              <small>
                                                SHA-256 {pkg.packageSha256}
                                              </small>
                                              <small>
                                                Commit{" "}
                                                {pkg.commitSha.slice(0, 12)}{" "}
                                                · test snapshot{" "}
                                                {pkg.testSnapshotSha256.slice(
                                                  0,
                                                  12,
                                                )}{" "}
                                                ·{" "}
                                                {new Date(
                                                  pkg.createdAt,
                                                ).toLocaleString("tr-TR")}
                                              </small>
                                              </details>
                                            </div>
                                            <button
                                              className="ns-btn ns-btn-sm small-button"
                                              disabled={
                                                releasePackageDownloadLoading !==
                                                null
                                              }
                                              onClick={() =>
                                                void downloadReleasePackage(
                                                  pkg,
                                                )
                                              }
                                            >
                                              {releasePackageDownloadLoading ===
                                              pkg.id
                                                ? "İndiriliyor…"
                                                : "Paketi indir"}
                                            </button>
                                          </div>
                                        )}
                                        {pkg &&
                                          (workspaceProject?.accessLevel ===
                                            "Maintainer" ||
                                            workspaceProject?.accessLevel ===
                                              "TenantAdmin") && (
                                            <details className="release-details release-staging"><summary>Diğer yayın seçenekleri</summary>
                                            <div className="modal-foot">
                                              <span>
                                                Bağımsız onaylı paket;
                                                localhost staging’e
                                                yayınlanabilir.
                                              </span>
                                              <button
                                                className="ns-btn ns-btn-sm small-button"
                                                disabled={
                                                  releaseDeploymentLoading
                                                }
                                                onClick={() =>
                                                  void deployStaging(pkg)
                                                }
                                              >
                                                {releaseDeploymentLoading
                                                  ? "Yayınlanıyor…"
                                                  : "Yerel staging’e yayınla"}
                                              </button>
                                            </div>                                                </details>

                                          )}
                                      </section>
                                    );
                                  })()}
                                {releaseVersions.find(item => item.releaseCandidateId === candidate.id) && releasePackages.find(item => item.releaseVersionId === releaseVersions.find(version => version.releaseCandidateId === candidate.id)!.id) && workspaceProject?.accessLevel === "TenantAdmin" && (() => {
                                  const version = releaseVersions.find(item => item.releaseCandidateId === candidate.id)!;
                                  const pkg = releasePackages.find(item => item.releaseVersionId === version.id)!;
                                  return <WebImageUpdate projectId={workspaceProject.id} packageId={pkg.id} commitSha={pkg.commitSha} token={token} />;
                                })()}
                              </div>
                              {releaseDeployments.length > 0 && (
                                <section
                                  className="panel"
                                  style={{ marginTop: 12 }}
                                >
                                  <div className="panel-heading">
                                    <div>
                                      <b>Yerel staging dağıtımları</b>
                                      <small>
                                        Docker Compose · yalnız localhost ·
                                        son {releaseDeployments.length}{" "}
                                        kayıt
                                      </small>
                                    </div>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      disabled={gitStatusLoading}
                                      onClick={() =>
                                        void loadWorkspaceGitStatus(
                                          gitStatusWorkspace!,
                                        )
                                      }
                                    >
                                      Yenile
                                    </button>
                                  </div>
                                  {stagingCredentials &&
                                    stagingCredentials.bootstrapEmail && (
                                      <div className="notice">
                                        <b>
                                          {stagingCredentials.deployment
                                            .environment === "Production"
                                            ? "Production ilk giriş bilgileri · bu kez gösteriliyor"
                                            : "Staging ilk giriş bilgileri · bu kez gösteriliyor"}
                                        </b>
                                        <br />
                                        E-posta:{" "}
                                        <code>
                                          {
                                            stagingCredentials.bootstrapEmail
                                          }
                                        </code>
                                        <br />
                                        Parola:{" "}
                                        <code>
                                          {
                                            stagingCredentials.bootstrapPassword
                                          }
                                        </code>
                                        <br />
                                        <a
                                          href={
                                            stagingCredentials.deployment
                                              .environmentUrl ?? "#"
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {
                                            stagingCredentials.deployment
                                              .environmentUrl
                                          }
                                        </a>
                                        <br />
                                        <small>
                                          Parolayı şimdi güvenli bir yere
                                          kaydedin. Tekrar gösterilmez.
                                        </small>
                                      </div>
                                    )}
                                  <div className="requests-list">
                                    {releaseDeployments
                                      .filter(
                                        (deployment) =>
                                          deployment.environment ===
                                          "Staging",
                                      )
                                      .map((deployment) => {
                                        const active =
                                          deployment.status === "Succeeded";
                                        const packageInfo =
                                          releasePackages.find(
                                            (item) =>
                                              item.id ===
                                              deployment.releasePackageId,
                                          );
                                        return (
                                          <article
                                            className="request-row"
                                            key={deployment.id}
                                          >
                                            <div className="request-symbol">
                                              <ShieldCheck size={17} />
                                            </div>
                                            <div className="request-info">
                                              <b>
                                                {packageInfo?.version ??
                                                  deployment.version ??
                                                  deployment.commitSha.slice(
                                                    0,
                                                    12,
                                                  )}{" "}
                                                · {deploymentStatusLabel(deployment.status)}
                                              </b>
                                              <small>
                                                {deployment.environmentUrl ??
                                                  "Staging URL yok"}{" "}
                                                ·{" "}
                                                {new Date(
                                                  deployment.createdAt,
                                                ).toLocaleString("tr-TR")}
                                              </small>
                                              <small>
                                                SHA-256{" "}
                                                {deployment.packageSha256} ·{" "}
                                                {deployment.failureCode ??
                                                  "Docker Compose"}
                                              </small>
                                            </div>
                                            {deployment.environmentUrl && (
                                              <a
                                                className="ns-btn ns-btn-sm small-button"
                                                href={
                                                  deployment.environmentUrl
                                                }
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                Aç
                                              </a>
                                            )}
                                            {active && (
                                              <>
                                                <button
                                                  className="ns-btn ns-btn-sm small-button"
                                                  disabled={
                                                    releaseDeploymentLoading
                                                  }
                                                  onClick={() => {
                                                    const pkg =
                                                      releasePackages.find(
                                                        (item) =>
                                                          item.id ===
                                                          deployment.releasePackageId,
                                                      ) ?? {
                                                        id: deployment.releasePackageId,
                                                        version:
                                                          deployment.version,
                                                        commitSha:
                                                          deployment.commitSha,
                                                      };
                                                    void deployStaging(pkg);
                                                  }}
                                                >
                                                  Yeniden dağıt
                                                </button>
                                                <button
                                                  className="ns-btn ns-btn-sm small-button danger-action"
                                                  disabled={
                                                    releaseDeploymentLoading
                                                  }
                                                  onClick={() =>
                                                    void destroyStaging(
                                                      deployment,
                                                    )
                                                  }
                                                >
                                                  Staging’i sil
                                                </button>
                                                {!productionApprovals.some(
                                                  (item) =>
                                                    item.stagingDeploymentId ===
                                                    deployment.id,
                                                ) && (
                                                  <button
                                                    className="ns-btn ns-btn-sm small-button"
                                                    disabled={
                                                      releaseDeploymentLoading
                                                    }
                                                    onClick={() =>
                                                      void requestProductionApproval(
                                                        deployment,
                                                      )
                                                    }
                                                  >
                                                    Üretim onay talebi
                                                  </button>
                                                )}
                                              </>
                                            )}
                                            {!active &&
                                              deployment.status ===
                                                "Superseded" && (
                                                <button
                                                  className="ns-btn ns-btn-sm small-button"
                                                  disabled={
                                                    releaseDeploymentLoading
                                                  }
                                                  onClick={() => {
                                                    const pkg =
                                                      releasePackages.find(
                                                        (item) =>
                                                          item.id ===
                                                          deployment.releasePackageId,
                                                      );
                                                    if (pkg)
                                                      void deployStaging(
                                                        pkg,
                                                        deployment.id,
                                                      );
                                                  }}
                                                >
                                                  Bu sürüme dön
                                                </button>
                                              )}
                                          </article>
                                        );
                                      })}
                                  </div>
                                  <section
                                    className="panel"
                                    style={{ marginTop: 14 }}
                                  >
                                    <div className="panel-heading">
                                      <div>
                                        <b>Üretim geçişi · onay kaydı</b>
                                        <small>
                                          Hedef: bu makinede Docker Compose
                                          · yalnız localhost
                                        </small>
                                      </div>
                                    </div>
                                    <p className="muted">
                                      Onaylı staging paketi ayrı kullanıcı
                                      ve migration onayından sonra
                                      production Compose stack’ine
                                      alınabilir. Stack localhost’a
                                      bağlıdır; SQL verisi ayrı kalıcı
                                      hacimde korunur ve güncelleme öncesi
                                      yedeklenir.
                                    </p>
                                    <div className="requests-list">
                                      {productionApprovals.map(
                                        (approval) => (
                                          <article
                                            className="request-row"
                                            key={approval.id}
                                          >
                                            <div className="request-symbol">
                                              <ShieldCheck size={17} />
                                            </div>
                                            <div className="request-info">
                                              <b>
                                                {approval.version ||
                                                  approval.releasePackageId.slice(
                                                    0,
                                                    12,
                                                  )}{" "}
                                                ·{" "}
                                                {approval.status ===
                                                "AwaitingReview"
                                                  ? "İnceleme bekliyor"
                                                  : approval.status ===
                                                      "Approved"
                                                    ? "Onaylandı"
                                                    : "Reddedildi"}
                                              </b>
                                              <small>
                                                Staging{" "}
                                                {approval.stagingUrl ??
                                                  "URL yok"}{" "}
                                                ·{" "}
                                                {new Date(
                                                  approval.createdAt,
                                                ).toLocaleString("tr-TR")}
                                              </small>
                                              <small>
                                                Talep:{" "}
                                                {approval.requestNote}
                                              </small>
                                              {approval.reviewNote && (
                                                <small>
                                                  İnceleme:{" "}
                                                  {approval.reviewNote}
                                                </small>
                                              )}
                                              <small>
                                                Canlı dağıtım:{" "}
                                                {approval.productionDeploymentStatus ===
                                                "Succeeded"
                                                  ? "Başarılı"
                                                  : approval.productionDeploymentStatus ===
                                                      "Failed"
                                                    ? "Başarısız"
                                                    : (approval.productionDeploymentStatus ??
                                                      "Başlamadı")}
                                              </small>
                                              {approval.productionEnvironmentUrl && (
                                                <small>
                                                  Production URL:{" "}
                                                  {
                                                    approval.productionEnvironmentUrl
                                                  }
                                                </small>
                                              )}
                                            </div>
                                            {tenant.role ===
                                              "TenantAdmin" &&
                                              approval.status ===
                                                "AwaitingReview" && (
                                                <>
                                                  <button
                                                    className="ns-btn ns-btn-sm small-button"
                                                    onClick={() =>
                                                      void reviewProductionApproval(
                                                        approval,
                                                        "Approved",
                                                      )
                                                    }
                                                  >
                                                    Onayla
                                                  </button>
                                                  <button
                                                    className="ns-btn ns-btn-sm small-button danger-action"
                                                    onClick={() =>
                                                      void reviewProductionApproval(
                                                        approval,
                                                        "Rejected",
                                                      )
                                                    }
                                                  >
                                                    Reddet
                                                  </button>
                                                </>
                                              )}
                                            {tenant.role ===
                                              "TenantAdmin" &&
                                              approval.status ===
                                                "Approved" &&
                                              (!approval.productionDeploymentStatus ||
                                                approval.productionDeploymentStatus ===
                                                  "Failed") && (
                                                <button
                                                  className="ns-btn ns-btn-sm small-button ns-btn-primary"
                                                  disabled={
                                                    releaseDeploymentLoading
                                                  }
                                                  onClick={() =>
                                                    void deployProduction(
                                                      approval,
                                                    )
                                                  }
                                                >
                                                  {releaseDeploymentLoading
                                                    ? "Dağıtılıyor…"
                                                    : approval.productionDeploymentStatus ===
                                                        "Failed"
                                                      ? "Tekrar dene"
                                                      : "Production’a yayınla"}
                                                </button>
                                              )}
                                          </article>
                                        ),
                                      )}
                                      {productionApprovals.length === 0 && (
                                        <div className="empty-small">
                                          Henüz üretim onay talebi yok.
                                        </div>
                                      )}
                                    </div>
                                    <div
                                      className="panel-heading"
                                      style={{ marginTop: 20 }}
                                    >
                                      <div>
                                        <b>Production dağıtım geçmişi</b>
                                        <small>
                                          {productionDeployments.length}{" "}
                                          kayıt · en çok 100 kayıt
                                          gösterilir
                                        </small>
                                      </div>
                                    </div>
                                    <div className="requests-list">
                                      {productionDeployments.map(
                                        (deployment) => (
                                          <article
                                            className="request-row"
                                            key={deployment.id}
                                          >
                                            <div className="request-info">
                                              <b>
                                                {deployment.version} ·{" "}
                                                {deployment.status ===
                                                "Succeeded"
                                                  ? "Başarılı"
                                                  : deployment.status ===
                                                      "Superseded"
                                                    ? "Önceki sürüm"
                                                    : deployment.status ===
                                                        "Failed"
                                                      ? "Başarısız"
                                                      : deployment.status}
                                              </b>
                                              <small>
                                                {deployment.commitSha.slice(
                                                  0,
                                                  12,
                                                )}{" "}
                                                ·{" "}
                                                {new Date(
                                                  deployment.completedAt ??
                                                    deployment.createdAt,
                                                ).toLocaleString("tr-TR")}
                                              </small>
                                              {deployment.environmentUrl && (
                                                <small>
                                                  {
                                                    deployment.environmentUrl
                                                  }
                                                </small>
                                              )}
                                            </div>
                                            {tenant.role ===
                                              "TenantAdmin" &&
                                              deployment.canRestoreDatabase && (
                                                <button
                                                  className="ns-btn ns-btn-sm small-button ns-btn-danger"
                                                  disabled={
                                                    releaseDeploymentLoading
                                                  }
                                                  onClick={() =>
                                                    void restoreProductionDatabase(
                                                      deployment,
                                                    )
                                                  }
                                                >
                                                  Yedeğe ve önceki sürüme
                                                  dön
                                                </button>
                                              )}
                                          </article>
                                        ),
                                      )}
                                    </div>
                                    {productionDeployments.length === 0 && (
                                      <div className="empty-small">
                                        Henüz production dağıtımı yok.
                                      </div>
                                    )}
                                  </section>
                                  <div className="boundary-note">
                                    <ShieldCheck size={17} />
                                    <span>
                                      <b>Geri alma davranışı</b>Eski uygulama
                                      sürümü aynı staging SQL veritabanıyla
                                      yeniden başlatılır. Veritabanı şeması
                                      otomatik geri alınmaz; yıkıcı
                                      migration’lar için ayrıca yedek
                                      gerekir.
                                    </span>
                                  </div>
                                </section>
                              )}
                              {candidate.githubPullRequestNumber &&
                                (workspaceProject?.accessLevel ===
                                  "Maintainer" ||
                                  workspaceProject?.accessLevel ===
                                    "TenantAdmin") && (
                                  <details className="release-details release-tools"><summary>GitHub inceleme araçları</summary><div className="release-tool-actions">
                                    {candidate.githubPullRequestState ===
                                      "draft" &&
                                      candidate.decision === "Approved" && (
                                        <button
                                          className="ns-btn ns-btn-sm small-button"
                                          disabled={
                                            pullRequestReadyLoading ===
                                            candidate.id
                                          }
                                          onClick={() =>
                                            void markGitHubPullRequestReady(
                                              candidate,
                                            )
                                          }
                                        >
                                          {pullRequestReadyLoading ===
                                          candidate.id
                                            ? "Hazırlanıyor…"
                                            : "İncelemeye hazırla"}
                                        </button>
                                      )}
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void submitGitHubReview(
                                          candidate,
                                          "COMMENT",
                                        )
                                      }
                                    >
                                      Yorum ekle
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void requestGitHubReviewers(
                                          candidate,
                                        )
                                      }
                                    >
                                      İnceleme iste
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void submitGitHubReview(
                                          candidate,
                                          "APPROVE",
                                        )
                                      }
                                    >
                                      GitHub’da onayla
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void submitGitHubReview(
                                          candidate,
                                          "REQUEST_CHANGES",
                                        )
                                      }
                                    >
                                      Değişiklik iste
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void syncGitHubReviewComments(
                                          candidate,
                                        )
                                      }
                                    >
                                      Yorumları GitHub’a aktar
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void importGitHubReviewComments(
                                          candidate,
                                        )
                                      }
                                    >
                                      Import Yorum ekles
                                    </button>
                                  </div></details>
                                )}
                              {candidate.canReview && (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    className="ns-btn ns-btn-sm small-button"
                                    onClick={() =>
                                      void reviewReleaseCandidate(
                                        candidate,
                                        "Approved",
                                      )
                                    }
                                  >
                                    Onayla
                                  </button>
                                  <button
                                    className="ns-btn ns-btn-sm small-button danger-action"
                                    onClick={() =>
                                      void reviewReleaseCandidate(
                                        candidate,
                                        "Rejected",
                                      )
                                    }
                                  >
                                    Reddet
                                  </button>
                                </div>
                              )}
                              {candidate.decision === "Approved" &&
                                (workspaceProject?.accessLevel ===
                                  "Maintainer" ||
                                  workspaceProject?.accessLevel ===
                                    "TenantAdmin") &&
                                !releaseVersions.some(
                                  (item) =>
                                    item.releaseCandidateId ===
                                    candidate.id,
                                ) && (
                                  <button
                                    className="ns-btn ns-btn-sm small-button"
                                    onClick={() =>
                                      void assignReleaseVersion(candidate)
                                    }
                                  >
                                    Sürüm ata
                                  </button>
                                )}
                              {candidate.decision === "Approved" && !candidate.githubPullRequestNumber &&
                                (workspaceProject?.accessLevel ===
                                  "Maintainer" ||
                                  workspaceProject?.accessLevel ===
                                    "TenantAdmin") && (
                                  <button
                                    className="ns-btn ns-btn-sm small-button"
                                    disabled={pullRequestDraftLoading}
                                    onClick={() =>
                                      void createPullRequestDraft(candidate)
                                    }
                                  >
                                    {pullRequestDraftLoading
                                      ? "Taslak hazırlanıyor…"
                                      : "PR taslağı hazırla"}
                                  </button>
                                )}
                              {pullRequestDraft?.candidateId ===
                                candidate.id && (
                                <section
                                  className="panel pr-draft-panel"
                                >
                                  {pullRequestDraft.draft.draftSource === "template" && (
                                    <div className="boundary-note">
                                      <Info size={17} />
                                      <span><b>Şablon taslağı</b> AI sağlayıcısı istek sınırı döndürdü. Taslak, yazdığınız özet ve doğrulanmış test bilgisi kullanılarak hazırlandı; yayınlamadan önce inceleyin.</span>
                                    </div>
                                  )}
                                  <div className="panel-heading pr-draft-heading">
                                    <div className="pr-draft-branches">
                                      <b>{pullRequestDraft.draft.title}</b>
                                      <small>
                                        {
                                          pullRequestDraft.draft
                                            .sourceBranch
                                        }{" "}
                                        →{" "}
                                        {pullRequestDraft.draft.baseBranch}{" "}
                                        · HEAD{" "}
                                        {pullRequestDraft.draft.commitSha.slice(
                                          0,
                                          12,
                                        )}
                                      </small>
                                    </div>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      onClick={() =>
                                        void navigator.clipboard.writeText(
                                          `${pullRequestDraft.draft.title}\n\n${pullRequestDraft.draft.body}`,
                                        )
                                      }
                                    >
                                      Başlık ve açıklamayı kopyala
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button ns-btn-primary"
                                      disabled={pullRequestPublishLoading}
                                      onClick={() =>
                                        void publishPullRequest(candidate)
                                      }
                                    >
                                      {pullRequestPublishLoading
                                        ? "GitHub’a gönderiliyor…"
                                        : "Push edip draft PR oluştur"}
                                    </button>
                                    <small className="pr-draft-publish-note">
                                      Yayın için yöneticinin GitHub App
                                      anahtarını yapılandırması gerekir.
                                      Installation ID gizli bilgi değildir.
                                    </small>
                                  </div>
                                  <pre
                                    style={{
                                      whiteSpace: "pre-wrap",
                                      overflowWrap: "anywhere",
                                      fontFamily: "inherit",
                                    }}
                                  >
                                    {pullRequestDraft.draft.body}
                                  </pre>
                                  {pullRequestDraft.draft.risks.length >
                                    0 && (
                                    <small>
                                      Riskler:{" "}
                                      {pullRequestDraft.draft.risks.join(
                                        " · ",
                                      )}
                                    </small>
                                  )}
                                  {pullRequestDraft.draft.limitations
                                    .length > 0 && (
                                    <div className="boundary-note">
                                      <ShieldCheck size={17} />
                                      <span>
                                        <b>Sınırlamalar</b>
                                        {pullRequestDraft.draft.limitations.join(
                                          " · ",
                                        )}
                                      </span>
                                    </div>
                                  )}
                                  <div className="notice">
                                    Taslak hazırlandı. Uzak depoya
                                    gönderilmedi ve PR oluşturulmadı.
                                  </div>
                                  {publishedPullRequest?.commitSha ===
                                    pullRequestDraft.draft.commitSha && (
                                    <div className="notice">
                                      {publishedPullRequest.pushed
                                        ? "Commit GitHub’a gönderildi. "
                                        : "Uzak dal zaten günceldi. "}
                                      <a
                                        href={publishedPullRequest.htmlUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Draft PR #
                                        {publishedPullRequest.pullNumber}’i
                                        aç
                                      </a>
                                    </div>
                                  )}
                                </section>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                );
              })()}
              <details className="release-details release-file-details"><summary>Dosya değişiklikleri ({workspaceGitStatus.totalChangedFiles})</summary>
              <div className="panel-heading studio-git-files-heading">
                <Layers size={22} />
                <div>
                  <b>
                    {workspaceGitStatus.totalChangedFiles.toLocaleString(
                      "tr-TR",
                    )}{" "}
                    değişen dosya
                  </b>
                  <small>
                    HEAD {workspaceGitStatus.headCommitSha.slice(0, 12)}
                  </small>
                </div>
              </div>
              {workspaceGitStatus.truncated && (
                <div className="notice">İlk 200 dosya gösteriliyor.</div>
              )}
              <div className="requests-list studio-git-files">
                {workspaceGitStatus.files.map((file, index) => (
                  <article
                    className="request-row"
                    key={`${file.path}-${index}`}
                  >
                    <div className="request-symbol">
                      <FileCode size={17} />
                    </div>
                    <div className="request-info">
                      <b>{file.path}</b>
                      <small>{file.status}</small>
                    </div>
                    <button
                      className="ns-btn ns-btn-sm small-button"
                      disabled={gitDiffLoading}
                      onClick={() => void openWorkspaceGitDiff(file.path)}
                    >
                      <Code2 size={16} /> Diff
                    </button>
                  </article>
                ))}
                {workspaceGitStatus.files.length === 0 && (
                  <div className="empty-small">
                    Çalışma ağacında değişiklik yok.
                  </div>
                )}
              </div>
              </details>
            </>
          )
        )}

        <div className="modal-foot">
          <span>
            {workspaceGitStatus?.branchName ??
              gitStatusWorkspace.branchName}{" "}
            · {workspaceGitStatus?.totalChangedFiles ?? 0} dosya
          </span>
          <button
            className="ns-btn"
            onClick={() => {
              setGitStatusWorkspace(null);
              setWorkspaceGitStatus(null);
            }}
          >
            Kapat
          </button>
        </div>
      </Dialog>
  );
}
