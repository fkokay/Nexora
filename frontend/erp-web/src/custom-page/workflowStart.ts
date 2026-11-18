import { api } from "../erpApi";

/** Sayfa düğmesinden iş akışı örneği başlatır (TenantWorkflowAction ve İşlemler menüsü ortak yolu). Hata fırlatır. */
export async function startPageWorkflow(token: string, workflowId: string, title: string, pageCode: string, componentId: string): Promise<void> {
  await api<{ id: string }>(`/api/workflows/definitions/${encodeURIComponent(workflowId)}/instances`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subjectType: "General",
      subjectTitle: title.slice(0, 160) || "Sayfa işlemi",
      context: { pageCode, componentId, action: "low-code-button" },
    }),
  });
}
