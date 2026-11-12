import { useEffect, useState } from "react";
import { authenticatedFetch } from "./authApi";
import "./credit-facilities.css";
import { CreditFacilitiesSummary } from "./credit-facilities/components/CreditFacilitiesSummary";
import { CreditExposurePanel } from "./credit-facilities/components/CreditExposurePanel";
import { CreditFacilityRegister } from "./credit-facilities/components/CreditFacilityRegister";
import { CreditFacilitiesPageStatus } from "./credit-facilities/components/CreditFacilitiesPageStatus";
import { CreditFacilitySetup } from "./credit-facilities/components/CreditFacilitySetup";
import { CreditMovementForm } from "./credit-facilities/components/CreditMovementForm";
import { CreditSecuritiesPanel } from "./credit-facilities/components/CreditSecuritiesPanel";
import type {
  Account,
  EffectiveInterestPreview,
  ExposureSummary,
  Facility,
  InterestPreview,
  InterestPosting,
  Movement,
  Schedule,
  ScreenField,
  Security,
  SecuritySummary,
} from "./credit-facilities/types";
import { confirmLocalized } from "./locale";

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
    let message = `İstek başarısız (${response.status})`;
    try {
      const body = await response.json();
      message =
        body.error ||
        Object.values(body.errors || {})
          .flat()
          .join(" ") ||
        message;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type CreditFacilitiesView =
  | "list"
  | "facility-create"
  | "schedule-create"
  | "movement-create"
  | "repayment-create"
  | "security-create";
export default function CreditFacilitiesPage({
  token,
  role,
  view = "list",
  onNavigate,
}: {
  token: string;
  role: string;
  view?: CreditFacilitiesView;
  onNavigate?: (page: string, label?: string) => void;
}) {
  const admin = role === "TenantAdmin";
  const [facilities, setFacilities] = useState<Facility[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [interestPreviews, setInterestPreviews] = useState<
    Record<string, InterestPreview>
  >({});
  const [effectiveInterestPreviews, setEffectiveInterestPreviews] = useState<
    Record<string, EffectiveInterestPreview>
  >({});
  const [effectiveInterestCosts, setEffectiveInterestCosts] = useState<
    Record<string, string>
  >({});
  const [securities, setSecurities] = useState<Security[]>([]),
    [expiringSecurities, setExpiringSecurities] = useState(0),
    [expiredSecurities, setExpiredSecurities] = useState(0);
  const [exposure, setExposure] = useState<ExposureSummary>({
    currencies: [],
    facilities: [],
  });
  const [securityFacilityId, setSecurityFacilityId] = useState(""),
    [securityType, setSecurityType] = useState<"Guarantee" | "Collateral">(
      "Guarantee",
    ),
    [securityCode, setSecurityCode] = useState(""),
    [securityIssuer, setSecurityIssuer] = useState(""),
    [securityBeneficiary, setSecurityBeneficiary] = useState(""),
    [securityAmount, setSecurityAmount] = useState(""),
    [securityCommission, setSecurityCommission] = useState("0"),
    [securityIssueDate, setSecurityIssueDate] = useState(today()),
    [securityExpiryDate, setSecurityExpiryDate] = useState(""),
    [securityNotes, setSecurityNotes] = useState("");
  const [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState("All"),
    [currencyFilter, setCurrencyFilter] = useState("All");
  const [scheduleFields, setScheduleFields] = useState<ScreenField[]>([
    { key: "dueDate", label: "Vade", visible: true, position: 0 },
    { key: "principalAmount", label: "Anapara", visible: true, position: 1 },
    { key: "interestAmount", label: "Faiz", visible: true, position: 2 },
    { key: "feeAmount", label: "Ücret", visible: true, position: 3 },
    { key: "total", label: "Toplam", visible: true, position: 4 },
    { key: "status", label: "Durum", visible: true, position: 5 },
    { key: "actions", label: "İşlem", visible: true, position: 6, fixed: true },
  ]);
  const [movementFields, setMovementFields] = useState<ScreenField[]>([
    { key: "transactionDate", label: "Tarih", visible: true, position: 0 },
    { key: "type", label: "Tür", visible: true, position: 1 },
    { key: "accountCode", label: "Hesap", visible: true, position: 2 },
    { key: "principalAmount", label: "Anapara", visible: true, position: 3 },
    { key: "interestAmount", label: "Faiz", visible: true, position: 4 },
    { key: "feeAmount", label: "Ücret", visible: true, position: 5 },
    { key: "actions", label: "İşlem", visible: true, position: 6, fixed: true },
  ]);
  const [exposureFields, setExposureFields] = useState<ScreenField[]>([
    { key: "code", label: "Kredi", visible: true, position: 0 },
    { key: "lenderName", label: "Banka / kurum", visible: true, position: 1 },
    { key: "currencyCode", label: "Para birimi", visible: true, position: 2 },
    { key: "approvedLimit", label: "Onaylı limit", visible: false, position: 3 },
    {
      key: "outstandingPrincipal",
      label: "Açık anapara",
      visible: true,
      position: 4,
    },
    { key: "security", label: "Teminat + garanti", visible: true, position: 5 },
    {
      key: "limitUtilization",
      label: "Limit kullanım",
      visible: true,
      position: 6,
    },
  ]);
  const [securityFields, setSecurityFields] = useState<ScreenField[]>([
    { key: "code", label: "Kod / tür", visible: true, position: 0 },
    { key: "facilityCode", label: "Bağlı kredi", visible: true, position: 1 },
    { key: "parties", label: "Veren → lehtar", visible: true, position: 2 },
    { key: "amount", label: "Tutar", visible: true, position: 3 },
    { key: "commissionAmount", label: "Komisyon", visible: true, position: 4 },
    { key: "issueDate", label: "Düzenleme", visible: true, position: 5 },
    { key: "expiryDate", label: "Vade", visible: true, position: 6 },
    { key: "status", label: "Durum", visible: true, position: 7 },
    { key: "notes", label: "Not", visible: false, position: 8 },
    { key: "actions", label: "İşlem", visible: true, position: 9, fixed: true },
  ]);
  const [code, setCode] = useState(""),
    [lender, setLender] = useState(""),
    [kind, setKind] = useState("Loan"),
    [currency, setCurrency] = useState("TRY"),
    [limit, setLimit] = useState(""),
    [startDate, setStartDate] = useState(today()),
    [maturityDate, setMaturityDate] = useState(""),
    [rate, setRate] = useState(""),
    [notes, setNotes] = useState("");
  const [facilityId, setFacilityId] = useState(""),
    [dueDate, setDueDate] = useState(today()),
    [principal, setPrincipal] = useState(""),
    [interest, setInterest] = useState(""),
    [fee, setFee] = useState(""),
    [scheduleNotes, setScheduleNotes] = useState("");
  const [movementFacilityId, setMovementFacilityId] = useState(""),
    [movementType, setMovementType] = useState<"Drawdown" | "Repayment">(
      "Drawdown",
    ),
    [accountId, setAccountId] = useState(""),
    [movementDate, setMovementDate] = useState(today()),
    [movementPrincipal, setMovementPrincipal] = useState(""),
    [movementInterest, setMovementInterest] = useState(""),
    [movementFee, setMovementFee] = useState(""),
    [movementScheduleId, setMovementScheduleId] = useState(""),
    [movementNotes, setMovementNotes] = useState(""),
    [movementRequestId, setMovementRequestId] = useState(() =>
      crypto.randomUUID(),
    );
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [rows, accountRows, securitySummary, exposureSummary] =
        await Promise.all([
          request<Facility[]>("/api/finance/credit-facilities/", token),
          request<Account[]>("/api/finance/accounts/", token),
          request<SecuritySummary>(
            "/api/finance/credit-facilities/securities?expiryWithinDays=30",
            token,
          ),
          request<ExposureSummary>(
            "/api/finance/credit-facilities/exposure-summary",
            token,
          ),
        ]);
      setFacilities(rows);
      setAccounts(accountRows);
      setSecurities(securitySummary.items);
      setExpiringSecurities(securitySummary.expiringCount);
      setExpiredSecurities(securitySummary.expiredCount);
      setExposure(exposureSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kredi bilgileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  useEffect(() => {
    if (view === "movement-create") setMovementType("Drawdown");
    if (view === "repayment-create") setMovementType("Repayment");
  }, [view]);
  useEffect(() => {
    if (view !== "repayment-create") return;
    try {
      const raw = sessionStorage.getItem("credit-facility-payment-draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        facilityId?: string;
        scheduleId?: string;
        principal?: string;
        interest?: string;
        fee?: string;
      };
      sessionStorage.removeItem("credit-facility-payment-draft");
      if (draft.facilityId) setMovementFacilityId(draft.facilityId);
      if (draft.scheduleId) setMovementScheduleId(draft.scheduleId);
      if (draft.principal) setMovementPrincipal(draft.principal);
      if (draft.interest) setMovementInterest(draft.interest);
      if (draft.fee) setMovementFee(draft.fee);
    } catch {
      sessionStorage.removeItem("credit-facility-payment-draft");
    }
  }, [view]);
  useEffect(() => {
    let cancelled = false;
    request<{ fields: ScreenField[] }>(
      "/api/screen-views/finance-credit-schedules/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setScheduleFields(
            view.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    request<{ fields: ScreenField[] }>(
      "/api/screen-views/finance-credit-movements/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setMovementFields(
            view.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    request<{ fields: ScreenField[] }>(
      "/api/screen-views/finance-credit-exposure-facilities/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setExposureFields(
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
  useEffect(() => {
    if (view !== "list") return;
    let cancelled = false;
    request<{ fields: ScreenField[] }>(
      "/api/screen-views/finance-credit-securities/active",
      token,
    )
      .then((view) => {
        if (!cancelled && view.fields?.length)
          setSecurityFields(
            view.fields.map((field, index) => ({
              ...field,
              fixed: field.key === "actions",
              position: field.position ?? index,
            })),
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, view]);
  async function submitFacility(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/api/finance/credit-facilities/", token, {
        method: "POST",
        body: JSON.stringify({
          code,
          lenderName: lender,
          facilityType: kind,
          currencyCode: currency,
          approvedLimit: Number(limit),
          startDate,
          maturityDate: maturityDate || null,
          annualInterestRatePercent: rate === "" ? null : Number(rate),
          notes: notes || null,
        }),
      });
      setCode("");
      setLender("");
      setLimit("");
      setMaturityDate("");
      setRate("");
      setNotes("");
      setNotice("Kredi/finansman kaydı oluşturuldu.");
      await load();
      onNavigate?.("finance-credit-facilities", "Krediler & Finansman");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kredi kaydı oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }
  async function submitSecurity(e: React.FormEvent) {
    e.preventDefault();
    const facility = facilities.find((x) => x.id === securityFacilityId);
    if (!facility) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/finance/credit-facilities/${facility.id}/securities`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            type: securityType,
            code: securityCode,
            issuer: securityIssuer,
            beneficiary: securityBeneficiary,
            amount: Number(securityAmount),
            currencyCode: facility.currencyCode,
            commissionAmount: Number(securityCommission || 0),
            issueDate: securityIssueDate,
            expiryDate: securityExpiryDate,
            notes: securityNotes || null,
          }),
        },
      );
      setSecurityCode("");
      setSecurityIssuer("");
      setSecurityBeneficiary("");
      setSecurityAmount("");
      setSecurityCommission("0");
      setSecurityExpiryDate("");
      setSecurityNotes("");
      setNotice(
        "Teminat/garanti kaydı oluşturuldu. Nakit veya muhasebe hareketi oluşturulmadı.",
      );
      await load();
      onNavigate?.("finance-credit-facilities", "Krediler & Finansman");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Teminat/garanti kaydı oluşturulamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function closeSecurity(item: Security, status: "Released" | "Called") {
    if (
      !confirmLocalized(
        `${item.code} kaydı ${status === "Released" ? "serbest bırakılmış" : "nakde/zarara çağrılmış"} olarak işaretlensin mi? Bu işlem nakit veya muhasebe kaydı oluşturmaz.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/finance/credit-facilities/${item.creditFacilityId}/securities/${item.id}/status`,
        token,
        { method: "PUT", body: JSON.stringify({ status }) },
      );
      setNotice(`${item.code} durumu güncellendi.`);
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Teminat/garanti durumu güncellenemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submitSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!facilityId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/finance/credit-facilities/${facilityId}/schedule`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            dueDate,
            principalAmount: Number(principal),
            interestAmount: Number(interest || 0),
            feeAmount: Number(fee || 0),
            notes: scheduleNotes || null,
          }),
        },
      );
      setPrincipal("");
      setInterest("");
      setFee("");
      setScheduleNotes("");
      setNotice("Ödeme planına satır eklendi.");
      await load();
      onNavigate?.("finance-credit-facilities", "Krediler & Finansman");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme planı kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }
  async function submitMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!movementFacilityId || !accountId) return;
    setBusy(true);
    setError("");
    setNotice("");
    const payload =
      movementType === "Drawdown"
        ? {
            requestId: movementRequestId,
            financialAccountId: accountId,
            transactionDate: movementDate,
            principalAmount: Number(movementPrincipal),
            notes: movementNotes || null,
          }
        : {
            requestId: movementRequestId,
            financialAccountId: accountId,
            creditFacilityScheduleId: movementScheduleId || null,
            transactionDate: movementDate,
            principalAmount: Number(movementPrincipal),
            interestAmount: Number(movementInterest || 0),
            feeAmount: Number(movementFee || 0),
            notes: movementNotes || null,
          };
    try {
      await request(
        `/api/finance/credit-facilities/${movementFacilityId}/${movementType === "Drawdown" ? "drawdowns" : "repayments"}`,
        token,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setMovementRequestId(crypto.randomUUID());
      setMovementPrincipal("");
      setMovementInterest("");
      setMovementFee("");
      setMovementScheduleId("");
      setMovementNotes("");
      setNotice(
        movementType === "Drawdown"
          ? "Kredi kullandırımı banka/kasa hareketine işlendi."
          : "Kredi geri ödemesi banka/kasa hareketine işlendi.",
      );
      await load();
      onNavigate?.("finance-credit-facilities", "Krediler & Finansman");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Kredi hareketi kaydedilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function previewInterest(f: Facility) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const end = today();
      const monthStart = `${end.slice(0, 7)}-01`;
      const from = f.startDate > monthStart ? f.startDate : monthStart;
      const to = f.maturityDate && f.maturityDate < end ? f.maturityDate : end;
      if (from > to)
        throw new Error(
          "Bu ay kredi sözleşmesi dönemi içinde tahakkuk günü yok.",
        );
      const result = await request<InterestPreview>(
        `/api/finance/credit-facilities/${f.id}/interest-accrual-preview?from=${from}&to=${to}`,
        token,
      );
      setInterestPreviews((current) => ({ ...current, [f.id]: result }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Faiz tahakkuk önizlemesi alınamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function previewEffectiveInterest(f: Facility) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const initialTransactionCosts = Number(effectiveInterestCosts[f.id] || 0);
      if (
        !Number.isFinite(initialTransactionCosts) ||
        initialTransactionCosts < 0 ||
        Math.round(initialTransactionCosts * 100) !==
          initialTransactionCosts * 100
      )
        throw new Error(
          "İşlem maliyetini sıfır veya pozitif, en fazla iki ondalık girin.",
        );
      const result = await request<EffectiveInterestPreview>(
        `/api/finance/credit-facilities/${f.id}/effective-interest-preview`,
        token,
        { method: "POST", body: JSON.stringify({ initialTransactionCosts }) },
      );
      setEffectiveInterestPreviews((current) => ({
        ...current,
        [f.id]: result,
      }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "TFRS 9 etkin faiz planı alınamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function postPreviousMonthInterest(f: Facility) {
    const current = new Date();
    const previous = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    const year = previous.getFullYear(),
      month = previous.getMonth() + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    if (
      !confirmLocalized(
        `${f.code} için ${period} Actual/365 faiz tahakkuku muhasebeleştirilsin mi? Kayıt aynı firma ve kredi için tekrar çalıştırıldığında yinelenmez.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<InterestPosting>(
        `/api/finance/credit-facilities/${f.id}/interest-accruals/${year}/${month}`,
        token,
        { method: "POST" },
      );
      setNotice(
        result.posted === false
          ? `${period} için tahakkuk yok; fiş oluşturulmadı.`
          : `${period} faiz tahakkuku ${result.replayed ? "zaten kayıtlı" : "yevmiye fişine işlendi"}${result.accruedInterest !== undefined ? `: ${money(result.accruedInterest, result.currencyCode || f.currencyCode)}` : ""}.`,
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Aylık faiz tahakkuku muhasebeleştirilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  function prepareSchedulePayment(f: Facility, item: Schedule) {
    sessionStorage.setItem(
      "credit-facility-payment-draft",
      JSON.stringify({
        facilityId: f.id,
        scheduleId: item.id,
        principal: String(item.principalAmount),
        interest: String(item.interestAmount),
        fee: String(item.feeAmount),
      }),
    );
    onNavigate?.("finance-credit-repayment-create", "Kredi geri ödemesi");
  }
  async function setScheduleStatus(item: Schedule, status: "Cancelled") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/finance/credit-facilities/schedule/${item.id}/status`,
        token,
        { method: "PUT", body: JSON.stringify({ status, paidDate: null }) },
      );
      setNotice("Ödeme planı iptal edildi.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme planı güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }
  async function closeFacility(f: Facility) {
    setBusy(true);
    setError("");
    try {
      await request(`/api/finance/credit-facilities/${f.id}/status`, token, {
        method: "PUT",
        body: JSON.stringify({
          status: f.status === "Active" ? "Closed" : "Active",
        }),
      });
      setNotice(
        f.status === "Active"
          ? "Kredi kapatıldı."
          : "Kredi yeniden etkinleştirildi.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Kredi durumu değiştirilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reverseMovement(f: Facility, m: Movement) {
    const date = today() < m.transactionDate ? m.transactionDate : today();
    if (
      !confirmLocalized(
        `${m.transactionDate} tarihli ${m.type === "Drawdown" ? "kullandırım" : "geri ödeme"} hareketi için ${date} tarihli ters kayıt oluşturulsun mu? Özgün kayıt korunur.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/finance/credit-facilities/${f.id}/movements/${m.id}/reversals`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            transactionDate: date,
            notes: "Kredi hareketi düzeltmesi",
          }),
        },
      );
      setNotice(
        "Kredi hareketi banka/kasa ve kredi defterine ters kayıt olarak işlendi.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Kredi hareketi ters kaydedilemedi.",
      );
    } finally {
      setBusy(false);
    }
  }
  const active = facilities.filter((x) => x.status === "Active");
  const movementFacility = facilities.find((x) => x.id === movementFacilityId);
  const currencies = [...new Set(facilities.map((f) => f.currencyCode))].sort();
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");
  const visibleFacilities = facilities.filter(
    (f) =>
      (statusFilter === "All" || f.status === statusFilter) &&
      (currencyFilter === "All" || f.currencyCode === currencyFilter) &&
      (!normalizedSearch ||
        [f.code, f.lenderName, f.facilityType, f.notes || ""].some((value) =>
          value.toLocaleLowerCase("tr-TR").includes(normalizedSearch),
        )),
  );
  const visibleScheduleFields = scheduleFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const visibleMovementFields = movementFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const visibleExposureFields = exposureFields
    .filter((field) => field.visible)
    .sort((a, b) => a.position - b.position);
  const visibleSecurityFields = securityFields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions"
        ? 1
        : b.key === "actions"
          ? -1
          : a.position - b.position,
    );
  const currencySummaries = currencies
    .map((code) => {
      const rows = facilities.filter((f) => f.currencyCode === code);
      return {
        code,
        count: rows.length,
        approved: rows.reduce((sum, f) => sum + f.approvedLimit, 0),
        drawdown: rows.reduce((sum, f) => sum + f.totalDrawdown, 0),
        outstanding: rows.reduce((sum, f) => sum + f.outstandingPrincipal, 0),
        scheduled: rows.reduce((sum, f) => sum + f.openScheduleTotal, 0),
      };
    })
    .filter(
      (summary) => currencyFilter === "All" || summary.code === currencyFilter,
    );
  const isList = view === "list";
  const pageTitle =
    view === "facility-create"
      ? "Yeni kredi / limit"
      : view === "schedule-create"
        ? "Ödeme planına taksit ekle"
        : view === "repayment-create"
          ? "Kredi geri ödemesi kaydet"
          : view === "security-create"
            ? "Teminat / garanti tanımla"
            : "Kredi kullandırımı kaydet";
  return (
    <div
      className={`finance-page credit-facilities-page${isList ? "" : " credit-operation-screen"}`}
    >
      {isList ? (
        <CreditFacilitiesPageStatus
          loading={loading}
          error={error}
          notice={notice}
          isAdmin={admin}
          totalCount={facilities.length}
          activeCount={active.length}
          visibleCount={visibleFacilities.length}
          onCreateFacility={() =>
            onNavigate?.("finance-credit-facility-create", "Yeni kredi / limit")
          }
          onCreateSchedule={() =>
            onNavigate?.("finance-credit-schedule-create", "Taksit planla")
          }
          onCreateMovement={() =>
            onNavigate?.("finance-credit-movement-create", "Kredi kullandırımı")
          }
          onRefresh={() => void load()}
          onDismissNotice={() => setNotice("")}
        />
      ) : (
        <div className="credit-operation-page-heading">
          <div>
            <button
              type="button"
              className="secondary small-button"
              onClick={() =>
                onNavigate?.(
                  "finance-credit-facilities",
                  "Krediler & Finansman",
                )
              }
            >
              ← Krediler & Finansman
            </button>
            <p className="eyebrow">FİNANS YÖNETİMİ · KREDİLER & FİNANSMAN</p>
            <h1>{pageTitle}</h1>
            <p className="muted">
              İşlemi ayrı ekranda tamamlayın; kaydedince kredi listesine
              dönersiniz.
            </p>
          </div>
        </div>
      )}
      {!isList && error && (
        <div className="alert inline-alert" role="alert">
          {error}
        </div>
      )}
      {!isList && notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {isList && (
        <>
          <CreditFacilitiesSummary
            summaries={currencySummaries}
            formatMoney={money}
          />
          <CreditExposurePanel
            exposure={exposure}
            formatMoney={money}
            visibleFacilityFields={visibleExposureFields}
          />
        </>
      )}
      <CreditFacilitySetup
        isAdmin={admin}
        view={
          view === "facility-create"
            ? "facility"
            : view === "schedule-create"
              ? "schedule"
              : "list"
        }
        onNavigate={onNavigate}
        busy={busy}
        activeFacilities={active}
        code={code}
        lender={lender}
        kind={kind}
        currency={currency}
        limit={limit}
        startDate={startDate}
        maturityDate={maturityDate}
        rate={rate}
        notes={notes}
        facilityId={facilityId}
        dueDate={dueDate}
        principal={principal}
        interest={interest}
        fee={fee}
        scheduleNotes={scheduleNotes}
        onCloseFacilityDialog={() => {}}
        onSubmitFacility={submitFacility}
        onSubmitSchedule={submitSchedule}
        onCodeChange={setCode}
        onLenderChange={setLender}
        onKindChange={setKind}
        onCurrencyChange={setCurrency}
        onLimitChange={setLimit}
        onStartDateChange={setStartDate}
        onMaturityDateChange={setMaturityDate}
        onRateChange={setRate}
        onNotesChange={setNotes}
        onFacilityIdChange={setFacilityId}
        onDueDateChange={setDueDate}
        onPrincipalChange={setPrincipal}
        onInterestChange={setInterest}
        onFeeChange={setFee}
        onScheduleNotesChange={setScheduleNotes}
      />
      {view === "movement-create" || view === "repayment-create" ? (
        <CreditMovementForm
          isAdmin={admin}
          view={view === "repayment-create" ? "repayment" : "drawdown"}
          onNavigate={onNavigate}
          facilities={facilities}
          accounts={accounts}
          facilityId={movementFacilityId}
          movementFacility={movementFacility}
          movementType={movementType}
          accountId={accountId}
          movementDate={movementDate}
          principal={movementPrincipal}
          interest={movementInterest}
          fee={movementFee}
          scheduleId={movementScheduleId}
          notes={movementNotes}
          busy={busy}
          formatMoney={money}
          onSubmit={submitMovement}
          onFacilityChange={(value) => {
            setMovementFacilityId(value);
            setAccountId("");
            setMovementScheduleId("");
          }}
          onTypeChange={(value) => {
            setMovementType(value);
            setMovementScheduleId("");
          }}
          onAccountChange={setAccountId}
          onDateChange={setMovementDate}
          onPrincipalChange={setMovementPrincipal}
          onInterestChange={setMovementInterest}
          onFeeChange={setMovementFee}
          onNotesChange={setMovementNotes}
          onScheduleSelected={(value) => {
            const item = movementFacility?.schedule.find(
              (schedule) => schedule.id === value,
            );
            setMovementScheduleId(value);
            if (item) {
              setMovementPrincipal(String(item.principalAmount));
              setMovementInterest(String(item.interestAmount));
              setMovementFee(String(item.feeAmount));
            }
          }}
        />
      ) : null}
      {view === "security-create" && (
        <CreditSecuritiesPanel
          isAdmin={admin}
          facilities={facilities}
          securities={securities}
          expiringCount={expiringSecurities}
          expiredCount={expiredSecurities}
          busy={busy}
          showCreateForm={view === "security-create"}
          onNavigate={onNavigate}
          facilityId={securityFacilityId}
          type={securityType}
          code={securityCode}
          issuer={securityIssuer}
          beneficiary={securityBeneficiary}
          amount={securityAmount}
          commission={securityCommission}
          issueDate={securityIssueDate}
          expiryDate={securityExpiryDate}
          notes={securityNotes}
          formatMoney={money}
          onSubmit={submitSecurity}
          onClose={(item, status) => void closeSecurity(item, status)}
          onFacilityChange={setSecurityFacilityId}
          onTypeChange={setSecurityType}
          onCodeChange={setSecurityCode}
          onIssuerChange={setSecurityIssuer}
          onBeneficiaryChange={setSecurityBeneficiary}
          onAmountChange={setSecurityAmount}
          onCommissionChange={setSecurityCommission}
          onIssueDateChange={setSecurityIssueDate}
          onExpiryDateChange={setSecurityExpiryDate}
          onNotesChange={setSecurityNotes}
        />
      )}
      {isList && (
        <>
          <CreditFacilityRegister
            facilities={facilities}
            visibleFacilities={visibleFacilities}
            loading={loading}
            admin={admin}
            search={search}
            statusFilter={statusFilter}
            currencyFilter={currencyFilter}
            currencies={currencies}
            visibleScheduleFields={visibleScheduleFields}
            visibleMovementFields={visibleMovementFields}
            interestPreviews={interestPreviews}
            effectiveInterestPreviews={effectiveInterestPreviews}
            effectiveInterestCosts={effectiveInterestCosts}
            busy={busy}
            formatMoney={money}
            onEffectiveInterestCostChange={(id, value) =>
              setEffectiveInterestCosts((current) => ({
                ...current,
                [id]: value,
              }))
            }
            onPreviewEffectiveInterest={(facility) =>
              void previewEffectiveInterest(facility)
            }
            onSearchChange={setSearch}
            onStatusChange={setStatusFilter}
            onCurrencyChange={setCurrencyFilter}
            onClearFilters={() => {
              setSearch("");
              setStatusFilter("All");
              setCurrencyFilter("All");
            }}
            onPreviewInterest={(facility) => void previewInterest(facility)}
            onPostPreviousMonthInterest={(facility) =>
              void postPreviousMonthInterest(facility)
            }
            onCloseFacility={(facility) => void closeFacility(facility)}
            onPrepareSchedulePayment={prepareSchedulePayment}
            onSetScheduleStatus={(item, status) =>
              void setScheduleStatus(item, status)
            }
            onReverseMovement={(facility, movement) =>
              void reverseMovement(facility, movement)
            }
          />
          <CreditSecuritiesPanel
            isAdmin={admin}
            facilities={facilities}
            securities={securities}
            expiringCount={expiringSecurities}
            expiredCount={expiredSecurities}
            busy={busy}
            showCreateForm={false}
            visibleFields={visibleSecurityFields}
            onNavigate={onNavigate}
            facilityId={securityFacilityId}
            type={securityType}
            code={securityCode}
            issuer={securityIssuer}
            beneficiary={securityBeneficiary}
            amount={securityAmount}
            commission={securityCommission}
            issueDate={securityIssueDate}
            expiryDate={securityExpiryDate}
            notes={securityNotes}
            formatMoney={money}
            onSubmit={submitSecurity}
            onClose={(item, status) => void closeSecurity(item, status)}
            onFacilityChange={setSecurityFacilityId}
            onTypeChange={setSecurityType}
            onCodeChange={setSecurityCode}
            onIssuerChange={setSecurityIssuer}
            onBeneficiaryChange={setSecurityBeneficiary}
            onAmountChange={setSecurityAmount}
            onCommissionChange={setSecurityCommission}
            onIssueDateChange={setSecurityIssueDate}
            onExpiryDateChange={setSecurityExpiryDate}
            onNotesChange={setSecurityNotes}
          />
          <div className="boundary-note">
            Faiz tahakkuku ve finansman hareketlerinin muhasebe/nakit etkileri
            kayıt türüne göre doğrulanır. Maruziyet özeti limitleri, açık
            anaparayı ve teminatları para birimi bazında ayrı gösterir.
          </div>
        </>
      )}
    </div>
  );
}
