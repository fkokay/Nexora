import { useState, type FormEvent } from "react";
import { AlertCircle, Database, FileCode2, ShieldCheck, X } from "lucide-react";
import { api } from "./api";
import { Dialog } from "./ui/Dialog";
import "./studio-tools.css";

type DatabaseEngineeringPlan = {
  summary: string;
  readOnlySqlQueries: { purpose: string; sql: string }[];
  migrationDesign: string[];
  indexRecommendations: string[];
  performanceAnalysis: string[];
  integrityChecks: string[];
  assumptions: string[];
  risks: string[];
};
type PlanResponse = {
  plan: DatabaseEngineeringPlan;
  sources: { path: string; sha256: string }[];
  executed: boolean;
};

export function DatabaseEngineer({
  token,
  projectId,
  projectName,
  requestId,
  workspaceName,
  disabled,
}: {
  token: string;
  projectId: string;
  projectName: string;
  requestId: string;
  workspaceName: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [request, setRequest] = useState(""),
    [pathsText, setPathsText] = useState(""),
    [consent, setConsent] = useState(false),
    [loading, setLoading] = useState(false),
    [result, setResult] = useState<PlanResponse | null>(null),
    [error, setError] = useState("");
  async function createPlan(event: FormEvent) {
    event.preventDefault();
    const paths = pathsText
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean);
    if (!consent || !request.trim() || paths.length === 0) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api<PlanResponse>(
          `/studio/projects/${projectId}/workspace-requests/${requestId}/database-engineering-plan`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              request: request.trim(),
              paths,
              aiSharingConfirmed: true,
            }),
          },
        ),
      );
      setConsent(false);
      // The submit button unmounts with the form; move focus to the result.
      requestAnimationFrame(() =>
        document.getElementById("database-engineer-result")?.focus(),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="secondary small-button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        <Database size={14} /> AI veritabanı mühendisi
      </button>
      {open && (
        <Dialog
          onClose={() => setOpen(false)}
          dismissible={!loading}
          labelledBy="database-engineer-title"
          describedBy="database-engineer-sub"
          className="ns-tool-dialog is-wide"
        >
          <header className="ns-dialog-head">
            <div>
              <span className="ns-eyebrow">AI ajanı · veritabanı mühendisi</span>
              <h2 id="database-engineer-title">
                {projectName} · {workspaceName}
              </h2>
            </div>
            <button
              type="button"
              className="ns-btn ns-btn-sm ns-btn-ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
          </header>
          <div className="ns-dialog-body">
            <p className="ns-dialog-sub" id="database-engineer-sub">
              Seçtiğiniz SQL, ORM, uygulama modeli veya API sözleşmelerine göre
              sorgu, migration, indeks, performans ve veri bütünlüğü önerileri
              hazırlar. OpenAPI, protobuf, GraphQL, WSDL/XSD, Thrift ve Avro
              dosyaları desteklenir. Öneriler çalıştırılmaz ve canlı
              veritabanına bağlanılmaz.
            </p>
            {error && (
              <div className="ns-callout is-danger" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {!result && (
              <form className="tools-form" onSubmit={createPlan}>
                <label className="ns-field">
                  <span className="ns-field-label">Veritabanı görevi</span>
                  <textarea
                    id="database-engineer-request"
                    value={request}
                    onChange={(event) => setRequest(event.target.value)}
                    required
                    maxLength={2000}
                    rows={3}
                    placeholder="Örn. Müşteri hareketleri için tenant güvenli ve sayfalı SQL Server sorgusu tasarla"
                  />
                </label>
                <label className="ns-field">
                  <span className="ns-field-label">İncelenecek dosya yolları</span>
                  <textarea
                    className="ns-mono"
                    value={pathsText}
                    onChange={(event) => setPathsText(event.target.value)}
                    required
                    rows={4}
                    placeholder={
                      "db/schema.sql\ncontracts/orders.proto\ncontracts/orders.wsdl"
                    }
                  />
                  <span className="ns-field-hint">
                    Her satıra bir dosya yazın. En fazla 10 dosya; SQL, Prisma,
                    protobuf, GraphQL, WSDL/XSD, Thrift ve Avro dosyaları kabul
                    edilir.
                  </span>
                </label>
                <label className="ns-check">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    required
                  />
                  <span>
                    Seçtiğim dosyaların içeriğinin güvenlik taramasından sonra
                    OpenAI’ye gönderilmesini onaylıyorum. SQL çalıştırılmaz,
                    migration uygulanmaz ve plan otomatik kaydedilmez.
                  </span>
                </label>
                <div className="tools-form-foot">
                  <span>
                    En çok 32 KiB/dosya, 128 KiB toplam. Sadece seçtiğiniz
                    dosyalar okunur.
                  </span>
                  <button
                    className="ns-btn ns-btn-primary"
                    disabled={loading || !consent}
                  >
                    {loading ? "Analiz ediliyor…" : "Veritabanı planı hazırla"}
                  </button>
                </div>
              </form>
            )}
            {result && (
              <>
                <div
                  className="ns-callout is-success"
                  role="status"
                  id="database-engineer-result"
                  tabIndex={-1}
                >
                  <Database size={16} />
                  <span>{result.plan.summary}</span>
                </div>
                <div className="ns-callout is-info">
                  <ShieldCheck size={16} />
                  <span>
                    <b>Çalıştırılmadı</b>SQL önerileri yalnızca SELECT
                    sorgularıdır. Migration taslakları açıklama niteliğindedir;
                    kodda veya veritabanında değişiklik yapılmadı.
                  </span>
                </div>
                <section
                  className="tools-section"
                  aria-labelledby="database-engineer-sources"
                >
                  <div className="ns-card-head">
                    <h3 id="database-engineer-sources">İncelenen dosyalar</h3>
                    <span className="ns-badge">
                      {result.sources.length} dosya
                    </span>
                  </div>
                  <ul className="tools-sources">
                    {result.sources.map((source) => (
                      <li key={source.path}>
                        <FileCode2 size={14} aria-hidden="true" />
                        <b className="ns-mono">{source.path}</b>
                        <small className="ns-mono">
                          SHA-256 · {source.sha256.slice(0, 16)}
                        </small>
                      </li>
                    ))}
                  </ul>
                </section>
                {result.plan.readOnlySqlQueries.length > 0 && (
                  <section
                    className="tools-section"
                    aria-labelledby="database-engineer-sql"
                  >
                    <div className="ns-card-head">
                      <h3 id="database-engineer-sql">
                        Salt okunur SQL Server sorguları
                      </h3>
                      <span className="ns-badge is-info">Çalıştırılmadı</span>
                    </div>
                    <div className="tools-queries">
                      {result.plan.readOnlySqlQueries.map((item, index) => (
                        <figure className="tools-query" key={index}>
                          <figcaption>{item.purpose}</figcaption>
                          <pre className="ns-code">
                            <code>{item.sql}</code>
                          </pre>
                        </figure>
                      ))}
                    </div>
                  </section>
                )}
                <div className="tools-plan-grid">
                  {(
                    [
                      ["Migration tasarımı", result.plan.migrationDesign],
                      ["İndeks önerileri", result.plan.indexRecommendations],
                      ["Performans analizi", result.plan.performanceAnalysis],
                      ["Veri bütünlüğü kontrolleri", result.plan.integrityChecks],
                      [
                        "Varsayımlar ve riskler",
                        [...result.plan.assumptions, ...result.plan.risks],
                      ],
                    ] as [string, string[]][]
                  ).map(
                    ([title, items]) =>
                      items.length > 0 && (
                        <section className="ns-card tools-plan-card" key={title}>
                          <h3>{title}</h3>
                          <ul>
                            {items.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      ),
                  )}
                </div>
              </>
            )}
          </div>
          {result && (
            <footer className="ns-dialog-foot tools-dialog-foot">
              <span>İnsan incelemesi ve bağımsız doğrulama gerekli.</span>
              <button
                type="button"
                className="ns-btn"
                onClick={() => {
                  setResult(null);
                  setRequest("");
                  setPathsText("");
                  // The button unmounts with the result; keep focus inside the dialog.
                  requestAnimationFrame(() =>
                    document.getElementById("database-engineer-request")?.focus(),
                  );
                }}
              >
                Yeni analiz
              </button>
            </footer>
          )}
        </Dialog>
      )}
    </>
  );
}
