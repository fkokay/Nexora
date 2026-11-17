import { useCallback, useEffect, useRef, useState } from "react";
import { BadgePercent, CalendarClock, FileCheck2, Wallet } from "lucide-react";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { authenticatedFetch } from "./authApi";
import { localDateString } from "./dateUtils";
import { ListPageHeader } from "./list-page/ListPageHeader";
import "./list-page/list-page-v2.css";
import "./document-detail/document-detail.css";
import "./sales-promotions.css";
import "./sales/sales-list-v2.css";
import CampaignPerformanceSection from "./sales-promotions/components/CampaignPerformanceSection";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import {
  ENDING_SOON_DAYS,
  campaignState,
  campaignStateLabel,
  daysBetween,
} from "./sales-promotions/campaignState";
import { useCampaignDefinitionScreen } from "./sales-promotions/useCampaignDefinitionScreen";
import type { CampaignDraft } from "./sales-promotions/components/CampaignDefinitionForm";
import { formatAmount } from "./document-detail/DocumentDetailLayout";
import type {
  Campaign,
  CampaignScreenField,
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
// The tenant's "sales-promotions" screen view (Ekran görünümleri) lays out the campaign list.
const defaultCampaignScreenFields: CampaignScreenField[] = [
  { key: "code", label: "Kampanya kodu", visible: true, position: 0 },
  { key: "name", label: "Kampanya adı", visible: true, position: 1 },
  { key: "discountPercent", label: "İndirim (%)", visible: true, position: 2 },
  { key: "effectiveFrom", label: "Başlangıç", visible: true, position: 3 },
  { key: "effectiveThrough", label: "Bitiş", visible: true, position: 4 },
  { key: "status", label: "Durum", visible: true, position: 5 },
  { key: "applicationCount", label: "Uygulama", visible: true, position: 6 },
];
/** Today's fields with the tenant's visibility, order, width and pin (unknown keys are ignored). */
function mergeScreenFields<T extends { key: string; position: number }>(defaults: T[], saved: unknown): T[] {
  if (!Array.isArray(saved)) return defaults;
  const keys = new Set(defaults.map((field) => field.key));
  const allowed = (saved as T[]).filter((field) => keys.has(field.key));
  return defaults
    .map((fallback) => ({ ...fallback, ...(allowed.find((field) => field.key === fallback.key) ?? {}) }))
    .sort((a, b) => a.position - b.position);
}
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
  const admin = role === "TenantAdmin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [quotes, setQuotes] = useState<Quote[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const reportExportRef = useRef<GridExportActions | null>(null);
  const [listToolsSlot, setListToolsSlot] = useState<HTMLDivElement | null>(null);
  const [overview, setOverview] = useState<PerformancePage | null>(null);
  const [performanceScreenFields, setPerformanceScreenFields] = useState(
    defaultPerformanceScreenFields,
  );
  const [campaignScreenFields, setCampaignScreenFields] = useState(
    defaultCampaignScreenFields,
  );
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
        if (current && Array.isArray(view.fields))
          setPerformanceScreenFields(mergeScreenFields(defaultPerformanceScreenFields, view.fields));
      })
      .catch(() => {
        if (current) setPerformanceScreenFields(defaultPerformanceScreenFields);
      });
    void request<{ fields?: CampaignScreenField[] }>(
      "/api/screen-views/sales-promotions/active",
      token,
    )
      .then((view) => {
        if (current && Array.isArray(view.fields))
          setCampaignScreenFields(mergeScreenFields(defaultCampaignScreenFields, view.fields));
      })
      .catch(() => {
        if (current) setCampaignScreenFields(defaultCampaignScreenFields);
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
  async function saveCampaign(draft: CampaignDraft, editing: Campaign | null): Promise<Campaign | null> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = JSON.stringify({
        code: draft.code,
        name: draft.name,
        discountPercent: Number(draft.percent),
        effectiveFrom: draft.from,
        effectiveThrough: draft.through,
        isActive: editing?.isActive ?? true,
      });
      const row = await request<Campaign>(
        editing
          ? `/api/sales/promotions/${editing.id}`
          : "/api/sales/promotions/",
        token,
        { method: editing ? "PUT" : "POST", body },
      );
      setCampaigns((current) =>
        editing
          ? current.map((item) => (item.id === row.id ? row : item))
          : [row, ...current],
      );
      setNotice(
        editing
          ? "Kampanya güncellendi."
          : "Kampanya oluşturuldu. Teklif tarihinin kampanya aralığında olması gerekir.",
      );
      return row;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function setCampaignStatus(campaign: Campaign, isActive: boolean): Promise<Campaign | null> {
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
            isActive,
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
      return row;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function apply(campaignId: string, quoteId: string): Promise<boolean> {
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
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const today = localDateString();
  const performanceById = new Map(
    (overview?.items ?? []).map((item) => [item.campaignId, item]),
  );
  const definition = useCampaignDefinitionScreen({
    active: !reportOpen,
    admin,
    campaigns,
    quotes,
    performanceById,
    fields: campaignScreenFields.filter((field) => field.visible),
    busy,
    error,
    setError,
    save: saveCampaign,
    setStatus: setCampaignStatus,
    apply,
    toolsSlot: listToolsSlot,
    toolsSlotRef: setListToolsSlot,
    onRefresh: () => void refreshAll(),
  });
  const visibleCampaigns = definition.visible;
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
  // Action bar. In the campaign list: Yeni / Aç / Sil of the definition screen (the open form registers Kaydet),
  // the page's own XLSX export and refresh; in the performance report the report grid's Excel export (grid fallback)
  // and its ListToolbar's refresh/filter apply. Yeni in the report returns to the list with an empty form.
  const commands: PageCommands = {};
  const more: MenuCommand[] = [];
  if (reportOpen) {
    const create = definition.commands.new;
    if (create)
      commands.new = {
        ...create,
        run: () => {
          setReportOpen(false);
          void definition.startCreate();
        },
      };
  } else {
    Object.assign(commands, definition.commands);
    more.push(...definition.moreItems);
  }
  more.push({
    id: "campaign-report",
    label: reportOpen ? "Kampanya listesi" : "Performans raporu",
    run: () => setReportOpen((open) => !open),
  });
  if (reportOpen) {
    more.push(csvExportCommand(reportExportRef));
  } else {
    commands.refresh = { run: () => void refreshAll() };
    commands.export = {
      disabledReason: visibleCampaigns.length === 0 ? "Dışa aktarılacak kampanya yok." : undefined,
      run: () => exportCampaigns(),
    };
  }
  commands.more = more;
  return (
    <main className="sales-promotions-page list-v2">
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
      {/* An open campaign form shows the error itself. */}
      {error && (reportOpen || !definition.formOpen) && (
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
          <section aria-label="Kampanya özeti">
            <ListSummaryCards
              cards={[
                { id: "current", label: "Etkin kampanya", value: current.length, icon: BadgePercent, tone: "ok", hint: "bugün geçerli" },
                {
                  id: "ending",
                  label: `${ENDING_SOON_DAYS} gün içinde bitiyor`,
                  value: endingSoon.length,
                  icon: CalendarClock,
                  tone: endingSoon.length ? "warn" : "primary",
                  hint: endingSoon.length ? endingSoon.map((item) => item.code).join(", ") : "Yakında biten kampanya yok",
                },
                {
                  id: "applied",
                  label: "Uygulanan teklif",
                  value: appliedQuotes.toLocaleString("tr-TR"),
                  icon: FileCheck2,
                  hint: `${linkedOrders.toLocaleString("tr-TR")} siparişe dönüştü`,
                },
                {
                  id: "discount",
                  label: "Verilen indirim",
                  value: discountByCurrency.size
                    ? [...discountByCurrency.entries()].map(([code, amount]) => (
                        <span key={code}>{formatAmount(amount, code)}</span>
                      ))
                    : "—",
                  icon: Wallet,
                  hint: "Tüm kampanyalar",
                },
              ]}
            />
          </section>
          {definition.view}
        </>
      )}
    </main>
  );
}
