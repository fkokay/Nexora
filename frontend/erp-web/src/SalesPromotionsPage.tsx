import { useCallback, useEffect, useRef, useState } from "react";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { authenticatedFetch } from "./authApi";
import { addLocalCalendarDays, localDateString } from "./dateUtils";
import type { FormEvent } from "react";
import { ListPageHeader } from "./list-page/ListPageHeader";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./finance-hub.css";
import "./credit-facilities.css";
import "./sales-promotions.css";
import "./sales/sales-list-v2.css";
import CampaignPerformanceSection from "./sales-promotions/components/CampaignPerformanceSection";
import {
  CampaignRegister,
  ENDING_SOON_DAYS,
  campaignState,
  campaignStateLabel,
  daysBetween,
  type CampaignState,
  type CampaignTab,
} from "./sales-promotions/components/CampaignRegister";
import { formatAmount } from "./document-detail/DocumentDetailLayout";
import CampaignDialog from "./sales-promotions/components/CampaignDialog";
import type {
  Campaign,
  PerformancePage,
  PerformanceScreenField,
  Quote,
} from "./sales-promotions/components/types";
import { problemDetail } from "./erpApi";

const defaultPerformanceScreenFields: PerformanceScreenField[] = [
  { key: "campaign", label: "Kampanya", visible: true, position: 0 },
  { key: "applications", label: "Uygulama", visible: true, position: 1 },
  {
    key: "appliedQuotes",
    label: "Uygulanan teklifler",
    visible: true,
    position: 2,
  },
  {
    key: "discountTotals",
    label: "İndirim tutarı",
    visible: true,
    position: 3,
  },
  {
    key: "linkedOrders",
    label: "Bağlantılı sipariş",
    visible: true,
    position: 4,
  },
  {
    key: "linkedOrderTotals",
    label: "Sipariş toplamı",
    visible: true,
    position: 5,
  },
];
const performanceScreenKeys = new Set(
  defaultPerformanceScreenFields.map((field) => field.key),
);
type QuotePage = {
  items: Quote[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type Props = { token: string; role: string; onBack?: () => void };

async function request<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || problemDetail(body) || message;
    } catch {}
    throw new Error(message);
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

export default function SalesPromotionsPage({ token, role, onBack }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [quotes, setQuotes] = useState<Quote[]>([]);
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [percent, setPercent] = useState("10"),
    [from, setFrom] = useState(localDateString()),
    [through, setThrough] = useState(addLocalCalendarDays(30));
  const [campaignId, setCampaignId] = useState(""),
    [quoteId, setQuoteId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const reportExportRef = useRef<GridExportActions | null>(null);
  const [campaignTab, setCampaignTab] = useState<CampaignTab>("summary");
  const [stateFilter, setStateFilter] = useState<CampaignState | "">("");
  const [overview, setOverview] = useState<PerformancePage | null>(null);
  const [performanceScreenFields, setPerformanceScreenFields] = useState(
    defaultPerformanceScreenFields,
  );
  const [campaignQuery, setCampaignQuery] = useState("");
  const [performance, setPerformance] = useState<PerformancePage | null>(null),
    [reportQuery, setReportQuery] = useState(""),
    [reportFrom, setReportFrom] = useState(""),
    [reportThrough, setReportThrough] = useState(""),
    [reportPage, setReportPage] = useState(1);
  const load = useCallback(async () => {
    const [campaignRows, quotePage, overviewPage] = await Promise.all([
      request<Campaign[]>("/api/sales/promotions/", token),
      request<QuotePage>("/api/sales/quotes/?page=1&pageSize=100", token),
      // All-time results per campaign for the tiles and the selected campaign (100 is the API page cap).
      request<PerformancePage>(
        "/api/sales/quotes/campaign-performance?page=1&pageSize=100",
        token,
      ),
    ]);
    setCampaigns(campaignRows);
    setOverview(overviewPage);
    setQuotes(
      quotePage.items.filter((x) => x.status === "Draft" && x.lineCount > 0),
    );
  }, [token]);
  const loadPerformance = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(reportPage),
      pageSize: "25",
    });
    if (reportQuery.trim()) params.set("q", reportQuery.trim());
    if (reportFrom) params.set("from", reportFrom);
    if (reportThrough) params.set("through", reportThrough);
    setPerformance(
      await request<PerformancePage>(
        `/api/sales/quotes/campaign-performance?${params}`,
        token,
      ),
    );
  }, [token, reportQuery, reportFrom, reportThrough, reportPage]);
  useEffect(() => {
    void load().catch((e) => setError((e as Error).message));
  }, [load]);
  useEffect(() => {
    let current = true;
    void request<{ fields?: PerformanceScreenField[] }>(
      "/api/screen-views/sales-campaign-performance/active",
      token,
    )
      .then((view) => {
        if (!current || !Array.isArray(view.fields)) return;
        const allowed = view.fields.filter((field) =>
          performanceScreenKeys.has(field.key),
        );
        setPerformanceScreenFields(
          defaultPerformanceScreenFields
            .map((fallback) => ({
              ...fallback,
              ...(allowed.find((field) => field.key === fallback.key) ?? {}),
            }))
            .sort((a, b) => a.position - b.position),
        );
      })
      .catch(() => {
        if (current) setPerformanceScreenFields(defaultPerformanceScreenFields);
      });
    return () => {
      current = false;
    };
  }, [token]);
  useEffect(() => {
    if (!reportOpen) return;
    void loadPerformance().catch((e) => setError((e as Error).message));
  }, [loadPerformance, reportOpen]);
  async function refreshAll() {
    setError("");
    try {
      await load();
      if (reportOpen) await loadPerformance();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function openCreate() {
    setEditingCampaign(null);
    setCode("");
    setName("");
    setPercent("10");
    setFrom(localDateString());
    setThrough(addLocalCalendarDays(30));
    setError("");
    setCreateOpen(true);
  }
  function openEdit(campaign: Campaign) {
    setEditingCampaign(campaign);
    setCode(campaign.code);
    setName(campaign.name);
    setPercent(String(campaign.discountPercent));
    setFrom(campaign.effectiveFrom);
    setThrough(campaign.effectiveThrough);
    setError("");
    setCreateOpen(true);
  }
  async function saveCampaign(e: FormEvent): Promise<boolean> {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = JSON.stringify({
        code,
        name,
        discountPercent: Number(percent),
        effectiveFrom: from,
        effectiveThrough: through,
        isActive: editingCampaign?.isActive ?? true,
      });
      const row = await request<Campaign>(
        editingCampaign
          ? `/api/sales/promotions/${editingCampaign.id}`
          : "/api/sales/promotions/",
        token,
        { method: editingCampaign ? "PUT" : "POST", body },
      );
      setCampaigns((current) =>
        editingCampaign
          ? current.map((item) => (item.id === row.id ? row : item))
          : [row, ...current],
      );
      setCampaignId(row.id);
      setNotice(
        editingCampaign
          ? "Kampanya güncellendi."
          : "Kampanya oluşturuldu. Teklif tarihinin kampanya aralığında olması gerekir.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function toggleCampaignStatus(campaign: Campaign) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const row = await request<Campaign>(
        `/api/sales/promotions/${campaign.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            code: campaign.code,
            name: campaign.name,
            discountPercent: campaign.discountPercent,
            effectiveFrom: campaign.effectiveFrom,
            effectiveThrough: campaign.effectiveThrough,
            isActive: !campaign.isActive,
          }),
        },
      );
      setCampaigns((current) =>
        current.map((item) => (item.id === row.id ? row : item)),
      );
      setNotice(
        row.isActive
          ? "Kampanya yeniden etkinleştirildi."
          : "Kampanya pasifleştirildi.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply(e: FormEvent, campaignId: string) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{
        discountAmount: number;
        grandTotal: number;
      }>("/api/sales/promotions/" + campaignId + "/apply", token, {
        method: "POST",
        body: JSON.stringify({ quoteId }),
      });
      setNotice(
        `Kampanya uygulandı. Ek indirim: ${result.discountAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} · Yeni toplam: ${result.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`,
      );
      setQuoteId("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const today = localDateString();
  const normalizedQuery = campaignQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleCampaigns = campaigns.filter(
    (item) =>
      (!stateFilter || campaignState(item, today) === stateFilter) &&
      `${item.code} ${item.name}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedQuery),
  );
  const selectedCampaign =
    visibleCampaigns.find((item) => item.id === campaignId) ??
    visibleCampaigns[0] ??
    null;
  const performanceById = new Map(
    (overview?.items ?? []).map((item) => [item.campaignId, item]),
  );
  const current = campaigns.filter(
    (item) => campaignState(item, today) === "current",
  );
  const endingSoon = current.filter(
    (item) => daysBetween(today, item.effectiveThrough) <= ENDING_SOON_DAYS,
  );
  const appliedQuotes = (overview?.items ?? []).reduce(
    (sum, item) => sum + item.appliedQuotes,
    0,
  );
  const linkedOrders = (overview?.items ?? []).reduce(
    (sum, item) => sum + item.linkedOrders,
    0,
  );
  const discountByCurrency = new Map<string, number>();
  for (const item of overview?.items ?? [])
    for (const total of item.discountTotals)
      discountByCurrency.set(
        total.currencyCode,
        (discountByCurrency.get(total.currencyCode) ?? 0) + total.amount,
      );
  async function exportCampaigns() {
    try {
      const XLSX = await import("xlsx");
      const rows = [
        ["Kod", "Kampanya", "İndirim %", "Başlangıç", "Bitiş", "Durum", "Uygulama"],
        ...visibleCampaigns.map((item) => [
          item.code,
          item.name,
          item.discountPercent,
          item.effectiveFrom,
          item.effectiveThrough,
          campaignStateLabel(campaignState(item, today)),
          item.applicationCount,
        ]),
      ];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Kampanyalar");
      XLSX.writeFile(book, `kampanyalar-${today}.xlsx`);
    } catch {
      setError("XLSX dosyası oluşturulamadı.");
    }
  }
  // Action bar. In the campaign list the page exports its own XLSX; in the performance report the report grid's
  // Excel export (grid fallback) and its ListToolbar's refresh/filter apply.
  const commands: PageCommands = {};
  if (role === "TenantAdmin" && !createOpen) commands.new = { primary: true, run: openCreate };
  const more: MenuCommand[] = [
    {
      id: "campaign-report",
      label: reportOpen ? "Kampanya listesi" : "Performans raporu",
      run: () => setReportOpen((open) => !open),
    },
  ];
  if (reportOpen) {
    more.push(csvExportCommand(reportExportRef));
  } else {
    if (role === "TenantAdmin" && selectedCampaign && !createOpen)
      commands.open = { disabledReason: busy ? "Kaydediliyor…" : undefined, run: () => openEdit(selectedCampaign) };
    commands.refresh = { run: () => void refreshAll() };
    commands.export = {
      disabledReason: visibleCampaigns.length === 0 ? "Dışa aktarılacak kampanya yok." : undefined,
      run: () => exportCampaigns(),
    };
  }
  commands.more = more;
  return (
    <main className="sales-promotions-page list-v2 fh-page cf-page">
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Kampanyalar ve promosyonlar"
        description="Tarih aralığına bağlı yüzde indirimleri taslak satış tekliflerine uygulayın."
        count={reportOpen ? (performance?.totalCount ?? null) : campaigns.length}
        countLabel="kampanya"
      >
        {onBack && (
          <button type="button" className="secondary" onClick={onBack}>
            Satışa dön
          </button>
        )}
      </ListPageHeader>
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
          <button
            type="button"
            aria-label="Bildirimi kapat"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {reportOpen ? (
        <CampaignPerformanceSection
          performance={performance}
          fields={performanceScreenFields}
          query={reportQuery}
          from={reportFrom}
          through={reportThrough}
          page={reportPage}
          onQueryChange={(value) => {
            setReportQuery(value);
            setReportPage(1);
          }}
          onFromChange={(value) => {
            setReportFrom(value);
            setReportPage(1);
          }}
          onThroughChange={(value) => {
            setReportThrough(value);
            setReportPage(1);
          }}
          onPageChange={setReportPage}
          onRefresh={() =>
            void loadPerformance().catch((e) => setError((e as Error).message))
          }
          exportActionsRef={reportExportRef}
        />
      ) : (
        <>
          <section className="fh-tiles" aria-label="Kampanya özeti">
            <div className="fh-tile">
              <span className="fh-tile-label">Etkin kampanya</span>
              <span className="fh-tile-value">{current.length}</span>
              <span className="fh-tile-hint">bugün geçerli</span>
            </div>
            <div className={`fh-tile${endingSoon.length ? " is-warning" : ""}`}>
              <span className="fh-tile-label">{`${ENDING_SOON_DAYS} gün içinde bitiyor`}</span>
              <span className="fh-tile-value">{endingSoon.length}</span>
              <span className="fh-tile-hint">
                {endingSoon.length
                  ? endingSoon.map((item) => item.code).join(", ")
                  : "Yakında biten kampanya yok"}
              </span>
            </div>
            <div className="fh-tile">
              <span className="fh-tile-label">Uygulanan teklif</span>
              <span className="fh-tile-value">{appliedQuotes.toLocaleString("tr-TR")}</span>
              <span className="fh-tile-hint">{`${linkedOrders.toLocaleString("tr-TR")} siparişe dönüştü`}</span>
            </div>
            <div className="fh-tile">
              <span className="fh-tile-label">Verilen indirim</span>
              <span className={`fh-tile-value${discountByCurrency.size ? "" : " is-muted-value"}`}>
                {discountByCurrency.size
                  ? [...discountByCurrency.entries()].map(([code, amount]) => (
                      <span key={code}>{formatAmount(amount, code)}</span>
                    ))
                  : "—"}
              </span>
              <span className="fh-tile-hint">Tüm kampanyalar</span>
            </div>
          </section>
          <CampaignRegister
            campaigns={campaigns}
            visibleCampaigns={visibleCampaigns}
            selected={selectedCampaign}
            performanceById={performanceById}
            quotes={quotes}
            today={today}
            tab={campaignTab}
            search={campaignQuery}
            stateFilter={stateFilter}
            admin={role === "TenantAdmin"}
            busy={busy}
            quoteId={quoteId}
            onSearchChange={setCampaignQuery}
            onStateFilterChange={setStateFilter}
            onRefresh={() => void refreshAll()}
            onSelect={(campaign) => {
              setCampaignId(campaign.id);
              setQuoteId("");
            }}
            onTabChange={setCampaignTab}
            onEdit={openEdit}
            onToggleStatus={(campaign) => void toggleCampaignStatus(campaign)}
            onQuoteChange={setQuoteId}
            onApply={(event) => {
              event.preventDefault();
              if (selectedCampaign) void apply(event, selectedCampaign.id);
            }}
            onClearFilters={() => {
              setCampaignQuery("");
              setStateFilter("");
            }}
            onCreate={openCreate}
          />
        </>
      )}
      {createOpen && role === "TenantAdmin" && (
        <CampaignDialog
          editing={Boolean(editingCampaign)}
          code={code}
          name={name}
          percent={percent}
          from={from}
          through={through}
          busy={busy}
          onCodeChange={setCode}
          onNameChange={setName}
          onPercentChange={setPercent}
          onFromChange={setFrom}
          onThroughChange={setThrough}
          onClose={() => {
            setCreateOpen(false);
            setEditingCampaign(null);
          }}
          onSubmit={(event) => {
            void saveCampaign(event).then((saved) => {
              if (saved) {
                setCreateOpen(false);
                setEditingCampaign(null);
              }
            });
          }}
        />
      )}
    </main>
  );
}
