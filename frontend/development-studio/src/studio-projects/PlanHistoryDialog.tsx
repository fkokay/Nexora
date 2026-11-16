// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, Code2, Trash2 } from "lucide-react";
import type { SavedArchitecturePlan } from "./types";

export type PlanHistoryDialogProps = {
  architectLoading: boolean;
  deleteSavedArchitecturePlan: (saved: SavedArchitecturePlan) => Promise<void>;
  openSavedArchitecturePlan: (saved: SavedArchitecturePlan) => Promise<void>;
  savedArchitecturePlans: SavedArchitecturePlan[];
  setShowPlanHistory: Dispatch<SetStateAction<boolean>>;
};

export function PlanHistoryDialog({
  architectLoading,
  deleteSavedArchitecturePlan,
  openSavedArchitecturePlan,
  savedArchitecturePlans,
  setShowPlanHistory,
}: PlanHistoryDialogProps) {
  return (
    <Dialog
  onClose={() => { setShowPlanHistory(false); }}
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">AI MİMAR</p>
            <h2>Kaydedilen planlar</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => setShowPlanHistory(false)}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          Bu projede açıkça kaydedilmiş mimari planlar. Her kayıt dal ve
          commit bilgisine bağlıdır.
        </p>
        {savedArchitecturePlans.length ? (
          savedArchitecturePlans.map((saved) => (
            <article className="request-row expanded" key={saved.id}>
              <div className="request-symbol">
                <Code2 size={17} />
              </div>
              <div className="request-info">
                <b>{saved.summary}</b>
                <small>
                  {saved.branchName} · {saved.commitSha.slice(0, 12)} ·{" "}
                  {new Date(saved.createdAt).toLocaleString("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </small>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="ns-btn ns-btn-sm small-button"
                  disabled={architectLoading}
                  onClick={() => void openSavedArchitecturePlan(saved)}
                >
                  Planı aç
                </button>
                {saved.canDelete && (
                  <button
                    className="ns-btn ns-btn-sm small-button"
                    disabled={architectLoading}
                    title="Planı sil"
                    aria-label="Planı sil"
                    onClick={() => void deleteSavedArchitecturePlan(saved)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Code2 size={22} />
            </div>
            <h3>Henüz kaydedilmiş plan yok</h3>
            <p>
              AI Mimar planını oluşturduktan sonra “Planı projeye
              kaydet” düğmesiyle geçmişe ekleyebilirsiniz.
            </p>
          </div>
        )}
        <div className="modal-foot">
          <span>Özgün talep metni bu kayıtlara eklenmez.</span>
          <button
            className="ns-btn"
            onClick={() => setShowPlanHistory(false)}
          >
            Kapat
          </button>
        </div>
      </Dialog>
  );
}
