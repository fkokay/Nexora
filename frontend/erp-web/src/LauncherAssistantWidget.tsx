import { useState, type CSSProperties, type FormEvent } from "react";
import { LoaderCircle, Send, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "./erpApi";
import type { ERPAssistantTurn } from "./erp-types";

export function LauncherAssistantWidget({ token, selected, style }: { token: string; selected: boolean; style?: CSSProperties }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ERPAssistantTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || busy) return;
    const history = turns.slice(-10).map(({ role, content: turn }) => ({ role, content: turn }));
    setBusy(true);
    setError("");
    setQuestion("");
    setTurns((previous) => [...previous, { role: "user", content }]);
    try {
      const result = await api<{ answer: string; readOnly: boolean }>(
        "/api/ai-settings/erp-assistant",
        token,
        { method: "POST", body: JSON.stringify({ question: content, aiSharingConfirmed: true, history }) },
      );
      setTurns((previous) => [...previous, { role: "assistant", content: result.answer }]);
    } catch (requestError) {
      setError((requestError as Error).message);
      setQuestion(content);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="launcher-panel launcher-assistant-widget" data-dashboard-widget="assistant" data-selected={selected} style={style}>
      <header>
        <span><Sparkles size={19} />AI Asistan</span>
        <small><ShieldCheck size={13} />Salt okunur</small>
      </header>
      <div className="launcher-assistant-conversation" aria-live="polite">
        {turns.length === 0 && !busy ? (
          <p>Stok, depo veya cari kayıtlarınız hakkında soru sorun.</p>
        ) : (
          turns.map((turn, index) => (
            <article className={"launcher-assistant-turn " + turn.role} key={index}>
              <b>{turn.role === "assistant" ? "Nexora AI" : "Siz"}</b>
              <p>{turn.content}</p>
            </article>
          ))
        )}
        {busy && <p className="launcher-assistant-thinking"><LoaderCircle size={14} />ERP kayıtları inceleniyor…</p>}
        {error && <p className="launcher-assistant-error" role="alert">{error}</p>}
      </div>
      <form className="launcher-assistant-composer" onSubmit={sendQuestion}>
        <div>
          <input type="text" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="ERP verileriniz hakkında sorun…" maxLength={2000} disabled={busy} />
          <button type="submit" aria-label="Soruyu gönder" disabled={busy || !question.trim()}>
            {busy ? <LoaderCircle size={16} className="launcher-assistant-spin" /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </section>
  );
}
