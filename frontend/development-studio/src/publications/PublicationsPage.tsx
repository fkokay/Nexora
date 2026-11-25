import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Upload } from "lucide-react";
import { authorizedFetch } from "../api";
import { SectionTabs } from "../shell/SectionTabs";
import { confirmDialog } from "../ui/confirmDialog";
import {
  historyRows,
  loadModuleDeployments,
  pendingRows,
  publishErrorMessage,
  PUBLICATIONS_TAKE,
  restoreErrorMessage,
  type ModuleDeployment,
  type PublicationRow,
  type Publications,
} from "./publicationsModel";

type Props = {
  token: string;
  /** Kişinin Yazılımcı ya da Yönetici rolü varsa modül sürümleri de geçmişte gösterilir. */
  includeModules: boolean;
};

type Tab = "pending" | "history";

const statusTone: Record<PublicationRow["status"], string> = {
  Taslak: "is-warning",
  Yayında: "is-success",
  "Önceki sürüm": "",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );

async function readError(response: Response): Promise<{ error?: string } | undefined> {
  return ((await response.json().catch(() => undefined)) as { error?: string } | undefined) ?? undefined;
}

/** Yayınlar: taslakta bekleyen ekranlar ve geçmiş yayınlar; önceki sürüme dönüş yeni bir taslak oluşturur. */
export function PublicationsPage({ token, includeModules }: Props) {
  const [tab, setTab] = useState<Tab>("pending");
  const [data, setData] = useState<Publications | null>(null);
  const [loadError, setLoadError] = useState("");
  const [deployments, setDeployments] = useState<ModuleDeployment[] | undefined>(undefined);
  const [deploymentsFailed, setDeploymentsFailed] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await authorizedFetch(`/api/custom-pages/publications?take=${PUBLICATIONS_TAKE}`, token);
      if (response.status === 403) throw new Error("Ekran yayınlarını görme yetkiniz yok.");
      if (!response.ok) throw new Error(publishErrorMessage(response.status, await readError(response)));
      setData((await response.json()) as Publications);
    } catch (cause) {
      setLoadError((cause as Error).message || "Yayınlar yüklenemedi.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!includeModules) {
      setDeployments(undefined);
      return;
    }
    let current = true;
    loadModuleDeployments(token)
      .then((result) => {
        if (!current) return;
        setDeployments(result.deployments);
        setDeploymentsFailed(result.failed);
      })
      .catch(() => {
        if (current) setDeploymentsFailed(true);
      });
    return () => {
      current = false;
    };
  }, [token, includeModules]);

  async function publish(row: PublicationRow) {
    const pageId = data?.pending.find((item) => `page:${item.pageId}` === row.key)?.pageId;
    if (!pageId) return;
    const ok = await confirmDialog({
      title: "Ekran yayınlansın mı?",
      message: `"${row.title}" taslağı ERP'de kullanıcıların gördüğü sürüm olur. Gerekirse Geçmiş sekmesinden önceki sürüme dönebilirsiniz.`,
      confirmLabel: "Yayınla",
    });
    if (!ok) return;
    setBusyKey(row.key);
    setError("");
    setNotice("");
    try {
      // Yayınlama taslağın güncel sürüm numarasını ister; liste bunu taşımadığı için önce okunur.
      const detail = await authorizedFetch(`/api/custom-pages/${pageId}`, token);
      if (!detail.ok) throw new Error(publishErrorMessage(detail.status, await readError(detail)));
      const { revision } = (await detail.json()) as { revision: number };
      const response = await authorizedFetch(`/api/custom-pages/${pageId}/publish`, token, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: revision }),
      });
      if (!response.ok) throw new Error(publishErrorMessage(response.status, await readError(response)));
      setNotice(`"${row.title}" yayınlandı.`);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyKey("");
    }
  }

  async function restore(row: PublicationRow) {
    const source = data?.history.find((item) => `rev:${item.revisionId}` === row.key);
    if (!source) return;
    setBusyKey(row.key);
    setError("");
    setNotice("");
    try {
      const response = await authorizedFetch(`/api/custom-pages/${source.pageId}/restore/${source.revisionId}`, token, { method: "POST" });
      if (!response.ok) throw new Error(restoreErrorMessage(response.status, await readError(response)));
      setNotice("Taslak oluşturuldu. Yayınlamak için Bekleyen sekmesine geçin.");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyKey("");
    }
  }

  const pending = data ? pendingRows(data) : [];
  const history = data ? historyRows(data, deployments) : [];
  const capped = (count: number) => (count >= PUBLICATIONS_TAKE ? `${PUBLICATIONS_TAKE}+` : String(count));
  const rows = tab === "pending" ? pending : history;

  return (
    <>
      <header className="ns-page-head st-page-head">
        <div>
          <h1>Yayınlar</h1>
          <p>Taslaktan canlıya giden ekranlar ve önceki sürüme dönüş</p>
        </div>
        <button className="ns-btn" type="button" onClick={() => void load()} disabled={!!busyKey}>
          <RefreshCw size={15} aria-hidden="true" />
          Yenile
        </button>
      </header>
      {error && (
        <div className="st-alert is-danger" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="st-alert is-success" role="status">
          {notice}
        </div>
      )}
      <SectionTabs
        tabs={[
          { id: "pending", label: data ? `Bekleyen (${capped(data.pending.length)})` : "Bekleyen" },
          { id: "history", label: "Geçmiş" },
        ]}
        active={tab}
        onSelect={(id) => setTab(id as Tab)}
      />
      <section className="ns-card st-card" aria-label={tab === "pending" ? "Bekleyen yayınlar" : "Yayın geçmişi"}>
        {loadError ? (
          <div className="st-alert is-danger" role="alert">
            {loadError}
          </div>
        ) : !data ? (
          <div className="st-loading" role="status">
            Yayınlar yükleniyor…
          </div>
        ) : rows.length === 0 ? (
          <p className="st-card-note">
            {tab === "pending" ? "Yayınlanmayı bekleyen taslak yok." : "Henüz yayınlanmış bir ekran yok."}
          </p>
        ) : (
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Ad</th>
                  <th scope="col">Tür</th>
                  <th scope="col">Kim</th>
                  <th scope="col">Tarih</th>
                  <th scope="col">Durum</th>
                  <th scope="col">
                    <span className="ns-sr-only">İşlem</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <b>{row.title}</b>
                    </td>
                    <td>{row.kind}</td>
                    <td>{row.by ?? "—"}</td>
                    <td className="st-num">{formatDate(row.at)}</td>
                    <td>
                      <span className={`ns-badge ${statusTone[row.status]}`.trim()}>{row.status}</span>
                    </td>
                    <td>
                      {row.action === "publish" && (
                        <button className="ns-btn ns-btn-primary ns-btn-sm" type="button" disabled={!!busyKey} onClick={() => void publish(row)}>
                          <Upload size={14} aria-hidden="true" />
                          {busyKey === row.key ? "Yayınlanıyor…" : "Yayınla"}
                        </button>
                      )}
                      {row.action === "restore" && (
                        <button className="ns-btn ns-btn-sm" type="button" disabled={!!busyKey} onClick={() => void restore(row)}>
                          <RotateCcw size={14} aria-hidden="true" />
                          {busyKey === row.key ? "Hazırlanıyor…" : "Önceki sürüme dön"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "history" && data && (
          <p className="st-card-note">
            {data.history.length >= PUBLICATIONS_TAKE && `En yeni ${PUBLICATIONS_TAKE} ekran yayını gösteriliyor. `}
            {includeModules &&
              (deploymentsFailed
                ? "Modül sürümlerinin bir kısmı yüklenemedi. "
                : "Modül sürümünü geri almak için Firma modülü ekranındaki dağıtım geçmişini kullanın. ")}
            Önceki sürüme dönmek yeni bir taslak oluşturur; yayınlayana kadar ERP değişmez.
          </p>
        )}
      </section>
    </>
  );
}
