// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { FlaskConical, X, Folder, CheckCircle2, FileCode, ShieldCheck, Trash2, Sparkles } from "lucide-react";
import type { AITestPlan, DevelopmentProject, SandboxErrorAnalysisResponse, SavedAITestPlan, WorkspaceRequest, WorkspaceTestDiscovery, WorkspaceTestRunStatus } from "./types";

export type TestDiscoveryDialogProps = {
  analyzeSandboxFailure: (operation: "test" | "build", workspaceRequestId: string, job: WorkspaceTestRunStatus) => Promise<void>;
  beginSandboxRepair: () => void;
  buildExecution: WorkspaceTestRunStatus | null;
  buildExecutionLoading: boolean;
  buildExecutionTarget: string;
  buildExecutionWorkspaceId: string | null;
  createAITestPlan: (e: FormEvent) => Promise<void>;
  deleteSavedAITestPlan: (saved: SavedAITestPlan) => Promise<void>;
  error: string;
  openSavedAITestPlan: (saved: SavedAITestPlan) => Promise<void>;
  pollWorkspaceBuildRun: () => Promise<void>;
  pollWorkspaceTestRun: () => Promise<void>;
  runWorkspaceBuild: (target: WorkspaceTestDiscovery["targets"][number]) => Promise<void>;
  runWorkspaceTest: (target: WorkspaceTestDiscovery["targets"][number]) => Promise<void>;
  sandboxErrorAnalysis: SandboxErrorAnalysisResponse | null;
  sandboxErrorAnalysisLoading: boolean;
  saveAITestPlan: () => Promise<void>;
  savedTestPlans: SavedAITestPlan[];
  setTestAIConsent: Dispatch<SetStateAction<boolean>>;
  setTestDiscovery: Dispatch<SetStateAction<WorkspaceTestDiscovery | null>>;
  setTestDiscoveryWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setTestRequest: Dispatch<SetStateAction<string>>;
  testAIConsent: boolean;
  testDiscovery: WorkspaceTestDiscovery | null;
  testDiscoveryLoading: boolean;
  testDiscoveryWorkspace: WorkspaceRequest;
  testExecution: WorkspaceTestRunStatus | null;
  testExecutionLoading: boolean;
  testExecutionTarget: string;
  testPlan: AITestPlan | null;
  testPlanLoading: boolean;
  testPlanSaveLoading: boolean;
  testPlanSavedId: string | null;
  testRequest: string;
  workspaceProject: DevelopmentProject | null;
};

export function TestDiscoveryDialog({
  analyzeSandboxFailure,
  beginSandboxRepair,
  buildExecution,
  buildExecutionLoading,
  buildExecutionTarget,
  buildExecutionWorkspaceId,
  createAITestPlan,
  deleteSavedAITestPlan,
  error,
  openSavedAITestPlan,
  pollWorkspaceBuildRun,
  pollWorkspaceTestRun,
  runWorkspaceBuild,
  runWorkspaceTest,
  sandboxErrorAnalysis,
  sandboxErrorAnalysisLoading,
  saveAITestPlan,
  savedTestPlans,
  setTestAIConsent,
  setTestDiscovery,
  setTestDiscoveryWorkspace,
  setTestRequest,
  testAIConsent,
  testDiscovery,
  testDiscoveryLoading,
  testDiscoveryWorkspace,
  testExecution,
  testExecutionLoading,
  testExecutionTarget,
  testPlan,
  testPlanLoading,
  testPlanSaveLoading,
  testPlanSavedId,
  testRequest,
  workspaceProject,
}: TestDiscoveryDialogProps) {
  return (
    <Dialog
  onClose={() => { setTestDiscoveryWorkspace(null);
          setTestDiscovery(null); }}
  className="studio-test-discovery-modal"
  backdropClassName="studio-test-discovery-backdrop"
  labelledBy="studio-test-discovery-title"
>
        <div className="modal-head studio-test-discovery-header">
          <div className="studio-test-discovery-heading">
            <span className="studio-test-discovery-mark">
              <FlaskConical size={23} />
            </span>
            <div>
              <p className="eyebrow">
                TEST VE BUILD <i>·</i> GÜVENLİ SANDBOX
              </p>
              <h2 id="studio-test-discovery-title">{workspaceProject?.name} / Test ve build hedefleri</h2>
            </div>
          </div>
          <button
            className="icon-button"
            aria-label="Kapat"
            onClick={() => {
              setTestDiscoveryWorkspace(null);
              setTestDiscovery(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          {testDiscoveryWorkspace.branchName} dalındaki proje manifestleri
          ve test dosyaları incelenir. Keşif salt okunurdur; Maintainer veya
          TenantAdmin seçilmiş hedefi ayrı onayla yalıtılmış sandbox içinde
          çalıştırabilir.
        </p>
        {error && <div className="alert">{error}</div>}
        {testDiscoveryLoading ? (
          <div className="empty-small">
            Test ve build hedefleri taranıyor…
          </div>
        ) : (
          testDiscovery && (
            <>
              <div className="studio-test-discovery-summary">
                <div className="studio-test-discovery-file-count">
                  <span className="studio-test-discovery-summary-icon">
                    <Folder size={24} />
                  </span>
                  <div>
                    <b>
                      {testDiscovery.scannedFiles.toLocaleString("tr-TR")}
                    </b>
                    <small>dosya incelendi</small>
                  </div>
                </div>
                <div className="studio-test-discovery-scan-status">
                  <span
                    className={testDiscovery.truncated ? "is-partial" : ""}
                  >
                    <CheckCircle2 size={16} />
                    {testDiscovery.truncated
                      ? "Kısmi analiz"
                      : "Analiz tamamlandı"}
                  </span>
                  <small>
                    {testDiscovery.truncated
                      ? "Güvenlik sınırına ulaşıldı; sonuç kısmi."
                      : "Manifest okuma sınırı: 64 KiB"}
                  </small>
                </div>
              </div>
              <div className="requests-list studio-test-discovery-targets">
                {testDiscovery.targets.map((target, i) => (
                  <article
                    className="request-row expanded studio-test-target-card"
                    key={`${target.path}-${i}`}
                  >
                    <div className="request-symbol">
                      <FileCode size={17} />
                    </div>
                    <div className="request-info">
                      <b>
                        {target.ecosystem} · {target.path}
                      </b>
                      <small>{target.evidence}</small>
                      <small>
                        Öneri: <code>{target.suggestedCommand}</code> ·
                        yalnızca test keşfi yapıldı
                      </small>
                    </div>
                    {target.canTest !== false &&
                      ((target.ecosystem === ".NET" &&
                        target.path.toLowerCase().endsWith(".csproj")) ||
                        (target.ecosystem === "Node.js" &&
                          target.path
                            .toLowerCase()
                            .endsWith("package.json")) ||
                        (target.ecosystem === "Python" &&
                          target.path.toLowerCase().endsWith(".py")) ||
                        (target.ecosystem === "Go" &&
                          target.path.toLowerCase().endsWith("_test.go")) ||
                        (target.ecosystem === "Rust" &&
                          target.path
                            .toLowerCase()
                            .endsWith("cargo.toml"))) &&
                      (workspaceProject?.accessLevel === "TenantAdmin" ||
                        workspaceProject?.accessLevel === "Maintainer") && (
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          disabled={testExecutionLoading}
                          onClick={() => void runWorkspaceTest(target)}
                        >
                          {testExecutionLoading &&
                          testExecutionTarget === target.path
                            ? "Test çalışıyor…"
                            : target.ecosystem === "Node.js"
                              ? "Yalıtılmış Node testi çalıştır"
                              : target.ecosystem === "Python"
                                ? "Yalıtılmış Python testi çalıştır"
                                : target.ecosystem === "Go"
                                  ? "Yalıtılmış Go testi çalıştır"
                                  : target.ecosystem === "Rust"
                                    ? "Yalıtılmış Rust testi çalıştır"
                                    : "Yalıtılmış .NET testi çalıştır"}
                        </button>
                      )}
                    {target.canBuild &&
                      (workspaceProject?.accessLevel === "TenantAdmin" ||
                        workspaceProject?.accessLevel === "Maintainer") && (
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          disabled={buildExecutionLoading}
                          onClick={() => void runWorkspaceBuild(target)}
                        >
                          {buildExecutionLoading &&
                          buildExecutionTarget === target.path
                            ? "Build çalışıyor…"
                            : `Yalıtılmış ${target.ecosystem} build çalıştır`}
                        </button>
                      )}
                  </article>
                ))}
                {testDiscovery.targets.length === 0 && (
                  <div className="empty-small">
                    Desteklenen bir test hedefi bulunamadı.
                  </div>
                )}
              </div>
              {testExecution && (
                <section className="panel" style={{ marginTop: 14 }}>
                  <div className="panel-heading">
                    <div>
                      <b>
                        {testExecutionTarget} · {testExecution.status === "Running" ? "Çalışıyor" : testExecution.status === "Queued" ? "Kuyrukta" : testExecution.status}
                      </b>
                      <small>
                        HEAD {testExecution.commitSha.slice(0, 12)} ·
                        Snapshot {testExecution.snapshotSha256.slice(0, 12)}{" "}
                        ·{" "}
                        {testExecution.hasUncommittedChanges
                          ? "kirli snapshot"
                          : "HEAD snapshot"}{" "}
                        · {testExecution.message ?? "Sandbox sonucu"}
                        {testExecution.completedAt
                          ? ` · ${new Date(testExecution.completedAt).toLocaleString("tr-TR")}`
                          : ""}
                      </small>
                    </div>
                    <small>
                      {testExecution.durationMilliseconds
                        ? `${Math.round(testExecution.durationMilliseconds / 1000)} sn`
                        : ""}
                    </small>
                  </div>
                  {testExecution.output && (
                    <>
                    <small>{testExecution.status === "Running" ? "Canlı işlem çıktısı" : "İşlem çıktısı"}</small>
                    <pre
                      style={{
                        maxHeight: 260,
                        overflow: "auto",
                        padding: 12,
                        background: "#0b1020",
                        color: "#dce5ff",
                        borderRadius: 10,
                        whiteSpace: "pre-wrap",
                        fontSize: 12,
                      }}
                    >
                      <code>{testExecution.output}</code>
                    </pre>
                    </>
                  )}
                  {testExecution.status === "DependencyUnavailable" && (
                    <div className="boundary-note">
                      <ShieldCheck size={17} />
                      <span>
                        <b>Çevrimdışı bağımlılık sınırı</b>
                        {testExecutionTarget
                          .toLowerCase()
                          .endsWith("package.json")
                          ? "Node.js paket bağımlılıkları sandboxa alınmadı; yalnız yerleşik node:test dosyaları çalışabilir."
                          : testExecutionTarget
                                .toLowerCase()
                                .endsWith(".py")
                            ? "Gerekli Python modülü imajdaki pytest ortamında yok."
                            : testExecutionTarget
                                  .toLowerCase()
                                  .endsWith("_test.go")
                              ? "Go modülü harici bağımlılık bildiriyor veya standart dışı paket bulunamadı."
                              : testExecutionTarget
                                    .toLowerCase()
                                    .endsWith("cargo.toml")
                                ? "Rust manifesti bağımlılık veya workspace içeriyor; ağsız sandbox yalnız bağımsız paketleri destekler."
                                : "Gerekli NuGet paketleri sandbox önbelleğinde bulunamadı."}{" "}
                        Sandbox internete erişmez; bu test çalıştırmasında
                        paket kaynağına bağlanılmadı.
                      </span>
                    </div>
                  )}
                  {testExecution.status !== "Passed" &&
                    testExecution.status !== "Queued" &&
                    testExecution.status !== "Running" &&
                    workspaceProject?.accessLevel !== "Viewer" && (
                      <button
                        className="ns-btn ns-btn-sm small-button"
                        disabled={sandboxErrorAnalysisLoading}
                        onClick={() =>
                          void analyzeSandboxFailure(
                            "test",
                            testDiscoveryWorkspace!.id,
                            testExecution,
                          )
                        }
                      >
                        {sandboxErrorAnalysisLoading
                          ? "Analiz ediliyor…"
                          : "AI ile hata analizi"}
                      </button>
                    )}
                  {["Queued", "Running"].includes(testExecution.status) &&
                    !testExecutionLoading && (
                      <button
                        className="ns-btn ns-btn-sm small-button"
                        onClick={() => void pollWorkspaceTestRun()}
                      >
                        Test durumunu yenile
                      </button>
                    )}
                </section>
              )}
              {buildExecution &&
                buildExecutionWorkspaceId ===
                  testDiscoveryWorkspace?.id && (
                  <section className="panel" style={{ marginTop: 14 }}>
                    <div className="panel-heading">
                      <div>
                        <b>
                          {buildExecutionTarget} · {buildExecution.status === "Running" ? "Çalışıyor" : buildExecution.status === "Queued" ? "Kuyrukta" : buildExecution.status}
                        </b>
                        <small>
                          HEAD {buildExecution.commitSha.slice(0, 12)} ·
                          Snapshot{" "}
                          {buildExecution.snapshotSha256.slice(0, 12)} ·{" "}
                          {buildExecution.message ?? "Sandbox build sonucu"}
                          {buildExecution.completedAt
                            ? ` · ${new Date(buildExecution.completedAt).toLocaleString("tr-TR")}`
                            : ""}
                        </small>
                      </div>
                      <small>
                        {buildExecution.durationMilliseconds
                          ? `${Math.round(buildExecution.durationMilliseconds / 1000)} sn`
                          : ""}
                      </small>
                    </div>
                    {buildExecution.output && (
                      <>
                      <small>{buildExecution.status === "Running" ? "Canlı işlem çıktısı" : "İşlem çıktısı"}</small>
                      <pre
                        style={{
                          maxHeight: 260,
                          overflow: "auto",
                          padding: 12,
                          background: "#0b1020",
                          color: "#dce5ff",
                          borderRadius: 10,
                          whiteSpace: "pre-wrap",
                          fontSize: 12,
                        }}
                      >
                        <code>{buildExecution.output}</code>
                      </pre>
                      </>
                    )}
                    {buildExecution.status !== "Built" &&
                      buildExecution.status !== "Queued" &&
                      buildExecution.status !== "Running" &&
                      workspaceProject?.accessLevel !== "Viewer" && (
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          disabled={sandboxErrorAnalysisLoading}
                          onClick={() =>
                            void analyzeSandboxFailure(
                              "build",
                              buildExecutionWorkspaceId!,
                              buildExecution,
                            )
                          }
                        >
                          {sandboxErrorAnalysisLoading
                            ? "Analiz ediliyor…"
                            : "AI ile hata analizi"}
                        </button>
                      )}
                    {["Queued", "Running"].includes(buildExecution.status) &&
                      !buildExecutionLoading && (
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          onClick={() => void pollWorkspaceBuildRun()}
                        >
                          Build durumunu yenile
                        </button>
                      )}
                  </section>
                )}
              {sandboxErrorAnalysis && (
                <section className="panel" style={{ marginTop: 14 }}>
                  <div className="panel-heading">
                    <div>
                      <b>
                        AI sandbox hata analizi ·{" "}
                        {sandboxErrorAnalysis.operation}
                      </b>
                      <small>
                        {sandboxErrorAnalysis.targetPath} ·{" "}
                        {sandboxErrorAnalysis.status} · commit{" "}
                        {sandboxErrorAnalysis.commitSha.slice(0, 12)}
                      </small>
                    </div>
                  </div>
                  <div className="notice">
                    {sandboxErrorAnalysis.analysis.summary}
                    <br />
                    <b>Olası neden:</b>{" "}
                    {sandboxErrorAnalysis.analysis.likelyCause}
                  </div>
                  <div className="boundary-note">
                    <ShieldCheck size={17} />
                    <span>
                      <b>
                        {sandboxErrorAnalysis.triage.sourceRepairCandidate
                          ? "Kaynak onarımı değerlendirilebilir"
                          : "Kod onarımı önerilmiyor"}
                      </b>
                      {sandboxErrorAnalysis.triage.summary}{" "}
                      {sandboxErrorAnalysis.triage.nextStep}
                    </span>
                  </div>
                  <div className="requests-list">
                    {sandboxErrorAnalysis.analysis.recommendedActions.map(
                      (action, index) => (
                        <article className="request-row" key={index}>
                          <div className="request-info">
                            <b>{index + 1}. öneri</b>
                            <small>{action}</small>
                          </div>
                        </article>
                      ),
                    )}
                  </div>
                  {sandboxErrorAnalysis.analysis.limitations.length > 0 && (
                    <div className="boundary-note">
                      <ShieldCheck size={17} />
                      <span>
                        <b>Sınırlar</b>
                        {sandboxErrorAnalysis.analysis.limitations.join(
                          " · ",
                        )}
                      </span>
                    </div>
                  )}
                  <div className="boundary-note">
                    <ShieldCheck size={17} />
                    <span>
                      <b>Paylaşım ve saklama</b>Çıktı OpenAI’ye
                      gönderilmeden önce maskelendi; ham sandbox çıktısı
                      AIStudioDB’ye kaydedilmedi. Öneriler otomatik
                      uygulanmaz.
                    </span>
                  </div>
                  {sandboxErrorAnalysis.triage.sourceRepairCandidate && (
                    <button
                      type="button"
                      className="ns-btn ns-btn-sm small-button ns-btn-primary"
                      style={{ marginTop: 12 }}
                      disabled={workspaceProject?.accessLevel === "Viewer"}
                      onClick={beginSandboxRepair}
                    >
                      AI ile onarım taslağı oluştur
                    </button>
                  )}
                  {!sandboxErrorAnalysis.triage.sourceRepairCandidate && (
                    <div className="notice">
                      Bu sonuç altyapı veya paket kaynağı kaynaklı
                      görünüyor. Kaynak kod onarımı açılmadı.
                    </div>
                  )}
                </section>
              )}
            </>
          )
        )}
        {testDiscovery && savedTestPlans.length > 0 && (
          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-heading">
              <div>
                <b>Kayıtlı test planları</b>
                <small>
                  Bu çalışma alanı için son {savedTestPlans.length} taslak
                </small>
              </div>
            </div>
            <div className="requests-list">
              {savedTestPlans.map((saved) => (
                <article className="request-row" key={saved.id}>
                  <div className="request-info">
                    <b>{saved.summary}</b>
                    <small>
                      {saved.branchName} · {saved.commitSha.slice(0, 12)} ·{" "}
                      {new Date(saved.createdAt).toLocaleString("tr-TR")}
                    </small>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="ns-btn ns-btn-sm small-button"
                      disabled={testPlanLoading}
                      onClick={() => void openSavedAITestPlan(saved)}
                    >
                      Görüntüle
                    </button>
                    {saved.canDelete && (
                      <button
                        type="button"
                        className="ns-btn ns-btn-sm small-button"
                        title="Planı sil"
                        aria-label="Planı sil"
                        onClick={() => void deleteSavedAITestPlan(saved)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {testDiscovery && workspaceProject?.accessLevel !== "Viewer" && (
          <form onSubmit={createAITestPlan} className="studio-test-plan-form">
            <div className="studio-test-plan-heading">
              <span><Sparkles size={21} /></span>
              <div><h3>AI Test Asistanı · senaryo taslağı</h3><p>Test etmek istediğiniz davranışı açıklayın, incelemeye hazır senaryolar oluşturun.</p></div>
            </div>
            <label>
              Test edilmesi gereken davranış
              <textarea
                value={testRequest}
                onChange={(e) => setTestRequest(e.target.value)}
                required
                maxLength={2000}
                rows={3}
                placeholder="Örn. Aynı çalışma alanı talebinin iki kez onaylanması checkout'u çoğaltmamalı"
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                marginTop: 12,
              }}
            >
              <input
                type="checkbox"
                checked={testAIConsent}
                onChange={(e) => setTestAIConsent(e.target.checked)}
                required
                style={{ width: 16, marginTop: 3 }}
              />
              <span>
                Talep metnimin, proje/dal adının ve test hedeflerinin
                sınırlı metadata özetinin OpenAI’ye gönderilmesini
                onaylıyorum. Kaynak kod paylaşılmaz.
              </span>
            </label>
            <div className="modal-foot">
              <span>
                Senaryo taslağı kod çalıştırmaz; .NET test hedefleri için
                yalıtılmış çalıştırma ayrı onay ister.
              </span>
              <button
                className="ns-btn ns-btn-primary"
                disabled={testPlanLoading || !testAIConsent}
              >
                {testPlanLoading
                  ? "Senaryolar hazırlanıyor…"
                  : "AI test senaryoları hazırla"}
              </button>
            </div>
          </form>
        )}
        {testPlan && (
          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-heading">
              <div>
                <b>AI Test Asistanı taslağı</b>
                <small>İnsan incelemesi gerekli · çalıştırılmadı</small>
              </div>
            </div>
            <div className="notice">{testPlan.summary}</div>
            <div className="requests-list">
              {testPlan.scenarios.map((scenario, i) => (
                <article className="request-row expanded" key={i}>
                  <div className="request-info">
                    <b>
                      {i + 1}. {scenario.title}
                    </b>
                    <small>
                      {scenario.category} · Öncelik: {scenario.priority}
                    </small>
                    <small>{scenario.objective}</small>
                    <small>Adımlar: {scenario.steps.join(" → ")}</small>
                    <small>Beklenen: {scenario.expectedResult}</small>
                  </div>
                </article>
              ))}
            </div>
            {(testPlan.assumptions.length > 0 ||
              testPlan.risks.length > 0) && (
              <div className="boundary-note">
                <ShieldCheck size={17} />
                <span>
                  <b>Varsayımlar ve riskler</b>
                  {[
                    ...testPlan.assumptions.map((x) => `Varsayım: ${x}`),
                    ...testPlan.risks.map((x) => `Risk: ${x}`),
                  ].join(" · ")}
                </span>
              </div>
            )}
            <div className="modal-foot">
              <span>
                {testPlanSavedId
                  ? "Proje geçmişinde kayıtlı; özgün talep saklanmadı."
                  : "Plan henüz kaydedilmedi."}
              </span>
              {!testPlanSavedId &&
                workspaceProject?.accessLevel !== "Viewer" && (
                  <button
                    className="ns-btn ns-btn-primary"
                    disabled={testPlanSaveLoading}
                    onClick={() => void saveAITestPlan()}
                  >
                    {testPlanSaveLoading
                      ? "Kaydediliyor…"
                      : "Planı proje geçmişine kaydet"}
                  </button>
                )}
            </div>
          </section>
        )}
        <div className="boundary-note">
          <ShieldCheck size={17} />
          <span>
            <b>Ağsız test sandboxı</b>Test keşfi salt okunur. Test ve .NET
            build çalıştırma yalnız Maintainer veya TenantAdmin tarafından
            açık onayla başlatılır; kaynak snapshotını değiştirmez, dış ağa
            erişmez ve süre/CPU/bellek/PID sınırlarına tabidir. Şimdilik
            .NET, Python pytest, Node.js yerleşik, standart kütüphane
            kullanan Go ve bağımlılıksız Rust testleri çalıştırılır; proje
            paketleri kurulmaz, npm scriptleri çağrılmaz.
          </span>
        </div>
      </Dialog>
  );
}
