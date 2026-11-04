import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Circle, CloudUpload, Info, Loader2, RefreshCw } from "lucide-react";
import { api } from "./api";

type Job = { id: string; packageId: string; status: string; commitSha: string; output: string };
type JobTone = "running" | "success" | "info" | "error";

const activeStatuses = new Set(["Queued", "Building", "Deploying"]);
const steps = ["Değişiklik analizi", "İmaj derleme", "Servisleri yenile", "Hazır"];

export function WebImageUpdate({ projectId, packageId, commitSha, token }: { projectId: string; packageId: string; commitSha: string; token: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const path = `/studio/projects/${projectId}/web-image-update`;
  const statusPath = `${path}?packageId=${encodeURIComponent(packageId)}`;
  const running = !!job && activeStatuses.has(job.status);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstLoad = true;

    async function refresh() {
      if (firstLoad && !cancelled) setLoading(true);
      try {
        const result = await api<{ enabled: boolean; job: Job | null }>(statusPath, token);
        if (cancelled) return;
        setEnabled(result.enabled);
        setJob(result.job);
        setLoadError("");
        if (result.job && activeStatuses.has(result.job.status)) timer = setTimeout(refresh, 3000);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Yayın durumu alınamadı.");
          timer = setTimeout(refresh, 10000);
        }
      } finally {
        firstLoad = false;
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [statusPath, token, refreshKey]);

  async function update() {
    if (!window.confirm(`${commitSha.slice(0, 12)} commit’inde değişen çalışan servisler belirlenecek ve yalnız bunların Docker imajları güncellenecek. Devam edilsin mi?`)) return;
    setBusy(true);
    setActionError("");
    try {
      const next = await api<Job>(path, token, { method: "POST", body: JSON.stringify({ packageId, confirmation: true }) });
      setJob(next);
      setRefreshKey(value => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Güncelleme başlatılamadı.");
    } finally {
      setBusy(false);
    }
  }

  const status = job?.status ?? "";
  // Keep the last completed job's status separate from a newer request error.
  // A failed attempt to start another update must not repaint an earlier
  // successful deployment as failed.
  const tone: JobTone = status === "Failed" ? "error" : status === "Succeeded" ? "success" : status === "NoChanges" ? "info" : "running";
  const stage = status === "Succeeded" ? 3 : status === "Deploying" ? 2 : status === "Building" ? 1 : 0;
  const statusTitle: Record<string, string> = {
    Queued: "Yayın sırasına alındı",
    Building: "Değişen projeler derleniyor",
    Deploying: "Yeni imajlar devreye alınıyor",
    Succeeded: "Yayın tamamlandı",
    NoChanges: "Uygulamalar zaten güncel",
    Failed: "Yayın tamamlanamadı",
  };
  const statusDescription: Record<string, string> = {
    Queued: "İşlem başladığında durum burada güncellenecek.",
    Building: "Yalnız değişen ve çalışan servislerin imajları hazırlanıyor.",
    Deploying: "Güncellenen servisler sağlık kontrolünden geçiriliyor.",
    Succeeded: "Yeni imajlar çalışıyor ve sağlık kontrolü başarılı.",
    NoChanges: "Bu committe çalışan uygulamalarda yeni imaj gerektiren bir değişiklik yok.",
    Failed: "Ayrıntıları açarak hata çıktısını ve varsa geri alma sonucunu görebilirsin.",
  };

  return <section className={`release-publish-card tone-${tone}`} aria-busy={busy || running || loading}>
    <header className="release-publish-header">
      <span className="release-publish-icon" aria-hidden="true"><CloudUpload size={21} /></span>
      <div className="release-publish-copy">
        <span className="release-publish-eyebrow">DOCKER YAYINI</span>
        <h3>Değişen uygulamaları yayınla</h3>
        <p>Commit farkı incelenir; yalnız değişen ve çalışan projeler güncellenir.</p>
      </div>
      <button className="release-publish-refresh" type="button" title="Durumu yenile" aria-label="Durumu yenile" disabled={loading || running} onClick={() => setRefreshKey(value => value + 1)}>
        {loading ? <Loader2 size={16} className="release-spin" /> : <RefreshCw size={16} />}
      </button>
    </header>

    <div className="release-publish-meta">
      <span><span className="release-publish-dot" /> Sürüm paketi hazır</span>
      <code title={commitSha}>{commitSha.slice(0, 12)}</code>
    </div>

    {enabled === false && <div className="release-publish-notice" role="status"><Info size={17} /><span><b>Yayın bu proje için etkin değil</b><small>Sunucu yöneticisinin uygulama yayını ayarını açması gerekiyor.</small></span></div>}
    {enabled === null && loading && <div className="release-publish-loading"><Loader2 size={16} className="release-spin" /> Sunucu durumu alınıyor…</div>}
    {loadError && <div className="release-publish-notice is-error" role="alert"><AlertCircle size={17} /><span><b>Sunucuya ulaşılamadı</b><small>{loadError}</small></span><button type="button" onClick={() => setRefreshKey(value => value + 1)}>Yeniden dene</button></div>}
    {actionError && <div className="release-publish-notice is-error" role="alert"><AlertCircle size={17} /><span><b>Son güncelleme isteği başlatılamadı</b><small>{actionError}{status === "Succeeded" ? " Aşağıdaki yeşil durum, önceki başarılı yayını gösteriyor." : ""}</small></span></div>}

    <button className="release-publish-action" type="button" disabled={enabled !== true || loading || busy || running} onClick={() => void update()}>
      {busy || running ? <Loader2 size={17} className="release-spin" /> : <CloudUpload size={17} />}
      <span>{busy || running ? "Yayın hazırlanıyor…" : status === "Failed" ? "Yeniden dene" : status === "Succeeded" ? "Yeni sürümü yayınla" : status === "NoChanges" ? "Yeniden kontrol et" : "Değişen projeleri güncelle"}</span>
      {!busy && !running && <span className="release-publish-action-arrow" aria-hidden="true">→</span>}
    </button>

    {job && <div className={`release-publish-result is-${tone}`} role="status" aria-live="polite">
      <div className="release-result-heading">
        <span className="release-result-symbol" aria-hidden="true">
          {tone === "success" ? <CheckCircle2 size={19} /> : tone === "info" ? <Info size={19} /> : tone === "error" ? <AlertCircle size={19} /> : <Loader2 size={19} className="release-spin" />}
        </span>
        <div><b>{statusTitle[status] ?? status}</b><small>{statusDescription[status] ?? "Yayın durumu sunucudan alındı."}</small></div>
      </div>

      {(activeStatuses.has(status) || status === "Succeeded") && <ol className="release-publish-steps" aria-label="Yayın aşamaları">
        {steps.map((label, index) => {
          const complete = status === "Succeeded" || index < stage;
          const current = status !== "Succeeded" && index === stage;
          return <li key={label} className={complete ? "is-complete" : current ? "is-current" : ""}>
            <span>{complete ? <Check size={13} /> : current ? <Loader2 size={13} className="release-spin" /> : <Circle size={13} />}</span>{label}
          </li>;
        })}
      </ol>}

      {(job.output || status === "Failed") && <details className="release-publish-log" open={status === "Failed"}>
        <summary>{status === "Failed" ? "Hata ve geri alma ayrıntıları" : "Teknik çıktıyı göster"}</summary>
        <pre>{job.output || "Sunucu ayrıntılı çıktı döndürmedi."}</pre>
      </details>}
    </div>}
  </section>;
}
