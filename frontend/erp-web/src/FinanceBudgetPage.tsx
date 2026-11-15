import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "./authApi";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./finance-hub.css";
import "./credit-facilities.css";
import "./finance-budget.css";
import {
  BudgetBoundaryNote,
  BudgetPageChrome,
} from "./finance-budget/BudgetPageChrome";
import BudgetPlanList, { budgetUsage, isApproved } from "./finance-budget/BudgetPlanList";
import BudgetEditor from "./finance-budget/BudgetEditor";
import BudgetDetail from "./finance-budget/BudgetDetail";
import type {
  Account,
  BudgetLayoutField,
  Entry,
  Plan,
  PlanView,
} from "./finance-budget/types";
import { problemDetail } from "./erpApi";

const defaultBudgetFields: BudgetLayoutField[] = [
  { key: "periodStart", label: "Dönem", visible: true, position: 0 },
  { key: "account", label: "Hesap", visible: true, position: 1 },
  { key: "section", label: "Tür", visible: true, position: 2 },
  {
    key: "plannedAmount",
    label: "Planlanan tahakkuk",
    visible: true,
    position: 3,
  },
  {
    key: "actualAmount",
    label: "Yevmiye gerçekleşeni",
    visible: true,
    position: 4,
  },
  { key: "variance", label: "Fark", visible: true, position: 5 },
  { key: "notes", label: "Not", visible: true, position: 6 },
];

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let message =
      response.status === 403
        ? "Erişim reddedildi (403). Oturumdaki firma üyeliği veya rol bu isteğe yetmiyor; yönetici işlemleri için TenantAdmin gerekir."
        : `İstek başarısız (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || problemDetail(body) || message;
    } catch {}
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

const money = (n: number, currency = "TRY") => {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n)} ${currency}`;
  }
};

export default function FinanceBudgetPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const admin = role === "TenantAdmin";
  const currentYear = new Date().getFullYear();
  const [plans, setPlans] = useState<Plan[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [selected, setSelected] = useState<PlanView | null>(null);
  const [baseCurrency, setBaseCurrency] = useState(""),
    [loadError, setLoadError] = useState("");
  const [name, setName] = useState(""),
    [year, setYear] = useState(currentYear),
    [entries, setEntries] = useState<Entry[]>([
      {
        accountId: "",
        periodStart: `${currentYear}-01-01`,
        plannedAmount: 0,
        notes: null,
      },
    ]);
  const [editing, setEditing] = useState(false);
  const [budgetFields, setBudgetFields] =
    useState<BudgetLayoutField[]>(defaultBudgetFields);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [openingPlanId, setOpeningPlanId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const eligible = useMemo(
    () =>
      accounts.filter(
        (x) =>
          x.isActive && ["Revenue", "Expense"].includes(x.statementSection),
      ),
    [accounts],
  );
  const controlsLocked = loading || busy || Boolean(openingPlanId);
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setLoadError("");
    try {
      const [p, a, currencySettings] = await Promise.all([
        request<Plan[]>("/api/finance/budgets/", token),
        request<Account[]>("/api/finance/general-ledger/accounts", token),
        request<{ baseCurrencyCode: string }>("/api/finance/currency", token),
      ]);
      const base = currencySettings.baseCurrencyCode.trim().toUpperCase();
      if (!base) {
        throw new Error(
          "Firmanın baz para birimi alınamadı. Bütçe verileri yüklenemedi.",
        );
      }
      setBaseCurrency(base);
      setPlans(p);
      setAccounts(a);
      if (!selected && p.length > 0) {
        setSelected(await request<PlanView>(`/api/finance/budgets/${p[0].id}`, token));
      }
      if (selected) {
        const updated = p.find((x) => x.id === selected.plan.id);
        if (updated)
          setSelected(
            await request<PlanView>(
              `/api/finance/budgets/${updated.id}`,
              token,
            ),
          );
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    void request<{ fields: BudgetLayoutField[] }>(
      "/api/screen-views/finance-budget-scenarios/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setBudgetFields(
            view.fields.map((field, index) => ({
              ...field,
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  function addLine() {
    setEntries((x) => [
      ...x,
      {
        accountId: "",
        periodStart: `${year}-01-01`,
        plannedAmount: 0,
        notes: null,
      },
    ]);
  }
  function updateLine(i: number, patch: Partial<Entry>) {
    setEntries((x) =>
      x.map((item, index) => (index === i ? { ...item, ...patch } : item)),
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !baseCurrency) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = {
        name,
        fiscalYear: year,
        currencyCode: baseCurrency,
        revision: selected?.plan.revision ?? 0,
        lines: entries.map((x) => ({
          ...x,
          plannedAmount: Number(x.plannedAmount),
        })),
      };
      const result = await request<PlanView>(
        selected
          ? `/api/finance/budgets/${selected.plan.id}`
          : "/api/finance/budgets/",
        token,
        { method: selected ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      setSelected(result);
      setNotice("Bütçe taslağı kaydedildi.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(plan: Plan) {
    if (controlsLocked) return;
    setOpeningPlanId(plan.id);
    setError("");
    setNotice("");
    try {
      setSelected(
        await request<PlanView>(`/api/finance/budgets/${plan.id}`, token),
      );
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpeningPlanId("");
    }
  }
  function edit(plan: PlanView) {
    if (controlsLocked || plan.plan.currencyCode !== baseCurrency) return;
    setName(plan.plan.name);
    setYear(plan.plan.fiscalYear);
    setEntries(
      plan.lines.map((x) => ({
        accountId: x.accountId,
        periodStart: x.periodStart,
        plannedAmount: x.plannedAmount,
        notes: x.notes,
      })),
    );
    setSelected(plan);
    setEditing(true);
    setNotice("");
    setError("");
  }
  async function approve() {
    if (
      !selected ||
      controlsLocked ||
      selected.plan.currencyCode !== baseCurrency
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<PlanView>(
        `/api/finance/budgets/${selected.plan.id}/approve`,
        token,
        { method: "POST" },
      );
      setSelected(result);
      setEditing(false);
      setNotice("Bütçe onaylandı.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function clearForm() {
    if (controlsLocked || !baseCurrency) return;
    setSelected(null);
    setName("");
    setYear(currentYear);
    setEntries([
      {
        accountId: "",
        periodStart: `${currentYear}-01-01`,
        plannedAmount: 0,
        notes: null,
      },
    ]);
    setEditing(true);
    setNotice("");
    setError("");
  }

  const draft =
    selected &&
    (selected.plan.status === 1 || selected.plan.status === "Draft");
  const currencyMismatch = Boolean(
    selected && baseCurrency && selected.plan.currencyCode !== baseCurrency,
  );
  const visibleBudgetFields = budgetFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const tilePlan = selected?.plan ?? plans[0] ?? null;
  const tileUsage = tilePlan ? budgetUsage(tilePlan, baseCurrency) : null;
  const tileVariance =
    tilePlan && tilePlan.currencyCode === baseCurrency
      ? tilePlan.actualTotal - tilePlan.plannedTotal
      : null;
  const pendingApproval = plans.filter((plan) => !isApproved(plan.status)).length;
  return (
    <div className="finance-page finance-budget-page list-v2 fh-page cf-page">
      <BudgetPageChrome
        plans={plans}
        admin={admin}
        baseCurrency={baseCurrency}
        onNew={clearForm}
        loading={loading}
        controlsLocked={controlsLocked}
        error={error}
        notice={notice}
        onRetry={() => void load()}
      />
      {tilePlan && (
        <section className="fh-tiles" aria-label="Seçili bütçe özeti">
          <div className="fh-tile">
            <span className="fh-tile-label">{`Plan · ${tilePlan.name}`}</span>
            <span className="fh-tile-value">
              {money(tilePlan.plannedTotal, tilePlan.currencyCode)}
            </span>
            <span className="fh-tile-hint">{`${tilePlan.fiscalYear} · ${tilePlan.lineCount} satır`}</span>
          </div>
          <div className="fh-tile">
            <span className="fh-tile-label">Yevmiye gerçekleşeni</span>
            <span className="fh-tile-value">
              {money(tilePlan.actualTotal, baseCurrency || tilePlan.currencyCode)}
            </span>
            {tileUsage !== null && (
              <>
                <span className="cf-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(1, Math.max(0, tileUsage)) * 100}%` }} />
                </span>
                <span className="fh-tile-hint">
                  {`Planın %${(tileUsage * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} gerçekleşti`}
                </span>
              </>
            )}
          </div>
          <div className={`fh-tile${tileVariance !== null && tileVariance < 0 ? " is-warning" : ""}`}>
            <span className="fh-tile-label">Fark (gerçekleşen − plan)</span>
            <span className={`fh-tile-value${tileVariance === null ? " is-muted-value" : ""}`}>
              {tileVariance === null ? "—" : money(tileVariance, baseCurrency)}
            </span>
            <span className="fh-tile-hint">
              {tileVariance === null
                ? "Para birimleri farklı; fark hesaplanmaz"
                : "Satır bazında yön için tabloya bakın"}
            </span>
          </div>
          <div className="fh-tile">
            <span className="fh-tile-label">Onay bekleyen</span>
            <span className="fh-tile-value">{pendingApproval}</span>
            <span className="fh-tile-hint">{`${plans.length} bütçe senaryosu`}</span>
          </div>
        </section>
      )}
      <div className="cf-layout budget-layout">
        <BudgetPlanList
          plans={plans}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          selected={selected}
          editing={editing}
          loading={loading}
          loadError={loadError}
          controlsLocked={controlsLocked}
          admin={admin}
          baseCurrency={baseCurrency}
          openingPlanId={openingPlanId}
          onOpen={(plan) => void open(plan)}
          onNew={clearForm}
          onRetry={() => void load()}
          onRefresh={() => void load()}
          money={money}
        />
        {admin && editing ? (
          <BudgetEditor
            selected={selected}
            name={name}
            year={year}
            entries={entries}
            eligible={eligible}
            baseCurrency={baseCurrency}
            controlsLocked={controlsLocked}
            busy={busy}
            onNameChange={setName}
            onYearChange={(y) => {
              setYear(y);
              if (Number.isFinite(y))
                setEntries((xs) =>
                  xs.map((x) => ({
                    ...x,
                    periodStart: `${y}-${x.periodStart.slice(5)}`,
                  })),
                );
            }}
            onAddLine={addLine}
            onUpdateLine={updateLine}
            onRemoveLine={(index) =>
              setEntries((xs) => xs.filter((_, i) => i !== index))
            }
            onCancel={() => setEditing(false)}
            onNew={clearForm}
            onSubmit={save}
          />
        ) : selected ? (
          <BudgetDetail
            selected={selected}
            draft={Boolean(draft)}
            admin={admin}
            currencyMismatch={currencyMismatch}
            baseCurrency={baseCurrency}
            visibleFields={visibleBudgetFields}
            controlsLocked={controlsLocked}
            busy={busy}
            onEdit={edit}
            onApprove={() => void approve()}
            money={money}
          />
        ) : (
          <section className="cf-detail">
            <p className="fh-empty">
              {plans.length
                ? "Ayrıntıları görmek için soldan bir bütçe seçin."
                : "Bütçe oluşturulduğunda ayrıntıları burada görünür."}
            </p>
          </section>
        )}
      </div>
      <BudgetBoundaryNote baseCurrency={baseCurrency} />
    </div>
  );
}
