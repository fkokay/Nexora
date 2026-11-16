// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { Code2, Plus, X, ShieldCheck } from "lucide-react";
import type { DevelopmentProject, StudioChatCodeChangePreview, StudioConversation, StudioConversationMessage, StudioKnowledgeAutoRefresh, WorkspaceRequest } from "./types";

export type ChatDialogProps = {
  applyStudioChatCodeChange: (change: StudioChatCodeChangePreview["changes"][number]) => Promise<void>;
  chatAIConsent: boolean;
  chatCodeChange: StudioChatCodeChangePreview | null;
  chatCodeChangeApplied: string[];
  chatCodeChangeLoading: boolean;
  chatConversation: StudioConversation | null;
  chatDraft: string;
  chatKnowledgeConsent: boolean;
  chatLoading: boolean;
  chatMessages: StudioConversationMessage[];
  chatSourceSharingConsent: boolean;
  chatStreamingText: string;
  chatWorkspace: WorkspaceRequest;
  createStudioChatCodeChange: (e: FormEvent) => Promise<void>;
  createStudioConversation: (e?: FormEvent, requestOverride?: WorkspaceRequest) => Promise<void>;
  deleteStudioConversation: () => Promise<void>;
  error: string;
  knowledgeAutoRefresh: StudioKnowledgeAutoRefresh;
  selectStudioConversation: (conversation: StudioConversation) => Promise<void>;
  sendStudioChatMessage: (e: FormEvent) => Promise<void>;
  setChatAIConsent: Dispatch<SetStateAction<boolean>>;
  setChatCodeChange: Dispatch<SetStateAction<StudioChatCodeChangePreview | null>>;
  setChatCodeChangeApplied: Dispatch<SetStateAction<string[]>>;
  setChatConversation: Dispatch<SetStateAction<StudioConversation | null>>;
  setChatDraft: Dispatch<SetStateAction<string>>;
  setChatKnowledgeConsent: Dispatch<SetStateAction<boolean>>;
  setChatMessages: Dispatch<SetStateAction<StudioConversationMessage[]>>;
  setChatSourceSharingConsent: Dispatch<SetStateAction<boolean>>;
  setChatWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  studioConversations: StudioConversation[];
  workspaceProject: DevelopmentProject;
};

export function ChatDialog({
  applyStudioChatCodeChange,
  chatAIConsent,
  chatCodeChange,
  chatCodeChangeApplied,
  chatCodeChangeLoading,
  chatConversation,
  chatDraft,
  chatKnowledgeConsent,
  chatLoading,
  chatMessages,
  chatSourceSharingConsent,
  chatStreamingText,
  chatWorkspace,
  createStudioChatCodeChange,
  createStudioConversation,
  deleteStudioConversation,
  error,
  knowledgeAutoRefresh,
  selectStudioConversation,
  sendStudioChatMessage,
  setChatAIConsent,
  setChatCodeChange,
  setChatCodeChangeApplied,
  setChatConversation,
  setChatDraft,
  setChatKnowledgeConsent,
  setChatMessages,
  setChatSourceSharingConsent,
  setChatWorkspace,
  studioConversations,
  workspaceProject,
}: ChatDialogProps) {
  return (
    <Dialog
  onClose={() => { setChatWorkspace(null);
          setChatConversation(null);
          setChatMessages([]); }}
  className="studio-chat-modal"
  backdropClassName="studio-chat-backdrop"
>
        <header className="modal-head studio-chat-header">
          <div className="studio-chat-heading">
            <span className="studio-chat-mark">
              <Code2 size={18} />
            </span>
            <div className="studio-chat-title">
              <p className="eyebrow studio-chat-eyebrow">
                AI DEVELOPMENT STUDIO <span>·</span> GÖREV SOHBETİ
              </p>
              <h2>{workspaceProject.name}</h2>
              <span
                className="studio-workspace-ref"
                title={chatWorkspace.workspaceBranchName ?? ""}
              >
                {chatWorkspace.workspaceBranchName ?? "Çalışma alanı"}
              </span>
            </div>
          </div>
          <div className="studio-chat-header-actions">
            {workspaceProject.accessLevel !== "Viewer" && (
              <button
                type="button"
                className="secondary studio-new-chat-button"
                disabled={chatLoading}
                onClick={() => void createStudioConversation()}
              >
                <Plus size={15} /> Yeni sohbet
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Sohbet penceresini kapat"
              onClick={() => {
                setChatWorkspace(null);
                setChatConversation(null);
                setChatMessages([]);
              }}
            >
              <X size={19} />
            </button>
          </div>
        </header>
        <p className="muted modal-sub studio-chat-description">
          Bu proje ve çalışma alanına özel bir sohbet ortamıdır. Kaynak
          dosyaları ve ERP kayıtları burada paylaşılabilir; AI asistanı ile
          geliştirme adımları yürütülebilir.
        </p>
        {error && <div className="alert">{error}</div>}
        <div className="studio-chat-layout">
          <section className="panel studio-message-panel">
            <div className="panel-heading studio-section-heading studio-message-heading">
              <div className="studio-message-heading-copy">
                {studioConversations.length > 1 ? (
                  <select
                    aria-label="Sohbet seç"
                    value={chatConversation?.id ?? ""}
                    onChange={(e) => {
                      const selected = studioConversations.find(
                        (item) => item.id === e.target.value,
                      );
                      if (selected) void selectStudioConversation(selected);
                    }}
                  >
                    {studioConversations.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>
                        {conversation.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <b>{chatConversation?.title ?? "Görev sohbeti"}</b>
                )}
                <small>
                  {chatConversation
                    ? `${chatMessages.length} mesaj · ${chatWorkspace.workspaceBranchName ?? "çalışma alanı"}`
                    : "Sohbet hazırlanıyor…"}
                </small>
              </div>
              {chatConversation?.canDelete && (
                <button
                  className="ns-btn ns-btn-sm small-button danger-action"
                  disabled={chatLoading}
                  onClick={() => void deleteStudioConversation()}
                >
                  Sohbeti sil
                </button>
              )}
            </div>
            {error && (
              <div className="alert studio-chat-error" role="alert">
                {error}
              </div>
            )}
            <div className="studio-message-list">
              {chatLoading && !chatMessages.length && !chatStreamingText ? (
                <div className="studio-chat-empty">
                  <span className="studio-empty-icon">
                    <Code2 size={20} />
                  </span>
                  <b>
                    AI sağlayıcısından yanıt bekleniyor (en fazla 60 sn)…
                  </b>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <article
                    key={message.id}
                    className={`studio-message ${message.role === "user" ? "user" : "assistant"}`}
                  >
                    <div className="studio-message-meta">
                      <b>{message.role === "user" ? "Siz" : "AI Studio"}</b>
                      <small>
                        {new Date(message.createdAt).toLocaleTimeString(
                          "tr-TR",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </small>
                    </div>
                    <div className="studio-message-content">
                      {message.content}
                    </div>
                  </article>
                ))
              )}
              {chatLoading && chatStreamingText && (
                <article className="studio-message assistant">
                  <div className="studio-message-meta">
                    <b>AI Studio</b>
                    <small>Yanıt yazılıyor…</small>
                  </div>
                  <div className="studio-message-content">
                    {chatStreamingText}
                  </div>
                </article>
              )}
              {!chatMessages.length && !chatLoading && (
                <div className="studio-chat-empty">
                  <span className="studio-empty-icon">
                    <Code2 size={20} />
                  </span>
                  <b>
                    {chatConversation
                      ? "Henüz mesaj yok"
                      : "Geliştirme sohbetinize başlayın"}
                  </b>
                  <small>
                    {chatConversation
                      ? "Bu konuşmaya proje sorunuzla ilk mesajı gönderin."
                      : "Proje ve çalışma alanınızla ilgili sorunuzu yazın."}
                  </small>
                </div>
              )}
            </div>
            {chatCodeChange && (
              <section className="panel" style={{ marginTop: 12 }}>
                <div className="panel-heading">
                  <div>
                    <b>AI Asistanı değişiklik taslağı</b>
                    <small>
                      {chatCodeChange.changes.length} dosya · izole
                      workspace · henüz uygulanmadı
                    </small>
                  </div>
                  <button
                    type="button"
                    className="ns-btn ns-btn-sm small-button"
                    onClick={() => {
                      setChatCodeChange(null);
                      setChatCodeChangeApplied([]);
                    }}
                  >
                    Taslağı kapat
                  </button>
                </div>
                <div className="notice">{chatCodeChange.summary}</div>
                {chatCodeChange.risks.length > 0 && (
                  <div className="boundary-note">
                    <ShieldCheck size={17} />
                    <span>
                      <b>AI risk notları</b>
                      {chatCodeChange.risks.join(" · ")}
                    </span>
                  </div>
                )}
                {chatCodeChange.changes.map((change) => (
                  <section
                    className="panel"
                    key={change.filePath}
                    style={{ marginTop: 12 }}
                  >
                    <div className="panel-heading">
                      <div>
                        <b>{change.filePath}</b>
                        <small>
                          Kaynak özeti {change.sourceSha256.slice(0, 12)} ·
                          dosya yazımı ayrı onay ister
                        </small>
                      </div>
                      <button
                        type="button"
                        className="ns-btn ns-btn-sm small-button ns-btn-primary"
                        disabled={
                          chatCodeChangeLoading ||
                          chatCodeChangeApplied.includes(change.filePath)
                        }
                        onClick={() =>
                          void applyStudioChatCodeChange(change)
                        }
                      >
                        {chatCodeChangeApplied.includes(change.filePath)
                          ? "Uygulandı"
                          : "Bu dosyayı uygula"}
                      </button>
                    </div>
                    {change.patches.map((patch, index) => (
                      <div
                        key={`${change.filePath}-${index}`}
                        className="panel"
                        style={{ marginTop: 8 }}
                      >
                        <div className="panel-heading">
                          <b>Değişiklik {index + 1}</b>
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit,minmax(260px,1fr))",
                            gap: 8,
                          }}
                        >
                          <pre
                            style={{
                              maxHeight: 180,
                              overflow: "auto",
                              padding: 10,
                              background: "#fff3f3",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            <code>{patch.findText}</code>
                          </pre>
                          <pre
                            style={{
                              maxHeight: 180,
                              overflow: "auto",
                              padding: 10,
                              background: "#effaf3",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            <code>{patch.replaceText}</code>
                          </pre>
                        </div>
                        {patch.notes.length > 0 && (
                          <small>{patch.notes.join(" · ")}</small>
                        )}
                      </div>
                    ))}
                  </section>
                ))}
                <div className="boundary-note" style={{ marginTop: 12 }}>
                  <ShieldCheck size={17} />
                  <span>
                    <b>İzole çalışma alanı sınırları</b>Her dosya ayrı
                    onaylanır; dosya taslak oluşturulduktan sonra değişmişse
                    uygulama durur. Kod çalıştırılmaz ve uzak depoya push
                    yapılmaz.
                  </span>
                </div>
              </section>
            )}
            {chatConversation &&
              workspaceProject.accessLevel !== "Viewer" && (
                <form
                  className="studio-chat-compose"
                  onSubmit={sendStudioChatMessage}
                >
                  <label htmlFor="studio-chat-message">Mesaj</label>
                  <textarea
                    id="studio-chat-message"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    maxLength={4000}
                    rows={3}
                    required
                    placeholder="Bu dalda sıradaki güvenli geliştirme adımı ne olmalı?"
                  />
                  <label className="studio-chat-consent">
                    <input
                      type="checkbox"
                      checked={chatAIConsent}
                      onChange={(e) => setChatAIConsent(e.target.checked)}
                      required
                    />
                    <span>
                      Bu mesajın (yapıştırdığım içerikler dahil), önceki
                      sohbet mesajlarının ve proje/dal adının seçili AI
                      sağlayıcısına gönderilmesini onaylıyorum.{" "}
                      {knowledgeAutoRefresh.allFiles
                        ? "Bu çalışma alanı için kalıcı kaynak paylaşım izni açıktır."
                        : "Runner kaynak dosyalarını veya ERP kayıtlarını otomatik eklemez."}
                    </span>
                  </label>
                  {knowledgeAutoRefresh.allFiles ? (
                    <div className="studio-chat-consent">
                      <ShieldCheck size={16} />
                      <span>
                        Kalıcı proje erişimi açık; sorularda ilgili kaynak
                        alıntıları otomatik aranır. Kod değişikliği taslağı
                        için de dosyalar bu izin kapsamında taranır.
                      </span>
                    </div>
                  ) : (
                    <>
                      <label className="studio-chat-consent">
                        <input
                          type="checkbox"
                          checked={chatKnowledgeConsent}
                          onChange={(e) =>
                            setChatKnowledgeConsent(e.target.checked)
                          }
                        />
                        <span>
                          Bu mesaj için, ayrıca seçip indekslediğim proje
                          dosyalarından ilgili alıntıları AI sağlayıcısına
                          gönder (ayrı onay).
                        </span>
                      </label>
                      <label className="studio-chat-consent">
                        <input
                          type="checkbox"
                          checked={chatSourceSharingConsent}
                          onChange={(e) =>
                            setChatSourceSharingConsent(e.target.checked)
                          }
                        />
                        <span>
                          Kod değişikliği taslağı istersem, ilgili workspace
                          kaynak dosyalarının AI Geliştirici'ye gönderilmesini
                          onaylıyorum.
                        </span>
                      </label>
                    </>
                  )}
                  <div className="studio-chat-compose-footer">
                    <span>
                      Değişiklik isteğinde AI dosyaları bulup diff taslağı
                      çıkarır; çalışma alanına yazma dosya başına onaylanır.
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="ns-btn"
                        disabled={
                          chatLoading ||
                          chatCodeChangeLoading ||
                          !chatAIConsent ||
                          !chatDraft.trim() ||
                          (!knowledgeAutoRefresh.allFiles &&
                            !chatSourceSharingConsent)
                        }
                        onClick={createStudioChatCodeChange}
                      >
                        {chatCodeChangeLoading
                          ? "Dosyalar inceleniyor…"
                          : "Değişiklik taslağı oluştur"}
                      </button>
                      <button
                        className="ns-btn ns-btn-primary"
                        disabled={
                          chatLoading ||
                          chatCodeChangeLoading ||
                          !chatAIConsent ||
                          !chatDraft.trim()
                        }
                      >
                        {chatLoading ? "Yanıt bekleniyor…" : "Gönder"}{" "}
                        <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
          </section>
        </div>
      </Dialog>
  );
}
