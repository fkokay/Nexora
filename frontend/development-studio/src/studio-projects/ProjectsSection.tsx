// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import {
  RefreshCw,
  Plus,
  ShieldCheck,
  Code2,
  Folder,
  FolderKanban,
  GitBranch,
  ListTodo,
  Check,
} from "lucide-react";
import { projectAccessLabel } from "./helpers";
import type { DevelopmentProject, Tenant } from "./types";

export type ProjectsHeaderProps = {
  busy: boolean;
  projectRequestCount: number;
  projects: DevelopmentProject[];
  refreshProjectStatus: () => Promise<void>;
  setShowCreate: Dispatch<SetStateAction<boolean>>;
  tenant: Tenant;
};

/** Projeler sayfasının üst başlığı ve özet şeridi (onay kuyruğunun da üstünde durur). */
export function ProjectsHeader({
  busy,
  projectRequestCount,
  projects,
  refreshProjectStatus,
  setShowCreate,
  tenant,
}: ProjectsHeaderProps) {
  const connected = projects.filter(
    (project) => project.githubAuthorized,
  ).length;
  const manageable = projects.filter(
    (project) =>
      project.accessLevel === "TenantAdmin" ||
      project.accessLevel === "Maintainer",
  ).length;
  return (
    <>
      <header className="st-hero">
        <div className="st-hero-text">
          <h1>Projeler</h1>
          <p>Yetkilendirilmiş depolar ve erişimler</p>
        </div>
        <div className="st-hero-actions">
          <button
            className="ns-btn"
            type="button"
            disabled={busy}
            onClick={() => void refreshProjectStatus()}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Bağlantıları yenile
          </button>
          {tenant.role === "TenantAdmin" && (
            <button
              className="ns-btn ns-btn-primary"
              type="button"
              onClick={() => setShowCreate(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Proje kaydet
            </button>
          )}
        </div>
      </header>
      <section className="st-stat-strip" aria-label="Proje özeti">
        <div className="st-stat">
          <span className="st-stat-label">
            <FolderKanban size={14} className="is-accent" aria-hidden="true" />
            Proje
          </span>
          <b>{projects.length}</b>
        </div>
        <div className="st-stat">
          <span className="st-stat-label">
            <GitBranch size={14} className="is-success" aria-hidden="true" />
            GitHub bağlı
          </span>
          <b>
            {connected}
            <small> / {projects.length}</small>
          </b>
        </div>
        <div className="st-stat">
          <span className="st-stat-label">
            <ShieldCheck size={14} className="is-info" aria-hidden="true" />
            Yönetilebilir
          </span>
          <b>{manageable}</b>
        </div>
        <div className="st-stat">
          <span className="st-stat-label">
            <ListTodo size={14} className="is-warning" aria-hidden="true" />
            Proje talebi
          </span>
          <b>{projectRequestCount}</b>
        </div>
      </section>
    </>
  );
}

export type ProjectsSectionProps = {
  aiConfigured: boolean | null;
  error: string;
  notice: string;
  openAccess: (project: DevelopmentProject) => Promise<void>;
  openWorkspace: (project: DevelopmentProject) => Promise<void>;
  projects: DevelopmentProject[];
  setModuleMappingProject: Dispatch<SetStateAction<DevelopmentProject | null>>;
  setShowCreate: Dispatch<SetStateAction<boolean>>;
  tenant: Tenant;
};

export function ProjectsSection({
  aiConfigured,
  error,
  notice,
  openAccess,
  openWorkspace,
  projects,
  setModuleMappingProject,
  setShowCreate,
  tenant,
}: ProjectsSectionProps) {
  const isAdmin = tenant.role === "TenantAdmin";
  const alerts = (
    <>
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
    </>
  );
  return (
    <>
      {projects.length ? (
        <section
          className="ns-card sp-projects"
          aria-labelledby="sp-projects-title"
        >
          <header className="ns-card-head">
            <div>
              <h3 id="sp-projects-title">Depolar</h3>
              <p className="sp-sub">
                {projects.length} proje · erişiminiz olan depolar
              </p>
            </div>
          </header>
          {alerts}
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
        </section>
      ) : (
        <>
          {(error || notice || aiConfigured === false) && (
            <div className="sp-alerts">{alerts}</div>
          )}
          <section
            className="ns-card sp-onboard"
            aria-labelledby="sp-onboard-title"
          >
            <div className="sp-onboard-main">
              <span className="sp-avatar" aria-hidden="true">
                <FolderKanban size={16} />
              </span>
              <h3 id="sp-onboard-title">
                {isAdmin
                  ? "İlk deponuzu bağlayın"
                  : "Henüz erişebildiğiniz proje yok"}
              </h3>
              <p>
                {isAdmin
                  ? "GitHub deposunu kaydedin; talepler bu depoda ayrı çalışma alanında hazırlanır."
                  : "Firma yöneticisi bir depo kaydedip size erişim verebilir."}
              </p>
              {isAdmin && (
                <div>
                  <button
                    className="ns-btn ns-btn-primary"
                    type="button"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus size={16} aria-hidden="true" /> Proje kaydet
                  </button>
                </div>
              )}
            </div>
            <div className="sp-onboard-after">
              <h4>Kaydettikten sonra</h4>
              <ul>
                <li>
                  <Check size={15} aria-hidden="true" />
                  Dosya gezgini salt okunur açılır
                </li>
                <li>
                  <Check size={15} aria-hidden="true" />
                  Git kimlik bilgisi alınmaz
                </li>
                <li>
                  <Check size={15} aria-hidden="true" />
                  Değişiklik onaysız uygulanmaz
                </li>
              </ul>
            </div>
          </section>
        </>
      )}
      <p className="sp-footnote sp-security-note">
        <ShieldCheck size={15} aria-hidden="true" />
        Depo erişimi proje ve firma yetkileriyle denetlenir; gezgin salt
        okunurdur, kod çalıştırılmaz ve değişiklikler onay gerektirir.
      </p>
    </>
  );
}
