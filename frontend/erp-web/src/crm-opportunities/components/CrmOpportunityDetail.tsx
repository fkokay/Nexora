import { StatusTag } from "../../list-page/StatusTag";
import {
  SalesListDetailPanel,
  SalesPanelFacts,
  SalesPanelSection,
  SalesPanelStats,
} from "../../sales/components/SalesListDetailPanel";
import { formatMoney, stageLabels, stages, type Opportunity } from "../types";
import { stageTone } from "../stageTone";

type Props = {
  selected: Opportunity;
  tab: string;
  onTabChange: (tab: string) => void;
  /** Opens the opportunity form (bar Aç / Enter); kapanmış fırsat düzenlenemez. */
  onOpen: () => void;
  openDisabled: boolean;
  onClose: () => void;
  takeFocus?: () => boolean;
};

const dateText = (value: string | null, empty: string) => (value ? new Date(value).toLocaleDateString("tr-TR") : empty);

/**
 * Right-hand panel of CRM Fırsatları (list type, as Satış): code and Aç, name, stage tag, the opportunity's figures
 * and its place in the stage flow. Stage changes and Sil are on the action bar (İşlemler / Sil).
 */
export function CrmOpportunityDetail({ selected, tab, onTabChange, onOpen, openDisabled, onClose, takeFocus }: Props) {
  const tabs = [{ id: "summary", label: "Özet" }, ...(selected.notes ? [{ id: "notes", label: "Not" }] : [])];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "summary";
  const closed = selected.stage === "Won" || selected.stage === "Lost";
  // The flow: İlk temas → Nitelikli → Teklif → Müzakere → Kazanıldı; Kaybedildi replaces Kazanıldı once lost.
  const flow = stages.filter((stage) => (selected.stage === "Lost" ? stage !== "Won" : stage !== "Lost"));
  // Earlier stages count as passed only where the API makes that certain: it moves an opportunity one step at a time
  // (CrmEndpoints.CanTransition: İlk temas → Nitelikli → Teklif → Müzakere → Kazanıldı), so an open or won
  // opportunity has passed every earlier step. Kaybedildi can follow any open stage and no stage history is kept,
  // so for a lost opportunity only Kaybedildi is marked.
  const reached = selected.stage === "Lost" ? -1 : flow.indexOf(selected.stage as (typeof stages)[number]);
  return (
    <SalesListDetailPanel
      label="Fırsat özeti"
      code={selected.code}
      title={selected.name}
      tags={
        <>
          <StatusTag tone={stageTone(selected.stage)}>{stageLabels[selected.stage] || selected.stage}</StatusTag>
          {closed && <StatusTag tone="off">Kapandı</StatusTag>}
        </>
      }
      tabs={tabs}
      tab={activeTab}
      onTabChange={onTabChange}
      onOpen={onOpen}
      openDisabled={openDisabled}
      onClose={onClose}
      takeFocus={takeFocus}
    >
      {activeTab === "notes" ? (
        <p className="crm-ld-notes">{selected.notes}</p>
      ) : (
        <>
          <SalesPanelStats
            items={[
              {
                label: "Tahmini değer",
                value: selected.estimatedValue === null ? "—" : formatMoney(selected.estimatedValue, selected.currencyCode, 2),
              },
              { label: "Kazanma olasılığı", value: `%${selected.probabilityPercent}` },
              { label: "Beklenen kapanış", value: dateText(selected.expectedCloseDate, "Belirtilmedi") },
              {
                label: "Sonraki takip",
                value: selected.nextActivityAt
                  ? new Date(selected.nextActivityAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })
                  : "Planlanmadı",
              },
            ]}
          />
          <SalesPanelFacts items={[{ label: "Müşteri", value: selected.customerName || "Müşteri bağlanmadı" }]} />
          <SalesPanelSection title="Aşama akışı">
            <ol className="sales-ld-chain crm-ld-flow">
              {flow.map((stage, index) => (
                <li
                  key={stage}
                  className={stage === selected.stage ? "is-current" : index < reached ? "is-done" : undefined}
                  aria-current={stage === selected.stage ? "step" : undefined}
                >
                  <span className="sales-ld-chain-text">
                    <span>{stageLabels[stage]}</span>
                  </span>
                  {stage === selected.stage && <StatusTag tone={stageTone(stage)}>Şu an</StatusTag>}
                </li>
              ))}
            </ol>
          </SalesPanelSection>
        </>
      )}
    </SalesListDetailPanel>
  );
}
