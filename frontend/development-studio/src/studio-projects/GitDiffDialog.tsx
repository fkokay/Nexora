// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { X, ShieldCheck } from "lucide-react";
import { CodeSuggestionDiff } from "./CodeSuggestionDiff";
import type { DevelopmentProject, StudioCodeReview, StudioCodeReviewThread, WorkspaceGitDiff } from "./types";

export type GitDiffDialogProps = {
  aiConfigured: boolean | null;
  codeReview: StudioCodeReview | null;
  codeReviewConsent: boolean;
  codeReviewLoading: boolean;
  createCodeReviewThread: (e: FormEvent) => Promise<void>;
  error: string;
  gitDiffLoading: boolean;
  gitDiffTarget: string;
  replyToCodeReviewThread: (e: FormEvent) => Promise<void>;
  reviewDraft: string;
  reviewLine: string;
  reviewReplyDraft: string;
  reviewReplyThread: string | null;
  reviewSaving: boolean;
  reviewThreads: StudioCodeReviewThread[];
  reviewWorkspaceDiff: (e: FormEvent) => Promise<void>;
  setCodeReviewConsent: Dispatch<SetStateAction<boolean>>;
  setCodeReviewThreadResolved: (thread: StudioCodeReviewThread, resolved: boolean) => Promise<void>;
  setGitDiffTarget: Dispatch<SetStateAction<string | null>>;
  setReviewDraft: Dispatch<SetStateAction<string>>;
  setReviewLine: Dispatch<SetStateAction<string>>;
  setReviewReplyDraft: Dispatch<SetStateAction<string>>;
  setReviewReplyThread: Dispatch<SetStateAction<string | null>>;
  setWorkspaceGitDiff: Dispatch<SetStateAction<WorkspaceGitDiff | null>>;
  workspaceGitDiff: WorkspaceGitDiff | null;
  workspaceProject: DevelopmentProject | null;
};

export function GitDiffDialog({
  aiConfigured,
  codeReview,
  codeReviewConsent,
  codeReviewLoading,
  createCodeReviewThread,
  error,
  gitDiffLoading,
  gitDiffTarget,
  replyToCodeReviewThread,
  reviewDraft,
  reviewLine,
  reviewReplyDraft,
  reviewReplyThread,
  reviewSaving,
  reviewThreads,
  reviewWorkspaceDiff,
  setCodeReviewConsent,
  setCodeReviewThreadResolved,
  setGitDiffTarget,
  setReviewDraft,
  setReviewLine,
  setReviewReplyDraft,
  setReviewReplyThread,
  setWorkspaceGitDiff,
  workspaceGitDiff,
  workspaceProject,
}: GitDiffDialogProps) {
  return (
    <Dialog
  onClose={() => { setGitDiffTarget(null);
          setWorkspaceGitDiff(null); }}
  style={{ maxWidth: 1000 }}
  backdropStyle={{ zIndex: 70 }}
>
        <div className="modal-head">
          <div>
            <p className="eyebrow">GIT FARKI · SALT OKUNUR</p>
            <h2>{gitDiffTarget}</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => {
              setGitDiffTarget(null);
              setWorkspaceGitDiff(null);
            }}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted modal-sub">
          HEAD ile çalışma ağacındaki metin karşılaştırması. İçerik yalnızca
          görüntülenir; AI’ye gönderilmez ve uygulanmaz.
        </p>
        {gitDiffLoading ? (
          <div className="empty-small">Diff okunuyor…</div>
        ) : (
          workspaceGitDiff && (
            <>
              <div className="panel-heading">
                <div>
                  <b>{workspaceGitDiff.status}</b>
                  <small>
                    HEAD {workspaceGitDiff.headCommitSha.slice(0, 12)} ·
                    dosya başına en fazla 900 KiB
                  </small>
                </div>
              </div>
              <CodeSuggestionDiff
                original={workspaceGitDiff.baseContent}
                proposed={workspaceGitDiff.currentContent}
              />
              {workspaceProject?.accessLevel !== "Viewer" && (
                <form
                  onSubmit={reviewWorkspaceDiff}
                  style={{ marginTop: 16 }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 9,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={codeReviewConsent}
                      onChange={(e) =>
                        setCodeReviewConsent(e.target.checked)
                      }
                      required
                          />
                    <span>
                      Bu dosyanın önceki ve güncel içeriğinin (toplam en
                      fazla 20 KiB) OpenAI’ye gönderilmesini onaylıyorum.
                      İnceleme sonucu saklanmaz ve değişiklik uygulamaz.
                    </span>
                  </label>
                  <button
                    className="ns-btn ns-btn-primary"
                    style={{ marginTop: 10 }}
                    disabled={
                      codeReviewLoading ||
                      !codeReviewConsent ||
                      aiConfigured === false
                    }
                  >
                    {codeReviewLoading
                      ? "Diff inceleniyor…"
                      : "AI ile bu diff’i incele"}
                  </button>
                </form>
              )}
              {codeReview && (
                <section className="panel" style={{ marginTop: 16 }}>
                  <div className="panel-heading">
                    <div>
                      <b>AI inceleme · kod çalıştırılmadı</b>
                      <small>
                        Yalnızca seçili dosya ve gösterilen dal diff’i
                        kullanıldı
                      </small>
                    </div>
                  </div>
                  <div className="notice">{codeReview.summary}</div>
                  {codeReview.findings.map((finding, i) => (
                    <article className="request-row expanded" key={i}>
                      <div className="request-info">
                        <b>
                          {finding.severity} · {finding.title}
                        </b>
                        <small>{finding.detail}</small>
                        <small>Öneri: {finding.recommendation}</small>
                      </div>
                    </article>
                  ))}
                  {codeReview.findings.length === 0 && (
                    <div className="empty-small">
                      Bu sınırlı diff içinde doğrulanabilir bir bulgu
                      üretilmedi.
                    </div>
                  )}
                  {codeReview.limitations.length > 0 && (
                    <div className="boundary-note">
                      <ShieldCheck size={17} />
                      <span>
                        <b>Sınırlamalar</b>
                        {codeReview.limitations.join(" · ")}
                      </span>
                    </div>
                  )}
                </section>
              )}
            </>
          )
        )}
        {workspaceGitDiff && (
          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-heading">
              <div>
                <b>Takım kod incelemesi</b>
                <small>
                  {
                    reviewThreads.filter(
                      (thread) => thread.status === "Open",
                    ).length
                  }{" "}
                  açık başlık · commit{" "}
                  {workspaceGitDiff.headCommitSha.slice(0, 12)}
                </small>
              </div>
            </div>
            {reviewThreads.map((thread) => (
              <article className="request-row expanded" key={thread.id}>
                <div className="request-info">
                  <b>
                    Satır {thread.lineNumber} ·{" "}
                    {thread.status === "Open" ? "Açık" : "Çözüldü"}
                  </b>
                  <small>
                    {thread.createdByUserId.slice(0, 8)} ·{" "}
                    {new Date(thread.createdAt).toLocaleString("tr-TR")}
                  </small>
                  {thread.isStale && (
                    <small className="alert">
                      Bu başlık eski commit’e bağlı; güncel diff’e yeniden
                      sabitleyin.
                    </small>
                  )}
                  {thread.comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        borderLeft: "2px solid #dedcf4",
                        padding: "6px 0 6px 10px",
                        marginTop: 7,
                      }}
                    >
                      <small>
                        {comment.githubAuthorLogin
                          ? `@${comment.githubAuthorLogin}`
                          : comment.createdByUserId.slice(0, 8)}{" "}
                        ·{" "}
                        {new Date(comment.createdAt).toLocaleString(
                          "tr-TR",
                        )}
                      </small>
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        {comment.body}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {thread.status === "Open" && (
                      <button
                        type="button"
                        className="ns-btn ns-btn-sm small-button"
                        onClick={() => {
                          setReviewReplyThread(thread.id);
                          setReviewReplyDraft("");
                        }}
                      >
                        Yanıtla
                      </button>
                    )}
                    <button
                      type="button"
                      className="ns-btn ns-btn-sm small-button"
                      disabled={reviewSaving}
                      onClick={() =>
                        void setCodeReviewThreadResolved(
                          thread,
                          thread.status === "Open",
                        )
                      }
                    >
                      {thread.status === "Open"
                        ? "Çözüldü işaretle"
                        : "Yeniden aç"}
                    </button>
                  </div>
                  {reviewReplyThread === thread.id && (
                    <form
                      onSubmit={replyToCodeReviewThread}
                      style={{ marginTop: 10 }}
                    >
                      <label>
                        Yanıt
                        <textarea
                          value={reviewReplyDraft}
                          onChange={(e) =>
                            setReviewReplyDraft(e.target.value)
                          }
                          required
                          maxLength={4000}
                          rows={2}
                        />
                      </label>
                      <button
                        className="ns-btn ns-btn-primary"
                        disabled={reviewSaving || !reviewReplyDraft.trim()}
                      >
                        {reviewSaving ? "Kaydediliyor…" : "Yanıtı ekle"}
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
            {reviewThreads.length === 0 && (
              <div className="empty-small">
                Bu dosyada henüz inceleme yorumu yok.
              </div>
            )}
            {workspaceProject?.accessLevel !== "Viewer" && (
              <form
                onSubmit={createCodeReviewThread}
                style={{ marginTop: 12 }}
              >
                <div className="panel-heading">
                  <div>
                    <b>Satıra yorum ekle</b>
                    <small>
                      Yorum güncel commit ve değişmiş dosya üzerinde
                      sabitlenir.
                    </small>
                  </div>
                </div>
                <label>
                  Satır numarası
                  <input
                    type="number"
                    min={1}
                    max={Math.max(
                      1,
                      workspaceGitDiff.currentContent.split(/\r?\n/).length,
                      workspaceGitDiff.baseContent.split(/\r?\n/).length,
                    )}
                    value={reviewLine}
                    onChange={(e) => setReviewLine(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Yorum
                  <textarea
                    value={reviewDraft}
                    onChange={(e) => setReviewDraft(e.target.value)}
                    required
                    maxLength={4000}
                    rows={3}
                    placeholder="Bu satırla ilgili soruyu veya öneriyi yazın"
                  />
                </label>
                <button
                  className="ns-btn ns-btn-primary"
                  disabled={
                    reviewSaving || !reviewDraft.trim() || !reviewLine
                  }
                >
                  {reviewSaving ? "Kaydediliyor…" : "Yorumu başlat"}
                </button>
              </form>
            )}
            <div className="boundary-note">
              <ShieldCheck size={17} />
              <span>
                <b>İnsan incelemesi</b>Yorumlar tenant, proje ve workspace
                ile sınırlandırılır. Yorum eklemek kodu değiştirmez veya
                commit etmez.
              </span>
            </div>
          </section>
        )}
        {error && <div className="alert">{error}</div>}
        <div className="modal-foot">
          <span>Salt okunur diff</span>
          <button
            className="ns-btn"
            onClick={() => {
              setGitDiffTarget(null);
              setWorkspaceGitDiff(null);
            }}
          >
            Kapat
          </button>
        </div>
      </Dialog>
  );
}
