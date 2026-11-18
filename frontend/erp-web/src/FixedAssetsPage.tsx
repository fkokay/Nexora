import SearchableRecordPicker from "./SearchableRecordPicker";
import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import type { Asset, AssetField } from "./fixed-assets/types";
import { FixedAssetRegister } from "./fixed-assets/components/FixedAssetRegister";
import { CalendarClock, CircleDollarSign, Landmark, TrendingDown } from "lucide-react";
import { localDateString } from "./dateUtils";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { ListFooter } from "./list-page/ListFooter";
import type { GridExportActions } from "./AdvancedDataGrid";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { csvExportCommand } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import "./fixed-assets.css";
import ModuleRecordForm from "./human-resources/components/ModuleRecordForm";
import { RecordFormGroup, RecordFormPage, RecordFormTabs, type RecordFormTab } from "./record-form/RecordForm";
import { StatusTag } from "./list-page/StatusTag";
import { FixedAssetDialog } from "./fixed-assets/components/FixedAssetDialog";

type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  statementSection: string;
};
type PurchaseInvoice = {
  id: string;
  code: string;
  supplierId: string;
  invoiceDate: string;
  grandTotal: number;
  journalEntryId: string | null;
};
type VukDepreciationLimit = {
  taxYear: number;
  lowerLimitTry: number;
  communiqueNumber: number;
  sourceUrl: string;
  advisory: string;
};
type VukUsefulLifeEntry = {
  code: string;
  description: string;
  usefulLifeYears: number;
  normalRatePercent: number;
  communiqueNumber: number;
};
type AcquisitionPosting = {
  assetId: string;
  purchaseInvoiceCode: string | null;
  journalEntryId: string | null;
  entryDate: string | null;
  lines: {
    accountId: string;
    accountCode: string | null;
    accountName: string | null;
    debit: number;
    credit: number;
  }[];
};
type Employee = {
  id: string;
  personnelCode: string;
  fullName: string;
  status: string;
};
type Schedule = {
  assetId: string;
  method: string;
  currencyBasis: string;
  acquisitionCostBase: number;
  residualValueBase: number;
  accumulatedDepreciationBase: number;
  rows: {
    periodStart: string;
    amountBase: number;
    isPosted: boolean;
    journalEntryId: string | null;
  }[];
};
type TaxSchedule = {
  assetId: string;
  schedule: string;
  isStatutoryFiling: boolean;
  confirmationRequired: boolean;
  source: string;
  vukUsefulLifeCode: string;
  vukUsefulLifeDescription: string | null;
  vukUsefulLifeTableYear: number | null;
  vukUsefulLifeCommuniqueNumber: number | null;
  vukUsefulLifeMonths: number;
  annualRatePercent: number;
  taxDepreciationStartDate: string;
  rows: {
    periodStart: string;
    amountBase: number;
    isPosted: boolean;
    journalEntryId: string | null;
  }[];
};
type Assignment = {
  id: string;
  employeeId: string;
  employee: string;
  assignedDate: string;
  returnedDate: string | null;
  location: string | null;
  notes: string | null;
  rowVersion: string;
};
type Disposal = {
  id: string;
  assetId: string;
  disposalDate: string;
  reason: string;
  proceedsBase: number;
  postedAccumulatedDepreciationBase: number;
  scheduleAccumulatedDepreciationBase: number;
  bookValueBase: number;
  gainLossBase: number;
  scheduleThroughPeriod: string | null;
  disposedAt: string;
  disposedByUserId: string;
  accountingTreatment: string;
  journalEntryId: string | null;
};
type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type ScreenView = { id?: string | null; fields: AssetField[] };
type PanelMode = "summary" | "acquire" | "dispose" | "assign" | "depreciate";

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
  en = false,
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = en
      ? `Request failed (${response.status})`
      : `İstek başarısız (${response.status})`;
    try {
      const body = await response.json();
      // ProblemDetails: the field messages are the useful part; the title is a generic English text.
      const fieldMessages =
        body?.errors && typeof body.errors === "object"
          ? Object.values(body.errors as Record<string, unknown>)
              .flat()
              .filter((value): value is string => typeof value === "string" && !!value.trim())
              .join(" ")
          : "";
      const text = (value: unknown) =>
        typeof value === "string" && value.trim() ? value : "";
      const title =
        text(body?.title) === "One or more validation errors occurred."
          ? en
            ? "Please check the entered information."
            : "Girilen bilgileri kontrol edin."
          : text(body?.title);
      message =
        fieldMessages || text(body?.detail) || text(body?.error) || title || message;
    } catch {}
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export default function FixedAssetsPage({
  token,
  locale,
}: {
  token: string;
  locale: "tr" | "en";
}) {
  const en = locale === "en";
  const [assets, setAssets] = useState<Asset[]>([]),
    [employees, setEmployees] = useState<Employee[]>([]),
    [selected, setSelected] = useState<Asset | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null),
    [taxSchedule, setTaxSchedule] = useState<TaxSchedule | null>(null),
    [taxScheduleError, setTaxScheduleError] = useState(""),
    [assignments, setAssignments] = useState<Assignment[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]),
    [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]),
    [acquisitionPosting, setAcquisitionPosting] =
      useState<AcquisitionPosting | null>(null);
  const [disposal, setDisposal] = useState<Disposal | null>(null),
    [disposalKey, setDisposalKey] = useState("");
  const [vukLimit, setVukLimit] = useState<VukDepreciationLimit | null>(null);
  const [vukCatalog, setVukCatalog] = useState<VukUsefulLifeEntry[]>([]);
  const [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [category, setCategory] = useState(""),
    [acquisitionDate, setAcquisitionDate] = useState(""),
    [inServiceDate, setInServiceDate] = useState(""),
    [cost, setCost] = useState(""),
    [residual, setResidual] = useState("0"),
    [life, setLife] = useState("60"),
    [source, setSource] = useState("");
  const [includeVukProfile, setIncludeVukProfile] = useState(false),
    [vukCode, setVukCode] = useState(""),
    [vukDescription, setVukDescription] = useState(""),
    [vukTableYear, setVukTableYear] = useState(""),
    [vukCommunique, setVukCommunique] = useState(""),
    [vukLifeMonths, setVukLifeMonths] = useState(""),
    [vukRate, setVukRate] = useState(""),
    [vukStartDate, setVukStartDate] = useState(""),
    [vukConfirmed, setVukConfirmed] = useState(false);
  const [disposalDate, setDisposalDate] = useState(localDateString()),
    [disposalReason, setDisposalReason] = useState(""),
    [disposalProceeds, setDisposalProceeds] = useState("0");
  const [period, setPeriod] = useState(""),
    [employeeId, setEmployeeId] = useState(""),
    [assignedDate, setAssignedDate] = useState(""),
    [location, setLocation] = useState("");
  const [offsetAccountId, setOffsetAccountId] = useState(""),
    [purchaseInvoiceId, setPurchaseInvoiceId] = useState("");
  const [assetListView, setAssetListView] = useState<ScreenView | null>(null);
  const [depreciationView, setDepreciationView] = useState<ScreenView | null>(
      null,
    ),
    [assignmentView, setAssignmentView] = useState<ScreenView | null>(null);
  const [assetSearch, setAssetSearch] = useState(""),
    [assetStatus, setAssetStatus] = useState("all"),
    [panelMode, setPanelMode] = useState<PanelMode>("summary"),
    [assetListViewLoaded, setAssetListViewLoaded] = useState(false);
  // Kıymet kartı (full-page record) of the selected asset, its section and the depreciation table's basis.
  const [cardOpen, setCardOpen] = useState(false),
    [cardTab, setCardTab] = useState("general"),
    [scheduleTab, setScheduleTab] = useState<"ledger" | "vuk">("ledger");
  const showAcquisition = panelMode === "acquire";
  const stayAfterCreate = useRef(false);
  const registerExportRef = useRef<GridExportActions | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [page, staff, ledgerAccounts, invoices] = await Promise.all([
        request<Page<Asset>>(
          "/api/fixed-assets?page=1&pageSize=200",
          token,
          undefined,
          en,
        ),
        request<Employee[]>("/api/hr/employees", token, undefined, en),
        request<LedgerAccount[]>(
          "/api/finance/general-ledger/accounts",
          token,
          undefined,
          en,
        ),
        request<PurchaseInvoice[]>(
          "/api/fixed-assets/purchase-invoices",
          token,
          undefined,
          en,
        ),
      ]);
      setAssets(page.items);
      setEmployees(staff.filter((x) => x.status !== "Terminated"));
      setAccounts(ledgerAccounts.filter((x) => x.isActive));
      setPurchaseInvoices(invoices);
      setSelected((current) =>
        current
          ? page.items.find((x) => x.id === current.id) || null
          : null,
      );
      return page.items;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [en, token]);
  const loadDetails = useCallback(
    async (asset: Asset | null) => {
      setSelected(asset);
      setSchedule(null);
      setTaxSchedule(null);
      setTaxScheduleError("");
      setAssignments([]);
      setDisposal(null);
      setAcquisitionPosting(null);
      setDetailError("");
      if (!asset) {
        setDetailLoading(false);
        return;
      }
      setDetailLoading(true);
      try {
        const [
          nextSchedule,
          nextAssignments,
          nextDisposal,
          nextAcquisitionPosting,
        ] = await Promise.all([
          request<Schedule>(
            `/api/fixed-assets/${asset.id}/depreciation-schedule`,
            token,
            undefined,
            en,
          ),
          request<Assignment[]>(
            `/api/fixed-assets/${asset.id}/assignments`,
            token,
            undefined,
            en,
          ),
          authenticatedFetch(`/api/fixed-assets/${asset.id}/disposal`, token, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(async (response) =>
            response.status === 404
              ? null
              : response.ok
                ? (response.json() as Promise<Disposal>)
                : Promise.reject(
                    new Error(
                      en
                        ? `Request failed (${response.status})`
                        : `İstek başarısız (${response.status})`,
                    ),
                  ),
          ),
          request<AcquisitionPosting>(
            `/api/fixed-assets/${asset.id}/acquisition-posting`,
            token,
            undefined,
            en,
          ),
        ]);
        setSchedule(nextSchedule);
        // Offer the first period that is not posted yet.
        setPeriod(
          nextSchedule.rows.find((row) => !row.isPosted)?.periodStart.slice(0, 7) ??
            "",
        );
        setAssignments(nextAssignments);
        setDisposal(nextDisposal);
        setAcquisitionPosting(nextAcquisitionPosting);
        if (asset.vukUsefulLifeCode) {
          try {
            setTaxSchedule(
              await request<TaxSchedule>(
                `/api/fixed-assets/${asset.id}/tax-depreciation-schedule`,
                token,
                undefined,
                en,
              ),
            );
          } catch (e) {
            setTaxScheduleError((e as Error).message);
          }
        }
      } catch (e) {
        setDetailError((e as Error).message);
        setError((e as Error).message);
      } finally {
        setDetailLoading(false);
      }
    },
    [en, token],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    void request<ScreenView>(
      "/api/screen-views/fixed-assets/active",
      token,
      undefined,
      en,
    )
      .then((view) => {
        if (active) setAssetListView(view);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setAssetListViewLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [en, token]);
  useEffect(() => {
    let active = true;
    void Promise.all([
      request<ScreenView>(
        "/api/screen-views/fixed-asset-depreciation/active",
        token,
        undefined,
        en,
      ),
      request<ScreenView>(
        "/api/screen-views/fixed-asset-assignments/active",
        token,
        undefined,
        en,
      ),
    ])
      .then(([depreciation, assignment]) => {
        if (active) {
          setDepreciationView(depreciation);
          setAssignmentView(assignment);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [en, token]);
  useEffect(() => {
    if (selected) void loadDetails(selected);
  }, [selected?.id, loadDetails]);
  useEffect(() => {
    if (!showAcquisition || !acquisitionDate) {
      setVukLimit(null);
      return;
    }
    let active = true;
    void request<VukDepreciationLimit>(
      `/api/fixed-assets/tax-limits/${acquisitionDate.slice(0, 4)}`,
      token,
      undefined,
      en,
    )
      .then((value) => {
        if (active) setVukLimit(value);
      })
      .catch(() => {
        if (active) setVukLimit(null);
      });
    return () => {
      active = false;
    };
  }, [acquisitionDate, en, showAcquisition, token]);
  useEffect(() => {
    if (!showAcquisition || !includeVukProfile || vukCatalog.length) return;
    let active = true;
    void request<{ entries: VukUsefulLifeEntry[] }>(
      "/api/fixed-assets/vuk-useful-life-catalog",
      token,
      undefined,
      en,
    )
      .then((result) => {
        if (active) setVukCatalog(result.entries);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [en, includeVukProfile, showAcquisition, token, vukCatalog.length]);
  function selectVukUsefulLifeCode(value: string) {
    const entry =
      vukCatalog.find(
        (item) => `${item.code} · ${item.description}` === value,
      ) || vukCatalog.find((item) => item.code === value);
    setVukCode(entry?.code || value);
    if (!entry) return;
    setVukDescription(entry.description);
    setVukTableYear("2026");
    setVukCommunique(String(entry.communiqueNumber));
    setVukLifeMonths(String(entry.usefulLifeYears * 12));
    setVukRate(String(entry.normalRatePercent));
  }
  async function createAsset(event: React.FormEvent) {
    event.preventDefault();
    if (includeVukProfile && !vukConfirmed) {
      setError(
        en
          ? "Confirm that the tax profile was checked with your accountant."
          : "VUK profilini mali müşavirinizle doğruladığınızı onaylayın.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        "/api/fixed-assets",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            assetCode: code,
            name,
            category: category || null,
            acquisitionDate,
            inServiceDate,
            acquisitionCostBase: Number(cost),
            residualValueBase: Number(residual),
            usefulLifeMonths: Number(life),
            sourceReference: source || null,
            supplierAccountId: null,
            purchaseInvoiceId: purchaseInvoiceId || null,
            ...(includeVukProfile
              ? {
                  vukUsefulLifeCode: vukCode,
                  vukUsefulLifeDescription: vukDescription,
                  vukUsefulLifeTableYear: Number(vukTableYear),
                  vukUsefulLifeCommuniqueNumber: Number(vukCommunique),
                  vukUsefulLifeMonths: Number(vukLifeMonths),
                  vukNormalDepreciationRatePercent: Number(vukRate),
                  vukTaxDepreciationStartDate: vukStartDate,
                }
              : {}),
          }),
        },
        en,
      );
      setNotice(
        en
          ? "Asset acquisition recorded. Link a posted purchase invoice when it already owns the accounting entry."
          : "Sabit kıymet edinimi kaydedildi. Muhasebe kaydı alış faturasındaysa faturayı bağlayın.",
      );
      if (!stayAfterCreate.current) setPanelMode("summary");
      setCode("");
      setName("");
      setCategory("");
      setCost("");
      setSource("");
      setPurchaseInvoiceId("");
      setIncludeVukProfile(false);
      setVukCode("");
      setVukDescription("");
      setVukConfirmed(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postAcquisition(event?: React.FormEvent) {
    event?.preventDefault();
    if (!selected || !offsetAccountId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<AcquisitionPosting>(
        `/api/fixed-assets/${selected.id}/acquisition-posting`,
        token,
        { method: "POST", body: JSON.stringify({ offsetAccountId }) },
        en,
      );
      setAcquisitionPosting(result);
      setOffsetAccountId("");
      setNotice(
        en
          ? "Acquisition posted to the general ledger."
          : "Edinim yevmiye defterine kaydedildi.",
      );
      await loadDetails(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postDepreciation(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !period) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/fixed-assets/${selected.id}/depreciation-postings`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ periodStart: `${period}-01` }),
        },
        en,
      );
      setNotice(
        en
          ? "Depreciation posted to the general ledger."
          : "Amortisman deftere kaydedildi.",
      );
      setPanelMode("summary");
      // Reload the list (accumulated depreciation) and then the selected asset's schedule.
      const items = await load();
      const fresh = items?.find((item) => item.id === selected.id);
      if (fresh) await loadDetails(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function postTaxDepreciation(periodStart: string) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/fixed-assets/${selected.id}/tax-depreciation-postings`,
        token,
        { method: "POST", body: JSON.stringify({ periodStart }) },
        en,
      );
      setNotice(
        en
          ? "Tax-basis depreciation was posted to its separate ledger accounts."
          : "Vergi amortismanı ayrı vergi defteri hesaplarına kaydedildi; yasal beyan oluşturulmadı.",
      );
      await loadDetails(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disposeAsset(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const key = disposalKey || crypto.randomUUID();
    setDisposalKey(key);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<Disposal>(
        `/api/fixed-assets/${selected.id}/disposals`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            disposalDate,
            reason: disposalReason,
            proceedsBase: Number(disposalProceeds),
            idempotencyKey: key,
          }),
        },
        en,
      );
      setDisposal(result);
      setDisposalKey("");
      setPanelMode("summary");
      // The API posts the disposal journal when the ledger mappings are complete; say so instead of
      // always claiming nothing was posted.
      const gainLoss = result.gainLossBase.toLocaleString(en ? "en-US" : "tr-TR", { minimumFractionDigits: 2 });
      const bookValue = result.bookValueBase.toLocaleString(en ? "en-US" : "tr-TR", { minimumFractionDigits: 2 });
      setNotice(
        result.journalEntryId
          ? en
            ? `Asset disposed. Book value ${bookValue}, gain/loss ${gainLoss}. The disposal journal entry was posted.`
            : `Kıymet elden çıkarıldı. Defter değeri ${bookValue}, kâr/zarar ${gainLoss}. Elden çıkarma yevmiye fişi oluşturuldu.`
          : en
            ? `Asset disposed. Operational book value: ${bookValue}. No journal entry was posted.`
            : `Kıymet elden çıkarıldı. Operasyonel defter değeri: ${bookValue}. Yevmiye kaydı oluşturulmadı.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !employeeId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/fixed-assets/${selected.id}/assignments`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            employeeId,
            assignedDate,
            location: location || null,
            notes: null,
          }),
        },
        en,
      );
      setNotice(en ? "Custody assigned." : "Zimmet kaydedildi.");
      setPanelMode("summary");
      setEmployeeId("");
      setLocation("");
      await loadDetails(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function returnAssignment(item: Assignment) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/fixed-assets/${selected.id}/assignments/${item.id}/return`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            returnedDate: localDateString(),
            rowVersion: item.rowVersion,
          }),
        },
        en,
      );
      setNotice(en ? "Asset returned." : "Kıymet iade alındı.");
      await loadDetails(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    // The card belongs to the selected asset; when a reload drops it, the card closes too.
    if (!selected && cardOpen) setCardOpen(false);
  }, [selected, cardOpen]);
  const assetFields = (assetListView?.fields || defaultAssetFields)
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const depreciationFields = (
    depreciationView?.fields || defaultDepreciationFields
  )
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const assignmentFields = (assignmentView?.fields || defaultAssignmentFields)
    .filter((field) => field.visible && field.key !== "actions")
    .sort((a, b) => a.position - b.position);
  const numberLocale = en ? "en-US" : "tr-TR";
  const money = (value: number) =>
    value.toLocaleString(numberLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const activeAssets = assets.filter((asset) => asset.status === "Active");
  const totalCost = assets.reduce(
    (sum, asset) => sum + asset.acquisitionCostBase,
    0,
  );
  const accumulatedDepreciation = assets.reduce(
    (sum, asset) => sum + asset.accumulatedDepreciationBase,
    0,
  );
  // Straight-line estimate for the current month: depreciation starts the month after the
  // in-service month and runs for the useful life, until the depreciable base is used up.
  const currentMonthIndex = (() => {
    const [year, month] = localDateString().split("-").map(Number);
    return year * 12 + month - 1;
  })();
  const thisMonthDepreciation = activeAssets.reduce((sum, asset) => {
    const match = asset.inServiceDate.match(/^(\d{4})-(\d{2})/);
    if (!match) return sum;
    const elapsed =
      currentMonthIndex - (Number(match[1]) * 12 + Number(match[2]) - 1);
    const base = asset.acquisitionCostBase - asset.residualValueBase;
    if (
      elapsed < 1 ||
      elapsed > asset.usefulLifeMonths ||
      base <= 0 ||
      asset.accumulatedDepreciationBase >= base
    )
      return sum;
    return sum + monthlyDepreciation(asset);
  }, 0);
  const filteredAssets = assets.filter((asset) => {
    const term = assetSearch.trim().toLocaleLowerCase(en ? "en-US" : "tr-TR");
    const matchesTerm =
      !term ||
      [asset.assetCode, asset.name, asset.category || ""].some((value) =>
        value.toLocaleLowerCase(en ? "en-US" : "tr-TR").includes(term),
      );
    const matchesStatus =
      assetStatus === "all" ||
      (assetStatus === "active"
        ? asset.status === "Active"
        : asset.status !== "Active");
    return matchesTerm && matchesStatus;
  });
  const selectedMonthly = selected ? monthlyDepreciation(selected) : 0;
  const selectedMonthsDone =
    selected && selectedMonthly > 0
      ? Math.min(
          selected.usefulLifeMonths,
          Math.round(selected.accumulatedDepreciationBase / selectedMonthly),
        )
      : 0;
  const currentHolder = assignments.find((item) => !item.returnedDate);
  const linkedInvoice = selected?.purchaseInvoiceId
    ? acquisitionPosting?.purchaseInvoiceCode ||
      purchaseInvoices.find((item) => item.id === selected.purchaseInvoiceId)
        ?.code ||
      (en ? "Linked" : "Bağlı")
    : "—";
  const selectedActive = selected?.status === "Active";
  function openPanel(mode: PanelMode) {
    setError("");
    setNotice("");
    if (mode === "assign" && !assignedDate) setAssignedDate(localDateString());
    setPanelMode(mode);
  }
  /** Single click / ↑↓: the asset becomes current and the panel shows its summary (as a row click did). */
  function selectAsset(asset: Asset) {
    setSelected(asset);
    openPanel("summary");
  }
  /** Double click / Enter / Aç: the asset card (record v3, read-only) opens. */
  function openAsset(asset: Asset) {
    selectAsset(asset);
    setCardTab("general");
    setScheduleTab("ledger");
    setCardOpen(true);
  }
  const actReason = !selected
    ? en
      ? "Select a record first"
      : "Önce bir kayıt seçin"
    : busy
      ? en
        ? "An operation is in progress…"
        : "İşlem sürüyor…"
      : detailLoading
        ? en
          ? "Loading details…"
          : "Ayrıntılar yükleniyor…"
        : detailError
          ? en
            ? "Could not load the selected asset details. Use Refresh to try again."
            : "Seçili kıymetin ayrıntıları yüklenemedi. Yenile ile tekrar deneyin."
          : undefined;
  const assetMore: MenuCommand[] = [];
  // The summary panel's buttons, with their conditions (active asset without a disposal).
  if (selected && selectedActive && !disposal)
    assetMore.push(
      { id: "asset-depreciate", label: en ? "Post depreciation" : "Amortismanı kaydet", disabledReason: actReason, run: () => openPanel("depreciate") },
      { id: "asset-assign", label: en ? "Assign custody" : "Zimmetle", disabledReason: actReason, run: () => openPanel("assign") },
      { id: "asset-dispose", label: en ? "Dispose" : "Elden çıkar", disabledReason: actReason, run: () => openPanel("dispose") },
    );
  if (!cardOpen) assetMore.push(csvExportCommand(registerExportRef));
  const cardOpenReason = en ? "Not available while the asset card is open" : "Kıymet kartı açıkken kullanılamaz";
  const assetCommands: PageCommands = {
    ...(cardOpen && selected
      ? {
          refresh: {
            disabledReason: busy || detailLoading ? actReason : undefined,
            run: () => {
              void load();
              void loadDetails(selected);
            },
          },
          filter: { disabledReason: cardOpenReason },
          export: { disabledReason: cardOpenReason },
        }
      : {}),
    new: {
      primary: panelMode !== "acquire",
      disabledReason: panelMode === "acquire" ? (en ? "The acquisition form is open" : "Edinim formu açık") : undefined,
      run: () => openPanel("acquire"),
    },
    open: {
      disabledReason: cardOpen ? cardOpenReason : selected ? undefined : en ? "Select a record first" : "Önce bir kayıt seçin",
      run: () => {
        if (selected) openAsset(selected);
      },
    },
    delete: {
      disabledReason: selected
        ? en
          ? "Assets cannot be deleted; use Dispose in Actions."
          : "Kıymet silinemez; İşlemler'den elden çıkarın."
        : en
          ? "Select a record first"
          : "Önce bir kayıt seçin",
    },
    more: assetMore,
  };
  const assetFieldLabel = (key: string, label: string) => {
    // The redesigned register uses shorter headings for the catalog defaults; tenant renames stay.
    const short: Record<string, [string, string, string]> = {
      acquisitionCostBase: ["Edinim maliyeti", "Maliyet", "Cost"],
      remainingBookValueBase: ["Kalan defter değeri", "Net defter", "Net book value"],
    };
    const entry = short[key];
    if (entry && entry[0] === label) return en ? entry[2] : entry[1];
    return en ? assetFieldEnglish[key] || label : label;
  };
  const panelTitleId = "fixed-asset-panel-title";
  // Edinim kaydı: a full-page record form (mockup 10 · record v3); Vazgeç / save return to the register.
  const acquireForm = (
          <ModuleRecordForm
            title={en ? "Register an acquisition" : "Edinim kaydı oluştur"}
            variant="page"
            className="fixed-asset-acquire-rf"
            error={error}
            onDismissError={() => setError("")}
            mode="create"
            busy={busy}
            saveLabel={en ? "Save acquisition" : "Edinimi kaydet"}
            onSubmit={createAsset}
            onCancel={() => setPanelMode("summary")}
            onSaveIntent={(stay) => {
              stayAfterCreate.current = stay;
            }}
            status={
              <>
                <span>
                  {en
                    ? "Start with the asset details, then add its cost and accounting source. Amounts use the company base currency."
                    : "Önce kıymet bilgilerini, ardından maliyet ve muhasebe kaynağını girin. Tutarlar firma baz para birimindedir."}
                </span>
                {notice && <span className="rf-status-notice">{notice}</span>}
              </>
            }
          >
            <RecordFormGroup
              title={en ? "Asset details" : "Kıymet bilgileri"}
              bodyClassName="rf-identity hrp-identity-3"
            >
                <label>
                  {en ? "Asset code" : "Kıymet kodu"}
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={40}
                    required
                  />
                </label>
                <label>
                  {en ? "Name" : "Ad"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  {en ? "Category" : "Kategori"}
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    maxLength={80}
                  />
                </label>
            </RecordFormGroup>
            <div className="rf-columns">
              <RecordFormGroup
                title={en ? "Dates and useful life" : "Tarihler ve faydalı ömür"}
              >
                <label>
                  {en ? "Acquisition date" : "Edinim tarihi"}
                  <input
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {en ? "In service" : "Kullanıma giriş"}
                  <input
                    type="date"
                    value={inServiceDate}
                    onChange={(e) => setInServiceDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {en ? "Useful life (months)" : "Faydalı ömür (ay)"}
                  <input
                    type="number"
                    min="1"
                    max="1200"
                    value={life}
                    onChange={(e) => setLife(e.target.value)}
                    required
                  />
                </label>
              {vukLimit && (
                <p className="fixed-asset-inline-note" role="status">
                  {en
                    ? `GİB VUK ${vukLimit.taxYear} lower limit: ${vukLimit.lowerLimitTry.toLocaleString("en-US")} TRY (Communiqué ${vukLimit.communiqueNumber}). Advisory only; this does not automatically authorize expensing.`
                    : `GİB VUK ${vukLimit.taxYear} amortisman alt sınırı: ${vukLimit.lowerLimitTry.toLocaleString("tr-TR")} TL (Tebliğ ${vukLimit.communiqueNumber}). Bilgilendirme amaçlıdır; otomatik gider yazma kararı değildir.`}
                </p>
              )}
              </RecordFormGroup>

              <RecordFormGroup
                title={en ? "Cost and reference" : "Maliyet ve referans"}
              >
                <label>
                  {en ? "Acquisition cost" : "Edinim maliyeti"}
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {en ? "Residual value" : "Kalıntı değer"}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={residual}
                    onChange={(e) => setResidual(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {en ? "Source reference" : "Kaynak referansı"}
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    maxLength={120}
                  />
                </label>
              </RecordFormGroup>
              <RecordFormGroup
                title={en ? "Accounting source" : "Muhasebe kaynağı"}
              >
              <label>
                {en
                  ? "Linked purchase invoice (optional)"
                  : "Bağlı alış faturası (isteğe bağlı)"}
                <select
                  value={purchaseInvoiceId}
                  onChange={(e) => setPurchaseInvoiceId(e.target.value)}
                >
                  <option value="">
                    {en ? "No invoice link" : "Fatura bağlantısı yok"}
                  </option>
                  {purchaseInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.code} · {formatDate(invoice.invoiceDate, en)} ·{" "}
                      {invoice.grandTotal.toLocaleString(
                        en ? "en-US" : "tr-TR",
                        { minimumFractionDigits: 2 },
                      )}
                      {invoice.journalEntryId
                        ? en
                          ? " · journaled"
                          : " · yevmiye kayıtlı"
                        : ""}
                    </option>
                  ))}
                </select>
                <small>
                  {en
                    ? "When linked, this invoice remains the accounting source; the separate acquisition journal is blocked to prevent double posting."
                    : "Fatura bağlandığında muhasebe kaynağı alış faturası olur; çift kayıt olmaması için ayrı edinim fişi engellenir."}
                </small>
              </label>
              </RecordFormGroup>
              <div className="rf-columns-wide">
                <RecordFormGroup
                  title={
                    en
                      ? "Optional VUK tax profile"
                      : "İsteğe bağlı VUK vergi profili"
                  }
                >
              <label className="fixed-asset-vuk-toggle rf-check">
                <input
                  type="checkbox"
                  checked={includeVukProfile}
                  onChange={(e) => setIncludeVukProfile(e.target.checked)}
                />
                {en
                  ? "Add an accountant-confirmed VUK depreciation profile"
                  : "Mali müşavir tarafından doğrulanmış VUK amortisman profili ekle"}
              </label>
              {includeVukProfile && (
                <>
                  <p className="fixed-asset-inline-note">
                    {en
                      ? "Enter the applicable asset class from the official GİB table. Verify the class, useful life, rate and tax start date with your accountant. This is an estimate, not a tax filing."
                      : "GİB resmi tablosundaki uygun kıymet sınıfını girin. Sınıfı, faydalı ömrü, oranı ve vergi başlangıç tarihini mali müşavirinizle doğrulayın. Bu hesap tahmindir, beyanname değildir."}{" "}
                    <a
                      href="https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv/yardim-kaynaklar/yararli-bilgiler/AmortismanOranlariTablosu.pdf"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {en
                        ? "Official GİB table"
                        : "GİB resmi amortisman tablosu"}
                    </a>
                  </p>
                  <div className="hrp-grid">
                    <label>
                      {en ? "Table code" : "Tablo kodu"}
                      <input
                        list="vuk-useful-life-codes"
                        value={vukCode}
                        onChange={(e) =>
                          selectVukUsefulLifeCode(e.target.value)
                        }
                        maxLength={40}
                        required={includeVukProfile}
                      />
                      <datalist id="vuk-useful-life-codes">
                        {vukCatalog.map((entry) => (
                          <option
                            key={`${entry.code}-${entry.description}`}
                            value={`${entry.code} · ${entry.description}`}
                            label={`${entry.usefulLifeYears} yıl · %${entry.normalRatePercent} · Tebliğ ${entry.communiqueNumber}`}
                          />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      {en
                        ? "Asset class description"
                        : "Kıymet sınıfı açıklaması"}
                      <input
                        value={vukDescription}
                        onChange={(e) => setVukDescription(e.target.value)}
                        maxLength={500}
                        required={includeVukProfile}
                      />
                    </label>
                    <label>
                      {en ? "Table year" : "Tablo yılı"}
                      <input
                        type="number"
                        min="2004"
                        max="2100"
                        value={vukTableYear}
                        onChange={(e) => setVukTableYear(e.target.value)}
                        required={includeVukProfile}
                      />
                    </label>
                    <label>
                      {en ? "Communiqué no." : "Tebliğ no."}
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={vukCommunique}
                        onChange={(e) => setVukCommunique(e.target.value)}
                        required={includeVukProfile}
                      />
                    </label>
                    <label>
                      {en
                        ? "Tax useful life (months)"
                        : "Vergi faydalı ömrü (ay)"}
                      <input
                        type="number"
                        min="1"
                        max="1200"
                        value={vukLifeMonths}
                        onChange={(e) => setVukLifeMonths(e.target.value)}
                        required={includeVukProfile}
                      />
                    </label>
                    <label>
                      {en
                        ? "Annual normal rate (%)"
                        : "Normal amortisman oranı (%)"}
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={vukRate}
                        onChange={(e) => setVukRate(e.target.value)}
                        required={includeVukProfile}
                      />
                    </label>
                    <label>
                      {en
                        ? "Tax depreciation start date"
                        : "Vergi amortisman başlangıcı"}
                      <input
                        type="date"
                        min={acquisitionDate || undefined}
                        value={vukStartDate}
                        onChange={(e) => setVukStartDate(e.target.value)}
                        required={includeVukProfile}
                      />
                    </label>
                  </div>
                  <label className="fixed-asset-vuk-confirm rf-check">
                    <input
                      type="checkbox"
                      checked={vukConfirmed}
                      onChange={(e) => setVukConfirmed(e.target.checked)}
                      required={includeVukProfile}
                    />
                    {en
                      ? "I verified this profile and tax start date with the company accountant."
                      : "Bu profili ve vergi başlangıç tarihini firma mali müşaviriyle doğruladım."}
                  </label>
                </>
              )}
                </RecordFormGroup>
              </div>
            </div>
          </ModuleRecordForm>
  );
  // Workflow forms (Amortismanı kaydet, Elden çıkar, Zimmetle) open from İşlemler as dialogs over the register or the
  // asset card; their bodies, conditions and save rules are the former side-panel modes'.
  const workflowLabel =
    panelMode === "depreciate"
      ? en ? "Post depreciation" : "Amortismanı kaydet"
      : panelMode === "dispose"
        ? en ? "Disposal record" : "Elden çıkarma kaydı"
        : en ? "Custody assignment" : "Zimmet kaydı";
  const workflowDialog =
    selected && (panelMode === "depreciate" || panelMode === "dispose" || panelMode === "assign") ? (
      <FixedAssetDialog label={workflowLabel} busy={busy} onClose={() => setPanelMode("summary")}>
          {panelMode === "depreciate" && selected && (
            <ModuleRecordForm
              error={error}
              onDismissError={() => setError("")}
              title={en ? "Post depreciation" : "Amortismanı kaydet"}
              mode="create"
              busy={busy}
              saveDisabled={detailLoading || !!detailError || !selectedActive}
              saveLabel={en ? "Post depreciation" : "Amortismanı kaydet"}
              onSubmit={postDepreciation}
              onCancel={() => setPanelMode("summary")}
              status={
                <span>
                  {selected.assetCode} · {selected.name}
                </span>
              }
            >
              <RecordFormGroup title={en ? "Period" : "Dönem"}>
                <label>
                  {en ? "Post period" : "Kaydedilecek dönem"}
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    required
                  />
                </label>
                <p className="fixed-asset-inline-note">
                  {en
                    ? "Monthly straight-line estimate begins in the month after service; posting requires ledger mappings."
                    : "Aylık doğrusal tahmin kullanıma giriş ayını izleyen ay başlar; kayıt için defter eşleştirmeleri gerekir."}
                </p>
              </RecordFormGroup>
            </ModuleRecordForm>
          )}
          {panelMode === "dispose" && selected && (
            <>
                <ModuleRecordForm
              error={error}
              onDismissError={() => setError("")}
                  title={en ? "Disposal record" : "Elden çıkarma kaydı"}
                  mode="create"
                  onCancel={() => setPanelMode("summary")}
                  busy={busy}
                  saveDisabled={
                    detailLoading ||
                    !!detailError ||
                    selected.status !== "Active"
                  }
                  saveLabel={en ? "Record disposal" : "Elden çıkarmayı kaydet"}
                  onSubmit={disposeAsset}
                >
                  <RecordFormGroup
                    title={en ? "Disposal" : "Elden Çıkarma"}
                    bodyClassName="rf-identity hrp-identity-3"
                  >
                    <label>
                      {en ? "Disposal date" : "Elden çıkarma tarihi"}
                      <input
                        type="date"
                        value={disposalDate}
                        onChange={(e) => setDisposalDate(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      {en
                        ? "Proceeds (base currency)"
                        : "Tahsilat (baz para birimi)"}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={disposalProceeds}
                        onChange={(e) => setDisposalProceeds(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      {en ? "Reason" : "Açıklama"}
                      <input
                        value={disposalReason}
                        onChange={(e) => setDisposalReason(e.target.value)}
                        maxLength={500}
                        required
                      />
                    </label>
                  </RecordFormGroup>
                </ModuleRecordForm>
              {!detailLoading && !detailError && !selectedActive && (
                <p className="fixed-asset-inline-note">
                  {en
                    ? "Disposal can be recorded for an active asset."
                    : "Elden çıkarma yalnızca etkin kıymetler için kaydedilebilir."}
                </p>
              )}
            </>
          )}
          {panelMode === "assign" && selected && (
            <>
            <ModuleRecordForm
              error={error}
              onDismissError={() => setError("")}
              title={en ? "Custody assignment" : "Zimmet kaydı"}
              mode="create"
              onCancel={() => setPanelMode("summary")}
              busy={busy}
              saveDisabled={detailLoading || !!detailError || !employees.length}
              saveLabel={en ? "Assign asset" : "Zimmetle"}
              onSubmit={assign}
            >
              <RecordFormGroup
                title={en ? "Custody" : "Zimmet"}
                bodyClassName="rf-identity hrp-identity-even"
              >
                <label>
                  {en ? "Employee" : "Personel"}
                  <SearchableRecordPicker
                    options={employees.map((x) => ({
                      id: x.id,
                      label: `${x.personnelCode} · ${x.fullName}`,
                    }))}
                    selectedId={employeeId}
                    onSelect={(id) => {
                      setEmployeeId(id);
                    }}
                    title={en ? "Select employee" : "Personel seçin"}
                    placeholder={en ? "Select employee" : "Personel seçin"}
                    searchPlaceholder={
                      en
                        ? "Search by code or name"
                        : "Personel kodu veya adıyla ara"
                    }
                    emptyMessage={
                      en
                        ? "No matching employee"
                        : "Eşleşen personel bulunamadı"
                    }
                    required
                  />
                </label>
                <label>
                  {en ? "Assigned date" : "Teslim tarihi"}
                  <input
                    type="date"
                    value={assignedDate}
                    onChange={(e) => setAssignedDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {en ? "Location" : "Konum"}
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={160}
                  />
                </label>
              </RecordFormGroup>
            </ModuleRecordForm>
              {!detailLoading && !detailError && !employees.length && (
                <p className="fixed-asset-inline-note">
                  {en
                    ? "No active employees are available for assignment."
                    : "Zimmet için etkin personel bulunamadı."}
                </p>
              )}
            </>
          )}

      </FixedAssetDialog>
    ) : null;
  // Kıymet kartı (mockup 10 · record v3, read-only: there is no PUT for an asset). Sections: Genel, Amortisman tablosu
  // (statement 03: Muhasebe / VUK), Edinim muhasebesi, Zimmet geçmişi, Elden çıkarma.
  const cardTabs: RecordFormTab[] = selected
    ? [
        { key: "general", label: en ? "General" : "Genel", state: "done" },
        { key: "schedule", label: en ? "Depreciation table" : "Amortisman tablosu", count: schedule?.rows.length },
        { key: "acquisition", label: en ? "Acquisition accounting" : "Edinim muhasebesi" },
        { key: "custody", label: en ? "Custody history" : "Zimmet geçmişi", count: detailLoading ? undefined : assignments.length },
        { key: "disposal", label: en ? "Disposal" : "Elden çıkarma", state: disposal ? "done" : "empty" },
      ]
    : [];
  const readOnlyField = (label: string, value: string, className?: string) => (
    <label className={className}>
      {label}
      <input value={value} readOnly />
    </label>
  );
  const assetCard = selected ? (
    <RecordFormPage
      variant="page"
      className="fixed-asset-card"
      title={selected.name}
      mode="edit"
      busy={busy}
      subtitle={
        <>
          <span className="rf-code">{selected.assetCode}</span>
          <StatusTag tone={selected.status === "Active" ? "ok" : "off"}>
            {selected.status === "Active" ? (en ? "Active" : "Etkin") : en ? "Disposed" : "Elden çıkarıldı"}
          </StatusTag>
          {selected.category && <span>{selected.category}</span>}
        </>
      }
      saveLabel={en ? "Save" : "Kaydet"}
      saveDisabledReason={
        en
          ? "An asset is not edited after acquisition; use Actions for its workflows."
          : "Kıymet edinimden sonra düzenlenmez; işlemler İşlemler menüsünde."
      }
      onSubmit={(event) => event.preventDefault()}
      onCancel={() => setCardOpen(false)}
      error={error}
      onDismissError={() => setError("")}
      status={
        <>
          <span>{en ? "Amounts in the company base currency." : "Tutarlar firma baz para birimindedir."}</span>
          {notice && <span className="rf-status-notice">{notice}</span>}
        </>
      }
      aside={
        <section className="fixed-asset-card-aside" aria-label={en ? "Asset summary" : "Kıymet özeti"}>
          <div className="fixed-asset-progress">
            <div>
              <span>{en ? "Depreciation" : "Amortisman"}</span>
              <b>
                {selectedMonthsDone} / {selected.usefulLifeMonths} {en ? "months" : "ay"}
              </b>
            </div>
            <div
              className="fixed-asset-progress-bar"
              role="progressbar"
              aria-label={en ? "Months depreciated" : "Amortismanı ayrılan ay"}
              aria-valuemin={0}
              aria-valuemax={selected.usefulLifeMonths}
              aria-valuenow={selectedMonthsDone}
            >
              <span
                style={{
                  width: `${selected.usefulLifeMonths ? Math.min(100, (selectedMonthsDone / selected.usefulLifeMonths) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
          <dl className="fixed-asset-facts">
            <div>
              <dt>{en ? "Net book value" : "Net defter"}</dt>
              <dd>{money(selected.acquisitionCostBase - selected.accumulatedDepreciationBase)}</dd>
            </div>
            <div>
              <dt>{en ? "Custody" : "Zimmet"}</dt>
              <dd>{detailLoading ? "…" : currentHolder?.employee || "—"}</dd>
            </div>
            <div>
              <dt>{en ? "Linked invoice" : "Bağlı fatura"}</dt>
              <dd>{linkedInvoice}</dd>
            </div>
          </dl>
        </section>
      }
    >
      {detailError && (
        <p className="fixed-asset-panel-status is-error" role="alert">
          {en
            ? "Could not load the selected asset details. Use Refresh to try again."
            : "Seçili kıymetin ayrıntıları yüklenemedi. Yenile ile tekrar deneyin."}
        </p>
      )}
      <RecordFormTabs tabs={cardTabs} active={cardTab} onChange={setCardTab} label={en ? "Asset card sections" : "Kıymet kartı bölümleri"}>
        {cardTab === "general" && (
          <div className="rf-columns">
            <RecordFormGroup title={en ? "Identity" : "Kimlik"} bodyClassName="rf-identity">
              {readOnlyField(en ? "Asset code" : "Kıymet kodu", selected.assetCode, "rf-mono")}
              {readOnlyField(en ? "Name" : "Ad", selected.name)}
              {readOnlyField(en ? "Category" : "Kategori", selected.category || "—")}
            </RecordFormGroup>
            <RecordFormGroup title={en ? "Cost and depreciation" : "Maliyet ve amortisman"}>
              {readOnlyField(en ? "Acquisition date" : "Edinim tarihi", formatDate(selected.acquisitionDate, en))}
              {readOnlyField(en ? "In service" : "Kullanıma giriş", formatDate(selected.inServiceDate, en))}
              {readOnlyField(en ? "Useful life (months)" : "Faydalı ömür (ay)", String(selected.usefulLifeMonths), "rf-num")}
              {readOnlyField(en ? "Acquisition cost" : "Edinim maliyeti", money(selected.acquisitionCostBase), "rf-num")}
              {readOnlyField(en ? "Residual value" : "Hurda değeri", money(selected.residualValueBase), "rf-num")}
              {readOnlyField(en ? "Monthly depreciation" : "Aylık amortisman", money(selectedMonthly), "rf-num")}
              {readOnlyField(en ? "Accumulated depreciation" : "Birikmiş amortisman", money(selected.accumulatedDepreciationBase), "rf-num")}
              {readOnlyField(en ? "Source reference" : "Kaynak referansı", selected.sourceReference || "—")}
            </RecordFormGroup>
            {selected.vukUsefulLifeCode && (
              <RecordFormGroup title={en ? "VUK profile" : "VUK profili"}>
                {readOnlyField(en ? "Useful life code" : "Faydalı ömür kodu", selected.vukUsefulLifeCode, "rf-mono")}
                {readOnlyField(en ? "Description" : "Açıklama", selected.vukUsefulLifeDescription || "—")}
                {readOnlyField(en ? "Useful life (months)" : "Faydalı ömür (ay)", selected.vukUsefulLifeMonths != null ? String(selected.vukUsefulLifeMonths) : "—", "rf-num")}
              </RecordFormGroup>
            )}
          </div>
        )}
        {cardTab === "schedule" && (
          <div className="rf-columns">
            <section className="fixed-asset-statement" aria-label={en ? "Depreciation table" : "Amortisman tablosu"}>
              <div className="fixed-asset-statement-head">
                <div className="fixed-asset-statement-tabs" role="tablist" aria-label={en ? "Depreciation basis" : "Amortisman esası"}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={scheduleTab === "ledger"}
                    className={scheduleTab === "ledger" ? "active" : ""}
                    onClick={() => setScheduleTab("ledger")}
                  >
                    {en ? "Accounting" : "Muhasebe"}
                  </button>
                  {selected.vukUsefulLifeCode && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={scheduleTab === "vuk"}
                      className={scheduleTab === "vuk" ? "active" : ""}
                      onClick={() => setScheduleTab("vuk")}
                    >
                      VUK
                    </button>
                  )}
                </div>
                <span className="fixed-asset-statement-hint">
                  {en ? "Post depreciation: Actions (Alt+İ)" : "Amortismanı kaydet: İşlemler (Alt+İ)"}
                </span>
              </div>
              {scheduleTab === "ledger" || !selected.vukUsefulLifeCode ? (
                <div className="fixed-asset-statement-table" role="region" aria-label={en ? "Depreciation schedule" : "Amortisman planı"} tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        {depreciationFields.map((field) => (
                          <th key={field.key} scope="col" className={field.key === "amountBase" ? "nx-num" : undefined}>
                            {en ? depreciationFieldEnglish[field.key] || field.label : field.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule?.rows.map((row) => (
                        <tr key={row.periodStart} className={row.isPosted ? "is-posted" : "is-planned"}>
                          {depreciationFields.map((field) => (
                            <td key={field.key} className={field.key === "amountBase" ? "nx-num" : undefined}>
                              {field.key === "isPosted" ? (
                                <StatusTag tone={row.isPosted ? "ok" : "info"}>{formatDepreciationField(row, field.key, en)}</StatusTag>
                              ) : (
                                formatDepreciationField(row, field.key, en)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!detailLoading && !detailError && schedule && !schedule.rows.length && (
                        <tr>
                          <td colSpan={Math.max(depreciationFields.length, 1)} className="table-empty">
                            {en ? "No remaining periods in this range." : "Bu aralıkta kalan dönem yok."}
                          </td>
                        </tr>
                      )}
                      {detailLoading && (
                        <tr>
                          <td colSpan={Math.max(depreciationFields.length, 1)} className="table-empty" role="status">
                            {en ? "Loading schedule…" : "Amortisman planı yükleniyor…"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {schedule && (
                      <tfoot>
                        {[
                          [en ? "Accumulated depreciation" : "Birikmiş amortisman", schedule.accumulatedDepreciationBase],
                          [en ? "Net book value" : "Net defter değeri", schedule.acquisitionCostBase - schedule.accumulatedDepreciationBase],
                        ].map(([label, value]) => {
                          // The closing figures sit under the amount column when the layout shows it.
                          const amountIndex = depreciationFields.findIndex((field) => field.key === "amountBase");
                          const labelSpan = amountIndex >= 1 ? amountIndex : Math.max(depreciationFields.length - 1, 1);
                          const rest = amountIndex >= 1 ? depreciationFields.length - amountIndex - 1 : 0;
                          return (
                            <tr key={String(label)}>
                              <th scope="row" colSpan={labelSpan}>
                                {label}
                              </th>
                              <td className="nx-num">{money(Number(value))}</td>
                              {rest > 0 && <td colSpan={rest} />}
                            </tr>
                          );
                        })}
                      </tfoot>
                    )}
                  </table>
                </div>
              ) : (
                <div className="fixed-asset-statement-vuk">

            {taxSchedule ? (
              <>
                <div className="fixed-asset-tax-profile">
                  <b>
                    {taxSchedule.vukUsefulLifeCode} ·{" "}
                    {taxSchedule.vukUsefulLifeDescription}
                  </b>
                  <span>
                    {en ? "Table" : "Tablo"}{" "}
                    {taxSchedule.vukUsefulLifeTableYear ?? "—"} ·{" "}
                    {en ? "Communiqué" : "Tebliğ"}{" "}
                    {taxSchedule.vukUsefulLifeCommuniqueNumber ?? "—"} ·{" "}
                    {taxSchedule.vukUsefulLifeMonths} {en ? "months" : "ay"} ·{" "}
                    {taxSchedule.annualRatePercent}%
                  </span>
                  <span>
                    {en ? "Tax start" : "Vergi başlangıcı"}:{" "}
                    {formatDate(taxSchedule.taxDepreciationStartDate, en)}
                  </span>
                </div>
                <p className="fixed-asset-inline-note" role="note">
                  {en
                    ? "Estimate only. It is not a statutory filing or tax advice; confirm each period with your accountant."
                    : "Yalnızca tahmindir; yasal beyan veya vergi danışmanlığı değildir. Dönemleri mali müşavirinizle doğrulayın."}
                </p>
                <div
                  className="fixed-asset-mini-table"
                  role="region"
                  aria-label={
                    en
                      ? "VUK tax depreciation estimate"
                      : "VUK vergi amortisman tahmini"
                  }
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{en ? "Period" : "Dönem"}</th>
                        <th scope="col">
                          {en ? "Estimated amount" : "Tahmini tutar"}
                        </th>
                        <th scope="col">{en ? "Status" : "Durum"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxSchedule.rows.map((row) => (
                        <tr key={row.periodStart}>
                          <td>{row.periodStart.slice(0, 7)}</td>
                          <td>
                            {row.amountBase.toLocaleString(
                              en ? "en-US" : "tr-TR",
                              { minimumFractionDigits: 2 },
                            )}
                          </td>
                          <td>
                            {row.isPosted ? (
                              en ? (
                                "Posted to tax ledger"
                              ) : (
                                "Vergi defterine kaydedildi"
                              )
                            ) : (
                              <>
                                <span>
                                  {en ? "Estimate only" : "Yalnızca tahmin"}
                                </span>
                                {taxSchedule.rows.find((item) => !item.isPosted)
                                  ?.periodStart === row.periodStart && (
                                  <button
                                    type="button"
                                    className="row-action"
                                    disabled={busy || detailLoading}
                                    onClick={() =>
                                      void postTaxDepreciation(row.periodStart)
                                    }
                                  >
                                    {en
                                      ? "Post tax entry"
                                      : "Vergi kaydı oluştur"}
                                  </button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!taxSchedule.rows.length && (
                        <tr>
                          <td colSpan={3} className="table-empty">
                            {en
                              ? "No periods are available through the current date."
                              : "Bugünün tarihine kadar hesaplanabilir dönem yok."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : taxScheduleError ? (
              <p className="fixed-asset-inline-note" role="alert">
                {taxScheduleError}
              </p>
            ) : !selected.vukUsefulLifeCode ? (
              <p className="fixed-asset-inline-note">
                {en
                  ? "No accountant-confirmed VUK profile is saved on this asset. Add one when recording a new acquisition."
                  : "Bu kıymette mali müşavir onaylı VUK profili yok. Yeni edinim kaydında profil ekleyebilirsiniz."}
              </p>
            ) : (
              <p className="fixed-asset-inline-note" role="status">
                {en ? "Loading the tax estimate…" : "Vergi tahmini yükleniyor…"}
              </p>
            )}
                
                </div>
              )}
            </section>
          </div>
        )}
        {cardTab === "acquisition" && (
          <div className="rf-columns">
            <RecordFormGroup title={en ? "Acquisition accounting" : "Edinim muhasebesi"}>

                <p className="fixed-asset-panel-status">
                  {en
                    ? "Posts debit to the company fixed-asset cost mapping and credit to the active offset account you select."
                    : "Firma sabit kıymet maliyet hesabına borç, seçtiğiniz etkin karşı hesaba alacak kaydeder."}
                </p>
            {acquisitionPosting?.journalEntryId ? (
              <div className="fixed-asset-disposal-summary">
                <b>
                  {en ? "Journal entry" : "Yevmiye fişi"} ·{" "}
                  {acquisitionPosting.journalEntryId}
                </b>
                <span>
                  {en ? "Entry date" : "Kayıt tarihi"}:{" "}
                  {formatDate(acquisitionPosting.entryDate, en)}
                </span>
                {acquisitionPosting.lines.map((line, index) => (
                  <span key={`${line.accountId}-${index}`}>
                    {line.accountCode} · {line.accountName} —{" "}
                    {line.debit > 0
                      ? en
                        ? "Debit"
                        : "Borç"
                      : `${line.credit > 0 ? (en ? "Credit" : "Alacak") : ""}`}{" "}
                    {line.debit > 0
                      ? line.debit.toLocaleString(en ? "en-US" : "tr-TR", {
                          minimumFractionDigits: 2,
                        })
                      : line.credit.toLocaleString(en ? "en-US" : "tr-TR", {
                          minimumFractionDigits: 2,
                        })}
                  </span>
                ))}
              </div>
            ) : selected.purchaseInvoiceId ? (
              <div className="fixed-asset-disposal-summary">
                <b>
                  {en
                    ? "Purchase invoice is the accounting source"
                    : "Muhasebe kaynağı alış faturası"}
                </b>
                <span>
                  {en ? "Invoice" : "Fatura"}:{" "}
                  {acquisitionPosting?.purchaseInvoiceCode ||
                    selected.purchaseInvoiceId}
                </span>
                <span>
                  {en
                    ? "Separate acquisition posting is disabled to avoid a duplicate journal."
                    : "Aynı tutarın ikinci kez kaydedilmemesi için ayrıca edinim fişi oluşturulmaz."}
                </span>
              </div>
            ) : (
              <>
                <div className="heading-actions fixed-asset-acq-row">
                  <label>
                    {en ? "Offset account" : "Edinim karşı hesabı"}
                    <select
                      id="fixed-asset-offset-account"
                      value={offsetAccountId}
                      onChange={(e) => setOffsetAccountId(e.target.value)}
                      required
                    >
                      <option value="">
                        {en ? "Select active account" : "Etkin hesap seçin"}
                      </option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      // Same guard as the former inner form: the account is required.
                      const select = document.getElementById("fixed-asset-offset-account") as HTMLSelectElement | null;
                      if (!offsetAccountId) {
                        select?.reportValidity();
                        return;
                      }
                      void postAcquisition();
                    }}
                    disabled={
                      busy || detailLoading || !!detailError || !accounts.length
                    }
                  >
                    {busy
                      ? en
                        ? "Posting…"
                        : "Kaydediliyor…"
                      : en
                        ? "Post acquisition"
                        : "Edinimi yevmiyeleştir"}
                  </button>
                </div>
                {!detailLoading && !accounts.length && (
                  <p className="fixed-asset-inline-note">
                    {en
                      ? "No active ledger accounts are available."
                      : "Kullanılabilir etkin defter hesabı bulunamadı."}
                  </p>
                )}
              </>
            )}
              
            </RecordFormGroup>
          </div>
        )}
        {cardTab === "custody" && (
          <div className="rf-columns">
            <RecordFormGroup title={en ? "Custody history" : "Zimmet geçmişi"} hint={en ? "Assign: Actions (Alt+İ)" : "Zimmetle: İşlemler (Alt+İ)"}>

                {assignments.length ? (
                  <ul className="fixed-asset-history">
                    {assignments.map((row) => (
                      <li key={row.id}>
                        <div>
                          {assignmentFields.map((field, index) =>
                            index === 0 ? (
                              <b key={field.key}>{formatAssignmentField(row, field.key, en)}</b>
                            ) : (
                              <span key={field.key}>
                                {en
                                  ? assignmentFieldEnglish[field.key] || field.label
                                  : field.label}
                                : {formatAssignmentField(row, field.key, en)}
                              </span>
                            ),
                          )}
                        </div>
                        {!row.returnedDate && (
                          <button
                            type="button"
                            className="row-action"
                            disabled={busy || detailLoading || !!detailError}
                            onClick={() => void returnAssignment(row)}
                          >
                            {en ? "Return" : "İade al"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="fixed-asset-panel-status">
                    {detailLoading
                      ? en
                        ? "Loading custody history…"
                        : "Zimmet geçmişi yükleniyor…"
                      : en
                        ? "No custody history yet."
                        : "Henüz zimmet geçmişi yok."}
                  </p>
                )}
              
            </RecordFormGroup>
          </div>
        )}
        {cardTab === "disposal" && (
          <div className="rf-columns">
            <RecordFormGroup title={en ? "Disposal" : "Elden çıkarma"}>
              {disposal ? (

              <div className="fixed-asset-disposal-summary">
                <b>
                  {en ? "Disposed" : "Elden çıkarıldı"} ·{" "}
                  {formatDate(disposal.disposalDate, en)}
                </b>
                <span>
                  {en ? "Reason" : "Açıklama"}: {disposal.reason}
                </span>
                <span>
                  {en ? "Proceeds" : "Tahsilat"}:{" "}
                  {disposal.proceedsBase.toLocaleString(
                    en ? "en-US" : "tr-TR",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
                <span>
                  {en ? "Book value" : "Defter değeri"}:{" "}
                  {disposal.bookValueBase.toLocaleString(
                    en ? "en-US" : "tr-TR",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
                <span>
                  {en ? "Gain / loss" : "Kâr / zarar"}:{" "}
                  {disposal.gainLossBase.toLocaleString(
                    en ? "en-US" : "tr-TR",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
                <small>
                  {disposal.journalEntryId
                    ? en
                      ? `General ledger entry: ${disposal.journalEntryId}`
                      : `Yevmiye fişi: ${disposal.journalEntryId}`
                    : en
                      ? "No general ledger entry is linked."
                      : "Yevmiye fişi bağlı değil."}
                </small>
              </div>
                
              ) : (
                <p className="fixed-asset-panel-status">
                  {selectedActive
                    ? en
                      ? "Not disposed. Dispose is in Actions (Alt+İ)."
                      : "Elden çıkarılmadı. Elden çıkar: İşlemler (Alt+İ)."
                    : en
                      ? "No disposal record is loaded."
                      : "Elden çıkarma kaydı yüklenmedi."}
                </p>
              )}
            </RecordFormGroup>
          </div>
        )}
      </RecordFormTabs>
    </RecordFormPage>
  ) : null;
  if (cardOpen && assetCard && panelMode !== "acquire")
    return (
      <div className="fixed-assets-page fixed-asset-card-page">
        <PageCommandsSlot commands={assetCommands} />
        {workflowDialog}
        {assetCard}
      </div>
    );
  if (panelMode === "acquire")
    return <div className="fixed-assets-page fixed-asset-acquire-page">{acquireForm}</div>;
  return (
    <div className="fixed-assets-page list-v2">
      <PageCommandsSlot commands={assetCommands} />
      {workflowDialog}
      <ListPageHeader
        title={en ? "Fixed assets" : "Duran Varlıklar"}
        description={
          en
            ? "Track acquisitions, depreciation, custody, and disposals in one register."
            : "Edinim, amortisman, zimmet ve elden çıkarmaları tek kıymet kaydından yönetin."
        }
        count={loading && !assets.length ? null : assets.length}
        countLabel={en ? "assets" : "kıymet"}
      />
      {/* While a workflow dialog is open its form shows the error (the page alert would be behind the overlay). */}
      {error && !workflowDialog && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      {/* Figures of the loaded register (the page loads the first 200 assets), in the tenant base currency. */}
      <ListSummaryCards
        cards={[
          {
            id: "cost",
            label: en ? "Acquisition cost" : "Edinim maliyeti",
            value: loading && !assets.length ? "—" : money(totalCost),
            icon: CircleDollarSign,
            hint: en ? "loaded assets (first 200)" : "yüklenen kıymetler (ilk 200)",
          },
          {
            id: "accumulated",
            label: en ? "Accumulated depreciation" : "Birikmiş amortisman",
            value: loading && !assets.length ? "—" : money(accumulatedDepreciation),
            icon: TrendingDown,
            hint: en ? "loaded assets (first 200)" : "yüklenen kıymetler (ilk 200)",
          },
          {
            id: "net",
            label: en ? "Net book value" : "Net defter değeri",
            value: loading && !assets.length ? "—" : money(totalCost - accumulatedDepreciation),
            icon: Landmark,
            hint: en ? "loaded assets (first 200)" : "yüklenen kıymetler (ilk 200)",
          },
          {
            id: "month",
            label: en ? "Depreciation this month" : "Bu ay amortisman",
            value: loading && !assets.length ? "—" : money(thisMonthDepreciation),
            icon: CalendarClock,
            hint: en ? "straight-line estimate · active assets" : "doğrusal tahmin · etkin kıymetler",
          },
        ]}
      />
      <div
        className="fixed-asset-workspace"
      >
        <div className="fixed-asset-main">
          <FixedAssetRegister
            assets={filteredAssets}
            totalAssetCount={assets.length}
            activeAssetCount={activeAssets.length}
            onRefresh={() => {
              if (loading || detailLoading || busy) return;
              void load();
              if (selected) void loadDetails(selected);
            }}
            fields={assetFields}
            layoutReady={assetListViewLoaded}
            defaultLayout={!assetListView?.id}
            loading={loading}
            busy={busy}
            search={assetSearch}
            status={assetStatus}
            selectedId={selected?.id ?? null}
            locale={locale}
            onSearchChange={setAssetSearch}
            onStatusChange={setAssetStatus}
            onSelect={selectAsset}
            onOpen={openAsset}
            exportActionsRef={registerExportRef}
            footer={
              <ListFooter hints={en ? "↑↓ move · Space mark · Enter open · Double-click open" : "↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç"}>
                {/* The grid paginates the loaded assets itself; the endpoint returns the first 200. */}
                {assets.length >= 200 && <span>{en ? "first 200 records" : "ilk 200 kayıt"}</span>}
              </ListFooter>
            }
            fieldLabel={assetFieldLabel}
            formatField={(asset, key) => formatAssetField(asset, key, en)}
          />
        </div>
        <aside
          ref={panelRef}
          tabIndex={-1}
          className="fixed-asset-panel"
          aria-labelledby={selected ? panelTitleId : undefined}
          aria-label={selected ? undefined : en ? "Asset summary" : "Kıymet özeti"}
        >
          {!selected && (
            <p className="fixed-asset-panel-empty">
              {en
                ? "Select an asset to see its summary."
                : "Özetini görmek için bir kıymet seçin."}
            </p>
          )}
          {selected && (
            <div className="fixed-asset-summary">
              <header>
                <span className="fixed-asset-eyebrow">
                  {en ? "Selected asset" : "Seçili kıymet"}
                </span>
                <h2 id={panelTitleId}>{selected.name}</h2>
                <p>
                  {[selected.assetCode, selected.category]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </header>
              {detailLoading && (
                <p className="fixed-asset-panel-status" role="status">
                  {en ? "Loading details…" : "Ayrıntılar yükleniyor…"}
                </p>
              )}
              {detailError && (
                <p className="fixed-asset-panel-status is-error" role="alert">
                  {en
                    ? "Could not load the selected asset details. Use Refresh to try again."
                    : "Seçili kıymetin ayrıntıları yüklenemedi. Yenile ile tekrar deneyin."}
                </p>
              )}
              <div className="fixed-asset-progress">
                <div>
                  <span>{en ? "Depreciation" : "Amortisman"}</span>
                  <b>
                    {en
                      ? `${selectedMonthsDone} / ${selected.usefulLifeMonths} months`
                      : `${selectedMonthsDone} / ${selected.usefulLifeMonths} ay`}
                  </b>
                </div>
                <div
                  className="fixed-asset-progress-bar"
                  role="progressbar"
                  aria-label={en ? "Months depreciated" : "Amortismanı ayrılan ay"}
                  aria-valuemin={0}
                  aria-valuemax={selected.usefulLifeMonths}
                  aria-valuenow={selectedMonthsDone}
                >
                  <span
                    style={{
                      width: `${selected.usefulLifeMonths ? Math.min(100, (selectedMonthsDone / selected.usefulLifeMonths) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <dl className="fixed-asset-facts">
                <div>
                  <dt>{en ? "Cost" : "Maliyet"}</dt>
                  <dd>{money(selected.acquisitionCostBase)}</dd>
                </div>
                <div>
                  <dt>{en ? "Monthly depreciation" : "Aylık amortisman"}</dt>
                  <dd>{money(selectedMonthly)}</dd>
                </div>
                <div>
                  <dt>{en ? "Net book value" : "Net defter"}</dt>
                  <dd>
                    {money(
                      selected.acquisitionCostBase -
                        selected.accumulatedDepreciationBase,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{en ? "Custody" : "Zimmet"}</dt>
                  <dd>{detailLoading ? "…" : currentHolder?.employee || "—"}</dd>
                </div>
                <div>
                  <dt>{en ? "Linked invoice" : "Bağlı fatura"}</dt>
                  <dd>{linkedInvoice}</dd>
                </div>
              </dl>
              <p className="fixed-asset-panel-status">
                {en
                  ? "Enter opens the asset card · workflows are in Actions (Alt+İ)."
                  : "Enter kıymet kartını açar · işlemler İşlemler'de (Alt+İ)."}
              </p>
              
              
              
              
              
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** (cost − residual) / useful life, rounded to two decimals. */
function monthlyDepreciation(asset: Asset) {
  if (!asset.usefulLifeMonths) return 0;
  const base = asset.acquisitionCostBase - asset.residualValueBase;
  return base > 0 ? Math.round((base / asset.usefulLifeMonths) * 100) / 100 : 0;
}

const defaultAssetFields = [
  { key: "assetCode", label: "Kıymet kodu", visible: true, position: 0 },
  { key: "name", label: "Kıymet", visible: true, position: 1 },
  { key: "category", label: "Kategori", visible: true, position: 2 },
  {
    key: "acquisitionDate",
    label: "Edinim tarihi",
    visible: true,
    position: 3,
  },
  {
    key: "inServiceDate",
    label: "Kullanıma giriş",
    visible: true,
    position: 4,
  },
  {
    key: "acquisitionCostBase",
    label: "Edinim maliyeti",
    visible: true,
    position: 5,
  },
  {
    key: "residualValueBase",
    label: "Kalıntı değer",
    visible: true,
    position: 6,
  },
  {
    key: "usefulLifeMonths",
    label: "Faydalı ömür (ay)",
    visible: true,
    position: 7,
  },
  {
    key: "accumulatedDepreciationBase",
    label: "Birikmiş amortisman",
    visible: true,
    position: 8,
  },
  {
    key: "remainingBookValueBase",
    label: "Kalan defter değeri",
    visible: true,
    position: 9,
  },
  { key: "vukTaxYear", label: "VUK yılı", visible: true, position: 10 },
  {
    key: "vukDepreciationLowerLimitTry",
    label: "VUK alt sınırı (TL)",
    visible: true,
    position: 11,
  },
  {
    key: "vukCommuniqueNumber",
    label: "VUK tebliği",
    visible: true,
    position: 12,
  },
  { key: "status", label: "Durum", visible: true, position: 13 },
  {
    key: "actions",
    label: "İşlemler",
    visible: true,
    position: 14,
    fixed: true,
  },
];
const defaultDepreciationFields = [
  { key: "periodStart", label: "Dönem", visible: true, position: 0 },
  { key: "amountBase", label: "Tutar", visible: true, position: 1 },
  { key: "isPosted", label: "Durum", visible: true, position: 2 },
  { key: "journalEntryId", label: "Yevmiye fişi", visible: true, position: 3 },
];
const defaultAssignmentFields = [
  { key: "employee", label: "Personel", visible: true, position: 0 },
  { key: "assignedDate", label: "Teslim", visible: true, position: 1 },
  { key: "returnedDate", label: "İade", visible: true, position: 2 },
  { key: "location", label: "Konum", visible: true, position: 3 },
  { key: "actions", label: "İşlem", visible: true, position: 4, fixed: true },
];
const depreciationFieldEnglish: Record<string, string> = {
  periodStart: "Period",
  amountBase: "Amount",
  isPosted: "Status",
  journalEntryId: "Journal entry",
};
const assignmentFieldEnglish: Record<string, string> = {
  employee: "Employee",
  assignedDate: "Assigned",
  returnedDate: "Returned",
  location: "Location",
  actions: "Action",
};
function formatDate(value: string | null | undefined, en: boolean) {
  if (!value) return "—";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      )
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(en ? "en-US" : "tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function formatDepreciationField(
  row: Schedule["rows"][number],
  key: string,
  en: boolean,
) {
  switch (key) {
    case "periodStart":
      return row.periodStart.slice(0, 7);
    case "amountBase":
      return row.amountBase.toLocaleString(en ? "en-US" : "tr-TR", {
        minimumFractionDigits: 2,
      });
    case "isPosted":
      return row.isPosted
        ? en
          ? "Posted"
          : "Kaydedildi"
        : en
          ? "Planned"
          : "Planlandı";
    case "journalEntryId":
      return row.journalEntryId || "—";
    default:
      return "—";
  }
}
function formatAssignmentField(row: Assignment, key: string, en: boolean) {
  switch (key) {
    case "employee":
      return row.employee;
    case "assignedDate":
      return formatDate(row.assignedDate, en);
    case "returnedDate":
      return formatDate(row.returnedDate, en);
    case "location":
      return row.location || "—";
    default:
      return "—";
  }
}
const assetFieldEnglish: Record<string, string> = {
  assetCode: "Asset code",
  name: "Asset",
  category: "Category",
  acquisitionDate: "Acquired",
  inServiceDate: "In service",
  acquisitionCostBase: "Acquisition cost",
  residualValueBase: "Residual value",
  usefulLifeMonths: "Useful life (months)",
  accumulatedDepreciationBase: "Accumulated depreciation",
  remainingBookValueBase: "Remaining book value",
  vukTaxYear: "VUK year",
  vukDepreciationLowerLimitTry: "VUK lower limit (TRY)",
  vukCommuniqueNumber: "VUK communiqué",
  status: "Status",
  actions: "Actions",
};
function formatAssetField(asset: Asset, key: string, en: boolean) {
  const locale = en ? "en-US" : "tr-TR",
    money = (value: number) =>
      value.toLocaleString(locale, { minimumFractionDigits: 2 });
  switch (key) {
    case "assetCode":
      return asset.assetCode;
    case "name":
      return asset.name;
    case "category":
      return asset.category || "—";
    case "acquisitionDate":
      return formatDate(asset.acquisitionDate, en);
    case "inServiceDate":
      return formatDate(asset.inServiceDate, en);
    case "acquisitionCostBase":
      return money(asset.acquisitionCostBase);
    case "residualValueBase":
      return money(asset.residualValueBase);
    case "usefulLifeMonths":
      return asset.usefulLifeMonths;
    case "accumulatedDepreciationBase":
      return money(asset.accumulatedDepreciationBase);
    case "remainingBookValueBase":
      return money(
        asset.acquisitionCostBase - asset.accumulatedDepreciationBase,
      );
    case "vukTaxYear":
      return asset.vukTaxYear ?? "—";
    case "vukDepreciationLowerLimitTry":
      return asset.vukDepreciationLowerLimitTry === null
        ? "—"
        : money(asset.vukDepreciationLowerLimitTry);
    case "vukCommuniqueNumber":
      return asset.vukCommuniqueNumber ?? "—";
    case "status":
      return asset.status === "Active"
        ? en
          ? "Active"
          : "Etkin"
        : asset.status === "Disposed"
          ? en
            ? "Disposed"
            : "Elden çıkarıldı"
          : asset.status;
    default:
      return "—";
  }
}
