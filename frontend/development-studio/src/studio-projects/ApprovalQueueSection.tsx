// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, SetStateAction } from "react";
import { Code2 } from "lucide-react";
import type { PendingWorkspaceApproval } from "./types";

export type ApprovalQueueSectionProps = {
  approvalQueueLoading: boolean;
  busy: boolean;
  error: string;
  loadPendingApprovals: (offset?: number) => Promise<void>;
  pendingApprovals: PendingWorkspaceApproval[];
  pendingApprovalsNextOffset: number | null;
  pendingApprovalsOffset: number;
  reviewNote: string;
  reviewPendingApproval: (request: PendingWorkspaceApproval, outcome: "Approve" | "Reject") => Promise<void>;
  setReviewNote: Dispatch<SetStateAction<string>>;
};

export function ApprovalQueueSection({
  approvalQueueLoading,
  busy,
  error,
  loadPendingApprovals,
  pendingApprovals,
  pendingApprovalsNextOffset,
  pendingApprovalsOffset,
  reviewNote,
  reviewPendingApproval,
  setReviewNote,
}: ApprovalQueueSectionProps) {
  return (
    <section className="ns-card sp-queue" aria-labelledby="sp-queue-title">
      <header className="ns-card-head">
        <div>
          <h3 id="sp-queue-title">Onay kuyruğu</h3>
          <p className="sp-sub">
            Yetkili olduğunuz projelerde bekleyen çalışma alanı talepleri
          </p>
        </div>
        <span className="ns-badge is-warning">
          {pendingApprovals.length} bekliyor
        </span>
      </header>
      {error && <div className="alert">{error}</div>}
      <ul className="sp-queue-list">
        {pendingApprovals.map((request) => (
          <li className="sp-queue-item" key={request.id}>
            <span className="sp-avatar" aria-hidden="true">
              <Code2 size={16} />
            </span>
            <div className="sp-queue-info">
              <b>
                {request.projectName} · <code>{request.branchName}</code>
              </b>
              <small>
                {request.requesterEmail} ·{" "}
                {new Date(request.createdAt).toLocaleString("tr-TR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </small>
              {request.developmentRequestTitle && (
                <small>
                  Bağlı talep: <b>{request.developmentRequestTitle}</b>
                </small>
              )}
              {request.developmentRequestDescription && (
                <p>{request.developmentRequestDescription}</p>
              )}
            </div>
            <div className="sp-actions">
              <button
                className="ns-btn ns-btn-sm small-button"
                disabled={busy || !reviewNote.trim()}
                title={
                  reviewNote.trim()
                    ? undefined
                    : "Reddetmek için aşağıya gerekçe yazın"
                }
                onClick={() => void reviewPendingApproval(request, "Reject")}
              >
                Reddet
              </button>
              <button
                className="ns-btn ns-btn-sm small-button ns-btn-primary"
                disabled={busy}
                onClick={() => void reviewPendingApproval(request, "Approve")}
              >
                Onayla
              </button>
            </div>
          </li>
        ))}
      </ul>
      {approvalQueueLoading && (
        <div className="ns-empty">Onay kuyruğu yükleniyor…</div>
      )}
      <div className="sp-queue-foot">
        <label className="ns-field">
          <span className="ns-field-label">Ret gerekçesi</span>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ret kararının kısa gerekçesini yazın…"
          />
          <small className="ns-field-hint">
            Reddetmek için gerekli. Gerekçe inceleme geçmişine kaydedilir.
            Talep sahibi kendi talebini inceleyemez.
          </small>
        </label>
        <nav className="sp-pager" aria-label="Onay kuyruğu sayfaları">
          <span>
            {pendingApprovalsOffset + 1}–
            {pendingApprovalsOffset + pendingApprovals.length}. kayıtlar
          </span>
          {pendingApprovalsOffset > 0 && (
            <button
              className="ns-btn ns-btn-sm small-button"
              disabled={approvalQueueLoading || busy}
              onClick={() =>
                void loadPendingApprovals(
                  Math.max(0, pendingApprovalsOffset - 100),
                )
              }
            >
              Önceki
            </button>
          )}
          {pendingApprovalsNextOffset !== null && (
            <button
              className="ns-btn ns-btn-sm small-button"
              disabled={approvalQueueLoading || busy}
              onClick={() =>
                void loadPendingApprovals(pendingApprovalsNextOffset)
              }
            >
              Sonraki
            </button>
          )}
        </nav>
      </div>
    </section>
  );
}
