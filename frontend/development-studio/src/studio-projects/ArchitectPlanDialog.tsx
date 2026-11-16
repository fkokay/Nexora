// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, ShieldCheck } from "lucide-react";
import type { ArchitecturePlan, DevelopmentProject, WorkspaceRequest } from "./types";

export type ArchitectPlanDialogProps = {
  architectConsent: boolean;
  architectLoading: boolean;
  architectPlan: ArchitecturePlan | null;
  architectRequest: string;
  architectSavedPlanId: string | null;
  createArchitecturePlan: (e: FormEvent) => Promise<void>;
  error: string;
  saveArchitecturePlan: () => Promise<void>;
  setArchitectConsent: Dispatch<SetStateAction<boolean>>;
  setArchitectPlan: Dispatch<SetStateAction<ArchitecturePlan | null>>;
  setArchitectRequest: Dispatch<SetStateAction<string>>;
  setArchitectSavedPlanId: Dispatch<SetStateAction<string | null>>;
  setArchitectWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  workspaceProject: DevelopmentProject | null;
};

export function ArchitectPlanDialog({
  architectConsent,
  architectLoading,
  architectPlan,
  architectRequest,
  architectSavedPlanId,
  createArchitecturePlan,
  error,
  saveArchitecturePlan,
  setArchitectConsent,
  setArchitectPlan,
  setArchitectRequest,
  setArchitectSavedPlanId,
  setArchitectWorkspace,
  workspaceProject,
}: ArchitectPlanDialogProps) {
  return (
    <Dialog
  onClose={() => { setArchitectWorkspace(null);
          setArchitectPlan(null); }}
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI MİMAR · TASLAK</p>
            <h2>{workspaceProject?.name}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              setArchitectWorkspace(null);
              setArchitectPlan(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          AI Mimar yalnız talebini ve proje haritası metadata’sını
          kullanarak incelenebilir bir plan hazırlar. Kaynak dosya içeriği
          gönderilmez; kod değiştirilmez.
        </p>
        {error && <div className="alert">{error}</div>}
        {!architectPlan && (
          <form onSubmit={createArchitecturePlan}>
            <label>
              İstenen geliştirme
              <textarea
                value={architectRequest}
                onChange={(e) => setArchitectRequest(e.target.value)}
                required
                maxLength={2000}
                rows={4}
                placeholder="Örn. Satış siparişlerine sevkiyat önceliği ekle"
              />
            </label>
            <label className="studio-test-plan-consent">
              <input
                type="checkbox"
                checked={architectConsent}
                onChange={(e) => setArchitectConsent(e.target.checked)}
                required
                style={{ width: 16, marginTop: 3 }}
              />
              <span>
                Talep metnimin ve proje adı, dal, dosya türü sayımları ile
                giriş dosyası yollarından oluşan haritanın OpenAI’ye
                gönderilmesini onaylıyorum. Kaynak kod gönderilmez.
              </span>
            </label>
            <div className="modal-foot">
              <span>
                AI çıktısı öneri taslağıdır; değişiklik uygulamaz.
              </span>
              <button
                className="ns-btn ns-btn-primary"
                disabled={architectLoading || !architectConsent}
              >
                {architectLoading
                  ? "Plan hazırlanıyor…"
                  : "Mimari plan hazırla"}{" "}
                <span>→</span>
              </button>
            </div>
          </form>
        )}
        {architectPlan && (
          <>
            <div className="notice">{architectPlan.summary}</div>
            <h3>Etkilenen alanlar</h3>
            <div className="requests-list">
              {architectPlan.affectedAreas.map((x, i) => (
                <article className="request-row" key={i}>
                  <div className="request-info">
                    <b>{x}</b>
                  </div>
                </article>
              ))}
            </div>
            <h3 style={{ marginTop: 16 }}>Uygulama adımları</h3>
            <div className="requests-list">
              {architectPlan.steps.map((step, i) => (
                <article className="request-row expanded" key={i}>
                  <div className="request-info">
                    <b>
                      {i + 1}. {step.title}
                    </b>
                    <small>{step.description}</small>
                    {step.files.length > 0 && (
                      <small>Dosyalar: {step.files.join(", ")}</small>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <h3 style={{ marginTop: 16 }}>Varsayımlar ve riskler</h3>
            <div className="requests-list">
              {[
                ...architectPlan.assumptions.map((x) => ({
                  kind: "Varsayım",
                  text: x,
                })),
                ...architectPlan.risks.map((x) => ({
                  kind: "Risk",
                  text: x,
                })),
              ].map((x, i) => (
                <article className="request-row" key={i}>
                  <div className="request-info">
                    <b>{x.kind}</b>
                    <small>{x.text}</small>
                  </div>
                </article>
              ))}
            </div>
            <div className="modal-foot">
              <span>
                {architectSavedPlanId
                  ? "Bu plan proje geçmişinde kayıtlı; otomatik uygulanmadı."
                  : "Planı kaydetmek özgün talep metnini saklamaz ve planı uygulamaz."}
              </span>
              <div>
                {!architectSavedPlanId && (
                  <button
                    className="ns-btn ns-btn-primary"
                    disabled={architectLoading}
                    onClick={() => void saveArchitecturePlan()}
                  >
                    {architectLoading
                      ? "Kaydediliyor…"
                      : "Planı projeye kaydet"}
                  </button>
                )}
                <button
                  className="ns-btn"
                  onClick={() => {
                    setArchitectPlan(null);
                    setArchitectSavedPlanId(null);
                    setArchitectConsent(false);
                  }}
                >
                  Yeni plan
                </button>
              </div>
            </div>
          </>
        )}
        <div className="boundary-note">
          <ShieldCheck size={17} />
          <span>
            <b>İnsan incelemesi gerekli</b>Plan yalnızca öneridir. Kod
            üretimi, test ve yayınlama bu aşamada kapalıdır.
          </span>
        </div>
      </Dialog>
  );
}
