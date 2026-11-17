import type { ReactNode } from "react";
import { BadgePercent } from "lucide-react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { formatDate } from "../../document-detail/DocumentDetailLayout";
import type { BulkAction } from "../../list-page/BulkActionBar";
import { ListFooter } from "../../list-page/ListFooter";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import {
  campaignState,
  campaignStateLabels,
  campaignStateTones,
  endingSoonDays,
  type CampaignState,
} from "../campaignState";
import type { Campaign, CampaignScreenField } from "./types";

// Sized for the left half of the definition screen at 1440; saved layouts keep their own widths.
const WIDTHS: Record<string, number> = {
  code: 88,
  name: 136,
  discountPercent: 60,
  effectiveFrom: 86,
  effectiveThrough: 86,
  status: 96,
  applicationCount: 68,
};

/** Today's state as a status tag; a campaign valid today that ends within a week says how many days are left. */
export function CampaignStatusTag({ campaign, today }: { campaign: Campaign; today: string }) {
  const soon = endingSoonDays(campaign, today);
  if (soon !== null) return <StatusTag tone="warn">{soon === 0 ? "Bugün bitiyor" : `${soon} gün kaldı`}</StatusTag>;
  const state = campaignState(campaign, today);
  return <StatusTag tone={campaignStateTones[state]}>{campaignStateLabels[state]}</StatusTag>;
}

type Props = {
  fields: CampaignScreenField[];
  campaigns: Campaign[];
  /** Rows after the search and the status chips. */
  visible: Campaign[];
  today: string;
  search: string;
  stateFilter: CampaignState | "";
  currentId: string | null;
  admin: boolean;
  onSearchChange: (value: string) => void;
  onStateFilterChange: (value: CampaignState | "") => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onCurrentRowChange: (key: string | null) => void;
  onSelectionChange: (keys: string[]) => void;
  selectedCount: number;
  bulkActions: BulkAction[];
  toolsSlot: HTMLDivElement | null;
  toolsSlotRef: (element: HTMLDivElement | null) => void;
  /** Shown in the empty list (first campaign). */
  emptyAction?: ReactNode;
};

/** Left half of the Kampanyalar definition screen: search, status chips, the compact list and its footer. */
export function CampaignDefinitionList(p: Props) {
  const counts = { current: 0, planned: 0, expired: 0, inactive: 0 } as Record<CampaignState, number>;
  for (const campaign of p.campaigns) counts[campaignState(campaign, p.today)] += 1;
  const cell = (field: CampaignScreenField, campaign: Campaign): ReactNode => {
    switch (field.key) {
      case "code":
        return <span className="nx-code">{campaign.code}</span>;
      case "name":
        return campaign.name;
      case "discountPercent":
        return `%${campaign.discountPercent.toLocaleString("tr-TR")}`;
      case "effectiveFrom":
        return formatDate(campaign.effectiveFrom);
      case "effectiveThrough":
        return formatDate(campaign.effectiveThrough);
      case "status":
        return <CampaignStatusTag campaign={campaign} today={p.today} />;
      case "applicationCount":
        return campaign.applicationCount.toLocaleString("tr-TR");
      default:
        return null;
    }
  };
  const numeric = (key: string) => key === "discountPercent" || key === "applicationCount";
  return (
    <>
      <ListToolbar
        search={p.search}
        onSearchChange={p.onSearchChange}
        searchLabel="Kampanya ara"
        searchPlaceholder="Kod veya kampanya adı"
        onRefresh={p.onRefresh}
        refreshLabel="Kampanyaları yenile"
        toolsSlotRef={p.toolsSlotRef}
      >
        <ListChipGroup
          label="Durum"
          value={p.stateFilter}
          allowClear
          onChange={(value) => p.onStateFilterChange(value as CampaignState | "")}
          options={(Object.keys(campaignStateLabels) as CampaignState[]).map((state) => ({
            value: state,
            label: campaignStateLabels[state],
            count: counts[state],
          }))}
        />
      </ListToolbar>
      <section className="panel kmp-def-grid list-v2-list">
        {p.visible.length > 0 ? (
          <div className="customer-table-wrap">
            <AdvancedDataGrid
              className="customer-table"
              gridId="sales-promotions-v2"
              {...screenViewGridDefaults(p.fields, (field) => WIDTHS[field.key])}
              externalPagination
              hideSearch
              enableRowSelection={false}
              selectable
              currentRowKey={p.currentId}
              onCurrentRowChange={p.onCurrentRowChange}
              onSelectionChange={p.onSelectionChange}
              bulkActions={p.bulkActions}
              toolbarContainer={p.toolsSlot}
              hideExport
              aria-label="Kampanya listesi"
            >
              <thead>
                <tr>
                  {p.fields.map((field) => (
                    <th key={field.key} className={numeric(field.key) ? "nx-num" : undefined}>
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.visible.map((campaign) => (
                  <tr key={campaign.id}>
                    {p.fields.map((field) => (
                      <td key={field.key} className={numeric(field.key) ? "nx-num" : undefined}>
                        {cell(field, campaign)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </AdvancedDataGrid>
          </div>
        ) : (
          <div className="kmp-empty">
            <span className="kmp-empty-icon">
              <BadgePercent size={19} />
            </span>
            <div>
              <b>{p.campaigns.length ? "Filtrelerle eşleşen kampanya yok." : "Henüz kampanya tanımlanmadı."}</b>
              <p>
                {p.campaigns.length
                  ? "Arama ifadesini veya durum filtresini değiştirin."
                  : p.admin
                    ? "İlk kampanyayı tarih aralığı ve indirim oranıyla oluşturun."
                    : "Kampanyalar firma yöneticisi tarafından tanımlanır."}
              </p>
            </div>
            {p.campaigns.length ? (
              <button type="button" className="secondary small-button" onClick={p.onClearFilters}>
                Filtreleri temizle
              </button>
            ) : (
              p.emptyAction
            )}
          </div>
        )}
        <ListFooter hints="↑↓ listede gez · Tab forma geç · Ctrl+S kaydet · Esc listeye dön · F2 yeni kampanya">
          {p.selectedCount > 0 && (
            <span>
              <span>{p.selectedCount}</span> <span>seçili</span>
            </span>
          )}
          <span>
            <span>{p.campaigns.length}</span> <span>kampanya</span> · <span>{counts.current}</span> <span>geçerli</span>
          </span>
        </ListFooter>
      </section>
    </>
  );
}
