import type { ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { DetailTiles } from "../../document-detail/DocumentDetailLayout";
import { DocumentSurface } from "../../document-page/DocumentSurface";
import { PageCommandsSlot, documentOpenCommands } from "../../commands/PageCommandsSlot";
import type { MenuCommand, PageCommands } from "../../commands/types";
import { categories, formatMonth, money, type PlanView } from "../types";

type Props = {
  selected: PlanView;
  draft: boolean;
  admin: boolean;
  busy: boolean;
  onEdit: (plan: PlanView) => void;
  onApprove: () => void;
  onClose: () => void;
  onNew: () => void;
  onRefresh: () => void;
  /** Page error / notice, shown under the surface header. */
  messages?: ReactNode;
};

/**
 * The opened cash budget plan on the detail surface: inflow / outflow / net tiles (the plan's own lines, one currency)
 * and the line table in one card. Düzenle and Onayla are in İşlemler with today's conditions (draft, firma yöneticisi,
 * not busy; Onayla needs a line). The server still requires a different TenantAdmin to approve.
 */
export default function DirectCashBudgetDetail({
  selected,
  draft,
  admin,
  busy,
  onEdit,
  onApprove,
  onClose,
  onNew,
  onRefresh,
  messages,
}: Props) {
  const currency = selected.currencyCode;
  const inflow = selected.lines.filter((line) => line.direction === "Inflow").reduce((sum, line) => sum + line.amount, 0);
  const outflow = selected.lines.filter((line) => line.direction === "Outflow").reduce((sum, line) => sum + line.amount, 0);
  const net = inflow - outflow;
  const actionReason = !admin
    ? "Nakit bütçesini yalnız firma yöneticisi düzenler ve onaylar"
    : !draft
      ? "Onaylı nakit bütçesi değiştirilemez"
      : busy
        ? "İşlem sürüyor…"
        : undefined;
  const more: MenuCommand[] = [
    { id: "cash-budget-edit", label: "Düzenle", disabledReason: actionReason, run: () => onEdit(selected) },
    {
      id: "cash-budget-approve",
      label: busy ? "Onaylanıyor…" : "Onayla",
      disabledReason: actionReason ?? (selected.lines.length === 0 ? "Satırı olmayan taslak onaylanamaz" : undefined),
      run: onApprove,
    },
  ];
  const commands: PageCommands = {
    ...documentOpenCommands(onRefresh),
    new: admin
      ? { disabledReason: busy ? "İşlem sürüyor…" : undefined, run: onNew }
      : { disabledReason: "Nakit bütçesi taslağını yalnız firma yöneticisi oluşturur" },
    save: { disabledReason: "Düzenlemek için İşlemler › Düzenle" },
    delete: { disabledReason: "Nakit bütçesi silinemez" },
    more,
  };
  return (
    <>
      <PageCommandsSlot commands={commands} />
      <DocumentSurface
        variant="detail"
        className="cash-budget-detail"
        title="Nakit bütçesi"
        eyebrow="Doğrudan nakit bütçesi"
        code={selected.name}
        status={draft ? { label: "Taslak", tone: "warning" } : { label: "Onaylı", tone: "success" }}
        meta={
          <span>
            {selected.fiscalYear} · {currency} · Sürüm {selected.revision} ·{" "}
            {draft ? "Taslak · tahminlere dahil edilmez" : `Onaylayan: ${selected.approvedByUserId ?? "—"}`}
          </span>
        }
        onClose={onClose}
        hints={["Alt+İ işlemler"]}
        footerStatus={
          <span>
            <span>{`${selected.lines.length} satır`}</span> · <span>Net</span> <b>{money(net, currency)}</b>
          </span>
        }
      >
        <div className="cash-budget-surface-body">
          {messages}
          <DetailTiles
            label="Nakit bütçesi özeti"
            items={[
              { label: "Planlanan tahsilat", value: money(inflow, currency) },
              { label: "Planlanan ödeme", value: money(outflow, currency) },
              {
                label: "Net nakit değişimi",
                value: money(net, currency),
                tone: net < 0 ? "warning" : "default",
                hint: <span>{`${selected.lines.length} satır · ${currency}`}</span>,
              },
            ]}
          />
          <section className="dd-box cash-budget-lines-box" aria-labelledby="cash-budget-lines-title">
            <header className="cash-budget-box-head">
              <h3 id="cash-budget-lines-title">Aylık nakit satırları</h3>
              {draft && admin && <span>Onay için farklı bir TenantAdmin gerekir.</span>}
            </header>
            <div className="ledger-list" role="region" aria-label="Nakit bütçesi satır tablosu" tabIndex={0}>
              <AdvancedDataGrid enableRowSelection={false} className="customer-table">
                <caption>
                  {selected.name} · {currency} para biriminde planlanan tahsilat ve ödemeler
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Dönem</th>
                    <th scope="col">Tür</th>
                    <th scope="col">Kategori</th>
                    <th scope="col">Açıklama</th>
                    <th scope="col" className="nx-num">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line, index) => (
                    <tr key={line.id ?? index}>
                      <td data-label="Dönem">{formatMonth(line.periodStart)}</td>
                      <td data-label="Tür">{line.direction === "Inflow" ? "Tahsilat" : "Ödeme"}</td>
                      <td data-label="Kategori">
                        {categories.find(([value]) => value === line.category)?.[1] ?? line.category}
                      </td>
                      <td data-label="Açıklama" className="direct-cash-budget-description-cell">
                        {line.description}
                      </td>
                      <td data-label="Tutar" className="nx-num">
                        {money(line.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdvancedDataGrid>
            </div>
          </section>
          {admin && draft && (
            <div className="boundary-note">
              <span>
                Onaylayan kullanıcı, taslağı oluşturan TenantAdmin’den farklı olmalıdır. Sunucu bunu doğrular. Bu onay
                yalnızca tahmin planını etkinleştirir; finansal kayıt oluşturmaz.
              </span>
            </div>
          )}
        </div>
      </DocumentSurface>
    </>
  );
}
