import { authenticatedFetch } from "../erp-src/authApi";
import type { DocumentRule, RuleField, RulePerson } from "./documentRulesModel";

// Belge kuralı uçları (ERP API): satış siparişi Onayla kuralları, taslak, yayın, Dene ve kişi listesi.
const ROUTE = "/api/document-rules/satis.siparis/onayla";

export type RuleSet = { version: number; status: string; rules: DocumentRule[]; updatedAt: string; publishedAt: string | null };
export type RulesView = {
  fields: RuleField[]; operators: Record<string, string[]>; published: RuleSet | null; draft: RuleSet | null;
  history: { version: number; status: string; ruleCount: number; createdAt: string; publishedAt: string | null }[];
};
export type TryStep = { step: string; source: string; outcome: string; message: string | null };
export type TryResult = { result: "blocked" | "approval" | "approved"; steps: TryStep[]; approvers: RulePerson[]; actorExcluded: boolean; usedDraft: boolean };

export class RulesError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, init ? { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } } : undefined);
  const body = (await response.json().catch(() => null)) as (T & { error?: string; errors?: Record<string, string[]> }) | null;
  if (!response.ok) {
    const validation = Object.values(body?.errors ?? {}).flat().join(" ");
    const message = response.status === 403 ? "Bu işlem için yetkiniz yok." : body?.error || validation || `İstek başarısız (${response.status}).`;
    throw new RulesError(message, response.status);
  }
  return body as T;
}

export const loadRules = (token: string) => call<RulesView>(ROUTE, token);
export const saveDraft = (token: string, rules: DocumentRule[], expectedUpdatedAt: string | null) =>
  call<RulesView>(`${ROUTE}/draft`, token, { method: "PUT", body: JSON.stringify({ rules, expectedUpdatedAt }) });
export const publishRules = (token: string) => call<RulesView>(`${ROUTE}/publish`, token, { method: "POST", body: "{}" });
export const tryRules = (token: string, body: { orderId?: string; facts?: Record<string, string>; actorUserId?: string }) =>
  call<TryResult>(`${ROUTE}/try`, token, { method: "POST", body: JSON.stringify(body) });
export const loadPeople = (token: string) => call<RulePerson[]>("/api/document-rules/people", token);
