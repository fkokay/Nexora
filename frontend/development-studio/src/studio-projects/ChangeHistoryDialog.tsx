// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, FileCode, ShieldCheck } from "lucide-react";
import { CodeSuggestionDiff } from "./CodeSuggestionDiff";
import type { DevelopmentProject, WorkspaceChange, WorkspaceChangeDiff, WorkspaceChanges, WorkspaceRequest } from "./types";

export type ChangeHistoryDialogProps = {
  changeDiff: WorkspaceChangeDiff | null;
  changeLoading: boolean;
  changeWorkspace: WorkspaceRequest;
  error: string;
  openWorkspaceChange: (change: WorkspaceChange) => Promise<void>;
  restoreApproval: boolean;
  restoreWorkspaceChange: () => Promise<void>;
  setChangeDiff: Dispatch<SetStateAction<WorkspaceChangeDiff | null>>;
  setChangeWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setRestoreApproval: Dispatch<SetStateAction<boolean>>;
  workspaceChanges: WorkspaceChanges | null;
  workspaceProject: DevelopmentProject | null;
};

export function ChangeHistoryDialog({
  changeDiff,
  changeLoading,
  changeWorkspace,
  error,
  openWorkspaceChange,
  restoreApproval,
  restoreWorkspaceChange,
  setChangeDiff,
  setChangeWorkspace,
  setRestoreApproval,
  workspaceChanges,
  workspaceProject,
}: ChangeHistoryDialogProps) {
  return (
    <Dialog
  onClose={() => { setChangeWorkspace(null);
          setChangeDiff(null); }}
  backdropClassName="studio-change-history-backdrop"
  style={{ maxWidth: 1000 }}
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">İZOLE ÇALIŞMA ALANI · DEĞİŞİKLİK GEÇMİŞİ</p>
            <h2>
              {workspaceProject?.name} / {changeWorkspace.branchName}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              setChangeWorkspace(null);
              setChangeDiff(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          Onaylanmış dosya önerileri checkout dışında saklanan önceki
          baytlarla izlenir. Geri alma kod çalıştırmaz ve yalnızca dosya
          aynı durumdaysa uygulanır.
        </p>
        {error && <div className="alert">{error}</div>}
        {changeLoading && (
          <div className="empty-small">Geçmiş yükleniyor…</div>
        )}
        {workspaceChanges?.truncated && (
          <div className="notice">
            En yeni 100 kayıt gösteriliyor; geçmiş listesi sınırlandırıldı.
          </div>
        )}
        {workspaceChanges &&
          workspaceChanges.changes.length === 0 &&
          !changeLoading && (
            <div className="empty-small">
              Bu çalışma alanında henüz onaylı dosya değişikliği yok.
            </div>
          )}
        {workspaceChanges?.changes.map((change) => (
          <article className="request-row expanded" key={change.id}>
            <div className="request-symbol">
              <FileCode size={17} />
            </div>
            <div className="request-info">
              <b>{change.path}</b>
              {change.wasCreated && <small>Yeni dosya</small>}
              <small>
                {new Date(change.appliedAt).toLocaleString("tr-TR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                ·{" "}
                {change.isRestored
                  ? "Geri alındı"
                  : change.isCurrent
                    ? "Geçerli dosya sürümü"
                    : "Daha yeni bir değişiklik var"}
              </small>
            </div>
            <button
              className="ns-btn ns-btn-sm small-button"
              disabled={changeLoading}
              onClick={() => void openWorkspaceChange(change)}
            >
              Diff’i aç
            </button>
          </article>
        ))}
        {changeDiff && (
          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-heading">
              <div>
                <b>{changeDiff.path}</b>
                {changeDiff.wasCreated && <small>Yeni dosya</small>}
                <small>
                  {changeDiff.isRestored
                    ? "Bu kayıt geri alınmış"
                    : changeDiff.isCurrent
                      ? "Dosya bu değişikliğin sürümünde"
                      : "Dosyada daha yeni bir sürüm var"}
                </small>
              </div>
            </div>
            <CodeSuggestionDiff
              original={changeDiff.originalContent}
              proposed={changeDiff.currentContent}
            />
            {changeDiff.isCurrent && !changeDiff.isRestored && (
              <>
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
                    checked={restoreApproval}
                    onChange={(e) => setRestoreApproval(e.target.checked)}
                    style={{ width: 18, marginTop: 3 }}
                  />
                  <span>
                    <b>
                      {changeDiff.wasCreated
                        ? "Oluşturulan dosyayı kaldır"
                        : "Önceki içeriği geri koy"}
                    </b>{" "}
                    {changeDiff.wasCreated
                      ? "Bu onay, AI önerisiyle oluşturulan dosyanın silinmesini sağlar."
                      : "Bu kayıttan hemen önceki dosya baytlarının geri yüklenmesini onaylıyorum."}
                  </span>
                </label>
                <div className="modal-foot">
                  <span>Dosya özeti eşleşmezse geri alma reddedilir.</span>
                  <button
                    className="secondary danger-action"
                    disabled={changeLoading || !restoreApproval}
                    onClick={() => void restoreWorkspaceChange()}
                  >
                    {changeLoading ? "Geri alınıyor…" : "Onayla ve geri al"}
                  </button>
                </div>
              </>
            )}
            {!changeDiff.isCurrent && !changeDiff.isRestored && (
              <div className="boundary-note">
                <ShieldCheck size={17} />
                <span>
                  <b>Eski kayıt</b>Dosyada daha yeni bir sürüm bulundu. Bu
                  kayıt üzerine yazmayacak; güncel değişikliği açın.
                </span>
              </div>
            )}
          </section>
        )}
        <div className="modal-foot">
          <span>
            {workspaceChanges?.changes.length ?? 0} kayıt · geçmiş en fazla
            200 uygulamayı tutar.
          </span>
          <button
            className="ns-btn"
            onClick={() => {
              setChangeWorkspace(null);
              setChangeDiff(null);
            }}
          >
            Kapat
          </button>
        </div>
      </Dialog>
  );
}
