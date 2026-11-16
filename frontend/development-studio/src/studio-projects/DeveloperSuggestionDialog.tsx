// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, ShieldCheck } from "lucide-react";
import { CodeSuggestionDiff } from "./CodeSuggestionDiff";
import type { CodeSuggestionPreview, WorkspaceFileContent, WorkspaceRequest } from "./types";

export type DeveloperSuggestionDialogProps = {
  applyCodeSuggestion: () => Promise<void>;
  createCodeSuggestion: (e: FormEvent) => Promise<void>;
  developerApplied: boolean;
  developerApplyApproval: boolean;
  developerConsent: boolean;
  developerFile: WorkspaceFileContent;
  developerIsNewFile: boolean;
  developerLoading: boolean;
  developerNewPath: string;
  developerRequest: string;
  developerSuggestion: CodeSuggestionPreview | null;
  error: string;
  setDeveloperApplyApproval: Dispatch<SetStateAction<boolean>>;
  setDeveloperConsent: Dispatch<SetStateAction<boolean>>;
  setDeveloperFile: Dispatch<SetStateAction<WorkspaceFileContent | null>>;
  setDeveloperNewPath: Dispatch<SetStateAction<string>>;
  setDeveloperRequest: Dispatch<SetStateAction<string>>;
  setDeveloperSuggestion: Dispatch<SetStateAction<CodeSuggestionPreview | null>>;
  setDeveloperWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
};

export function DeveloperSuggestionDialog({
  applyCodeSuggestion,
  createCodeSuggestion,
  developerApplied,
  developerApplyApproval,
  developerConsent,
  developerFile,
  developerIsNewFile,
  developerLoading,
  developerNewPath,
  developerRequest,
  developerSuggestion,
  error,
  setDeveloperApplyApproval,
  setDeveloperConsent,
  setDeveloperFile,
  setDeveloperNewPath,
  setDeveloperRequest,
  setDeveloperSuggestion,
  setDeveloperWorkspace,
}: DeveloperSuggestionDialogProps) {
  return (
    <Dialog
  onClose={() => { setDeveloperWorkspace(null);
          setDeveloperFile(null);
          setDeveloperSuggestion(null); }}
  style={{ maxWidth: 1000 }}
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI GELİŞTİRİCİ · İNCELEME TASLAĞI</p>
            <h2>{developerFile.path}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              setDeveloperWorkspace(null);
              setDeveloperFile(null);
              setDeveloperSuggestion(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          AI yalnızca seçtiğiniz bu dosyayı ve talebinizi alır. Öneri diff
          olarak gösterilir; çalışma alanına yazılmaz ve kod çalıştırılmaz.
        </p>
        {error && <div className="alert">{error}</div>}
        <form onSubmit={createCodeSuggestion}>
          {developerIsNewFile && (
            <label>
              Yeni kaynak dosya yolu
              <input
                value={developerNewPath}
                onChange={(e) => setDeveloperNewPath(e.target.value)}
                required
                maxLength={500}
              />
            </label>
          )}
          <label>
            İstenen değişiklik
            <textarea
              value={developerRequest}
              onChange={(e) => setDeveloperRequest(e.target.value)}
              required
              maxLength={2000}
              rows={3}
              placeholder="Örn. doğrulama mesajını Türkçeleştir"
            />
          </label>
          <label
            style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
          >
            <input
              type="checkbox"
              checked={developerConsent}
              onChange={(e) => setDeveloperConsent(e.target.checked)}
              required
              style={{ width: 18, marginTop: 3 }}
            />
            <span>
              {developerIsNewFile
                ? `Bu yeni dosya yolu ve talebim OpenAI API’ye gönderilecek: ${developerNewPath}. Mevcut kaynak içeriği paylaşılmıyor.`
                : `Bu dosyanın kaynak içeriğinin (${developerFile.path}, en fazla 32 KiB) talebimle birlikte OpenAI API’ye gönderilmesini onaylıyorum.`}
            </span>
          </label>
          <div className="modal-foot">
            <span>
              Kaynak paylaşımı kayıt altına alınır; dosya değişmez.
            </span>
            <button
              className="ns-btn ns-btn-primary"
              disabled={developerLoading || !developerConsent}
            >
              {developerLoading
                ? "Öneri hazırlanıyor…"
                : "Kod önerisi oluştur"}
            </button>
          </div>
        </form>
        {developerSuggestion && (
          <>
            <div className="section-title">
              <div>
                <h3>{developerSuggestion.summary}</h3>
                <p>{developerSuggestion.filePath} · yalnızca öneri</p>
              </div>
            </div>
            <CodeSuggestionDiff
              original={developerSuggestion.originalContent}
              proposed={developerSuggestion.proposedContent}
            />
            {developerSuggestion.notes.length > 0 && (
              <div className="boundary-note">
                <ShieldCheck size={17} />
                <span>
                  <b>İnceleme notları</b>
                  {developerSuggestion.notes.join(" · ")}
                </span>
              </div>
            )}
            {!developerApplied && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginTop: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={developerApplyApproval}
                  onChange={(e) =>
                    setDeveloperApplyApproval(e.target.checked)
                  }
                  style={{ width: 18, marginTop: 3 }}
                />
                <span>
                  <b>Öneriyi onayla</b> {developerSuggestion.filePath}{" "}
                  dosyasını bu izole checkout içinde önerilen içerikle
                  değiştirmeyi onaylıyorum. Mevcut dosyanın özeti eşleşmezse
                  değişiklik uygulanmaz.
                </span>
              </label>
            )}
            <div className="modal-foot">
              <span>
                {developerApplied
                  ? "Değişiklik uygulandı; build veya kod çalıştırma yapılmadı."
                  : "Uygulama ayrı onay gerektirir ve eski dosya özeti kontrol edilir."}
              </span>
              <button
                type="button"
                className="ns-btn ns-btn-primary"
                disabled={
                  developerLoading ||
                  developerApplied ||
                  !developerApplyApproval
                }
                onClick={() => void applyCodeSuggestion()}
              >
                {developerLoading
                  ? "Uygulanıyor…"
                  : developerApplied
                    ? "Çalışma alanına uygulandı"
                    : "Onayla ve dosyaya uygula"}
              </button>
            </div>
          </>
        )}
      </Dialog>
  );
}
