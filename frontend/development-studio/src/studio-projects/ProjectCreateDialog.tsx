// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, ShieldCheck } from "lucide-react";

export type ProjectCreateDialogProps = {
  busy: boolean;
  createProject: (e: FormEvent) => Promise<void>;
  defaultBranch: string;
  error: string;
  name: string;
  repositoryUrl: string;
  setDefaultBranch: Dispatch<SetStateAction<string>>;
  setName: Dispatch<SetStateAction<string>>;
  setRepositoryUrl: Dispatch<SetStateAction<string>>;
  setShowCreate: Dispatch<SetStateAction<boolean>>;
};

export function ProjectCreateDialog({
  busy,
  createProject,
  defaultBranch,
  error,
  name,
  repositoryUrl,
  setDefaultBranch,
  setName,
  setRepositoryUrl,
  setShowCreate,
}: ProjectCreateDialogProps) {
  return (
    <Dialog
      onClose={() => setShowCreate(false)}
      labelledBy="sp-create-title"
      className="sp-dialog"
      dismissible={!busy}
    >
      <header className="sp-dialog-head">
        <div>
          <h2 id="sp-create-title">Proje kaydet</h2>
          <p>
            HTTPS depo adresini kaydedin. Kaynak kod ancak bir çalışma alanı
            talebi onaylandığında indirilir.
          </p>
        </div>
        <button
          type="button"
          className="ns-btn ns-btn-sm small-button ns-btn-ghost"
          aria-label="Kapat"
          onClick={() => setShowCreate(false)}
        >
          <X size={17} />
        </button>
      </header>
      {error && <div className="alert">{error}</div>}
      <form className="sp-form" onSubmit={createProject}>
        <label className="ns-field">
          <span className="ns-field-label">Proje adı</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            placeholder="Örn. Nexora ERP"
          />
        </label>
        <label className="ns-field">
          <span className="ns-field-label">HTTPS depo adresi</span>
          <input
            type="url"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            required
            maxLength={2048}
            placeholder="https://github.com/organizasyon/proje.git"
          />
        </label>
        <label className="ns-field">
          <span className="ns-field-label">Varsayılan dal</span>
          <input
            className="ns-mono"
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            required
            maxLength={256}
          />
        </label>
        <footer className="sp-dialog-foot">
          <small>
            <ShieldCheck size={14} aria-hidden="true" /> Yalnız firma
            yöneticisi kaydedebilir
          </small>
          <button
            type="button"
            className="ns-btn"
            onClick={() => setShowCreate(false)}
          >
            Vazgeç
          </button>
          <button disabled={busy} className="ns-btn ns-btn-primary">
            {busy ? "Kaydediliyor…" : "Projeyi kaydet"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
