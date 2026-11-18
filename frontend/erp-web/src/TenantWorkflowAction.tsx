import { useState } from "react";
import { startPageWorkflow } from "./custom-page/workflowStart";
import "./tenant-workflow-action.css";

export default function TenantWorkflowAction({
  token, workflowId, title, pageCode, componentId,
}: {
  token: string;
  workflowId: string;
  title: string;
  pageCode: string;
  componentId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const start = async () => {
    if (!workflowId || busy) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      await startPageWorkflow(token, workflowId, title, pageCode, componentId);
      setMessage("İş akışı başlatıldı.");
    } catch (cause) {
      setFailed(true);
      setMessage((cause as Error).message || "İş akışı başlatılamadı.");
    } finally { setBusy(false); }
  };

  return <div className="tenant-workflow-action">
    <button className="tenant-page-button" type="button" onClick={() => void start()} disabled={busy || !workflowId}>
      {busy ? "Başlatılıyor…" : title || "İş akışını başlat"}
    </button>
    {message && <small className={failed ? "is-error" : "is-success"} role={failed ? "alert" : "status"}>{message}</small>}
    {!workflowId && <small className="is-error">Bu düğmeye yayımlanmış bir iş akışı bağlanmamış.</small>}
  </div>;
}
