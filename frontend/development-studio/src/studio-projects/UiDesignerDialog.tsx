// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, ShieldCheck } from "lucide-react";
import { UiDesignPlanPreview } from "../UIDesigner";
import type { DevelopmentProject, UiDesignPreview, WorkspaceRequest } from "./types";

export type UiDesignerDialogProps = {
  applyUiDesign: () => Promise<void>;
  createUiDesign: (e: FormEvent) => Promise<void>;
  error: string;
  setUiDesignApplyApproval: Dispatch<SetStateAction<boolean>>;
  setUiDesignConsent: Dispatch<SetStateAction<boolean>>;
  setUiDesignPath: Dispatch<SetStateAction<string>>;
  setUiDesignRequest: Dispatch<SetStateAction<string>>;
  setUiDesignResult: Dispatch<SetStateAction<UiDesignPreview | null>>;
  setUiDesignerWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  uiDesignApplied: boolean;
  uiDesignApplyApproval: boolean;
  uiDesignConsent: boolean;
  uiDesignLoading: boolean;
  uiDesignPath: string;
  uiDesignRequest: string;
  uiDesignResult: UiDesignPreview | null;
  uiDesignerWorkspace: WorkspaceRequest;
  workspaceProject: DevelopmentProject;
};

export function UiDesignerDialog({
  applyUiDesign,
  createUiDesign,
  error,
  setUiDesignApplyApproval,
  setUiDesignConsent,
  setUiDesignPath,
  setUiDesignRequest,
  setUiDesignResult,
  setUiDesignerWorkspace,
  uiDesignApplied,
  uiDesignApplyApproval,
  uiDesignConsent,
  uiDesignLoading,
  uiDesignPath,
  uiDesignRequest,
  uiDesignResult,
  uiDesignerWorkspace,
  workspaceProject,
}: UiDesignerDialogProps) {
  return (
    <Dialog
  onClose={() => { setUiDesignerWorkspace(null); }}
  dismissible={!uiDesignLoading}
  className="studio-ui-designer-modal"
  backdropClassName="studio-ui-designer-backdrop"
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              AI ARAYÜZ TASARIMCISI · DUYARLI EKRAN TASLAĞI
            </p>
            <h2>
              {workspaceProject.name} / {uiDesignerWorkspace.branchName}
            </h2>
          </div>
          <button
            className="icon-button"
            disabled={uiDesignLoading}
            onClick={() => setUiDesignerWorkspace(null)}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          İsteğinizden erişilebilir, responsive bir ERP ekran taslağı
          üretin. Önizlemeyi inceleyip onayladığınızda .tsx bileşeni yeni
          dosya olarak izole çalışma alanına eklenir.
        </p>
        {error && <div className="alert">{error}</div>}
        <form onSubmit={createUiDesign} className="ui-designer-form">
          <label>
            Ekran dosyası yolu
            <input
              value={uiDesignPath}
              onChange={(e) => setUiDesignPath(e.target.value)}
              required
              maxLength={500}
              placeholder="src/screens/CustomerOverview.tsx"
              pattern=".*\.tsx"
              title="Yeni bir .tsx bileşen dosyası kullanın"
            />
          </label>
          <label>
            Ekran ihtiyacı
            <textarea
              value={uiDesignRequest}
              onChange={(e) => setUiDesignRequest(e.target.value)}
              required
              maxLength={2000}
              rows={3}
              placeholder="Örn. cari listesi, filtreler, risk kartı ve yeni cari eylemi olan responsive ekran"
            />
          </label>
          <label className="ui-designer-consent">
            <input
              type="checkbox"
              checked={uiDesignConsent}
              onChange={(e) => setUiDesignConsent(e.target.checked)}
              required
            />
            <span>
              Bu tasarım isteğinin, proje/dal adının ve yeni dosya yolunun
              OpenAI’ye gönderilmesini onaylıyorum. Kaynak kodu ve ERP
              verisi paylaşılmaz.
            </span>
          </label>
          <div className="modal-foot">
            <span>
              Yalnız statik ekran taslağı; veri bağlama ve buton
              davranışları üretilmez.
            </span>
            <button
              className="ns-btn ns-btn-primary"
              disabled={
                uiDesignLoading ||
                !uiDesignConsent ||
                !uiDesignRequest.trim() ||
                !uiDesignPath.trim()
              }
            >
              {uiDesignLoading
                ? "Tasarım hazırlanıyor…"
                : "AI ile ekran tasarla"}
            </button>
          </div>
        </form>
        {uiDesignResult && (
          <div className="ui-designer-result">
            <div className="ui-designer-result-heading">
              <div>
                <p className="eyebrow">ÖNİZLEME · UYGULANMADI</p>
                <h3>{uiDesignResult.summary}</h3>
                <small>
                  {uiDesignResult.filePath} ·{" "}
                  {uiDesignResult.proposedContent.length.toLocaleString(
                    "tr-TR",
                  )}{" "}
                  karakter
                </small>
              </div>
              <button
                className="ns-btn ns-btn-sm small-button"
                disabled={uiDesignLoading || uiDesignApplied}
                onClick={() => {
                  setUiDesignResult(null);
                  setUiDesignConsent(false);
                  setUiDesignApplyApproval(false);
                }}
              >
                İsteği düzenle
              </button>
            </div>
            <UiDesignPlanPreview plan={uiDesignResult.plan} />
            <details className="ui-generated-source">
              <summary>Üretilecek React/TSX kodunu incele</summary>
              <pre>
                <code>{uiDesignResult.proposedContent}</code>
              </pre>
            </details>
            <label className="ui-designer-apply-consent">
              <input
                type="checkbox"
                checked={uiDesignApplyApproval}
                disabled={uiDesignLoading || uiDesignApplied}
                onChange={(e) => setUiDesignApplyApproval(e.target.checked)}
              />
              <span>
                Önizlemeyi ve kodu inceledim. Bu yeni dosyayı onayla
                çalışma alanına ekle.
              </span>
            </label>
            <div className="modal-foot">
              <span>
                {uiDesignApplied
                  ? "Dosya eklendi; kod çalıştırılmadı."
                  : "Dosya yazılmadan önce insan onayı gerekir."}
              </span>
              <button
                className="ns-btn ns-btn-primary"
                disabled={
                  uiDesignLoading ||
                  uiDesignApplied ||
                  !uiDesignApplyApproval
                }
                onClick={() => void applyUiDesign()}
              >
                {uiDesignLoading
                  ? "Uygulanıyor…"
                  : uiDesignApplied
                    ? "Dosya eklendi"
                    : "Onayla ve yeni dosyayı ekle"}
              </button>
            </div>
          </div>
        )}
        <div className="boundary-note">
          <ShieldCheck size={17} />
          <span>
            <b>Güvenli uygulama sınırı</b>AI yalnız görsel şema ve statik
            TSX taslağı üretir. API şemayı doğrular, kaynak kod göndermez;
            Runner dosya yolunu doğrular. Onayla yazılır, otomatik
            çalıştırma yapılmaz.
          </span>
        </div>
      </Dialog>
  );
}
