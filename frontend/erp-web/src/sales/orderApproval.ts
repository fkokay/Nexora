// Satış siparişi Onayla ve onay kararı (belge kuralları PR 3): kural uyarısı onay ister, onay iste kuralı siparişi bekletir.
import { authenticatedFetch } from "../authApi";
import { api } from "../erpApi";

export type ApproveOutcome = { status: string; warnings: string[] } | null;

type ProblemBody = { error?: string; code?: string; warnings?: string[]; errors?: Record<string, string[]> };

async function postApprove(orderId: string, token: string | undefined, acknowledgeWarnings: boolean) {
  const response = await authenticatedFetch(`/api/sales/orders/${encodeURIComponent(orderId)}/approve`, token, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), acknowledgeWarnings }),
  });
  const body = (await response.json().catch(() => null)) as (ProblemBody & { status?: string }) | null;
  return { response, body };
}

/**
 * Onayla. Kural uyarı verirse `confirm` uyarılarla çağrılır; kullanıcı onaylarsa istek uyarılar görüldü diye yinelenir, vazgeçerse
 * null döner. Engel ya da başka bir hata `Error` olarak fırlar (sunucunun mesajıyla).
 */
export async function approveSalesOrder(orderId: string, token: string | undefined,
  confirm: (warnings: string[]) => Promise<boolean>): Promise<ApproveOutcome> {
  let { response, body } = await postApprove(orderId, token, false);
  if (response.status === 409 && body?.code === "needsConfirmation") {
    if (!(await confirm(body.warnings ?? []))) return null;
    ({ response, body } = await postApprove(orderId, token, true));
  }
  if (!response.ok) {
    const validation = Object.values(body?.errors ?? {}).flat().join(" ");
    throw new Error(body?.error || validation || (response.status === 403 ? "Bu işlem için yetkiniz yok." : `İstek başarısız (${response.status}).`));
  }
  return { status: body?.status ?? "", warnings: body?.warnings ?? [] };
}

/** Onay bekleyen siparişte karar: Onayla ya da gerekçeyle Reddet (iş akışı karar ucu). */
export const decideSalesOrder = (instanceId: string, decision: "Approved" | "Rejected", comment: string | null, token?: string) =>
  api<unknown>(`/api/workflows/instances/${encodeURIComponent(instanceId)}/decision`, token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, comment }) });

export const warningsText = (warnings: string[]) => warnings.map((w) => `• ${w}`).join("\n");
