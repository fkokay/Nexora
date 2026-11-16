// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X } from "lucide-react";
import { projectAccessLabel } from "./helpers";
import type { DevelopmentProject, ProjectMember } from "./types";

export type ProjectAccessDialogProps = {
  accessLevel: "Viewer" | "Contributor" | "Maintainer";
  accessProject: DevelopmentProject;
  busy: boolean;
  error: string;
  grantAccess: (e: FormEvent) => Promise<void>;
  memberEmail: string;
  members: ProjectMember[];
  revokeAccess: (member: ProjectMember) => Promise<void>;
  setAccessLevel: Dispatch<SetStateAction<"Viewer" | "Contributor" | "Maintainer">>;
  setAccessProject: Dispatch<SetStateAction<DevelopmentProject | null>>;
  setMemberEmail: Dispatch<SetStateAction<string>>;
};

export function ProjectAccessDialog({
  accessLevel,
  accessProject,
  busy,
  error,
  grantAccess,
  memberEmail,
  members,
  revokeAccess,
  setAccessLevel,
  setAccessProject,
  setMemberEmail,
}: ProjectAccessDialogProps) {
  return (
    <Dialog
      onClose={() => setAccessProject(null)}
      labelledBy="sp-access-title"
      className="sp-dialog sp-dialog-wide"
      dismissible={!busy}
    >
      <header className="sp-dialog-head">
        <div>
          <h2 id="sp-access-title">{accessProject.name} · erişimler</h2>
          <p>
            Yalnız bu firmanın etkin üyelerine proje rolü verilebilir.
            Değişiklikler denetim kaydına yazılır.
          </p>
        </div>
        <button
          type="button"
          className="ns-btn ns-btn-sm small-button ns-btn-ghost"
          aria-label="Kapat"
          onClick={() => setAccessProject(null)}
        >
          <X size={17} />
        </button>
      </header>
      {error && <div className="alert">{error}</div>}
      {members.length ? (
        <div className="sp-table-wrap">
          <table className="sp-table sp-table-compact">
            <thead>
              <tr>
                <th scope="col">Üye</th>
                <th scope="col">Rol</th>
                <th scope="col">Verildiği tarih</th>
                <th scope="col">
                  <span className="ns-sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>
                    <b>{member.email}</b>
                  </td>
                  <td>{projectAccessLabel(member.accessLevel)}</td>
                  <td>
                    {new Date(member.grantedAt).toLocaleDateString("tr-TR", {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className="sp-cell-end">
                    <button
                      className="ns-btn ns-btn-sm small-button ns-btn-ghost sp-danger-text"
                      disabled={busy}
                      onClick={() => void revokeAccess(member)}
                    >
                      Erişimi kaldır
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ns-empty">
          <b>Bu projede henüz üye yok</b>
          <span>Aşağıdan bir firma üyesine rol verin.</span>
        </div>
      )}
      <form className="sp-form sp-grant" onSubmit={grantAccess}>
        <label className="ns-field">
          <span className="ns-field-label">Firma üyesi e-postası</span>
          <input
            type="email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            required
            placeholder="kullanici@firma.com"
          />
        </label>
        <label className="ns-field">
          <span className="ns-field-label">Proje rolü</span>
          <select
            value={accessLevel}
            onChange={(e) =>
              setAccessLevel(e.target.value as ProjectMember["accessLevel"])
            }
          >
            <option value="Viewer">Görüntüleyici · yalnız okur</option>
            <option value="Contributor">Katılımcı · çalışma alanı açar</option>
            <option value="Maintainer">
              Bakım sorumlusu · erişimleri yönetir
            </option>
          </select>
        </label>
        <footer className="sp-dialog-foot">
          <button
            type="button"
            className="ns-btn"
            onClick={() => setAccessProject(null)}
          >
            Kapat
          </button>
          <button disabled={busy} className="ns-btn ns-btn-primary">
            {busy ? "Kaydediliyor…" : "Erişim ver"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
