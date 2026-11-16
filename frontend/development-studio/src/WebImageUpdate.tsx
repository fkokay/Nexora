import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Circle, CloudUpload, Info, Loader2, RefreshCw } from "lucide-react";
import { api } from "./api";
import { confirmDialog } from "./ui/confirmDialog";
import "./studio-tools.css";

type Job = { id: string; packageId: string; status: string; commitSha: string; output: string };
type JobTone = "running" | "success" | "info" | "error";

const activeStatuses = new Set(["Queued", "Building", "Deploying"]);
const steps = ["Değişiklik analizi", "İmaj derleme", "Servisleri yenile", "Hazır"];
const calloutTone: Record<JobTone, string> = { running: "is-info", success: "is-success", info: "is-info", error: "is-danger" };

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
    if (
      !(await confirmDialog({
        title: "Değişen servislerin imajları güncellensin mi?",
        message: "Bu commit'te değişen çalışan servisler belirlenecek ve yalnız onların Docker imajları yeniden oluşturulacak.",
        details: [["Commit", commitSha.slice(0, 12)]],
        confirmLabel: "İmajları güncelle",
      }))
    )
      return;
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

  return <section className="ns-card wiu-card" aria-busy={busy || running || loading} aria-labelledby={`wiu-title-${packageId}`}>
    <header className="wiu-head">
      <span className="wiu-icon" aria-hidden="true"><CloudUpload size={18} /></span>
      <div className="wiu-copy">
        <span className="ns-eyebrow">Docker yayını</span>
        <h3 id={`wiu-title-${packageId}`}>Değişen uygulamaları yayınla</h3>
        <p>Commit farkı incelenir; yalnız değişen ve çalışan projeler güncellenir.</p>
      </div>
      <button className="ns-btn ns-btn-sm ns-btn-ghost wiu-refresh" type="button" title="Durumu yenile" aria-label="Durumu yenile" disabled={loading || running} onClick={() => setRefreshKey(value => value + 1)}>
        {loading ? <Loader2 size={16} className="wiu-spin" /> : <RefreshCw size={16} />}
      </button>
    </header>

    <div className="wiu-meta">
      <span className="ns-badge is-success">Sürüm paketi hazır</span>
      <code className="ns-mono" title={commitSha}>{commitSha.slice(0, 12)}</code>
    </div>

    {enabled === false && <div className="ns-callout is-warning" role="status"><Info size={16} /><span><b>Yayın bu proje için etkin değil</b>Sunucu yöneticisinin uygulama yayını ayarını açması gerekiyor.</span></div>}
    {enabled === null && loading && <div className="wiu-loading"><Loader2 size={16} className="wiu-spin" /> Sunucu durumu alınıyor…</div>}
    {loadError && <div className="ns-callout is-danger" role="alert"><AlertCircle size={16} /><span><b>Sunucuya ulaşılamadı</b>{loadError}</span><button type="button" className="ns-btn ns-btn-sm" onClick={() => setRefreshKey(value => value + 1)}>Yeniden dene</button></div>}
    {actionError && <div className="ns-callout is-danger" role="alert"><AlertCircle size={16} /><span><b>Son güncelleme isteği başlatılamadı</b>{actionError}{status === "Succeeded" ? " Aşağıdaki yeşil durum, önceki başarılı yayını gösteriyor." : ""}</span></div>}

    {job && <div className={`ns-callout wiu-result ${calloutTone[tone]}`} role="status" aria-live="polite">
      {tone === "success" ? <CheckCircle2 size={18} /> : tone === "info" ? <Info size={18} /> : tone === "error" ? <AlertCircle size={18} /> : <Loader2 size={18} className="wiu-spin" />}
      <div className="wiu-result-body">
        <span><b>{statusTitle[status] ?? status}</b>{statusDescription[status] ?? "Yayın durumu sunucudan alındı."}</span>

        {(activeStatuses.has(status) || status === "Succeeded") && <ol className="wiu-steps" aria-label="Yayın aşamaları">
          {steps.map((label, index) => {
            const complete = status === "Succeeded" || index < stage;
            const current = status !== "Succeeded" && index === stage;
            return <li key={label} className={complete ? "is-complete" : current ? "is-current" : ""}>
              <span aria-hidden="true">{complete ? <Check size={12} /> : current ? <Loader2 size={12} className="wiu-spin" /> : <Circle size={12} />}</span>{label}
            </li>;
          })}
        </ol>}

        {(job.output || status === "Failed") && <details className="wiu-log" open={status === "Failed"}>
          <summary>{status === "Failed" ? "Hata ve geri alma ayrıntıları" : "Teknik çıktıyı göster"}</summary>
          <pre className="ns-code">{job.output || "Sunucu ayrıntılı çıktı döndürmedi."}</pre>
        </details>}
      </div>
    </div>}

    <div className="wiu-actions">
      <button className="ns-btn ns-btn-primary" type="button" disabled={enabled !== true || loading || busy || running} onClick={() => void update()}>
        {busy || running ? <Loader2 size={16} className="wiu-spin" /> : <CloudUpload size={16} />}
        <span>{busy || running ? "Yayın hazırlanıyor…" : status === "Failed" ? "Yeniden dene" : status === "Succeeded" ? "Yeni sürümü yayınla" : status === "NoChanges" ? "Yeniden kontrol et" : "Değişen projeleri güncelle"}</span>
      </button>
    </div>
  </section>;
}
