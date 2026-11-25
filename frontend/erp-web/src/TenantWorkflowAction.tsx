import { useRef, useState } from "react";
import { startPageWorkflow } from "./custom-page/workflowStart";
import "./tenant-workflow-action.css";

type WorkflowRunHooks = {
  setFeedback: (status: { tone: "success" | "error"; text: string } | null) => void;
  setBusy: (busy: boolean) => void;
  inFlight: { current: boolean };
};

/** İş akışı düğmesinin başlatması: sayfa düğmesi ve kalıp kabuğunun işlem çubuğu aynı yolu kullanır. */
export async function runWorkflowStart({ token, workflowId, title, pageCode, componentId }: {
  token: string; workflowId: string; title: string; pageCode: string; componentId: string;
}, { setFeedback, setBusy, inFlight }: WorkflowRunHooks) {
  if (!workflowId || inFlight.current) return;
  inFlight.current = true;
  setBusy(true); setFeedback(null);
  try {
    await startPageWorkflow(token, workflowId, title, pageCode, componentId);
    setFeedback({ tone: "success", text: "İş akışı başlatıldı." });
  } catch (cause) {
    setFeedback({ tone: "error", text: (cause as Error).message || "İş akışı başlatılamadı." });
  } finally { inFlight.current = false; setBusy(false); }
}

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
  const inFlight = useRef(false);

  const start = () => {
    if (busy) return;
    return runWorkflowStart({ token, workflowId, title, pageCode, componentId }, {
      setFeedback: (status) => { setMessage(status?.text ?? ""); setFailed(status?.tone === "error"); },
      setBusy, inFlight,
    });
  };

  return <div className="tenant-workflow-action">
    <button className="tenant-page-button" type="button" onClick={() => void start()} disabled={busy || !workflowId}>
      {busy ? "Başlatılıyor…" : title || "İş akışını başlat"}
    </button>
    {message && <small className={failed ? "is-error" : "is-success"} role={failed ? "alert" : "status"}>{message}</small>}
    {!workflowId && <small className="is-error">Bu düğmeye yayımlanmış bir iş akışı bağlanmamış.</small>}
  </div>;
}
