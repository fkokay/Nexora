import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, GitBranch, RefreshCw } from "lucide-react";
import { authorizedFetch } from "../api";
import { githubRows, MODULE_CODE_HREF, type GitHubProject } from "./connectionsModel";

type Props = { token: string };
type ApiProject = { repositoryUrl: string; githubAuthorized?: boolean; gitHubAuthorized?: boolean };

/** Bağlantılar: firmanın dış sistem bağlantıları; şimdilik GitHub depoları. */
export function ConnectionsPage({ token }: Props) {
  const [projects, setProjects] = useState<GitHubProject[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await authorizedFetch("/studio/projects/", token);
      if (!response.ok) throw new Error(`Bağlantılar yüklenemedi (${response.status}).`);
      const items = (await response.json()) as ApiProject[];
      setProjects(
        items.map((item) => ({
          repositoryUrl: item.repositoryUrl,
          githubAuthorized: item.githubAuthorized ?? item.gitHubAuthorized ?? false,
        })),
      );
    } catch (cause) {
      setLoadError((cause as Error).message || "Bağlantılar yüklenemedi.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className="ns-page-head st-page-head">
        <div>
          <h1>Bağlantılar</h1>
          <p>Dış sistemler ve Git</p>
        </div>
        <button className="ns-btn" type="button" onClick={() => void load()}>
          <RefreshCw size={15} aria-hidden="true" />
          Yenile
        </button>
      </header>
      <section className="ns-card st-card" aria-label="Bağlantılar">
        {loadError ? (
          <div className="st-alert is-danger" role="alert">
            {loadError}
          </div>
        ) : !projects ? (
          <div className="st-loading" role="status">
            Bağlantılar yükleniyor…
          </div>
        ) : (
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Bağlantı</th>
                  <th scope="col">Ayrıntı</th>
                  <th scope="col">Durum</th>
                  <th scope="col">
                    <span className="ns-sr-only">İşlem</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {githubRows(projects).map((row, index) => (
                  <tr key={`${row.detail}-${index}`}>
                    <td>
                      <b>
                        <GitBranch size={14} aria-hidden="true" /> {row.title}
                      </b>
                    </td>
                    <td>{row.detail}</td>
                    <td>
                      <span className={`ns-badge ${row.status === "Bağlı" ? "is-success" : "is-warning"}`}>{row.status}</span>
                    </td>
                    <td>
                      <a className="ns-btn ns-btn-ghost ns-btn-sm" href={MODULE_CODE_HREF}>
                        Firma modülünde aç
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="st-card-note">Depo ekleme ve GitHub yetkilendirmesi Firma modülü ekranında yapılır.</p>
      </section>
    </>
  );
}
