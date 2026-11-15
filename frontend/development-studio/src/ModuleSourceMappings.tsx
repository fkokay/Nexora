import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { api } from "./api";
import { confirmDialog } from "./ui/confirmDialog";
import { Dialog } from "./ui/Dialog";
import "./studio-tools.css";

type Project = {
  id: string;
  name: string;
  repositoryUrl: string;
  defaultBranch: string;
};
type Mapping = {
  id: string;
  moduleCode: string;
  projectId: string;
  projectName: string;
  repositoryUrl: string;
  ref: string;
  pathAllowlist: string[];
  createdAt: string;
};

export function ModuleSourceMappings({
  token,
  project,
  onClose,
}: {
  token: string;
  project: Project;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Mapping[]>([]),
    [moduleCodes, setModuleCodes] = useState<string[]>([]),
    [moduleCode, setModuleCode] = useState(""),
    [ref, setRef] = useState(project.defaultBranch),
    [paths, setPaths] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    setError("");
    try {
      const [mappings, codes] = await Promise.all([
        api<Mapping[]>(
          `/studio/projects/${project.id}/module-source-mappings`,
          token,
        ),
        api<string[]>("/studio/modules/active", token),
      ]);
      setItems(mappings);
      setModuleCodes(codes);
      setModuleCode((current) => current || codes[0] || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [project.id, token]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<Mapping>("/studio/projects/module-source-mappings", token, {
        method: "POST",
        body: JSON.stringify({
          projectId: project.id,
          moduleCode: moduleCode.trim(),
          ref: ref.trim(),
          pathAllowlist: paths
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
          mappingConfirmed: confirmed,
        }),
      });
      setNotice(
        "Modül kaynak eşlemesi tenant için kaydedildi ve denetim kaydına eklendi.",
      );
      setModuleCode("");
      setPaths("");
      setConfirmed(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Mapping) {
    if (
      !(await confirmDialog({
        title: `${item.moduleCode} kaynak eşlemesi kaldırılsın mı?`,
        message: "Modül bu projedeki kaynak koduyla eşleşmez. Eşlemeyi daha sonra yeniden ekleyebilirsiniz.",
        tone: "danger",
        confirmLabel: "Eşlemeyi kaldır",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<void>(
        `/studio/projects/module-source-mappings/${item.id}`,
        token,
        { method: "DELETE" },
      );
      setItems((current) => current.filter((x) => x.id !== item.id));
      setNotice("Eşleme kaldırıldı ve denetim kaydına eklendi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      // The disabled Kaldır button (or its removed row) drops focus; keep it inside the dialog.
      requestAnimationFrame(() => {
        if (document.activeElement === document.body)
          document.getElementById("module-source-list-title")?.focus();
      });
    }
  }
  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      labelledBy="module-source-mappings-title"
      describedBy="module-source-mappings-sub"
      className="ns-tool-dialog"
    >
      <header className="ns-dialog-head">
        <div>
          <span className="ns-eyebrow">Tenant kapsamında · kullanıcı onaylı</span>
          <h2 id="module-source-mappings-title">Modül kaynak eşlemeleri</h2>
        </div>
        <button
          type="button"
          className="ns-btn ns-btn-sm ns-btn-ghost"
          onClick={onClose}
          aria-label="Kapat"
        >
          <X size={18} />
        </button>
      </header>
      <div className="ns-dialog-body">
        <p className="ns-dialog-sub" id="module-source-mappings-sub">
          Hedef repo, kayıtlı Studio projesinden alınır:{" "}
          <b className="ns-mono tools-repo">{project.repositoryUrl}</b>. Repo
          URL’si bu formda değiştirilemez. Ref ve kaynak path’lerini siz
          doğrularsınız.
        </p>
        {error && (
          <div className="ns-callout is-danger" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="ns-callout is-success" role="status">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
        )}
        <form className="tools-form" onSubmit={save}>
          <div className="tools-form-row">
            <label className="ns-field">
              <span className="ns-field-label">Etkin modül kodu</span>
              <select
                value={moduleCode}
                onChange={(e) => setModuleCode(e.target.value)}
                required
                disabled={moduleCodes.length === 0}
              >
                <option value="">
                  {moduleCodes.length ? "Modül seçin" : "Etkin modül bulunamadı"}
                </option>
                {moduleCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <span className="ns-field-hint">
                Yalnızca bu tenant’ta etkinleştirilmiş modüller listelenir.
              </span>
            </label>
            <label className="ns-field">
              <span className="ns-field-label">Git ref / branch</span>
              <input
                className="ns-mono"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                maxLength={256}
                required
                placeholder="main"
              />
            </label>
          </div>
          <label className="ns-field">
            <span className="ns-field-label">Path allowlist metaverisi</span>
            <textarea
              className="ns-mono"
              value={paths}
              onChange={(e) => setPaths(e.target.value)}
              maxLength={4000}
              required
              rows={4}
              placeholder={
                "modules/inventory-tools\nfrontend/modules/inventory-tools"
              }
            />
            <span className="ns-field-hint">
              Her satıra bir dizin veya dosya yolu. Mutlak yollar, traversal ve
              hassas klasör adları reddedilir; bu liste mevcut çalışma alanı
              editöründe henüz zorunlu tutulmaz.
            </span>
          </label>
          <label className="ns-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            <span>
              Bu modül için doğru repo, ref ve kaynak path’lerini doğruladım.
              Kaydetme yalnız eşleme kaydı oluşturur.
            </span>
          </label>
          <div className="tools-form-foot">
            <span>
              <ShieldCheck size={14} /> Repo bağlantısı ve yayın onayları ayrı
              kalır
            </span>
            <button
              className="ns-btn ns-btn-primary"
              disabled={busy || !confirmed}
            >
              {busy ? "Kaydediliyor…" : "Eşlemeyi kaydet"}
            </button>
          </div>
        </form>
        <section className="tools-section" aria-labelledby="module-source-list-title">
          <div className="ns-card-head">
            <h3 id="module-source-list-title" tabIndex={-1}>Bu projeye bağlı modüller</h3>
            <span className="ns-badge">{items.length} eşleme</span>
          </div>
          {loading ? (
            <div className="ns-empty">Eşlemeler yükleniyor…</div>
          ) : items.length ? (
            <div className="ns-table-wrap">
              <table className="ns-table tools-table">
                <thead>
                  <tr>
                    <th scope="col">Modül</th>
                    <th scope="col">Repo · ref</th>
                    <th scope="col">Path sınırı</th>
                    <th scope="col">
                      <span className="ns-sr-only">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <b>{item.moduleCode}</b>
                      </td>
                      <td className="tools-cell-mono">
                        {item.repositoryUrl}
                        <span className="ns-badge is-accent">{item.ref}</span>
                      </td>
                      <td className="tools-cell-mono">
                        {item.pathAllowlist.join(" · ")}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ns-btn ns-btn-sm tools-danger"
                          disabled={busy}
                          onClick={() => void remove(item)}
                          aria-label={`${item.moduleCode} eşlemesini kaldır`}
                        >
                          Kaldır
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ns-empty">
              <b>Henüz modül bağlanmadı</b>
              Bu projeye bağlı modül eşlemesi yok.
            </div>
          )}
        </section>
        <div className="ns-callout is-info">
          <ShieldCheck size={16} />
          <span>
            <b>İşlem sınırı</b>Bu kayıt yalnızca tenant kapsamındaki eşlemeyi
            saklar. Checkout, Git işlemi, kod çalıştırma, push veya yayın
            başlatmaz.
          </span>
        </div>
      </div>
    </Dialog>
  );
}
