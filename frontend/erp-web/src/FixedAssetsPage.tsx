import SearchableRecordPicker from "./SearchableRecordPicker";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import type { Asset, AssetField } from "./fixed-assets/types";
import { FixedAssetRegister } from "./fixed-assets/components/FixedAssetRegister";
import { localDateString } from "./dateUtils";
import { ListPageHeader } from "./list-page/ListPageHeader";
import "./fixed-assets.css";
import ModuleRecordForm from "./human-resources/components/ModuleRecordForm";
import { RecordFormGroup } from "./record-form/RecordForm";

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
type ScreenView = { fields: AssetField[] };

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
      message =
        body.error ||
        body.title ||
        Object.values(body.errors || {})
          .flat()
          .join(" ") ||
        message;
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
    [showAcquisition, setShowAcquisition] = useState(false);
  const stayAfterCreate = useRef(false);
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
          : page.items[0] || null,
      );
    } catch (e) {
      setError((e as Error).message);
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
      if (!stayAfterCreate.current) setShowAcquisition(false);
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
  async function postAcquisition(event: React.FormEvent) {
    event.preventDefault();
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
      await load();
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
      setNotice(
        en
          ? `Asset disposed. Operational book value: ${result.bookValueBase.toLocaleString("en-US", { minimumFractionDigits: 2 })}. No journal entry was posted.`
          : `Kıymet elden çıkarıldı. Operasyonel defter değeri: ${result.bookValueBase.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}. Yevmiye kaydı oluşturulmadı.`,
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
  const assetFields = (assetListView?.fields || defaultAssetFields)
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const depreciationFields = (
    depreciationView?.fields || defaultDepreciationFields
  )
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const assignmentFields = (assignmentView?.fields || defaultAssignmentFields)
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const activeAssets = assets.filter((asset) => asset.status === "Active");
  const totalCost = assets.reduce(
    (sum, asset) => sum + asset.acquisitionCostBase,
    0,
  );
  const accumulatedDepreciation = assets.reduce(
    (sum, asset) => sum + asset.accumulatedDepreciationBase,
    0,
  );
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
  return (
    <div className="fixed-assets-page list-v2">
      <ListPageHeader
        title={en ? "Fixed assets" : "Sabit kıymetler"}
        description={
          en
            ? "Track acquisitions, depreciation, custody, and disposals in one register."
            : "Edinim, amortisman, zimmet ve elden çıkarmaları tek kıymet kaydından yönetin."
        }
        count={loading && !assets.length ? null : assets.length}
        countLabel={en ? "records" : "kayıt"}
      >
        <button
          type="button"
          className="primary"
          onClick={() => setShowAcquisition((value) => !value)}
        >
          {showAcquisition
            ? en
              ? "Close form"
              : "Formu kapat"
            : en
              ? "New acquisition"
              : "Yeni edinim"}
        </button>
      </ListPageHeader>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      <section
        className="fixed-asset-metrics"
        aria-label={en ? "Asset summary" : "Kıymet özeti"}
      >
        <article>
          <span>{en ? "Acquisition cost" : "Edinim maliyeti"}</span>
          <strong>
            {totalCost.toLocaleString(en ? "en-US" : "tr-TR", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <small>
            {en ? "Company base currency" : "Firma baz para birimi"}
          </small>
        </article>
        <article>
          <span>{en ? "Accumulated depreciation" : "Birikmiş amortisman"}</span>
          <strong>
            {accumulatedDepreciation.toLocaleString(en ? "en-US" : "tr-TR", {
              minimumFractionDigits: 2,
            })}
          </strong>
          <small>{en ? "Book total" : "Defter toplamı"}</small>
        </article>
        <article>
          <span>{en ? "Net book value" : "Net defter değeri"}</span>
          <strong>
            {(totalCost - accumulatedDepreciation).toLocaleString(
              en ? "en-US" : "tr-TR",
              { minimumFractionDigits: 2 },
            )}
          </strong>
          <small>{en ? "Operational value" : "Operasyonel değer"}</small>
        </article>
      </section>
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
        loading={loading}
        search={assetSearch}
        status={assetStatus}
        selectedId={selected?.id ?? null}
        locale={locale}
        onSearchChange={setAssetSearch}
        onStatusChange={setAssetStatus}
        onSelect={setSelected}
        fieldLabel={(key, label) =>
          en ? assetFieldEnglish[key] || label : label
        }
        formatField={(asset, key) => formatAssetField(asset, key, en)}
      />
      {showAcquisition && (
        <section
          className="hrp-form-section"
          aria-label={en ? "Register an acquisition" : "Edinim kaydı oluştur"}
        >
          <ModuleRecordForm
            title={en ? "Register an acquisition" : "Edinim kaydı oluştur"}
            className="hrp-wide"
            mode="create"
            busy={busy}
            saveLabel={en ? "Save acquisition" : "Edinimi kaydet"}
            onSubmit={createAsset}
            onCancel={() => setShowAcquisition(false)}
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
        </section>
      )}

      {selected && (
        <>
          <div
            className="fixed-asset-detail-status"
            role={detailError ? "alert" : "status"}
            aria-live="polite"
          >
            {detailLoading
              ? en
                ? `Loading details for ${selected.assetCode}…`
                : `${selected.assetCode} ayrıntıları yükleniyor…`
              : detailError
                ? en
                  ? "Could not load the selected asset details. Use Refresh to try again."
                  : "Seçili kıymetin ayrıntıları yüklenemedi. Yenile ile tekrar deneyin."
                : en
                  ? `Selected asset: ${selected.assetCode} · ${selected.name}`
                  : `Seçili kıymet: ${selected.assetCode} · ${selected.name}`}
          </div>
          <section
            className="panel"
            aria-labelledby="acquisition-accounting-heading"
          >
            <div className="panel-heading">
              <div>
                <h3 id="acquisition-accounting-heading">
                  {en ? "Acquisition accounting" : "Edinim muhasebesi"} ·{" "}
                  {selected.assetCode}
                </h3>
                <p>
                  {en
                    ? "Posts debit to the company fixed-asset cost mapping and credit to the active offset account you select."
                    : "Firma sabit kıymet maliyet hesabına borç, seçtiğiniz etkin karşı hesaba alacak kaydeder."}
                </p>
              </div>
              <span className="fixed-asset-step">
                {en ? "02 · Journal" : "02 · Yevmiye"}
              </span>
            </div>
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
                <form className="heading-actions" onSubmit={postAcquisition}>
                  <label>
                    {en ? "Offset account" : "Edinim karşı hesabı"}
                    <select
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
                    className="primary"
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
                </form>
                {!detailLoading && !accounts.length && (
                  <p className="fixed-asset-inline-note">
                    {en
                      ? "No active ledger accounts are available."
                      : "Kullanılabilir etkin defter hesabı bulunamadı."}
                  </p>
                )}
              </>
            )}
          </section>
          <section className="panel" aria-labelledby="depreciation-heading">
            <div className="panel-heading">
              <div>
                <h3 id="depreciation-heading">
                  {en ? "Depreciation schedule" : "Amortisman planı"} ·{" "}
                  {selected.assetCode}
                </h3>
                <p>
                  {en
                    ? "Monthly straight-line estimate begins in the month after service; posting requires ledger mappings."
                    : "Aylık doğrusal tahmin kullanıma giriş ayını izleyen ay başlar; kayıt için defter eşleştirmeleri gerekir."}
                </p>
              </div>
              <span className="fixed-asset-step">
                {en ? "03 · Depreciation" : "03 · Amortisman"}
              </span>
            </div>
            <form className="heading-actions" onSubmit={postDepreciation}>
              <label>
                {en ? "Post period" : "Kaydedilecek dönem"}
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  required
                />
              </label>
              <button
                className="primary"
                disabled={busy || detailLoading || !!detailError}
              >
                {busy
                  ? en
                    ? "Posting…"
                    : "Kaydediliyor…"
                  : en
                    ? "Post depreciation"
                    : "Amortismanı kaydet"}
              </button>
            </form>
            <div
              className="ledger-list"
              role="region"
              aria-label={en ? "Depreciation schedule" : "Amortisman planı"}
              tabIndex={0}
            >
              <AdvancedDataGrid
                enableRowSelection={false}
                className="customer-table"
                gridId="fixed-asset-depreciation"
                {...screenViewGridDefaults(depreciationFields)}
              >
                <thead>
                  <tr>
                    {depreciationFields.map((field) => (
                      <th key={field.key} scope="col">
                        {en
                          ? depreciationFieldEnglish[field.key] || field.label
                          : field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schedule?.rows.map((row) => (
                    <tr key={row.periodStart}>
                      {depreciationFields.map((field) => (
                        <td
                          key={field.key}
                          data-label={
                            en
                              ? depreciationFieldEnglish[field.key] ||
                                field.label
                              : field.label
                          }
                        >
                          {formatDepreciationField(row, field.key, en)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {detailLoading && (
                    <tr>
                      <td
                        colSpan={Math.max(depreciationFields.length, 1)}
                        className="table-empty"
                        role="status"
                      >
                        {en
                          ? "Loading schedule…"
                          : "Amortisman planı yükleniyor…"}
                      </td>
                    </tr>
                  )}
                  {detailError && (
                    <tr>
                      <td
                        colSpan={Math.max(depreciationFields.length, 1)}
                        className="table-empty"
                      >
                        {en
                          ? "Schedule is unavailable. Refresh to try again."
                          : "Amortisman planına ulaşılamıyor. Yenile ile tekrar deneyin."}
                      </td>
                    </tr>
                  )}
                  {!detailLoading &&
                    !detailError &&
                    schedule &&
                    !schedule.rows.length && (
                      <tr>
                        <td
                          colSpan={Math.max(depreciationFields.length, 1)}
                          className="table-empty"
                        >
                          {en
                            ? "No remaining periods in this range."
                            : "Bu aralıkta kalan dönem yok."}
                        </td>
                      </tr>
                    )}
                </tbody>
              </AdvancedDataGrid>
            </div>
          </section>
          <section className="panel" aria-labelledby="tax-depreciation-heading">
            <div className="panel-heading">
              <div>
                <h3 id="tax-depreciation-heading">
                  {en
                    ? "VUK tax depreciation estimate"
                    : "VUK vergi amortisman tahmini"}{" "}
                  · {selected.assetCode}
                </h3>
                <p>
                  {en
                    ? "Separate from the operational book schedule; based only on the accountant-confirmed snapshot saved on this asset."
                    : "Operasyonel defter planından ayrıdır; yalnızca kıymette saklanan mali müşavir onaylı anlık profile dayanır."}
                </p>
              </div>
              <span className="fixed-asset-step">
                {en ? "Tax estimate" : "Vergi tahmini"}
              </span>
            </div>
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
                  className="ledger-list"
                  role="region"
                  aria-label={
                    en
                      ? "VUK tax depreciation estimate"
                      : "VUK vergi amortisman tahmini"
                  }
                  tabIndex={0}
                >
                  <AdvancedDataGrid
                    enableRowSelection={false}
                    className="customer-table"
                  >
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
                  </AdvancedDataGrid>
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
          </section>
          <section className="panel" aria-labelledby="disposal-heading">
            <div className="panel-heading">
              <div>
                <h3 id="disposal-heading">
                  {en ? "Dispose asset" : "Kıymeti elden çıkar"}
                </h3>
                <p>
                  {en
                    ? "Book value uses scheduled depreciation through the last complete month before disposal. Posting requires tenant ledger mappings."
                    : "Defter değeri elden çıkarma ayından önceki son tam dönemin amortisman planını kullanır. Kayıt için firma defter hesap eşleştirmeleri gerekir."}
                </p>
              </div>
              <span className="fixed-asset-step">
                {en ? "04 · Disposal" : "04 · Elden çıkarma"}
              </span>
            </div>
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
              <>
                <ModuleRecordForm
                  title={en ? "Disposal record" : "Elden çıkarma kaydı"}
                  mode="create"
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
                {!detailLoading &&
                  !detailError &&
                  selected.status !== "Active" && (
                    <p className="fixed-asset-inline-note">
                      {en
                        ? "Disposal can be recorded for an active asset."
                        : "Elden çıkarma yalnızca etkin kıymetler için kaydedilebilir."}
                    </p>
                  )}
              </>
            )}
          </section>
          <section className="panel" aria-labelledby="custody-heading">
            <div className="panel-heading">
              <div>
                <h3 id="custody-heading">
                  {en ? "Custody" : "Zimmet"} · {selected.assetCode}
                </h3>
                <p>
                  {en
                    ? "Assignment history is retained when an asset is returned."
                    : "Kıymet iade edildiğinde zimmet geçmişi korunur."}
                </p>
              </div>
              <span className="fixed-asset-step">
                {en ? "05 · Custody" : "05 · Zimmet"}
              </span>
            </div>
            <ModuleRecordForm
              title={en ? "Custody assignment" : "Zimmet kaydı"}
              mode="create"
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
            <div
              className="ledger-list"
              role="region"
              aria-label={en ? "Custody history" : "Zimmet geçmişi"}
              tabIndex={0}
            >
              <AdvancedDataGrid
                enableRowSelection={false}
                className="customer-table"
                gridId="fixed-asset-assignments"
                {...screenViewGridDefaults(assignmentFields)}
              >
                <thead>
                  <tr>
                    {assignmentFields.map((field) => (
                      <th key={field.key} scope="col">
                        {en
                          ? assignmentFieldEnglish[field.key] || field.label
                          : field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((row) => (
                    <tr key={row.id}>
                      {assignmentFields.map((field) => (
                        <td
                          key={field.key}
                          data-label={
                            en
                              ? assignmentFieldEnglish[field.key] || field.label
                              : field.label
                          }
                        >
                          {field.key === "actions"
                            ? !row.returnedDate && (
                                <button
                                  type="button"
                                  className="row-action"
                                  disabled={
                                    busy || detailLoading || !!detailError
                                  }
                                  onClick={() => void returnAssignment(row)}
                                >
                                  {busy
                                    ? en
                                      ? "Saving…"
                                      : "Kaydediliyor…"
                                    : en
                                      ? "Return"
                                      : "İade al"}
                                </button>
                              )
                            : formatAssignmentField(row, field.key, en)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {detailLoading && (
                    <tr>
                      <td
                        colSpan={Math.max(assignmentFields.length, 1)}
                        className="table-empty"
                        role="status"
                      >
                        {en
                          ? "Loading custody history…"
                          : "Zimmet geçmişi yükleniyor…"}
                      </td>
                    </tr>
                  )}
                  {detailError && (
                    <tr>
                      <td
                        colSpan={Math.max(assignmentFields.length, 1)}
                        className="table-empty"
                      >
                        {en
                          ? "Custody history is unavailable. Refresh to try again."
                          : "Zimmet geçmişine ulaşılamıyor. Yenile ile tekrar deneyin."}
                      </td>
                    </tr>
                  )}
                  {!detailLoading && !detailError && !assignments.length && (
                    <tr>
                      <td
                        colSpan={Math.max(assignmentFields.length, 1)}
                        className="table-empty"
                      >
                        {en
                          ? "No custody history yet."
                          : "Henüz zimmet geçmişi yok."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </AdvancedDataGrid>
            </div>
          </section>
        </>
      )}
    </div>
  );
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
