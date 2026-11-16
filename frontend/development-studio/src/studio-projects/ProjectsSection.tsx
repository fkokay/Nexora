// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import { RefreshCw, Plus, ShieldCheck, Code2, Folder, FolderKanban } from "lucide-react";
import { projectAccessLabel } from "./helpers";
import type { DevelopmentProject, Tenant } from "./types";

export type ProjectsSectionProps = {
  aiConfigured: boolean | null;
  busy: boolean;
  error: string;
  notice: string;
  openAccess: (project: DevelopmentProject) => Promise<void>;
  openWorkspace: (project: DevelopmentProject) => Promise<void>;
  projects: DevelopmentProject[];
  refreshProjectStatus: () => Promise<void>;
  setModuleMappingProject: Dispatch<SetStateAction<DevelopmentProject | null>>;
  setShowCreate: Dispatch<SetStateAction<boolean>>;
  tenant: Tenant;
};

export function ProjectsSection({
  aiConfigured,
  busy,
  error,
  notice,
  openAccess,
  openWorkspace,
  projects,
  refreshProjectStatus,
  setModuleMappingProject,
  setShowCreate,
  tenant,
}: ProjectsSectionProps) {
  return (
    <section className="ns-card sp-projects" aria-labelledby="sp-projects-title">
      <header className="ns-card-head">
        <div>
          <h3 id="sp-projects-title">Projeler</h3>
          <p className="sp-sub">
            Erişiminiz olan depolar · {projects.length} proje
          </p>
        </div>
        <div className="sp-actions">
          <button
            className="ns-btn ns-btn-sm small-button"
            disabled={busy}
            onClick={() => void refreshProjectStatus()}
          >
            <RefreshCw size={14} aria-hidden="true" /> Bağlantıları yenile
          </button>
          {tenant.role === "TenantAdmin" && (
            <button
              className="ns-btn ns-btn-sm small-button ns-btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={15} aria-hidden="true" /> Proje kaydet
            </button>
          )}
        </div>
      </header>
      {error && <div className="alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      {aiConfigured === false && (
        <div className="notice">
          <b>AI sağlayıcısı yapılandırılmadı.</b> AI özelliklerini açmak için
          Docker ortamına <code>OPENAI_API_KEY</code> ekleyip{" "}
          <code>ai-service</code> servisini yeniden başlatın. Anahtar
          tarayıcıya gönderilmez.
        </div>
      )}
      {projects.length ? (
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Proje / depo</th>
                <th scope="col">Varsayılan dal</th>
                <th scope="col">Rolünüz</th>
                <th scope="col">GitHub</th>
                <th scope="col">
                  <span className="ns-sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <div className="sp-project-name">
                      <span className="sp-avatar" aria-hidden="true">
                        {project.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="sp-link"
                          onClick={() => void openWorkspace(project)}
                        >
                          {project.name}
                        </button>
                        <small title={project.repositoryUrl}>
                          {project.repositoryUrl}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code className="sp-branch">{project.defaultBranch}</code>
                  </td>
                  <td>{projectAccessLabel(project.accessLevel)}</td>
                  <td>
                    <span
                      className={`ns-badge ${project.githubAuthorized ? "is-success" : "is-warning"}`}
                    >
                      {project.githubAuthorized ? "Bağlı" : "Yetki gerekli"}
                    </span>
                  </td>
                  <td>
                    <div className="sp-actions sp-row-actions">
                      {(project.accessLevel === "Maintainer" ||
                        project.accessLevel === "TenantAdmin") && (
                        <>
                          <button
                            className="ns-btn ns-btn-sm small-button ns-btn-ghost"
                            onClick={() => void openAccess(project)}
                          >
                            <ShieldCheck size={14} aria-hidden="true" />
                            Erişimler
                          </button>
                          <button
                            className="ns-btn ns-btn-sm small-button ns-btn-ghost"
                            onClick={() => setModuleMappingProject(project)}
                          >
                            <Code2 size={14} aria-hidden="true" />
                            Modül kaynağı
                          </button>
                        </>
                      )}
                      <button
                        className="ns-btn ns-btn-sm small-button"
                        onClick={() => void openWorkspace(project)}
                      >
                        <Folder size={14} aria-hidden="true" />
                        Çalışma alanı
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ns-empty">
          <span className="sp-avatar" aria-hidden="true">
            <FolderKanban size={16} />
          </span>
          <b>Henüz erişebildiğiniz proje yok</b>
          <span>
            {tenant.role === "TenantAdmin"
              ? "İlk depoyu kaydederek başlayın."
              : "Firma yöneticisi bir depo kaydedip size erişim verebilir."}
          </span>
          {tenant.role === "TenantAdmin" && (
            <button
              className="ns-btn ns-btn-sm small-button ns-btn-primary"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={15} aria-hidden="true" /> Proje kaydet
            </button>
          )}
        </div>
      )}
      <p className="sp-footnote">
        <ShieldCheck size={15} aria-hidden="true" />
        Proje gezgini onaylı checkout'taki dosya adlarını ve türlerini
        listeler. Git kimlik bilgisi alınmaz, önizleme salt okunurdur ve kod
        çalıştırılmaz.
      </p>
    </section>
  );
}
