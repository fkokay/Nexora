import { useCallback, useEffect, useRef, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { Dialog } from "../../ui/Dialog";
import { confirmDialog } from "../../ui/confirmDialog";
import { buildBundle, readCatalogEntries, type CatalogFile } from "./catalogFiles";
import {
  activateRelease, activeCatalog, CatalogApiError, createRelease, listReleases,
  type ActiveCatalog, type BreakingPage, type CatalogRelease,
} from "./catalogApi";

export type CatalogReleaseDialogProps = {
  token: string;
  root: string;
  files: CatalogFile[];
  hasUncommittedCatalogChanges: boolean;
  headCommitSha: string | null;
  repositoryUrl: string | null;
  /** Firma yöneticisi ya da Studio yazılımcısı: önizleme ve sürüm yayını (sunucu da aynı kuralı uygular). */
  canDevelop: boolean;
  onClose: () => void;
};

const semver = /^(\d+)\.(\d+)\.(\d+)$/;
const parts = (v: string) => (semver.exec(v) ?? []).slice(1).map(Number);

function nextVersion(releases: CatalogRelease[]): string {
  let best: number[] | null = null;
  for (const release of releases) {
    const p = parts(release.version);
    if (p.length !== 3) continue;
    if (!best || p[0] > best[0] || (p[0] === best[0] && (p[1] > best[1] || (p[1] === best[1] && p[2] > best[2])))) best = p;
  }
  return best ? `${best[0]}.${best[1]}.${best[2] + 1}` : "1.0.0";
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "İşlem tamamlanamadı.");

export function CatalogReleaseDialog({
  token, root, files, hasUncommittedCatalogChanges, headCommitSha, repositoryUrl, canDevelop, onClose,
}: CatalogReleaseDialogProps) {
  const blocked = hasUncommittedCatalogChanges || !canDevelop;
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [active, setActive] = useState<ActiveCatalog | null>(null);
  const [version, setVersion] = useState("1.0.0");
  const [versionTouched, setVersionTouched] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readErrors, setReadErrors] = useState<string[]>([]);
  const [pages, setPages] = useState<BreakingPage[]>([]);
  const [done, setDone] = useState<string | null>(null);
  // Onay penceresi açıkken ikinci "Bu sürüme dön" tıklaması yok sayılır (state bir sonraki çizime kadar güncellenmez).
  const rollbackPending = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [list, current] = await Promise.all([listReleases(token), activeCatalog(token)]);
      setReleases(list);
      setActive(current);
      if (!versionTouched) setVersion(nextVersion(list));
    } catch (e) {
      setError(errorText(e));
    }
  }, [token, versionTouched]);

  useEffect(() => {
    if (blocked) return;
    void refresh();
    // yalnız açılışta yüklenir; sonraki yenilemeler işlemlerden sonra elle yapılır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  const otherPath = active?.sourcePath && active.sourcePath !== root ? active.sourcePath : null;

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setPages([]); setReadErrors([]); setDone(null);
    try { await action(); } catch (e) {
      setError(errorText(e));
      if (e instanceof CatalogApiError && e.pages?.length) setPages(e.pages);
      // Kırılma raporu olmayan 409: beklenen etkin sürüm eskidi. Yalnız etkin sürüm yeniden okunur (önerilen sürüm
      // numarası değişmez), yeniden deneme güncel kimliği gönderir.
      else if (e instanceof CatalogApiError && e.status === 409) await activeCatalog(token).then(setActive).catch(() => undefined);
    } finally { setBusy(false); }
  }

  const createDraft = () => run(async () => {
    const { entries, errors } = readCatalogEntries(root, files);
    if (errors.length) { setReadErrors(errors); return; }
    const created = await createRelease(token, {
      version: version.trim(), bundle: buildBundle(entries),
      sourceRepository: repositoryUrl, sourceCommit: headCommitSha, sourcePath: root,
    });
    setDraftId(created.id);
  });

  const activate = (id: string, label: string) => run(async () => {
    await activateRelease(token, id, active?.releaseId ?? null);
    setDraftId(null);
    setDone(label);
    await refresh();
  });

  async function rollback(release: CatalogRelease) {
    if (rollbackPending.current || busy) return;
    rollbackPending.current = true;
    setBusy(true);
    try {
      const ok = await confirmDialog({
        title: `${release.version} sürümüne dönülsün mü?`,
        message: "Etkin katalog bu sürümle değiştirilir. Geçerli sürüm yeniden etkinleştirilebilir.",
        confirmLabel: "Bu sürüme dön",
      });
      if (ok) await activate(release.id, release.version);
    } finally {
      rollbackPending.current = false;
      setBusy(false);
    }
  }

  const currentEntries = readCatalogEntries(root, files).entries;
  const count = (kind: string) => currentEntries.filter(e => e.kind === kind).length;
  const componentCount = count("component");

  return (
    <Dialog onClose={onClose} labelledBy="sp-catalog-release-title" className="sp-dialog" dismissible={!busy}>
      <header className="sp-dialog-head">
        <div>
          <h2 id="sp-catalog-release-title">Sürüm yayınla</h2>
          <p>Katalogdaki veri kaynakları, eylemler ve bileşenler ({currentEntries.length} öğe) yeni bir sürüm olarak firmaya kurulur.</p>
        </div>
        <button type="button" className="ns-btn ns-btn-sm small-button ns-btn-ghost" aria-label="Kapat" disabled={busy} onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="sp-catalog-sum">
        <div><span>Veri kaynağı</span><b>{count("dataSource")}</b></div>
        <div><span>Eylem</span><b>{count("action")}</b></div>
        <div><span>Bileşen</span><b>{componentCount}</b></div>
      </div>
      {componentCount > 0 && (
        <p className="sp-catalog-note">
          Yayınlanan sürüm taslaktır; firmada TenantAdmin etkinleştirince bütün sayfalar yeni bileşen kodunu kullanır. Danışmanın sayfaları ve ayar değerleri değişmez.
        </p>
      )}
      {!canDevelop && <div className="alert">Yalnızca yazılımcı ya da yönetici yayınlayabilir.</div>}
      {canDevelop && hasUncommittedCatalogChanges && <div className="alert">Önce değişiklikleri commit edin.</div>}
      {error && <div className="alert">{error}</div>}
      {readErrors.length > 0 && (
        <div className="alert"><ul>{readErrors.map(item => <li key={item}>{item}</li>)}</ul></div>
      )}
      {pages.length > 0 && (
        <div className="alert">
          <b>Bu sayfalar etkilenir</b>
          <ul>{pages.map(page => <li key={page.code}>{page.name} ({page.code}): {page.references.join(", ")}</li>)}</ul>
        </div>
      )}
      {done && <p role="status">{done} sürümü etkinleştirildi.</p>}
      {otherPath && !draftId && <div className="alert">Etkin katalog {otherPath} klasöründen; bu yayın onun yerini alır.</div>}
      <form className="sp-form" onSubmit={event => event.preventDefault()}>
        <label className="ns-field">
          <span className="ns-field-label">Yeni sürüm</span>
          <input
            className="ns-mono" value={version} disabled={blocked || busy || !!draftId} maxLength={40}
            onChange={event => { setVersionTouched(true); setVersion(event.target.value); }}
          />
        </label>
        <footer className="sp-dialog-foot">
          <small><ShieldCheck size={14} aria-hidden="true" /> Yalnız yazılımcı ya da yönetici yayınlayabilir</small>
          <button type="button" className="ns-btn" disabled={busy} onClick={onClose}>Vazgeç</button>
          {draftId ? (
            <button type="button" className="ns-btn ns-btn-primary" disabled={busy} onClick={() => void activate(draftId, version)}>
              {busy ? "Etkinleştiriliyor…" : "Etkinleştir"}
            </button>
          ) : (
            <button type="button" className="ns-btn ns-btn-primary" disabled={blocked || busy || !version.trim()} onClick={() => void createDraft()}>
              {busy ? "Oluşturuluyor…" : "Taslak oluştur"}
            </button>
          )}
        </footer>
      </form>
      {!blocked && (
        <section>
          <h3>Sürümler</h3>
          {releases.length === 0 ? <p>Henüz sürüm yok.</p> : (
            <ul className="sp-catalog-releases">
              {releases.map(release => (
                <li key={release.id}>
                  <b>{release.version}</b> · {release.status} · <code>{release.sourceCommit?.slice(0, 7) ?? "—"}</code> · {new Date(release.createdAt).toLocaleDateString("tr-TR")}
                  {release.status === "Superseded" && (
                    <button type="button" className="ns-btn ns-btn-sm" disabled={busy} onClick={() => void rollback(release)}>Bu sürüme dön</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Dialog>
  );
}
