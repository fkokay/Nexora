import { useState, type ReactNode } from "react";
import AdvancedDataGrid from "../AdvancedDataGrid";
import { screenViewGridDefaults } from "../screenViewGridLayout";
import { DetailTabs, DetailTiles } from "../document-detail/DocumentDetailLayout";
import { DocumentSurface } from "../document-page/DocumentSurface";
import { PageCommandsSlot, documentOpenCommands } from "../commands/PageCommandsSlot";
import type { MenuCommand, PageCommands } from "../commands/types";
import { budgetUsage } from "./BudgetPlanList";
import type { BudgetLayoutField, Line, PlanView } from "./types";

type BudgetTab = "monthly" | "accounts";

type Props = {
  selected: PlanView;
  draft: boolean;
  admin: boolean;
  currencyMismatch: boolean;
  baseCurrency: string;
  visibleFields: BudgetLayoutField[];
  controlsLocked: boolean;
  busy: boolean;
  onEdit: (plan: PlanView) => void;
  onApprove: () => void;
  onClose: () => void;
  onNew: () => void;
  onRefresh: () => void;
  /** Page error / notice, shown under the surface header. */
  messages?: ReactNode;
  money: (amount: number, currency?: string) => string;
};

export default function BudgetDetail({
  selected,
  draft,
  admin,
  currencyMismatch,
  baseCurrency,
  visibleFields,
  controlsLocked,
  busy,
  onEdit,
  onApprove,
  onClose,
  onNew,
  onRefresh,
  messages,
  money,
}: Props) {
  const [tab, setTab] = useState<BudgetTab>("monthly");
  const approved = isApproved(selected.plan.status);
  const plan = selected.plan;
  const usage = budgetUsage(plan, baseCurrency);
  const variance = plan.currencyCode === baseCurrency ? plan.actualTotal - plan.plannedTotal : null;
  // Same conditions as the former header buttons (draft, firma yöneticisi, base currency, not busy).
  const actionReason = !admin
    ? "Bütçe taslağını yalnız firma yöneticisi düzenler ve onaylar"
    : !draft
      ? "Onaylı bütçe değiştirilemez"
      : currencyMismatch
        ? "Senaryo güncel baz para biriminde değil"
        : controlsLocked
          ? "İşlem sürüyor…"
          : undefined;
  const more: MenuCommand[] = [
    { id: "budget-edit", label: "Düzenle", disabledReason: actionReason, run: () => onEdit(selected) },
    {
      id: "budget-approve",
      label: busy ? "Onaylanıyor…" : "Onayla",
      disabledReason: actionReason ?? (selected.lines.length === 0 ? "Satırı olmayan taslak onaylanamaz" : undefined),
      run: onApprove,
    },
  ];
  const commands: PageCommands = {
    ...documentOpenCommands(onRefresh),
    new: admin ? { disabledReason: controlsLocked ? "İşlem sürüyor…" : undefined, run: onNew } : { disabledReason: "Bütçe taslağını yalnız firma yöneticisi oluşturur" },
    save: { disabledReason: "Düzenlemek için İşlemler › Düzenle" },
    delete: { disabledReason: "Bütçe senaryosu silinemez" },
    more,
  };
  return (
    <>
    <PageCommandsSlot commands={commands} />
    <DocumentSurface
      variant="detail"
      className="budget-detail"
      title="Bütçe senaryosu"
      eyebrow="Bütçe senaryosu"
      code={plan.name}
      status={approved ? { label: "Onaylı", tone: "success" } : { label: "Taslak", tone: "warning" }}
      meta={
        <span>
          {plan.fiscalYear} · {plan.currencyCode} ·{" "}
          {approved
            ? `Onaylandı${plan.approvedAt ? ` (${plan.approvedAt.slice(0, 10).split("-").reverse().join(".")})` : ""}`
            : "Onay için taslağı oluşturan dışında bir firma yöneticisi gerekir"}
        </span>
      }
      onClose={onClose}
      hints={["Alt+İ işlemler"]}
      footerStatus={
        <span>
          <span>{`${selected.lines.length} satır`}</span> · <span>Plan</span> <b>{money(plan.plannedTotal, plan.currencyCode)}</b>
        </span>
      }
    >
      {messages}
      <DetailTiles
        label="Bütçe özeti"
        items={[
          { label: "Plan", value: money(plan.plannedTotal, plan.currencyCode), hint: <span>{`${plan.fiscalYear} · ${plan.lineCount} satır`}</span> },
          {
            label: "Yevmiye gerçekleşeni",
            value: money(plan.actualTotal, baseCurrency || plan.currencyCode),
            progress: usage === null ? undefined : Math.min(1, Math.max(0, usage)),
            hint: usage === null ? undefined : <span>{`Planın %${(usage * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} gerçekleşti`}</span>,
          },
          {
            label: "Fark (gerçekleşen − plan)",
            value: variance === null ? "—" : money(variance, baseCurrency),
            tone: variance !== null && variance < 0 ? "warning" : "default",
            hint: <span>{variance === null ? "Para birimleri farklı; fark hesaplanmaz" : "Satır bazında yön için tabloya bakın"}</span>,
          },
        ]}
      />
      <div className="dd-box budget-detail-box">
      <DetailTabs<BudgetTab>
        label="Bütçe ayrıntıları"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "monthly", label: "Aylık karşılaştırma", count: selected.lines.length },
          { key: "accounts", label: "Hesap bazında", count: new Set(selected.lines.map((line) => line.accountId)).size },
        ]}
      />
      <div className="cf-tabbody" role="tabpanel">
      {currencyMismatch && (
        <div className="budget-currency-warning" role="status">
          <strong>Para birimi uyumsuzluğu</strong>
          <span>
            Bu senaryo {selected.plan.currencyCode} ile oluşturulmuş; firmanın
            güncel baz para birimi {baseCurrency}. Plan tutarları{" "}
            {selected.plan.currencyCode}, yevmiye gerçekleşenleri {baseCurrency}{" "}
            cinsindedir ve aralarında kur çevrimi yapılmaz. Fark gösterilmez. Bu
            senaryo düzenlenemez veya onaylanamaz; güncel baz para biriminde
            yeni bir taslak oluşturun.
          </span>
        </div>
      )}
      {selected.lines.length === 0 ? (
        <div className="budget-state budget-empty">
          <strong>Bu senaryoda bütçe satırı yok</strong>
          <span>
            {draft && admin && !currencyMismatch
              ? "Taslağı düzenleyip satır ekleyebilirsiniz."
              : "Senaryo henüz herhangi bir bütçe satırı içermiyor."}
          </span>
          {draft && admin && !currencyMismatch && (
            <button
              type="button"
              className="secondary"
              onClick={() => onEdit(selected)}
              disabled={controlsLocked}
            >
              Taslağı düzenle
            </button>
          )}
        </div>
      ) : tab === "accounts" ? (
        <AccountSummary selected={selected} baseCurrency={baseCurrency} currencyMismatch={currencyMismatch} money={money} />
      ) : (
        <div className="ledger-list budget-ledger-wrap">
          <AdvancedDataGrid
            className="customer-table budget-ledger"
            gridId="finance-budget-scenarios"
            {...screenViewGridDefaults(visibleFields)}
          >
            <thead>
              <tr>
                {visibleFields.map((field) => (
                  <th key={field.key} scope="col">
                    {field.key === "plannedAmount"
                      ? `${field.label} (${selected.plan.currencyCode})`
                      : field.key === "actualAmount"
                        ? `${field.label} (${baseCurrency})`
                        : field.key === "variance"
                          ? `${field.label}${currencyMismatch ? " (hesaplanmıyor)" : ` (${baseCurrency})`}`
                          : field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selected.lines.map((line, index) => {
                const variance = line.variance;
                const favorable =
                  variance !== null &&
                  variance !== undefined &&
                  (line.statementSection === "Revenue"
                    ? variance >= 0
                    : variance <= 0);
                return (
                  <tr
                    key={
                      line.id ||
                      `${line.accountId}-${line.periodStart}-${index}`
                    }
                  >
                    {visibleFields.map((field) => {
                      const value = getLineValue(
                        field,
                        line,
                        selected.plan.currencyCode,
                        baseCurrency,
                        money,
                      );
                      return (
                        <td
                          key={field.key}
                          data-label={field.label}
                          className={
                            field.key === "variance" && variance != null
                              ? favorable
                                ? "positive"
                                : "negative"
                              : undefined
                          }
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </AdvancedDataGrid>
        </div>
      )}
      </div>
      </div>
    </DocumentSurface>
    </>
  );
}

/** Plan, actual and variance per account over the whole fiscal year. */
function AccountSummary({
  selected,
  baseCurrency,
  currencyMismatch,
  money,
}: {
  selected: PlanView;
  baseCurrency: string;
  currencyMismatch: boolean;
  money: Props["money"];
}) {
  const rows = new Map<string, { code: string; name: string; section?: string; planned: number; actual: number }>();
  for (const line of selected.lines) {
    const row = rows.get(line.accountId) ?? {
      code: line.accountCode || "—",
      name: line.accountName || "",
      section: line.statementSection,
      planned: 0,
      actual: 0,
    };
    row.planned += line.plannedAmount;
    row.actual += line.actualAmount ?? 0;
    rows.set(line.accountId, row);
  }
  return (
    <div className="table-scroll budget-account-summary">
      <table>
        <thead>
          <tr>
            <th scope="col">Hesap</th>
            <th scope="col">Tür</th>
            <th scope="col" className="amount">{`Plan (${selected.plan.currencyCode})`}</th>
            <th scope="col" className="amount">{`Gerçekleşen (${baseCurrency})`}</th>
            <th scope="col" className="amount">Fark</th>
            <th scope="col" className="amount">Gerçekleşme</th>
          </tr>
        </thead>
        <tbody>
          {[...rows.values()]
            .sort((a, b) => a.code.localeCompare(b.code, "tr"))
            .map((row) => {
              const variance = currencyMismatch ? null : row.actual - row.planned;
              const favorable =
                variance !== null && (row.section === "Revenue" ? variance >= 0 : variance <= 0);
              return (
                <tr key={row.code}>
                  <td>
                    <b>{row.code}</b>
                    <small className="cell-subtitle">{row.name}</small>
                  </td>
                  <td>{row.section === "Revenue" ? "Gelir" : row.section === "Expense" ? "Gider" : "—"}</td>
                  <td className="amount">{money(row.planned, selected.plan.currencyCode)}</td>
                  <td className="amount">{money(row.actual, baseCurrency)}</td>
                  <td className={`amount${variance === null ? "" : favorable ? " positive" : " negative"}`}>
                    {variance === null ? "—" : money(variance, baseCurrency)}
                  </td>
                  <td className="amount">
                    {currencyMismatch || row.planned <= 0
                      ? "—"
                      : `%${((row.actual / row.planned) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function getLineValue(
  field: BudgetLayoutField,
  line: Line,
  planCurrency: string,
  baseCurrency: string,
  money: Props["money"],
) {
  switch (field.key) {
    case "periodStart":
      return formatPeriod(line.periodStart);
    case "account":
      return (
        <>
          <b>{line.accountCode || "—"}</b>
          <small className="cell-subtitle">{line.accountName}</small>
        </>
      );
    case "section":
      return line.statementSection === "Revenue"
        ? "Gelir"
        : line.statementSection === "Expense"
          ? "Gider"
          : "—";
    case "plannedAmount":
      return money(line.plannedAmount, planCurrency);
    case "actualAmount":
      return money(line.actualAmount ?? 0, baseCurrency);
    case "variance":
      return line.variance == null ? "—" : money(line.variance, baseCurrency);
    case "notes":
      return line.notes || "—";
    default:
      return "—";
  }
}

function isApproved(status: PlanView["plan"]["status"]) {
  return status === 2 || status === "Approved";
}

function formatPeriod(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("tr-TR", {
        month: "long",
        year: "numeric",
      }).format(date);
}
