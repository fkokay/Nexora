import { useState } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { ListToolbar } from "../../list-page/ListToolbar";
import type { Campaign, CampaignScreenField } from "./types";

type Props = {
  campaigns: Campaign[];
  visibleCampaigns: Campaign[];
  selectedCampaign: Campaign | null;
  selectedCampaignId: string;
  fields: CampaignScreenField[];
  query: string;
  role: string;
  busy: boolean;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onSelect: (campaignId: string) => void;
  onEdit: (campaign: Campaign) => void;
  onToggleStatus: (campaign: Campaign) => void;
};

export default function CampaignsSection({
  campaigns,
  visibleCampaigns,
  selectedCampaign,
  selectedCampaignId,
  fields,
  query,
  role,
  busy,
  onQueryChange,
  onRefresh,
  onSelect,
  onEdit,
  onToggleStatus,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  // The code is written under the name, so its own column is dropped while the name is shown.
  const nameVisible = fields.some((field) => field.key === "name" && field.visible);
  const visibleFields = fields.filter(
    (field) => field.visible && !(nameVisible && field.key === "code"),
  );
  const campaignCell = (campaign: Campaign, key: string) => {
    switch (key) {
      case "code":
        return <b>{campaign.code}</b>;
      case "name":
        return (
          <>
            <b>{campaign.name}</b>
            <small className="cell-subtitle list-v2-name-code">{campaign.code}</small>
          </>
        );
      case "discountPercent":
        return `%${campaign.discountPercent}`;
      case "effectiveFrom":
        return campaign.effectiveFrom;
      case "effectiveThrough":
        return campaign.effectiveThrough;
      case "status":
        return campaign.isActive ? "Aktif" : "Pasif";
      case "applicationCount":
        return campaign.applicationCount;
      default:
        return null;
    }
  };

  return (
    <>
    <ListToolbar
      search={query}
      onSearchChange={onQueryChange}
      searchLabel="Kampanya ara"
      searchPlaceholder="Kod veya kampanya adı"
      toolsSlotRef={setToolsSlot}
      onRefresh={onRefresh}
    />
    <dl className="sales-lv2-facts" aria-label="Kampanya özeti">
      <div>
        <dt>Etkin kampanya</dt>
        <dd>{campaigns.filter((campaign) => campaign.isActive).length}</dd>
      </div>
      <div>
        <dt>Toplam uygulama</dt>
        <dd>{campaigns.reduce((sum, campaign) => sum + campaign.applicationCount, 0).toLocaleString("tr-TR")}</dd>
      </div>
    </dl>
    <section className="panel sales-campaign-workbench list-v2-list" aria-label="Kampanya listesi">
      <div className="sales-campaign-layout">
        <div className="table-scroll">
          <AdvancedDataGrid
            hideSearch
            toolbarContainer={toolsSlot}
            enableRowSelection={false}
            gridId="sales-campaigns-v2"
            initialColumnWidths={visibleFields.map(
              (field) =>
                ({
                  code: 100,
                  name: 140,
                  discountPercent: 80,
                  effectiveFrom: 100,
                  effectiveThrough: 100,
                  status: 85,
                  applicationCount: 125,
                })[field.key] ?? 90,
            )}
            minimumColumnWidths={visibleFields.map(
              (field) =>
                ({
                  code: 80,
                  name: 110,
                  discountPercent: 65,
                  effectiveFrom: 80,
                  effectiveThrough: 80,
                  status: 70,
                  applicationCount: 100,
                })[field.key] ?? 70,
            )}
          >
            <thead>
              <tr>
                {visibleFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleCampaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  aria-selected={campaign.id === selectedCampaignId}
                  onClick={() => onSelect(campaign.id)}
                >
                  {visibleFields.map((field) => (
                    <td key={field.key}>{campaignCell(campaign, field.key)}</td>
                  ))}
                </tr>
              ))}
              {visibleCampaigns.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, visibleFields.length)}>
                    {query
                      ? "Aramayla eşleşen kampanya yok."
                      : "Henüz kampanya tanımlanmadı."}
                  </td>
                </tr>
              )}
            </tbody>
          </AdvancedDataGrid>
        </div>
        {selectedCampaign && (
          <aside className="sales-campaign-detail">
            <div className="list-v2-detail-head">
              <div>
                <span className="list-v2-kind">SEÇİLİ KAMPANYA</span>
                <h2>{selectedCampaign.name}</h2>
              </div>
              {role === "TenantAdmin" && (
                <div className="list-v2-detail-head-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => onEdit(selectedCampaign)}
                  >
                    Düzenle
                  </button>
                </div>
              )}
            </div>
            <div className="list-v2-detail-meta">
              <span className="list-v2-detail-code">{selectedCampaign.code}</span>
              <span
                className={`list-v2-status${selectedCampaign.isActive ? " is-active" : ""}`}
              >
                <i />
                {selectedCampaign.isActive ? "Aktif" : "Pasif"}
              </span>
            </div>
            <dl className="list-v2-facts">
              <div>
                <dt>İndirim</dt>
                <dd>%{selectedCampaign.discountPercent}</dd>
              </div>
              <div>
                <dt>Geçerlilik</dt>
                <dd>
                  {selectedCampaign.effectiveFrom} –{" "}
                  {selectedCampaign.effectiveThrough}
                </dd>
              </div>
              <div>
                <dt>Uygulama sayısı</dt>
                <dd>{selectedCampaign.applicationCount}</dd>
              </div>
            </dl>
            {role === "TenantAdmin" && (
              <div className="list-v2-detail-foot">
                <button
                  type="button"
                  className={selectedCampaign.isActive ? "is-danger" : undefined}
                  disabled={busy}
                  onClick={() => onToggleStatus(selectedCampaign)}
                >
                  {busy
                    ? "Kaydediliyor…"
                    : selectedCampaign.isActive
                      ? "Pasifleştir"
                      : "Etkinleştir"}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
    </>
  );
}
