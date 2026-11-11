import { useState } from "react";
import { api } from "./erpApi";
import "./tenant-workflow-action.css";

type WorkflowStartResult = { id: string };

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
      await api<WorkflowStartResult>(`/api/workflows/definitions/${encodeURIComponent(workflowId)}/instances`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: "General",
          subjectTitle: title.slice(0, 160) || "Sayfa işlemi",
          context: { pageCode, componentId, action: "low-code-button" },
        }),
      });
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
