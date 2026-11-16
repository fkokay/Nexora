// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { GitBranch, X, Folder, RefreshCw, Code2, Grid2X2, List, FileCode, FolderTree, ArrowUpRight, ShieldCheck } from "lucide-react";
import type { DevelopmentProject, WorkspaceAnalysis, WorkspaceRequest } from "./types";

export type ProjectMapDialogProps = {
  analysisCompletedAt: string | null;
  analysisLoading: boolean;
  analysisWorkspace: WorkspaceRequest;
  error: string;
  inventoryLayout: "grid" | "list";
  loadWorkspaceAnalysis: (request: WorkspaceRequest) => Promise<void>;
  setAnalysisWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setInventoryLayout: Dispatch<SetStateAction<"grid" | "list">>;
  setWorkspaceAnalysis: Dispatch<SetStateAction<WorkspaceAnalysis | null>>;
  workspaceAnalysis: WorkspaceAnalysis | null;
  workspaceProject: DevelopmentProject | null;
};

export function ProjectMapDialog({
  analysisCompletedAt,
  analysisLoading,
  analysisWorkspace,
  error,
  inventoryLayout,
  loadWorkspaceAnalysis,
  setAnalysisWorkspace,
  setInventoryLayout,
  setWorkspaceAnalysis,
  workspaceAnalysis,
  workspaceProject,
}: ProjectMapDialogProps) {
  return (
    <Dialog
  onClose={() => { setAnalysisWorkspace(null);
          setWorkspaceAnalysis(null); }}
  className="studio-inventory-modal"
>
        <div className="modal-head">
          <div className="studio-inventory-hero-icon">
            <GitBranch size={27} />
          </div>
          <div className="studio-inventory-hero-copy">
            <p className="eyebrow">KOD ÇALIŞMA ALANI ENVANTERİ</p>
            <h2>{workspaceProject?.name} / Proje haritası</h2>
            <p>
              {analysisWorkspace.branchName} dalının kod yapısını, dosya
              türlerini ve solution girişlerini tek ekranda görüntüleyin.
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Proje haritasını kapat"
            onClick={() => {
              setAnalysisWorkspace(null);
              setWorkspaceAnalysis(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub studio-inventory-intro">
          Dosya içerikleri okunmaz; yalnızca yapı, tür ve sayısal bilgiler
          analiz edilir.
        </p>
        {error && <div className="alert">{error}</div>}
        {analysisLoading ? (
          <div className="empty-small">Dosya envanteri çıkarılıyor…</div>
        ) : (
          workspaceAnalysis && (
            <>
              <section
                className="studio-inventory-summary"
                aria-label="Envanter özeti"
              >
                <span className="studio-inventory-summary-icon">
                  <Folder size={23} />
                </span>
                <div className="studio-inventory-file-total">
                  <strong>
                    {workspaceAnalysis.scannedFiles.toLocaleString("tr-TR")}
                  </strong>
                  <span>dosya tarandı</span>
                </div>
                <div className="studio-inventory-scan-state">
                  <span
                    className={`studio-inventory-status${workspaceAnalysis.truncated ? " is-partial" : ""}`}
                  >
                    <i />
                    {workspaceAnalysis.truncated
                      ? "Kısmi envanter"
                      : "Envanter tamamlandı"}
                  </span>
                  <small>
                    {analysisCompletedAt
                      ? `Son tarama: ${new Date(analysisCompletedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}`
                      : "Envanter hazır"}
                  </small>
                </div>
                <button
                  className="secondary studio-inventory-rescan"
                  disabled={analysisLoading}
                  onClick={() =>
                    void loadWorkspaceAnalysis(analysisWorkspace)
                  }
                >
                  <RefreshCw size={15} />
                  {analysisLoading ? "Taranıyor…" : "Yeniden tara"}
                </button>
              </section>
              <section className="studio-inventory-section">
                <div className="studio-inventory-section-heading">
                  <div className="studio-inventory-heading-title">
                    <span>
                      <Code2 size={20} />
                    </span>
                    <div>
                      <h3>Teknoloji ve dosya türleri</h3>
                      <p>
                        Workspace içinde tespit edilen dosya türlerinin
                        dağılımı.
                      </p>
                    </div>
                  </div>
                  <div
                    className="studio-inventory-view-switch"
                    role="group"
                    aria-label="Dosya türü görünümü"
                  >
                    <button
                      className={inventoryLayout === "grid" ? "active" : ""}
                      aria-label="Kart görünümü"
                      aria-pressed={inventoryLayout === "grid"}
                      onClick={() => setInventoryLayout("grid")}
                    >
                      <Grid2X2 size={16} />
                    </button>
                    <button
                      className={inventoryLayout === "list" ? "active" : ""}
                      aria-label="Liste görünümü"
                      aria-pressed={inventoryLayout === "list"}
                      onClick={() => setInventoryLayout("list")}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
                <div
                  className={`studio-inventory-type-grid ${inventoryLayout === "list" ? "is-list" : ""}`}
                >
                  {workspaceAnalysis.technologies.map((item) => {
                    const percent = workspaceAnalysis.scannedFiles
                      ? (item.fileCount / workspaceAnalysis.scannedFiles) *
                        100
                      : 0;
                    return (
                      <article
                        className="studio-inventory-type-card"
                        key={item.name}
                      >
                        <span className="studio-inventory-type-icon">
                          <FileCode size={17} />
                        </span>
                        <div className="studio-inventory-type-copy">
                          <b>{item.name}</b>
                          <span>
                            {item.fileCount.toLocaleString("tr-TR")} dosya
                          </span>
                          <div className="studio-inventory-progress">
                            <i
                              style={{ width: `${Math.max(percent, 1)}%` }}
                            />
                          </div>
                        </div>
                        <small>
                          {percent.toLocaleString("tr-TR", {
                            maximumFractionDigits: 1,
                          })}
                          %
                        </small>
                      </article>
                    );
                  })}
                </div>
                {!workspaceAnalysis.technologies.length && (
                  <div className="empty-small">
                    Envanterde tanınan dosya türü bulunamadı.
                  </div>
                )}
              </section>
              <section className="studio-inventory-section studio-inventory-entry-section">
                <div className="studio-inventory-section-heading">
                  <div className="studio-inventory-heading-title">
                    <span>
                      <FolderTree size={20} />
                    </span>
                    <div>
                      <h3>Solution ve proje girişleri</h3>
                      <p>
                        Workspace içindeki solution ve proje manifestleri.
                      </p>
                    </div>
                  </div>
                  <span className="studio-inventory-count">
                    {workspaceAnalysis.entryPoints.length} kayıt
                  </span>
                </div>
                <div className="studio-inventory-entry-list">
                  {workspaceAnalysis.entryPoints.map((path) => {
                    const isSolution = path.toLowerCase().endsWith(".sln");
                    return (
                      <article
                        className="studio-inventory-entry"
                        key={path}
                      >
                        <FileCode size={18} />
                        <div className="studio-inventory-entry-copy">
                          <b>{path.split(/[\/]/).pop()}</b>
                          <span>
                            {path.startsWith("/") ? path : `/${path}`}
                          </span>
                        </div>
                        <span className="studio-inventory-entry-kind">
                          {isSolution ? "Solution" : "Project"}
                        </span>
                        <ArrowUpRight size={17} />
                      </article>
                    );
                  })}
                  {!workspaceAnalysis.entryPoints.length && (
                    <div className="empty-small">
                      Tanınan bir solution veya proje manifesti bulunamadı.
                    </div>
                  )}
                </div>
              </section>
            </>
          )
        )}
        <div className="boundary-note studio-inventory-boundary">
          <ShieldCheck size={17} />
          <span>
            <b>Salt okunur teknik envanter</b>Bu harita dosya adlarından
            hesaplanır; yapay zekâ yorumu değildir. Kod, bağımlılık
            betikleri veya testler çalıştırılmaz.
          </span>
        </div>
      </Dialog>
  );
}
