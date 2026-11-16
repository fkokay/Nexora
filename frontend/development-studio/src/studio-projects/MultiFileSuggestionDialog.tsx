// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, ShieldCheck } from "lucide-react";
import { CodeSuggestionDiff } from "./CodeSuggestionDiff";
import type { DevelopmentProject, MultiFileCodeSuggestionPreview, WorkspaceRequest } from "./types";

export type MultiFileSuggestionDialogProps = {
  applyMultiFileSuggestion: (change: MultiFileCodeSuggestionPreview["changes"][number]) => Promise<void>;
  createMultiFileSuggestion: (e: FormEvent) => Promise<void>;
  error: string;
  multiFileApplied: string[];
  multiFileConsent: boolean;
  multiFileLoading: boolean;
  multiFilePaths: string[];
  multiFileRequest: string;
  multiFileSuggestion: MultiFileCodeSuggestionPreview | null;
  repairMode: { operation: "test" | "build"; targetPath: string; } | null;
  repairPathsDraft: string;
  rerunAfterSandboxRepair: () => Promise<void>;
  setMultiDeveloperWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setMultiFileConsent: Dispatch<SetStateAction<boolean>>;
  setMultiFileRequest: Dispatch<SetStateAction<string>>;
  setMultiFileSuggestion: Dispatch<SetStateAction<MultiFileCodeSuggestionPreview | null>>;
  setRepairMode: Dispatch<SetStateAction<{ operation: "test" | "build"; targetPath: string; } | null>>;
  setRepairPathsDraft: Dispatch<SetStateAction<string>>;
  workspaceProject: DevelopmentProject | null;
};

export function MultiFileSuggestionDialog({
  applyMultiFileSuggestion,
  createMultiFileSuggestion,
  error,
  multiFileApplied,
  multiFileConsent,
  multiFileLoading,
  multiFilePaths,
  multiFileRequest,
  multiFileSuggestion,
  repairMode,
  repairPathsDraft,
  rerunAfterSandboxRepair,
  setMultiDeveloperWorkspace,
  setMultiFileConsent,
  setMultiFileRequest,
  setMultiFileSuggestion,
  setRepairMode,
  setRepairPathsDraft,
  workspaceProject,
}: MultiFileSuggestionDialogProps) {
  return (
    <Dialog
  onClose={() => { setMultiDeveloperWorkspace(null); }}
  dismissible={!multiFileLoading}
  style={{ maxWidth: 1100 }}
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI GELİŞTİRİCİ · ÇOKLU DOSYA TASLAĞI</p>
            <h2>{multiFilePaths.length} dosyada koordineli öneri</h2>
          </div>
          <button
            className="icon-button"
            disabled={multiFileLoading}
            onClick={() => setMultiDeveloperWorkspace(null)}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          Yalnız seçtiğiniz kaynak dosyaları ve talebiniz OpenAI’ye
          gönderilir. Öneriler dosya başına ayrı diff olarak incelenir;
          hiçbiri otomatik uygulanmaz.
        </p>
        {error && <div className="alert">{error}</div>}
        {!multiFileSuggestion && (
          <form onSubmit={createMultiFileSuggestion}>
            {repairMode && (
              <label>
                Onarılacak kaynak dosyaları
                <textarea
                  value={repairPathsDraft}
                  onChange={(e) => setRepairPathsDraft(e.target.value)}
                  required
                  maxLength={2500}
                  rows={3}
                  placeholder="src/Services/Example.cs`nsrc/Tests/ExampleTests.cs"
                />
                <small>
                  Hata çözümüyle ilgili dosyaların yollarını girin. 1–5
                  dosya; yalnızca bu seçili içerikler paylaşılır.
                </small>
              </label>
            )}
            <label>
              {repairMode
                ? "Hata analizi ve onarım talebi"
                : "İstenen geliştirme"}
              <textarea
                value={multiFileRequest}
                onChange={(e) => setMultiFileRequest(e.target.value)}
                required
                maxLength={2000}
                rows={4}
                placeholder="Örn. API yanıt sözleşmesini ve ona bağlı UI modelini birlikte güncelle"
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginTop: 12,
              }}
            >
              <input
                type="checkbox"
                checked={multiFileConsent}
                onChange={(e) => setMultiFileConsent(e.target.checked)}
                required
                style={{ width: 18, marginTop: 3 }}
              />
              <span>
                {repairMode
                  ? "Yukarıda belirttiğim 1–5 dosya ile hata analizi ve onarım talebimin OpenAI’ye gönderilmesini onaylıyorum."
                  : `Seçtiğim ${multiFilePaths.length} dosyanın içeriğinin (toplam en fazla 64 KiB) ve talebimin OpenAI’ye gönderilmesini onaylıyorum.`}
              </span>
            </label>
            <div className="modal-foot">
              <span>
                {repairMode
                  ? "En çok 5 dosya · diff incelemesi ve her dosya için ayrı uygulama onayı gerekir."
                  : "En fazla 5 dosya · toplam kaynak 64 KiB · otomatik uygulama kapalı"}
              </span>
              <button
                className="ns-btn ns-btn-primary"
                disabled={multiFileLoading || !multiFileConsent}
              >
                {multiFileLoading
                  ? "Öneri hazırlanıyor…"
                  : repairMode
                    ? "Onarım diff’i oluştur"
                    : "Koordineli öneri oluştur"}
              </button>
            </div>
          </form>
        )}
        {multiFileSuggestion && (
          <>
            <div className="notice">{multiFileSuggestion.summary}</div>
            {multiFileSuggestion.risks.length > 0 && (
              <div className="boundary-note">
                <ShieldCheck size={17} />
                <span>
                  <b>AI risk notları</b>
                  {multiFileSuggestion.risks.join(" · ")}
                </span>
              </div>
            )}
            {multiFileSuggestion.changes.map((change) => (
              <section
                className="panel"
                key={change.filePath}
                style={{ marginTop: 14 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>{change.filePath}</b>
                    <small>
                      Kaynak SHA-256: {change.sourceSha256.slice(0, 12)} ·
                      uygulama için ayrı onay gerekir
                    </small>
                  </div>
                  <button
                    className="ns-btn ns-btn-sm small-button"
                    disabled={
                      multiFileLoading ||
                      multiFileApplied.includes(change.filePath)
                    }
                    onClick={() => void applyMultiFileSuggestion(change)}
                  >
                    {multiFileApplied.includes(change.filePath)
                      ? "Uygulandı"
                      : "Bu dosyayı uygula"}
                  </button>
                </div>
                <CodeSuggestionDiff
                  original={change.originalContent}
                  proposed={change.proposedContent}
                />
                {change.notes.length > 0 && (
                  <small>{change.notes.join(" · ")}</small>
                )}
              </section>
            ))}
            <div className="modal-foot">
              <span>
                {multiFileApplied.length}/
                {multiFileSuggestion.changes.length} dosya uygulandı; her
                dosya ayrı onaylandı.
              </span>
              <div>
                {repairMode &&
                  multiFileApplied.length ===
                    multiFileSuggestion.changes.length &&
                  (workspaceProject?.accessLevel === "TenantAdmin" ||
                    workspaceProject?.accessLevel === "Maintainer") && (
                    <button
                      className="ns-btn ns-btn-primary"
                      disabled={multiFileLoading}
                      onClick={() => void rerunAfterSandboxRepair()}
                    >
                      {repairMode.operation === "test"
                        ? "Onaylı değişikliklerle testi yeniden çalıştır"
                        : "Onaylı değişikliklerle build’i yeniden çalıştır"}
                    </button>
                  )}
                {repairMode &&
                  multiFileApplied.length ===
                    multiFileSuggestion.changes.length &&
                  workspaceProject?.accessLevel !== "TenantAdmin" &&
                  workspaceProject?.accessLevel !== "Maintainer" && (
                    <small>
                      Değişiklikler uygulandı; sandbox testini yeniden
                      çalıştırmak için Maintainer veya TenantAdmin onayı
                      gerekir.
                    </small>
                  )}
                <button
                  className="ns-btn"
                  onClick={() => {
                    setMultiDeveloperWorkspace(null);
                    setMultiFileSuggestion(null);
                    setRepairMode(null);
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          </>
        )}
      </Dialog>
  );
}
