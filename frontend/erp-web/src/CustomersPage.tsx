import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
} from "lucide-react";
import { api, localDateString } from "./erpApi";
import { dropPageParam, setPageParams, usePageParams } from "./pageNavigation";
import AdvancedDataGrid from "./AdvancedDataGrid";
import { screenViewGridDefaults } from "./screenViewGridLayout";
import type {
  CustomerItem,
  CustomerGroupItem,
  CustomerCompanyOption,
  CustomerLocationDefinitions,
  CustomerAddressItem,
  BuiltInScreenLayoutField,
  CustomerDialogRequest,
  CustomerCustomFieldDefinition,
  CustomerCustomFieldRevision,
  CustomerCustomFieldValueRevision,
  CustomerBalance,
  CustomerStatement,
  ExternalStatementLine,
  CustomerLedgerItem,
  CustomerCustomFieldValue,
} from "./erp-types";
import CustomerSalesInvoicesPanel from "./CustomerSalesInvoicesPanel";
import MasterDataImportDialog from "./MasterDataImportDialog";
import { CustomerDirectoryHeader } from "./customers/components/CustomerDirectoryHeader";
import { CustomerFilters } from "./customers/components/CustomerFilters";
import { CustomerGrid } from "./customers/components/CustomerGrid";
import { validateCustomerIdentifiers } from "./customers/identifierValidation";
import "./list-page/list-page-v2.css";
import "./sales/sales-list-v2.css";
import "./customers/customers-list.css";
import "./customers/customer-modals.css";
import { StatusTag } from "./list-page/StatusTag";
import { CUSTOMER_GROUPS_CHANGED_EVENT } from "./customer-groups/customerGroupsEvents";
import { PageCommandsSlot } from "./commands/PageCommandsSlot";
import { useCustomerListScreen } from "./customers/useCustomerListScreen";
import { CUSTOMER_SEARCH_REQUEST_EVENT, customerTypeLabel, customerTypeTone } from "./customers/customerLabels";
import {
  CustomerDetailPanel,
  type CustomerDetailTab,
} from "./customers/components/CustomerDetailPanel";
import CustomerCreatePage from "./customers/components/CustomerCreatePage";
import CustomerEditPage from "./customers/components/CustomerEditPage";
import {
  CUSTOMER_ADDRESS_FORM_ID,
  CustomerAddressSection,
  emptyAddressDraft,
  type CustomerAddressDraft,
} from "./customers/components/CustomerAddressSection";
import type { CustomerCreatePageProps } from "./customers/components/CustomerCreatePage";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "./record-form/RecordForm";
import "./purchasing-record-forms.css";

type CustomerPageSettings = { title: string; description: string; searchLabel: string; searchPlaceholder: string; typeFilterLabel: string; statusFilterLabel: string; applyLabel: string; showTypeFilter: boolean; showStatusFilter: boolean };
const defaultCustomerPageSettings: CustomerPageSettings = { title: "Cari Hesaplar", description: "Müşteri ve tedarikçi kartlarını firma bazında yönetin.", searchLabel: "Cari ara", searchPlaceholder: "Cari kodu, unvanı veya vergi no ile ara", typeFilterLabel: "Cari türü", statusFilterLabel: "Durum", applyLabel: "Filtrele", showTypeFilter: true, showStatusFilter: true };

function parseCustomerStatementCsv(source: string): ExternalStatementLine[] {
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  if (rows.length < 2)
    throw new Error(
      "Ekstre CSV dosyasında başlık ve en az bir hareket olmalı.",
    );
  const headers = rows[0].map((x) =>
    x
      .replace(/^\uFEFF/, "")
      .trim()
      .toLocaleLowerCase("tr-TR"),
  );
  const col = (...names: string[]) =>
    headers.findIndex((h) => names.includes(h));
  const dateCol = col("date", "tarih"),
    directionCol = col("direction", "yön", "yon", "borç/alacak", "borc/alacak"),
    amountCol = col("amount", "tutar"),
    descriptionCol = col("description", "açıklama", "aciklama");
  if (dateCol < 0 || directionCol < 0 || amountCol < 0)
    throw new Error(
      "CSV başlıkları date, direction ve amount (veya Türkçe karşılıkları) içermeli.",
    );
  const parseDate = (raw: string) => {
    const value = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const match = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (match)
      return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    throw new Error(`Geçersiz tarih: ${value}`);
  };
  const parseAmount = (raw: string) => {
    let value = raw.trim().replace(/[\s₺$€£]/g, "");
    if (value.includes(",") && value.includes("."))
      value =
        value.lastIndexOf(",") > value.lastIndexOf(".")
          ? value.replace(/\./g, "").replace(",", ".")
          : value.replace(/,/g, "");
    else if (value.includes(",")) value = value.replace(",", ".");
    const result = Number(value);
    if (!Number.isFinite(result) || result <= 0)
      throw new Error(`Geçersiz tutar: ${raw}`);
    return result;
  };
  return rows.slice(1).map((values, i) => {
    const get = (index: number) =>
      index < 0 ? "" : (values[index] || "").trim();
    const directionRaw = get(directionCol).toLocaleLowerCase("tr-TR");
    const direction =
      directionRaw === "debit" ||
      directionRaw === "borç" ||
      directionRaw === "borc"
        ? "Debit"
        : directionRaw === "credit" || directionRaw === "alacak"
          ? "Credit"
          : null;
    if (!direction)
      throw new Error(
        `${i + 2}. satırda yön Debit/Borç veya Credit/Alacak olmalı.`,
      );
    return {
      entryDate: parseDate(get(dateCol)),
      direction,
      amount: parseAmount(get(amountCol)),
      description: get(descriptionCol),
    };
  });
}

const customerFieldTypeLabels: Record<string, string> = {
  Text: "Metin",
  Decimal: "Ondalık sayı",
  Date: "Tarih",
  Boolean: "Evet/Hayır",
};

function customerFieldTypeLabel(dataType: string) {
  return customerFieldTypeLabels[dataType] ?? dataType;
}

const CUSTOMER_EDIT_REQUEST_EVENT = "nexora:customer-edit-request";
const CUSTOMER_EDIT_SECTION_KEY = "nexora.customer-edit-section";
const CUSTOMER_ADDRESSES_CHANGED_EVENT = "nexora:customer-addresses-changed";
/** The panel's default address: the active default General address, else any active default (as before). */
function defaultAddressOf(list: CustomerAddressItem[]): CustomerAddressItem | null {
  return (
    list.find((x) => x.isActive && x.isDefault && x.kind === "General") ??
    list.find((x) => x.isActive && x.isDefault) ??
    null
  );
}

function CustomersPage({
  token,
  role,
  initialSearch,
  initialCreate: initialCreateProp = false,
  initialEdit: initialEditProp = false,
  onNavigate,
  onOpenSalesInvoice,
  onOpenPurchaseInvoices,
}: {
  token: string;
  role: string;
  initialSearch: string;
  initialCreate?: boolean;
  initialEdit?: boolean;
  onNavigate: (page: string) => void;
  onOpenSalesInvoice: (invoiceId: string) => void;
  onOpenPurchaseInvoices: (supplier: { id: string; name: string }) => void;
}) {
  // Sistem cari listesi kartı `customer-create` sekmesinde `customerId` parametresiyle açar (kart sistem sayfası yayımlı
  // değilken bu eski ekran çizilir): o cari `customer-edit` gibi düzenleme kipinde açılır. Parametre sekmenin açık kaydıdır;
  // kart kapanınca silinir (aynı cari yeniden açılabilir), parametresiz "Yeni" sekmeyi yeni kart formuna döndürür.
  const paramEditId = usePageParams(initialCreateProp ? "customer-create" : undefined).customerId ?? "";
  const initialEdit = initialEditProp || paramEditId !== "";
  const initialCreate = initialCreateProp && !initialEdit;
  const canDesignCustomerFields =
    role === "TenantAdmin" || role === "TenantDeveloper";
  const canManageCustomerFieldPolicy = role === "TenantAdmin";
  const [items, setItems] = useState<CustomerItem[]>([]),
    // The search the shown `items` were loaded for (a load started before a new search may answer after it).
    [itemsFilter, setItemsFilter] = useState<string | null>(null),
    [groups, setGroups] = useState<CustomerGroupItem[]>([]),
    [companyOptions, setCompanyOptions] = useState<CustomerCompanyOption[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true);
  const [directoryMetrics, setDirectoryMetrics] = useState<{
    total: number;
    customers: number;
    suppliers: number;
    dealers: number;
    employees: number;
    others: number;
    active: number;
    inactive: number;
  } | null>(null);
  const [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(null);
  const [locationDefinitions, setLocationDefinitions] =
    useState<CustomerLocationDefinitions>({ provinces: [], districts: [] });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [customerDetailTab, setCustomerDetailTab] =
    useState<CustomerDetailTab>("general");
  const [exportBusy, setExportBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [customerDetailAddress, setCustomerDetailAddress] =
    useState<CustomerAddressItem | null>(null);
  const [customerDetailAddressLoaded, setCustomerDetailAddressLoaded] =
    useState(false);
  const [screenFields, setScreenFields] = useState<BuiltInScreenLayoutField[]>([
    { key: "code", label: "Cari kodu", visible: true, position: 0, width: 110 },
    { key: "name", label: "Ünvan", visible: true, position: 1, width: 190 },
    {
      key: "groupName",
      label: "Cari grubu",
      visible: true,
      position: 2,
      width: 150,
    },
    { key: "type", label: "Tür", visible: true, position: 3, width: 100 },
    {
      key: "currencyCode",
      label: "Döviz",
      visible: true,
      position: 4,
      width: 78,
    },
    {
      key: "paymentTermDays",
      label: "Vade",
      visible: true,
      position: 5,
      width: 88,
    },
    {
      key: "taxNumber",
      label: "Vergi no",
      visible: true,
      position: 6,
      width: 130,
    },
    { key: "status", label: "Durum", visible: true, position: 7, width: 86 },
    {
      key: "actions",
      label: "İşlemler",
      visible: true,
      position: 8,
      width: 92,
      fixed: true,
    },
  ]);
  const [pageSettings, setPageSettings] = useState<CustomerPageSettings>(defaultCustomerPageSettings);
  const [detailFields, setDetailFields] = useState<BuiltInScreenLayoutField[]>([
    { key: "groupName", label: "Cari grubu", visible: true, position: 0 },
    { key: "taxNumber", label: "Vergi no", visible: true, position: 1 },
    {
      key: "identityNumber",
      label: "T.C. kimlik no",
      visible: true,
      position: 2,
    },
    { key: "taxOffice", label: "Vergi dairesi", visible: true, position: 3 },
    { key: "currencyCode", label: "Para birimi", visible: true, position: 4 },
    { key: "paymentTermDays", label: "Vade", visible: true, position: 5 },
    { key: "riskLimit", label: "Risk limiti", visible: true, position: 6 },
  ]);
  const [movementScreenFields, setMovementScreenFields] = useState<
    BuiltInScreenLayoutField[]
  >([
    { key: "entryDate", label: "Tarih", visible: true, position: 0 },
    { key: "direction", label: "Yön", visible: true, position: 1 },
    { key: "description", label: "Açıklama", visible: true, position: 2 },
    { key: "amount", label: "Tutar", visible: true, position: 3 },
    { key: "balance", label: "Dönem bakiyesi", visible: true, position: 4 },
    { key: "actions", label: "İşlemler", visible: true, position: 5, fixed: true },
  ]);
  const visibleMovementFields = movementScreenFields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions" ? 1 : b.key === "actions" ? -1 : a.position - b.position,
    );
  const hasSelectedCustomer = Boolean(selectedCustomerId);
  useEffect(() => {
    if (!hasSelectedCustomer) return;
    let active = true;
    void api<{ fields: BuiltInScreenLayoutField[] }>(
      "/api/screen-views/customer-detail-movements/active",
      token,
    )
      .then((view) => {
        if (active && view.fields?.length) setMovementScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token, hasSelectedCustomer]);
  const [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState("");
  // A global-search request: the text and a counter, so repeating the same search applies it (and its first-match
  // pick) again. The prop covers the first mount; the shell's event covers a mounted (kept-alive) list.
  const [searchRequest, setSearchRequest] = useState<{ text: string; seq: number } | null>(null);
  const applySearchRequest = (text: string) => {
    if (!text) return;
    setSearch(text);
    setFilter(text);
    setPage(1);
    setSearchRequest((current) => ({ text, seq: (current?.seq ?? 0) + 1 }));
  };
  useEffect(() => {
    applySearchRequest(initialSearch);
  }, [initialSearch]);
  useEffect(() => {
    const onSearch = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if (typeof text === "string") applySearchRequest(text);
    };
    window.addEventListener(CUSTOMER_SEARCH_REQUEST_EVENT, onSearch);
    return () => window.removeEventListener(CUSTOMER_SEARCH_REQUEST_EVENT, onSearch);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setFilter(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const [customerCreateTab, setCustomerCreateTab] = useState("basic");
  const [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [customerDialog, setCustomerDialog] =
      useState<CustomerDialogRequest | null>(null),
    [customerDialogValue, setCustomerDialogValue] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(
    null,
  );
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [type, setType] = useState<CustomerItem["type"]>("Customer"),
    [taxNumber, setTaxNumber] = useState("");
  const [identityNumber, setIdentityNumber] = useState(""),
    [taxOffice, setTaxOffice] = useState("");
  const [isEInvoiceRegistered, setIsEInvoiceRegistered] = useState(false),
    [eInvoiceRecipientAlias, setEInvoiceRecipientAlias] = useState("");
  const [phone, setPhone] = useState(""), [email, setEmail] = useState(""), [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState(""), [contactPhone, setContactPhone] = useState(""), [contactEmail, setContactEmail] = useState("");
  const [priceListCode, setPriceListCode] = useState(""), [receivableAccountCode, setReceivableAccountCode] = useState(""), [payableAccountCode, setPayableAccountCode] = useState("");
  const [bankName, setBankName] = useState(""), [bankBranchCode, setBankBranchCode] = useState(""), [iban, setIban] = useState("");
  const [groupId, setGroupId] = useState(""),
    [parentCompanyId, setParentCompanyId] = useState(""),
    [currencyCode, setCurrencyCode] = useState("TRY"),
    [riskLimit, setRiskLimit] = useState(""),
    [paymentTermDays, setPaymentTermDays] = useState("0");
  const [fieldCustomer, setFieldCustomer] = useState<CustomerItem | null>(null),
    [customerFields, setCustomerFields] = useState<
      CustomerCustomFieldDefinition[]
    >([]),
    [customerFieldValues, setCustomerFieldValues] = useState<
      Record<string, string>
    >({}),
    [customerFieldCode, setCustomerFieldCode] = useState(""),
    [customerFieldLabel, setCustomerFieldLabel] = useState(""),
    [customerFieldType, setCustomerFieldType] =
      useState<CustomerCustomFieldDefinition["dataType"]>("Text"),
    [customerFieldMaxLength, setCustomerFieldMaxLength] = useState("200");
  const [customerFieldDefinitionScreen, setCustomerFieldDefinitionScreen] =
    useState<"closed" | "list" | "create">("closed");
  const [customerCreateFields, setCustomerCreateFields] = useState<
      CustomerCustomFieldDefinition[]
    >([]),
    [customerCreateValues, setCustomerCreateValues] = useState<
      Record<string, string>
    >({}),
    [customerFieldRequired, setCustomerFieldRequired] = useState(false);
  const [customerFieldMetadataHistory, setCustomerFieldMetadataHistory] =
      useState<CustomerCustomFieldRevision[]>([]),
    [customerFieldMetadataDefinition, setCustomerFieldMetadataDefinition] =
      useState<CustomerCustomFieldDefinition | null>(null);
  const [customerFieldValueHistory, setCustomerFieldValueHistory] = useState<
      CustomerCustomFieldValueRevision[]
    >([]),
    [
      customerFieldValueHistoryDefinition,
      setCustomerFieldValueHistoryDefinition,
    ] = useState<CustomerCustomFieldDefinition | null>(null);
  // Addresses of the open card (Adresler section) and the section's new-address fields. The card's own "Adres"
  // fields (its primary address, sent with the card) keep their separate state below.
  const [addresses, setAddresses] = useState<CustomerAddressItem[]>([]),
    [addressDraft, setAddressDraft] = useState<CustomerAddressDraft>(emptyAddressDraft);
  const [addressLabel, setAddressLabel] = useState(""),
    [addressLine, setAddressLine] = useState(""),
    [addressCity, setAddressCity] = useState(""),
    [addressDistrict, setAddressDistrict] = useState(""),
    [addressPostalCode, setAddressPostalCode] = useState(""),
    [addressCountry, setAddressCountry] = useState("TR"),
    [addressLatitude, setAddressLatitude] = useState<number | null>(null),
    [addressLongitude, setAddressLongitude] = useState<number | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<CustomerItem | null>(
      null,
    ),
    [ledgerBalance, setLedgerBalance] = useState<CustomerBalance | null>(null),
    [statementPage, setStatementPage] = useState(1);
  const [customerMovementOpen, setCustomerMovementOpen] = useState(false),
    [reconciliationPage, setReconciliationPage] = useState(1);
  const [salesInvoicesCustomer, setSalesInvoicesCustomer] =
    useState<CustomerItem | null>(null);
  const today = localDateString(),
    [statementFrom, setStatementFrom] = useState(`${today.slice(0, 8)}01`),
    [statementTo, setStatementTo] = useState(today),
    [statement, setStatement] = useState<CustomerStatement | null>(null),
    [externalRows, setExternalRows] = useState<ExternalStatementLine[]>([]),
    [externalFileName, setExternalFileName] = useState(""),
    [externalPerspective, setExternalPerspective] = useState<
      "counterparty" | "same"
    >("counterparty");
  const [movementDirection, setMovementDirection] =
      useState<CustomerLedgerItem["direction"]>("Debit"),
    [movementAmount, setMovementAmount] = useState(""),
    [movementDescription, setMovementDescription] = useState(""),
    [movementDate, setMovementDate] = useState(localDateString());
  function confirmCustomerAction(
    message: string,
    options: { title?: string; confirmLabel?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) =>
      setCustomerDialog({
        kind: "confirm",
        title: options.title || "İşlemi onaylayın",
        message,
        confirmLabel: options.confirmLabel || "Onayla",
        danger: options.danger ?? false,
        resolve,
      }),
    );
  }
  function promptCustomerValue(
    title: string,
    message: string,
    initialValue: string,
    options: {
      valueLabel?: string;
      inputType?: "text" | "number";
      min?: number;
      max?: number;
      maxLength?: number;
      choices?: { value: string; label: string }[];
    } = {},
  ): Promise<string | null> {
    setCustomerDialogValue(initialValue);
    return new Promise((resolve) =>
      setCustomerDialog({
        kind: "prompt",
        title,
        message,
        valueLabel: options.valueLabel || "Değer",
        initialValue,
        inputType: options.inputType || "text",
        min: options.min,
        max: options.max,
        maxLength: options.maxLength,
        choices: options.choices,
        resolve,
      }),
    );
  }
  function finishCustomerDialog(value: boolean | string | null) {
    const request = customerDialog;
    setCustomerDialog(null);
    if (request?.kind === "confirm") request.resolve(value === true);
    else if (request?.kind === "prompt")
      request.resolve(typeof value === "string" ? value : null);
  }
  // Only the latest list request may write the list: a slower, earlier one (e.g. the unfiltered first load) is dropped.
  const loadSeq = useRef(0);
  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: filter,
        page: String(page),
        pageSize: "25",
      });
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const data = await api<{ items: CustomerItem[]; totalCount: number }>(
        `/api/customers/?${params.toString()}`,
        token,
      );
      if (seq !== loadSeq.current) return;
      setItems(data.items);
      setItemsFilter(filter);
      setTotal(data.totalCount);
    } catch (e) {
      if (seq === loadSeq.current) setError((e as Error).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }
  async function exportCustomers(format: "csv" | "xlsx") {
    setExportBusy(true);
    try {
      const params = new URLSearchParams({
        q: filter,
        page: "1",
        pageSize: "100",
      });
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      const first = await api<{ items: CustomerItem[]; totalCount: number }>(
        `/api/customers/?${params}`,
        token,
      );
      const rows = [...first.items];
      for (let nextPage = 2; rows.length < first.totalCount; nextPage++) {
        params.set("page", String(nextPage));
        const result = await api<{ items: CustomerItem[]; totalCount: number }>(
          `/api/customers/?${params}`,
          token,
        );
        if (!result.items.length) break;
        rows.push(...result.items);
      }
      const data = rows.map((item) => ({
        "Cari kodu": item.code,
        Ünvan: item.name,
        "Cari grubu": item.groupName || "",
        Tür: customerTypeLabel(item.type),
        Döviz: item.currencyCode,
        "Vade (gün)": item.paymentTermDays,
        "Vergi no": item.taxNumber || "",
        "Vergi dairesi": item.taxOffice || "",
        "Risk limiti": item.riskLimit ?? "",
        Durum: item.isActive ? "Aktif" : "Pasif",
      }));
      const fileName = `cariler-${localDateString()}.${format}`;
      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.json_to_sheet(data),
          "Cariler",
        );
        XLSX.writeFileXLSX(workbook, fileName);
      } else {
        const headers = Object.keys(data[0] || { "Cari kodu": "" });
        const cell = (value: unknown) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`;
        const csv = [
          headers.map(cell).join(","),
          ...data.map((row) =>
            headers
              .map((header) => cell((row as Record<string, unknown>)[header]))
              .join(","),
          ),
        ].join("\r\n");
        const url = URL.createObjectURL(
          new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setExportBusy(false);
    }
  }
  async function loadScreenLayout() {
    try {
      const active = await api<{ fields: BuiltInScreenLayoutField[]; pageSettings?: CustomerPageSettings | null }>(
        "/api/screen-views/customers/active",
        token,
      );
      setScreenFields(
        active.fields.map((field, index) => ({
          ...field,
          fixed: field.key === "actions",
          position: field.position ?? index,
        })),
      );
      setPageSettings(active.pageSettings || defaultCustomerPageSettings);
      if (active.pageSettings?.showTypeFilter === false) setTypeFilter("");
      if (active.pageSettings?.showStatusFilter === false) setStatusFilter("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadCustomerDetailLayout() {
    try {
      const active = await api<{ fields: BuiltInScreenLayoutField[] }>(
        "/api/screen-views/customer-details/active",
        token,
      );
      const existing = active.fields
        .map((field, index) => ({
          ...field,
          position: field.position ?? index,
        }))
        .sort((a, b) => a.position - b.position);
      const existingKeys = new Set(existing.map((field) => field.key));
      const additions = [
        { key: "identityNumber", label: "T.C. kimlik no", visible: true },
        { key: "taxOffice", label: "Vergi dairesi", visible: true },
      ].filter((field) => !existingKeys.has(field.key));
      const taxNumberIndex = existing.findIndex(
        (field) => field.key === "taxNumber",
      );
      const fields =
        taxNumberIndex < 0
          ? [...existing, ...additions]
          : [
              ...existing.slice(0, taxNumberIndex + 1),
              ...additions,
              ...existing.slice(taxNumberIndex + 1),
            ];
      setDetailFields(
        fields.map((field, position) => ({ ...field, position })),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadGroups() {
    try {
      setGroups(await api<CustomerGroupItem[]>("/api/customer-groups/", token));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // Row actions live in the bar's İşlemler and the detail panel, so "actions" gets no column. Like Stok Kartları
  // (mockup 08) the code has its own column; when the tenant hides it, the code is written under the name.
  const visibleScreenFields = useMemo(
    () =>
      screenFields
        .filter((field) => field.visible && field.key !== "actions")
        .sort((a, b) => a.position - b.position),
    [screenFields],
  );
  const codeColumnShown = visibleScreenFields.some((field) => field.key === "code");
  const selectedCustomer =
    items.find((item) => item.id === selectedCustomerId) ?? null;
  const openCustomerSalesAction = (page: string) => {
    if (!selectedCustomer) return;
    const customer = {
      id: selectedCustomer.id,
      code: selectedCustomer.code,
      name: selectedCustomer.name,
      type: selectedCustomer.type,
      isActive: selectedCustomer.isActive,
      currencyCode: selectedCustomer.currencyCode,
    };
    const action = { page, customerId: selectedCustomer.id, customer };
    sessionStorage.setItem("nexora.customer-sales-action", JSON.stringify(action));
    // Karar 4: hedef ekranın sayfa parametreleri de yazılır (sistem sayfası kartları `customerId`, sipariş kartı `orderDate`
    // okur); eski ekranlar yukarıdaki köprüyü ve `customerId` parametresini okumaya devam eder.
    setPageParams(page, { customerId: selectedCustomer.id, ...(page === "sales-order-create" ? { orderDate: localDateString() } : {}) });
    onNavigate(page);
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("nexora:customer-sales-action", { detail: action }),
      );
    }, 0);
  };
  // The current row is the one the user chose (click, ↑/↓); the list never picks a first row by itself. Arriving
  // from the global search (`initialSearch`) still shows the first match, once per search.
  const autoSelectedRequest = useRef(0);
  useEffect(() => {
    if (loading) return;
    if (selectedCustomerId && !items.some((item) => item.id === selectedCustomerId)) {
      setSelectedCustomerId(null);
      return;
    }
    // Only rows loaded for that search count: the list's first, unfiltered load may answer after the search was set.
    if (
      searchRequest &&
      autoSelectedRequest.current !== searchRequest.seq &&
      itemsFilter !== null &&
      itemsFilter.trim() === searchRequest.text.trim() &&
      items.length
    ) {
      autoSelectedRequest.current = searchRequest.seq;
      setSelectedCustomerId(items[0].id);
    }
  }, [items, itemsFilter, loading, selectedCustomerId, searchRequest]);
  useEffect(() => {
    void load();
    void loadGroups();
  }, [token, filter, page, typeFilter, statusFilter]);
  // Groups are defined on the Cari Grupları screen; a kept-alive customer screen reloads its group choices.
  useEffect(() => {
    const onChanged = () => void loadGroups();
    window.addEventListener(CUSTOMER_GROUPS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CUSTOMER_GROUPS_CHANGED_EVENT, onChanged);
  }, [token]);
  useEffect(() => {
    let active = true;
    const count = async (options: { type?: string; status?: string } = {}) => {
      const params = new URLSearchParams({ page: "1", pageSize: "1" });
      if (filter) params.set("q", filter);
      if (options.type) params.set("type", options.type);
      if (options.status) params.set("status", options.status);
      const result = await api<{ totalCount: number }>(
        `/api/customers/?${params.toString()}`,
        token,
      );
      return result.totalCount;
    };
    void Promise.all([
      count(),
      count({ type: "Customer" }),
      count({ type: "Supplier" }),
      count({ type: "Dealer" }),
      count({ type: "Employee" }),
      count({ type: "Both" }),
      count({ status: "Active" }),
      count({ status: "Inactive" }),
    ])
      .then(([all, customers, suppliers, dealers, employees, others, activeCount, inactive]) => {
        if (active)
          setDirectoryMetrics({
            total: all,
            customers,
            suppliers,
            dealers,
            employees,
            others,
            active: activeCount,
            inactive,
          });
      })
      .catch(() => {
        if (active) setDirectoryMetrics(null);
      });
    return () => {
      active = false;
    };
  }, [token, filter]);
  useEffect(() => {
    let cancelled = false;
    api<CustomerCompanyOption[]>("/api/customers/company-options", token)
      .then((options) => {
        if (!cancelled) setCompanyOptions(options);
      })
      .catch(() => {
        if (!cancelled) setCompanyOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    let cancelled = false;
    api<CustomerLocationDefinitions>("/api/location-definitions/", token)
      .then((data) => {
        if (!cancelled) setLocationDefinitions(data);
      })
      .catch(() => {
        if (!cancelled)
          setLocationDefinitions({ provinces: [], districts: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  useEffect(() => {
    void loadScreenLayout();
  }, [token]);
  useEffect(() => {
    void loadCustomerDetailLayout();
  }, [token]);
  useEffect(() => {
    const onChanged = (event: Event) => {
      const { customerId, addresses: list } = (event as CustomEvent<{ customerId: string; addresses: CustomerAddressItem[] }>).detail;
      if (customerId !== selectedCustomerId) return;
      setCustomerDetailAddress(defaultAddressOf(list));
      setCustomerDetailAddressLoaded(true);
    };
    window.addEventListener(CUSTOMER_ADDRESSES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CUSTOMER_ADDRESSES_CHANGED_EVENT, onChanged);
  }, [selectedCustomerId]);
  useEffect(() => {
    let cancelled = false;
    setCustomerDetailAddress(null);
    setCustomerDetailAddressLoaded(false);
    if (!selectedCustomerId)
      return () => {
        cancelled = true;
      };
    void api<CustomerAddressItem[]>(
      `/api/customers/${selectedCustomerId}/addresses`,
      token,
    )
      .then((addresses) => {
        if (!cancelled) {
          setCustomerDetailAddress(
            addresses.find(
              (address) =>
                address.isActive &&
                address.isDefault &&
                address.kind === "General",
            ) ??
              addresses.find(
                (address) => address.isActive && address.isDefault,
              ) ??
              null,
          );
          setCustomerDetailAddressLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerDetailAddress(null);
          setCustomerDetailAddressLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, token]);
  const visibleCustomerDetailFields = useMemo(
    () =>
      detailFields
        .filter((field) => field.visible)
        .sort((a, b) => a.position - b.position),
    [detailFields],
  );
  async function openCustomerModal() {
    setCustomerCreateValues({});
    setCode("");
    setName("");
    setTaxNumber("");
    setIdentityNumber("");
    setTaxOffice("");
    setIsEInvoiceRegistered(false);
    setEInvoiceRecipientAlias("");
    setType("Customer");
    setGroupId("");
    setParentCompanyId("");
    setCurrencyCode("TRY");
    setRiskLimit("");
    setPaymentTermDays("0");
    setAddressLabel("Merkez");
    setAddressLine("");
    setAddressCity("");
    setAddressDistrict("");
    setAddressPostalCode("");
    setAddressCountry("TR");
    setAddressLatitude(null);
    setAddressLongitude(null);
    setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      setCustomerCreateFields(
        await api<CustomerCustomFieldDefinition[]>(
          "/api/customers/custom-fields",
          token,
          { signal: controller.signal },
        ),
      );
      setModal(true);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Cari formu verileri zamanında yüklenemedi. Bağlantıyı kontrol edip yeniden deneyin."
          : (e as Error).message,
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  useEffect(() => {
    if (!initialCreate) return;
    // Parametreyle açılmış düzenleme kartından yeni karta dönüş de buradan geçer.
    setEditingCustomer(null);
    void openCustomerModal();
  }, [initialCreate]);
  const [editRequest, setEditRequest] = useState(0);
  useEffect(() => {
    if (!initialEditProp) return;
    const onEditRequest = () => setEditRequest((value) => value + 1);
    window.addEventListener(CUSTOMER_EDIT_REQUEST_EVENT, onEditRequest);
    return () => window.removeEventListener(CUSTOMER_EDIT_REQUEST_EVENT, onEditRequest);
  }, [initialEditProp]);
  useEffect(() => {
    if (!initialEdit) return;
    let active = true;
    const customerId = paramEditId || sessionStorage.getItem("nexora.customer-edit-id");
    if (!customerId) {
      onNavigate("customers");
      return;
    }
    setModal(false);
    void api<CustomerItem>(`/api/customers/${customerId}`, token)
      .then((item) => { if (active) void openEditCustomer(item, false); })
      .catch((error) => {
        if (!active) return;
        setError((error as Error).message);
      });
    return () => { active = false; };
  }, [initialEdit, paramEditId, token, editRequest]);
  /** Düzenleme kartından listeye dönüş; parametreyle açılan kart sekmesi bir sonraki kullanımı için yeni kart formuna döner. */
  function leaveEdit() {
    if (initialEditProp) sessionStorage.removeItem("nexora.customer-edit-id");
    if (paramEditId) {
      dropPageParam("customer-create", "customerId");
      setEditingCustomer(null);
      setModal(false);
    }
    onNavigate("customers");
  }
  /** Set by the form's "Kaydet ve Yeni" action; read once by the next successful create. */
  const stayAfterSave = useRef(false);
  /**
   * Set by "Kaydet ve Yeni" on the custom field definition and account movement forms;
   * read once by the next successful save, which then keeps that form open for another record.
   */
  const stayOpenAfterSave = useRef(false);
  const setStayOpenAfterSave = (value: boolean) => {
    stayOpenAfterSave.current = value;
  };
  function takeStayOpenAfterSave() {
    const stay = stayOpenAfterSave.current;
    stayOpenAfterSave.current = false;
    return stay;
  }
  /** Returns every field of the new-card form to its default, including the address. */
  function resetCustomerForm() {
    setCode("");
    setName("");
    setTaxNumber("");
    setIdentityNumber("");
    setTaxOffice("");
    setIsEInvoiceRegistered(false);
    setEInvoiceRecipientAlias("");
    setPhone(""); setEmail(""); setWebsite(""); setContactName(""); setContactPhone(""); setContactEmail("");
    setPriceListCode(""); setReceivableAccountCode(""); setPayableAccountCode(""); setBankName(""); setBankBranchCode(""); setIban("");
    setType("Customer");
    setGroupId("");
    setParentCompanyId("");
    setCurrencyCode("TRY");
    setRiskLimit("");
    setPaymentTermDays("0");
    setAddressLine("");
    setAddressCity("");
    setAddressDistrict("");
    setAddressPostalCode("");
    setAddressCountry("TR");
    setAddressLatitude(null);
    setAddressLongitude(null);
    setCustomerCreateValues({});
  }
  /** Blocks submit on invalid VKN/TCKN/IBAN and opens the tab holding the first invalid field. */
  function identifierErrorsBlockSubmit(stored: CustomerItem | null): boolean {
    const addressSent = !!(addressLine.trim() || addressCity.trim() || addressDistrict.trim() || addressPostalCode.trim());
    const errors = validateCustomerIdentifiers(
      { taxNumber, identityNumber, iban, countryCode: addressSent ? addressCountry : null },
      stored,
    );
    const messages = Object.values(errors);
    if (messages.length === 0) return false;
    setCustomerCreateTab(errors.taxNumber || errors.identityNumber ? "other" : "finance");
    // The inline field errors list every problem; the banner names the first so it stays translatable.
    setError(messages[0]);
    return true;
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (identifierErrorsBlockSubmit(null)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<CustomerItem>("/api/customers/", token, {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          type,
          taxNumber: taxNumber || null,
          identityNumber: identityNumber || null,
          taxOffice: taxOffice || null,
          isEInvoiceRegistered,
          eInvoiceRecipientAlias: eInvoiceRecipientAlias || null,
          phone: phone || null, email: email || null, website: website || null,
          contactName: contactName || null, contactPhone: contactPhone || null, contactEmail: contactEmail || null,
          priceListCode: priceListCode || null, receivableAccountCode: receivableAccountCode || null, payableAccountCode: payableAccountCode || null,
          bankName: bankName || null, bankBranchCode: bankBranchCode || null, iban: iban || null,
          address:
            addressLine.trim() ||
            addressCity.trim() ||
            addressDistrict.trim() ||
            addressPostalCode.trim()
              ? {
                  kind: "General",
                  label: addressLabel || "Merkez",
                  addressLine,
                  city: addressCity,
                  district: addressDistrict || null,
                  postalCode: addressPostalCode || null,
                  countryCode: addressCountry,
                  isDefault: true,
                  latitude: addressLatitude,
                  longitude: addressLongitude,
                }
              : null,
          isActive: true,
          groupId: groupId || null,
          parentCompanyId: parentCompanyId || null,
          currencyCode,
          riskLimit: riskLimit ? Number(riskLimit) : null,
          paymentTermDays: Number(paymentTermDays),
          customFields: customerCreateValues,
        }),
      });
      const createdCode = code;
      resetCustomerForm();
      if (stayAfterSave.current) {
        setCustomerCreateTab("contact");
        setNotice(`${createdCode} kaydedildi. Yeni cari kartı girebilirsiniz.`);
        if (!initialCreate) await load();
        return;
      }
      if (initialCreate) {
        // The create route stays alive as a workspace tab; keep its form mounted (already
        // reset above) so reopening the tab does not wait on a load that never re-runs.
        setCustomerCreateTab("contact");
        onNavigate("customers");
        return;
      }
      setModal(false);
      setNotice("Cari kartı oluşturuldu.");
      if (initialCreate) onNavigate("customers");
      else if (page !== 1) setPage(1);
      else await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openEditCustomer(item: CustomerItem, openPage = true, section?: "addresses" | "custom") {
    if (openPage) {
      sessionStorage.setItem("nexora.customer-edit-id", item.id);
      // The customer-edit alias of the customer-create system page reads the account from this page param.
      setPageParams("customer-edit", { customerId: item.id });
      if (section) sessionStorage.setItem(CUSTOMER_EDIT_SECTION_KEY, section);
      else sessionStorage.removeItem(CUSTOMER_EDIT_SECTION_KEY);
      onNavigate("customer-edit");
      // An edit tab that is already open stays mounted; tell it to load the newly chosen account.
      window.dispatchEvent(new CustomEvent(CUSTOMER_EDIT_REQUEST_EVENT));
      return;
    }
    setError("");
    setNotice("");
    setCode(item.code);
    setName(item.name);
    setType(item.type);
    setTaxNumber(item.taxNumber || "");
    setIdentityNumber(item.identityNumber || "");
    setTaxOffice(item.taxOffice || "");
    setIsEInvoiceRegistered(item.isEInvoiceRegistered ?? false);
    setEInvoiceRecipientAlias(item.eInvoiceRecipientAlias || "");
    setPhone(item.phone || ""); setEmail(item.email || ""); setWebsite(item.website || "");
    setContactName(item.contactName || ""); setContactPhone(item.contactPhone || ""); setContactEmail(item.contactEmail || "");
    setPriceListCode(item.priceListCode || ""); setReceivableAccountCode(item.receivableAccountCode || ""); setPayableAccountCode(item.payableAccountCode || "");
    setBankName(item.bankName || ""); setBankBranchCode(item.bankBranchCode || ""); setIban(item.iban || "");
    setGroupId(item.groupId || "");
    setParentCompanyId(item.parentCompanyId || "");
    setCurrencyCode(item.currencyCode);
    setRiskLimit(item.riskLimit == null ? "" : String(item.riskLimit));
    setPaymentTermDays(String(item.paymentTermDays));
    setAddressLabel("Merkez");
    setAddressLine("");
    setAddressCity("");
    setAddressDistrict("");
    setAddressPostalCode("");
    setAddressCountry("TR");
    setAddressLatitude(null);
    setAddressLongitude(null);
    try {
      const [existing, definitions, values] = await Promise.all([
        api<CustomerAddressItem[]>(`/api/customers/${item.id}/addresses`, token),
        api<CustomerCustomFieldDefinition[]>("/api/customers/custom-fields", token),
        api<CustomerCustomFieldValue[]>(`/api/customers/${item.id}/custom-fields`, token),
      ]);
      setAddresses(existing);
      setAddressDraft(emptyAddressDraft);
      const primary = existing.find(
        (x) => x.kind === "General" && x.isDefault && x.isActive,
      );
      if (primary) {
        setAddressLabel(primary.label);
        setAddressLine(primary.addressLine);
        setAddressCity(primary.city);
        setAddressDistrict(primary.district || "");
        setAddressPostalCode(primary.postalCode || "");
        setAddressCountry(primary.countryCode || "TR");
        setAddressLatitude(primary.latitude);
        setAddressLongitude(primary.longitude);
      }
      setCustomerCreateFields(definitions);
      setCustomerCreateValues(
        Object.fromEntries(values.map((value) => [value.code, value.value])),
      );
    } catch (e) {
      setError((e as Error).message);
    }
    setEditingCustomer(item);
    // Opened from the list's Adresler / Özel alanlar: start on that section of the card.
    const startSection = sessionStorage.getItem(CUSTOMER_EDIT_SECTION_KEY);
    sessionStorage.removeItem(CUSTOMER_EDIT_SECTION_KEY);
    if (startSection) setCustomerCreateTab(startSection);
    setModal(true);
  }
  async function saveCustomerEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer) return;
    if (identifierErrorsBlockSubmit(editingCustomer)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<CustomerItem>(`/api/customers/${editingCustomer.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          code,
          name,
          type,
          taxNumber: taxNumber || null,
          identityNumber: identityNumber || null,
          taxOffice: taxOffice || null,
          isEInvoiceRegistered,
          eInvoiceRecipientAlias: eInvoiceRecipientAlias || null,
          phone: phone || null, email: email || null, website: website || null,
          contactName: contactName || null, contactPhone: contactPhone || null, contactEmail: contactEmail || null,
          priceListCode: priceListCode || null, receivableAccountCode: receivableAccountCode || null, payableAccountCode: payableAccountCode || null,
          bankName: bankName || null, bankBranchCode: bankBranchCode || null, iban: iban || null,
          address:
            addressLine.trim() ||
            addressCity.trim() ||
            addressDistrict.trim() ||
            addressPostalCode.trim()
              ? {
                  kind: "General",
                  label: addressLabel || "Merkez",
                  addressLine,
                  city: addressCity,
                  district: addressDistrict || null,
                  postalCode: addressPostalCode || null,
                  countryCode: addressCountry,
                  isDefault: true,
                  latitude: addressLatitude,
                  longitude: addressLongitude,
                }
              : null,
          isActive: editingCustomer.isActive,
          rowVersion: editingCustomer.rowVersion,
          groupId: groupId || null,
          parentCompanyId: parentCompanyId || null,
          currencyCode,
          riskLimit: riskLimit ? Number(riskLimit) : null,
          paymentTermDays: Number(paymentTermDays),
          customFields: customerCreateValues,
        }),
      });
      setEditingCustomer(null);
      setModal(false);
      setNotice("Cari kartı güncellendi.");
      if (initialEdit) leaveEdit();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleActive(item: CustomerItem) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // PUT replaces the card's contact, bank and e-invoice fields; send the stored values so
      // toggling the status does not wipe them (address and custom fields are kept when omitted).
      const full = await api<CustomerItem>(`/api/customers/${item.id}`, token);
      await api<CustomerItem>(`/api/customers/${item.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          code: full.code,
          name: full.name,
          type: full.type,
          taxNumber: full.taxNumber,
          identityNumber: full.identityNumber,
          taxOffice: full.taxOffice,
          isEInvoiceRegistered: full.isEInvoiceRegistered,
          eInvoiceRecipientAlias: full.eInvoiceRecipientAlias,
          phone: full.phone, email: full.email, website: full.website,
          contactName: full.contactName, contactPhone: full.contactPhone, contactEmail: full.contactEmail,
          priceListCode: full.priceListCode, receivableAccountCode: full.receivableAccountCode, payableAccountCode: full.payableAccountCode,
          bankName: full.bankName, bankBranchCode: full.bankBranchCode, iban: full.iban,
          isActive: !full.isActive,
          rowVersion: full.rowVersion,
          groupId: full.groupId,
          parentCompanyId: full.parentCompanyId || null,
          currencyCode: full.currencyCode,
          riskLimit: full.riskLimit,
          paymentTermDays: full.paymentTermDays,
        }),
      });
      setNotice(
        item.isActive
          ? "Cari kart pasife alındı."
          : "Cari kart yeniden etkinleştirildi.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openCustomerFields(item: CustomerItem) {
    setFieldCustomer(item);
    setCustomerFields([]);
    setCustomerFieldValues({});
    setCustomerFieldMetadataDefinition(null);
    setCustomerFieldMetadataHistory([]);
    setCustomerFieldValueHistoryDefinition(null);
    setCustomerFieldValueHistory([]);
    setError("");
    try {
      const [definitions, values] = await Promise.all([
        api<CustomerCustomFieldDefinition[]>(
          "/api/customers/custom-fields",
          token,
        ),
        api<CustomerCustomFieldValue[]>(
          `/api/customers/${item.id}/custom-fields`,
          token,
        ),
      ]);
      setCustomerFields(definitions);
      setCustomerFieldValues(
        Object.fromEntries(values.map((value) => [value.code, value.value])),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveCustomerFieldValues(e: React.FormEvent) {
    e.preventDefault();
    if (!fieldCustomer) return;
    setBusy(true);
    setError("");
    try {
      const values = await api<CustomerCustomFieldValue[]>(
        `/api/customers/${fieldCustomer.id}/custom-fields`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({ values: customerFieldValues }),
        },
      );
      setCustomerFieldValues(
        Object.fromEntries(values.map((value) => [value.code, value.value])),
      );
      setNotice("Cari özel alan değerleri kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createCustomerField(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<CustomerCustomFieldDefinition>(
        "/api/customers/custom-fields",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            code: customerFieldCode,
            label: customerFieldLabel,
            dataType: customerFieldType,
            maxLength: Number(customerFieldMaxLength),
            isRequired: canManageCustomerFieldPolicy && customerFieldRequired,
          }),
        },
      );
      setCustomerFieldCode("");
      setCustomerFieldLabel("");
      setCustomerFieldMaxLength("200");
      setCustomerFieldRequired(false);
      if (fieldCustomer) await openCustomerFields(fieldCustomer);
      if (!takeStayOpenAfterSave()) setCustomerFieldDefinitionScreen("list");
      setNotice("Cari özel alan tanımı oluşturuldu.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivateCustomerField(field: CustomerCustomFieldDefinition) {
    if (
      !(await confirmCustomerAction(
        `${field.label} alanı yeni değer girişinden kaldırılacak; mevcut değerler korunacak. Devam edilsin mi?`,
        {
          title: "Özel alanı devre dışı bırak",
          confirmLabel: "Devre dışı bırak",
          danger: true,
        },
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<void>(`/api/customers/custom-fields/${field.id}`, token, {
        method: "DELETE",
      });
      setCustomerFields((current) =>
        current.filter((item) => item.id !== field.id),
      );
      await loadCustomerFieldMetadataHistory(field);
      setNotice(
        "Cari özel alanı devre dışı bırakıldı. Sürüm geçmişinden yeniden etkinleştirebilirsiniz.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editCustomerField(field: CustomerCustomFieldDefinition) {
    const label = (
      await promptCustomerValue(
        "Özel alanı düzenle",
        "Yeni alan etiketini girin.",
        field.label,
        { valueLabel: "Alan etiketi", maxLength: 120 },
      )
    )?.trim();
    if (!label) return;
    let maxLength = field.maxLength;
    if (field.dataType === "Text") {
      const raw = await promptCustomerValue(
        "Metin sınırı",
        "Karakter sayısını 1–500 arasında belirleyin.",
        String(field.maxLength),
        {
          valueLabel: "En fazla karakter",
          inputType: "number",
          min: 1,
          max: 500,
        },
      );
      if (raw === null) return;
      maxLength = Number(raw);
      if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 500) {
        setError("Metin uzunluğu 1–500 arasında olmalıdır.");
        return;
      }
    }
    let isRequired: boolean | undefined;
    if (canManageCustomerFieldPolicy) {
      const requiredValue = await promptCustomerValue(
        "Zorunluluk ayarı",
        "Zorunlu yapmak için tüm mevcut carilerde değer bulunmalıdır.",
        field.isRequired ? "true" : "false",
        {
          valueLabel: "Zorunlu alan",
          choices: [
            { value: "true", label: "Evet" },
            { value: "false", label: "Hayır" },
          ],
        },
      );
      if (requiredValue === null) return;
      isRequired = requiredValue === "true";
    }
    setBusy(true);
    setError("");
    try {
      await api<CustomerCustomFieldDefinition>(
        `/api/customers/custom-fields/${field.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({ label, maxLength, isRequired }),
        },
      );
      if (fieldCustomer) await openCustomerFields(fieldCustomer);
      await loadCustomerFieldMetadataHistory(field);
      setNotice("Cari özel alan tanımı yeni sürüm olarak kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadCustomerFieldMetadataHistory(
    field: CustomerCustomFieldDefinition,
  ) {
    setCustomerFieldMetadataDefinition(field);
    setCustomerFieldMetadataHistory([]);
    try {
      setCustomerFieldMetadataHistory(
        await api<CustomerCustomFieldRevision[]>(
          `/api/customers/custom-fields/${field.id}/history`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadCustomerFieldValueHistory(
    field: CustomerCustomFieldDefinition,
  ) {
    if (!fieldCustomer) return;
    setCustomerFieldValueHistoryDefinition(field);
    setCustomerFieldValueHistory([]);
    try {
      setCustomerFieldValueHistory(
        await api<CustomerCustomFieldValueRevision[]>(
          `/api/customers/${fieldCustomer.id}/custom-fields/${field.id}/history`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restoreCustomerFieldValueRevision(
    revision: CustomerCustomFieldValueRevision,
  ) {
    if (
      !fieldCustomer ||
      !customerFieldValueHistoryDefinition ||
      !(await confirmCustomerAction(
        `${revision.label} alanının ${new Date(revision.createdAt).toLocaleString("tr-TR")} tarihli değişikliği geri alınsın mı? Bu işlem yeni bir geçmiş kaydı oluşturur.`,
        { title: "Önceki değeri geri yükle", confirmLabel: "Geri yükle" },
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<CustomerCustomFieldValue>(
        `/api/customers/${fieldCustomer.id}/custom-fields/${revision.definitionId}/history/${revision.id}/restore`,
        token,
        { method: "POST", body: JSON.stringify({ confirmation: true }) },
      );
      await openCustomerFields(fieldCustomer);
      await loadCustomerFieldValueHistory(customerFieldValueHistoryDefinition);
      setNotice(
        "Önceki cari özel alan değeri geri yüklendi; işlem geçmişe eklendi.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restoreCustomerFieldMetadataRevision(
    revision: CustomerCustomFieldRevision,
  ) {
    if (
      !customerFieldMetadataDefinition ||
      !(await confirmCustomerAction(
        `${revision.code} alanının v${revision.version} tanımı geri yüklensin mi? Bu işlem yeni sürüm oluşturur.`,
        { title: "Alan tanımını geri yükle", confirmLabel: "Geri yükle" },
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<CustomerCustomFieldDefinition>(
        `/api/customers/custom-fields/${revision.definitionId}/restore`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            version: revision.version,
            confirmation: true,
          }),
        },
      );
      if (fieldCustomer) await openCustomerFields(fieldCustomer);
      await loadCustomerFieldMetadataHistory(customerFieldMetadataDefinition);
      setNotice(`v${revision.version} tanımı yeni sürüm olarak geri yüklendi.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /**
   * The card (its own route) tells the list that the account's addresses changed, so the list panel's default
   * address follows (the base window updated it in place).
   */
  function announceAddresses(customerId: string, list: CustomerAddressItem[]) {
    window.dispatchEvent(new CustomEvent(CUSTOMER_ADDRESSES_CHANGED_EVENT, { detail: { customerId, addresses: list } }));
  }
  /** Adds an address to the open card (same request as the former Adresler window). */
  async function createSectionAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer) return;
    const fields = addressDraft;
    setBusy(true);
    setError("");
    try {
      const isDefault = !addresses.some(
        (x) => x.isActive && x.kind === fields.kind && x.isDefault,
      );
      const address = await api<CustomerAddressItem>(
        `/api/customers/${editingCustomer.id}/addresses`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            kind: fields.kind,
            label: fields.label,
            addressLine: fields.addressLine,
            city: fields.city,
            district: fields.district || null,
            postalCode: fields.postalCode || null,
            countryCode: fields.countryCode,
            isDefault,
            latitude: fields.latitude,
            longitude: fields.longitude,
          }),
        },
      );
      const nextAddresses = [
        ...addresses.filter((x) => !(address.isDefault && x.kind === address.kind)),
        address,
      ];
      setAddresses(nextAddresses);
      announceAddresses(editingCustomer.id, nextAddresses);
      // Kind and country stay for the next address, as in the former window.
      setAddressDraft({ ...emptyAddressDraft, kind: fields.kind, countryCode: fields.countryCode });
      setNotice("Adres kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleAddressActive(address: CustomerAddressItem) {
    if (!editingCustomer) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<CustomerAddressItem>(
        `/api/customers/${editingCustomer.id}/addresses/${address.id}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            ...address,
            isActive: !address.isActive,
            isDefault: address.isActive ? false : address.isDefault,
          }),
        },
      );
      const nextAddresses = addresses.map((x) => (x.id === address.id ? updated : x));
      setAddresses(nextAddresses);
      announceAddresses(editingCustomer.id, nextAddresses);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openLedger(item: CustomerItem) {
    setError("");
    setLedgerCustomer(item);
    setLedgerBalance(null);
    setStatement(null);
    setStatementPage(1);
    setReconciliationPage(1);
    setExternalRows([]);
    setExternalFileName("");
    try {
      const [balance, statementData] = await Promise.all([
        api<CustomerBalance>(`/api/customers/${item.id}/balance`, token),
        api<CustomerStatement>(
          `/api/customers/${item.id}/statement?from=${statementFrom}&to=${statementTo}`,
          token,
        ),
      ]);
      setLedgerBalance(balance);
      setStatement(statementData);
      setStatementPage(1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reloadStatement() {
    if (!ledgerCustomer) return;
    setError("");
    try {
      const data = await api<CustomerStatement>(
        `/api/customers/${ledgerCustomer.id}/statement?from=${statementFrom}&to=${statementTo}`,
        token,
      );
      setStatement(data);
      setStatementPage(1);
      setExternalRows([]);
      setExternalFileName("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function downloadCustomerStatement() {
    if (!statement) return;
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ["date", "direction", "amount", "description", "balance"],
      ...statement.items.map((x) => [
        x.entryDate,
        x.direction,
        x.amount.toFixed(2),
        x.description,
        x.balance.toFixed(2),
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escape).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cari-ekstresi-${statement.customerCode}-${statement.from}-${statement.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function importCustomerStatement(file: File | null) {
    if (!file) return;
    setError("");
    try {
      const rows = parseCustomerStatementCsv(await file.text());
      setExternalRows(rows);
      setReconciliationPage(1);
      setExternalFileName(file.name);
    } catch (e) {
      setExternalRows([]);
      setReconciliationPage(1);
      setExternalFileName("");
      setError((e as Error).message);
    }
  }
  const statementPageSize = 50,
    statementPageCount = Math.max(
      1,
      Math.ceil((statement?.items.length ?? 0) / statementPageSize),
    ),
    pagedStatementItems =
      statement?.items.slice(
        (statementPage - 1) * statementPageSize,
        statementPage * statementPageSize,
      ) ?? [];
  const reconciliation = useMemo(() => {
    const buckets = new Map<
        string,
        { items: CustomerStatement["items"]; cursor: number }
      >(),
      matchedErpIds = new Set<string>(),
      externalMatched = new Set<number>();
    let matched = 0;
    if (statement) {
      for (const item of statement.items) {
        const key = `${item.entryDate}|${item.direction}|${Math.round(item.amount * 100)}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.items.push(item);
        else buckets.set(key, { items: [item], cursor: 0 });
      }
      externalRows.forEach((external, index) => {
        const direction =
            externalPerspective === "counterparty"
              ? external.direction === "Debit"
                ? "Credit"
                : "Debit"
              : external.direction,
          key = `${external.entryDate}|${direction}|${Math.round(external.amount * 100)}`,
          bucket = buckets.get(key),
          candidate = bucket?.items[bucket.cursor];
        if (candidate && Math.abs(candidate.amount - external.amount) < 0.005) {
          bucket.cursor++;
          matchedErpIds.add(candidate.id);
          externalMatched.add(index);
          matched++;
        }
      });
    }
    const erpUnmatchedItems =
        statement?.items.filter((item) => !matchedErpIds.has(item.id)) ?? [],
      externalUnmatchedItems = externalRows.filter(
        (_, index) => !externalMatched.has(index),
      ),
      rows = [
        ...erpUnmatchedItems.map((item) => ({
          key: `erp-${item.id}`,
          source: "erp" as const,
          item,
        })),
        ...externalUnmatchedItems.map((item, index) => ({
          key: `external-${index}`,
          source: "external" as const,
          item,
        })),
      ];
    return {
      matched,
      erpUnmatched: erpUnmatchedItems.length,
      externalUnmatched: externalUnmatchedItems.length,
      rows,
      totalUnmatched: rows.length,
    };
  }, [statement, externalRows, externalPerspective]);
  const reconciliationPageSize = 50,
    reconciliationPageCount = Math.max(
      1,
      Math.ceil(reconciliation.totalUnmatched / reconciliationPageSize),
    ),
    visibleReconciliationRows = reconciliation.rows.slice(
      (reconciliationPage - 1) * reconciliationPageSize,
      reconciliationPage * reconciliationPageSize,
    );
  async function createMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!ledgerCustomer) return;
    setBusy(true);
    setError("");
    try {
      await api<CustomerLedgerItem>(
        `/api/customers/${ledgerCustomer.id}/ledger`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            entryDate: movementDate,
            direction: movementDirection,
            amount: Number(movementAmount),
            currencyCode: ledgerCustomer.currencyCode,
            description: movementDescription,
          }),
        },
      );
      setMovementAmount("");
      setMovementDescription("");
      if (!takeStayOpenAfterSave()) setCustomerMovementOpen(false);
      await openLedger(ledgerCustomer);
      setNotice("Cari hareketi kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reverseMovement(item: CustomerLedgerItem) {
    if (!ledgerCustomer) return;
    const reason = (
      await promptCustomerValue(
        "Cari hareketini ters kaydet",
        "Bu hareket silinmez; karşı yönlü yeni kayıt oluşturulur. Ters kayıt nedenini girin.",
        "",
        { valueLabel: "Ters kayıt nedeni", maxLength: 240 },
      )
    )?.trim();
    if (!reason) return;
    setBusy(true);
    setError("");
    try {
      await api<CustomerLedgerItem>(
        `/api/customers/${ledgerCustomer.id}/ledger/${item.id}/reverse`,
        token,
        { method: "POST", body: JSON.stringify({ reason }) },
      );
      await openLedger(ledgerCustomer);
      setNotice("Ters kayıt oluşturuldu; kaynak hareket silinmedi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function renderScreenCell(
    field: BuiltInScreenLayoutField,
    item: CustomerItem,
  ) {
    if (field.key.startsWith("custom:")) return item.customFields?.[field.key] || "—";
    switch (field.key) {
      case "code":
        return item.code;
      case "name":
        return (
          <>
            <span className="customer-name-line">
              <span className="customer-name">{item.name}</span>
              {item.isEInvoiceRegistered && <StatusTag tone="ok">e-Fatura</StatusTag>}
            </span>
            {!codeColumnShown && <small className="cell-subtitle list-v2-name-code">{item.code}</small>}
          </>
        );
      case "groupName":
        return item.groupName || <span className="list-v2-unset">Grup atanmamış</span>;
      case "type":
        return <StatusTag tone={customerTypeTone(item.type)}>{customerTypeLabel(item.type)}</StatusTag>;
      case "currencyCode":
        return item.currencyCode;
      case "paymentTermDays":
        return (
          <>
            <span>{item.paymentTermDays}</span> <span>gün</span>
          </>
        );
      case "taxNumber":
        return item.taxNumber || <span className="list-v2-unset">—</span>;
      case "identityNumber":
        return item.identityNumber || "—";
      case "taxOffice":
        return item.taxOffice || "—";
      case "riskLimit":
        return item.riskLimit == null ? <span className="list-v2-unset">—</span> : item.riskLimit.toLocaleString("tr-TR");
      case "parentCompanyName":
        return item.parentCompanyName || "—";
      case "subsidiaryCount":
        return item.subsidiaryCount ?? 0;
      case "createdAt":
        return new Date(item.createdAt).toLocaleDateString("tr-TR");
      case "status":
        return <StatusTag tone={item.isActive ? "ok" : "off"}>{item.isActive ? "Aktif" : "Pasif"}</StatusTag>;
      default:
        return "—";
    }
  }
  const list = useCustomerListScreen({
    active: !modal && !initialCreate && !initialEdit,
    token,
    isAdmin: role === "TenantAdmin",
    busy,
    exportBusy,
    items,
    total,
    page,
    pageSize: 25,
    loading,
    counts: directoryMetrics,
    search: filter,
    currentId: selectedCustomerId,
    onCurrentChange: setSelectedCustomerId,
    onPageChange: setPage,
    onCreate: () => onNavigate("customer-create"),
    onOpen: (item) => void openEditCustomer(item),
    onExport: (format) => void exportCustomers(format),
    onGroups: () => onNavigate("customer-groups"),
    onImport: () => setImportOpen(true),
    onToggleActive: (item) => void toggleActive(item),
    onSalesAction: (target) => openCustomerSalesAction(target),
    onLedger: (item) => void openLedger(item),
    onAddresses: (item) => void openEditCustomer(item, true, "addresses"),
    onFields: (item) => void openEditCustomer(item, true, "custom"),
    onFieldDefinitions: (item) => void openCustomerFields(item),
    onInvoices: (item) => setSalesInvoicesCustomer(item),
    onPurchaseInvoices: (item) => onOpenPurchaseInvoices({ id: item.id, name: item.name }),
  });
  const customerFormProps: CustomerCreatePageProps = {
    busy,
    error,
    setError,
    setModal: (value) => {
        if (!value && initialCreate) {
          // Keep the create tab's form mounted for its next use; just clear it.
          resetCustomerForm();
          setError("");
          setNotice("");
          setCustomerCreateTab("contact");
          onNavigate("customers");
          return;
        }
        setModal(value);
        if (!value && initialEdit) leaveEdit();
        else if (!value && initialCreate) onNavigate("customers");
      },
    create: initialEdit ? saveCustomerEdit : create,
    customerCreateTab,
    setCustomerCreateTab,
    code,
    setCode,
    name,
    setName,
    type,
    setType,
    groups,
    groupId,
    setGroupId,
    parentCompanyId,
    setParentCompanyId,
    companyOptions,
    editingCustomer,
    currencyCode,
    setCurrencyCode,
    riskLimit,
    setRiskLimit,
    paymentTermDays,
    setPaymentTermDays,
    identityNumber,
    setIdentityNumber,
    taxNumber,
    setTaxNumber,
    taxOffice,
    setTaxOffice,
    isEInvoiceRegistered,
    setIsEInvoiceRegistered,
    eInvoiceRecipientAlias,
    setEInvoiceRecipientAlias,
    phone, setPhone, email, setEmail, website, setWebsite,
    contactName, setContactName, contactPhone, setContactPhone, contactEmail, setContactEmail,
    priceListCode, setPriceListCode, receivableAccountCode, setReceivableAccountCode, payableAccountCode, setPayableAccountCode,
    bankName, setBankName, bankBranchCode, setBankBranchCode, iban, setIban,
    addressPostalCode,
    setAddressPostalCode,
    addressCountry,
    setAddressCountry,
    addressCity,
    setAddressCity,
    addressDistrict,
    setAddressDistrict,
    addressLine,
    setAddressLine,
    locationDefinitions,
    addressLatitude,
    setAddressLatitude,
    addressLongitude,
    setAddressLongitude,
    customerCreateFields,
    customerCreateValues,
    setCustomerCreateValues,
    notice,
    setStayAfterSave: (value) => {
      stayAfterSave.current = value;
    },
    onReset: () => {
      resetCustomerForm();
      setError("");
      setNotice("");
    },
  };
  if (initialEdit && editingCustomer)
    customerFormProps.extraSections = [
      {
        key: "addresses",
        label: "Adresler",
        count: addresses.length,
        content: (
          <CustomerAddressSection
            addresses={addresses}
            busy={busy}
            draft={addressDraft}
            onDraftChange={setAddressDraft}
            onToggleActive={(address) => void toggleAddressActive(address)}
            locationDefinitions={locationDefinitions}
          />
        ),
      },
    ];
  const customerCreatePage = <CustomerCreatePage {...customerFormProps} />;
  const customerEditPage = <CustomerEditPage {...customerFormProps} />;
  if (initialCreate || initialEdit)
    return modal ? (
      initialEdit ? (
        <>
          {customerEditPage}
          {/* The Adresler section's new-address fields submit this form (forms cannot nest in the card's form). */}
          <form id={CUSTOMER_ADDRESS_FORM_ID} hidden onSubmit={(event) => void createSectionAddress(event)} />
        </>
      ) : (
        customerCreatePage
      )
    ) : error ? (
      <div className="customer-page-main">
        <div className="alert inline-alert" role="alert">
          {error}
            {initialCreate && (
              <button type="button" onClick={() => void openCustomerModal()}>
                Yeniden dene
              </button>
            )}
            <button type="button" onClick={() => (initialEdit ? leaveEdit() : onNavigate("customers"))}>Cari listesine dön</button>
        </div>
      </div>
    ) : (
      <div className="loading-state">Cari kartı formu yükleniyor…</div>
    );
  return modal ? (
    customerCreatePage
  ) : (
    <>
      <div className="customer-page-main list-v2">
      <PageCommandsSlot commands={list.commands} />
      <CustomerDirectoryHeader
        title={pageSettings.title}
        description={pageSettings.description}
        total={directoryMetrics?.total ?? null}
      />
      {list.summary}
      {error && (
        <div className="alert inline-alert" role="alert">
          {error}
          <button type="button" aria-label="Kapat" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" aria-label="Kapat" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <CustomerFilters
        search={search}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        onSearchChange={setSearch}
        onTypeChange={(value) => {
          setTypeFilter(value);
          setPage(1);
        }}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
        onApply={() => {
          setPage(1);
          setFilter(search.trim());
        }}
        onRefresh={() => void load()}
        counts={directoryMetrics}
        toolsSlotRef={setGridToolsSlot}
        searchLabel={pageSettings.searchLabel}
        searchPlaceholder={pageSettings.searchPlaceholder}
        typeFilterLabel={pageSettings.typeFilterLabel}
        statusFilterLabel={pageSettings.statusFilterLabel}
        applyLabel={pageSettings.applyLabel}
        showTypeFilter={pageSettings.showTypeFilter}
        showStatusFilter={pageSettings.showStatusFilter}
      >
        {list.panelToggle}
      </CustomerFilters>
      <div ref={list.panelRootRef} className={`sales-list-body customer-list-body${list.panelOpen ? " has-detail" : ""}`}>
        <CustomerGrid
          items={items}
          fields={visibleScreenFields}
          loading={loading}
          filter={filter}
          toolbarContainer={gridToolsSlot}
          exportActionsRef={list.exportRef}
          selection={list.selection}
          footer={list.footer}
          renderCell={renderScreenCell}
        />
        {list.renderPanel((customer) => (
          <CustomerDetailPanel
            customer={customer}
            tab={customerDetailTab}
            fields={visibleCustomerDetailFields}
            address={customerDetailAddress}
            addressLoaded={customerDetailAddressLoaded}
            balance={list.balance}
            balanceError={list.balanceError}
            onTabChange={setCustomerDetailTab}
            onOpen={() => void openEditCustomer(customer)}
            onClose={list.closePanel}
            takeFocus={list.takeFocus}
            onInvoices={() => setSalesInvoicesCustomer(customer)}
            onPurchaseInvoices={() => onOpenPurchaseInvoices({ id: customer.id, name: customer.name })}
            onLedger={() => void openLedger(customer)}
            onAddresses={() => void openEditCustomer(customer, true, "addresses")}
            onFields={() => void openEditCustomer(customer, true, "custom")}
          />
        ))}
      </div>
      </div>
      {fieldCustomer && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setFieldCustomer(null);
          }}
        >
          <div className="modal customer-fields-modal" role="dialog" aria-modal="true" aria-label="Cari Özel Alanları">
            <RecordFormPage
              variant="dialog"
              className="prf-flush"
              title="Cari Özel Alan Değerleri"
              mode="edit"
              busy={busy}
              saveLabel="Değerleri kaydet"
              onSubmit={saveCustomerFieldValues}
              onCancel={() => {
                if (!busy) setFieldCustomer(null);
              }}
              status={
                <>
                  <span>
                    {fieldCustomer.code} · {fieldCustomer.name}
                  </span>
                  <span className="rf-status-end">Değerler yalnızca bu firmada saklanır.</span>
                </>
              }
            >
              <div className="prf-group-toolbar">
                <small>
                  Firma tanımları müşteri ve tedarikçi cari kartlarında kullanılır.
                  Değerler veri türüne göre doğrulanır.
                </small>
                {canDesignCustomerFields && (
                  <button
                    type="button"
                    className="secondary small-button"
                    disabled={busy}
                    onClick={() => setCustomerFieldDefinitionScreen("list")}
                  >
                    Alan tanımları
                  </button>
                )}
              </div>
              <RecordFormGroup title="Özel Alanlar">
              <div className="requests-list customer-field-values-list">
                {customerFields.map((field) => (
                  <article className="request-row expanded" key={field.id}>
                    <div className="request-info">
                      <label>
                        <span>
                          {field.label}
                          {field.isRequired && <RequiredMark />}
                        </span>
                        {field.dataType === "Boolean" ? (
                          <select
                            required={field.isRequired}
                            value={customerFieldValues[field.code] || ""}
                            onChange={(e) =>
                              setCustomerFieldValues((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Seçin</option>
                            <option value="true">Evet</option>
                            <option value="false">Hayır</option>
                          </select>
                        ) : (
                          <input
                            type={
                              field.dataType === "Decimal"
                                ? "number"
                                : field.dataType === "Date"
                                  ? "date"
                                  : "text"
                            }
                            step={
                              field.dataType === "Decimal" ? "any" : undefined
                            }
                            maxLength={
                              field.dataType === "Text"
                                ? field.maxLength
                                : undefined
                            }
                            required={field.isRequired}
                            value={customerFieldValues[field.code] || ""}
                            onChange={(e) =>
                              setCustomerFieldValues((current) => ({
                                ...current,
                                [field.code]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </label>
                    </div>
                    <div className="customer-field-actions">
                      <button
                        type="button"
                        className="row-action"
                        disabled={busy}
                        onClick={() =>
                          void loadCustomerFieldValueHistory(field)
                        }
                      >
                        Değer geçmişi
                      </button>
                    </div>
                  </article>
                ))}
                {customerFields.length === 0 && (
                  <div className="empty-small">
                    Bu firma için henüz cari özel alanı tanımlanmadı.
                  </div>
                )}
              </div>
              </RecordFormGroup>
            </RecordFormPage>
            {customerFieldValueHistoryDefinition && (
              <section className="panel customer-field-history">
                <div className="panel-heading">
                  <div>
                    <b>
                      {customerFieldValueHistoryDefinition.label} · değer
                      geçmişi
                    </b>
                    <small>
                      Son 50 değişiklik; geri yükleme yeni bir geçmiş kaydı
                      oluşturur.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary small-button"
                    onClick={() => setCustomerFieldValueHistoryDefinition(null)}
                  >
                    Kapat
                  </button>
                </div>
                <div className="requests-list">
                  {customerFieldValueHistory.map((revision) => (
                    <article className="request-row" key={revision.id}>
                      <div className="request-info">
                        <b>
                          {revision.previousValue ?? "—"} →{" "}
                          {revision.newValue ?? "—"}
                        </b>
                        <small>
                          Tanım v{revision.definitionVersion} ·{" "}
                          {new Date(revision.createdAt).toLocaleString("tr-TR")}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="secondary small-button"
                        disabled={busy}
                        onClick={() =>
                          void restoreCustomerFieldValueRevision(revision)
                        }
                      >
                        Önceki değeri geri yükle
                      </button>
                    </article>
                  ))}
                  {customerFieldValueHistory.length === 0 && (
                    <div className="empty-small">
                      Bu alan için değer geçmişi yok.
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {fieldCustomer &&
        canDesignCustomerFields &&
        customerFieldDefinitionScreen !== "closed" && (
          <div
            className="modal-backdrop customer-field-definition-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !busy)
                setCustomerFieldDefinitionScreen("closed");
            }}
          >
            <section
              className="modal customer-fields-modal customer-field-definition-modal"
              role="dialog"
              aria-modal="true"
              aria-label={
                customerFieldDefinitionScreen === "list"
                  ? "Alan tanımları"
                  : "Yeni alan tanımı"
              }
            >
              {customerFieldDefinitionScreen === "list" && (
              <div className="modal-head">
                <div>
                  <p className="eyebrow">CARİ ÖZEL ALAN TANIMLARI</p>
                  <h2 id="customer-field-definition-title">Alan tanımları</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Kapat"
                  disabled={busy}
                  onClick={() => setCustomerFieldDefinitionScreen("closed")}
                >
                  <X size={19} />
                </button>
              </div>
              )}
              {error && customerFieldDefinitionScreen === "list" && (
                <div className="alert inline-alert" role="alert">
                  {error}
                </div>
              )}
              {customerFieldDefinitionScreen === "list" ? (
                <>
                  <p className="muted customer-fields-description">
                    Bu tanımlar firma içindeki müşteri ve tedarikçi kartlarında
                    kullanılabilir.
                  </p>
                  <div className="requests-list customer-field-definition-list">
                    {customerFields.map((field) => (
                      <article className="request-row" key={field.id}>
                        <div className="request-info">
                          <b>{field.label}</b>
                          <small>
                            {field.code} · {customerFieldTypeLabel(field.dataType)}
                            {field.dataType === "Text"
                              ? ` · en fazla ${field.maxLength} karakter`
                              : ""}{" "}
                            · sürüm {field.version}
                            {field.isRequired ? " · zorunlu" : ""} ·{" "}
                            {field.isActive ? "Etkin" : "Devre dışı"}
                          </small>
                        </div>
                        <div className="customer-field-actions">
                          <button
                            type="button"
                            className="row-action"
                            disabled={busy}
                            onClick={() => void editCustomerField(field)}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="row-action"
                            disabled={busy}
                            onClick={() =>
                              void loadCustomerFieldMetadataHistory(field)
                            }
                          >
                            Sürüm geçmişi
                          </button>
                          {canManageCustomerFieldPolicy && (
                            <button
                              type="button"
                              className="row-action danger-action"
                              disabled={busy}
                              onClick={() =>
                                void deactivateCustomerField(field)
                              }
                            >
                              Devre dışı bırak
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                    {customerFields.length === 0 && (
                      <div className="empty-small">
                        Henüz cari özel alan tanımı yok.
                      </div>
                    )}
                  </div>
                  <div className="modal-foot">
                    <span>Alan tanımları tüm cari kartlarında geçerlidir.</span>
                    <div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          setCustomerFieldDefinitionScreen("closed")
                        }
                      >
                        Kapat
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          setCustomerFieldDefinitionScreen("create")
                        }
                      >
                        Yeni alan tanımla
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <RecordFormPage
                  variant="dialog"
                  className="prf-flush"
                  title="Yeni Alan Tanımı"
                  mode="create"
                  busy={busy}
                  saveLabel="Alan tanımını kaydet"
                  onSubmit={createCustomerField}
                  onCancel={() => {
                    if (!busy) setCustomerFieldDefinitionScreen("list");
                  }}
                  onSaveIntent={setStayOpenAfterSave}
                  onReset={() => {
                    setCustomerFieldCode("");
                    setCustomerFieldLabel("");
                    setCustomerFieldMaxLength("200");
                    setCustomerFieldRequired(false);
                    setError("");
                  }}
                  error={error}
                  status={
                    <>
                      <span>
                        Tanım firma içindeki müşteri ve tedarikçi kartlarında
                        kullanılabilir.
                      </span>
                      <span className="rf-status-warning">
                        Mevcut kayıtlar yeni zorunlu değer isteyebilir.
                      </span>
                    </>
                  }
                >
                  <RecordFormGroup title="Alan Kimliği" bodyClassName="rf-identity prf-identity-2">
                    <label>
                      <span>Alan kodu <RequiredMark /></span>
                      <input
                        className="rf-must rf-mono"
                        value={customerFieldCode}
                        onChange={(e) =>
                          setCustomerFieldCode(e.target.value.toUpperCase())
                        }
                        required
                        maxLength={40}
                        placeholder="SEKTOR"
                      />
                    </label>
                    <label>
                      <span>Ekran etiketi <RequiredMark /></span>
                      <input
                        className="rf-must"
                        value={customerFieldLabel}
                        onChange={(e) => setCustomerFieldLabel(e.target.value)}
                        required
                        maxLength={120}
                      />
                    </label>
                  </RecordFormGroup>
                  <RecordFormGroup title="Veri Türü ve Kurallar">
                    <div className="rf-pair">
                    <label>
                      Veri türü
                      <select
                        value={customerFieldType}
                        onChange={(e) =>
                          setCustomerFieldType(
                            e.target
                              .value as CustomerCustomFieldDefinition["dataType"],
                          )
                        }
                      >
                        <option value="Text">Metin</option>
                        <option value="Decimal">Ondalık sayı</option>
                        <option value="Date">Tarih</option>
                        <option value="Boolean">Evet/Hayır</option>
                      </select>
                    </label>
                    {customerFieldType === "Text" && (
                      <label>
                        <span>En fazla karakter <RequiredMark /></span>
                        <input
                          className="rf-num"
                          type="number"
                          min="1"
                          max="500"
                          value={customerFieldMaxLength}
                          onChange={(e) =>
                            setCustomerFieldMaxLength(e.target.value)
                          }
                          required
                        />
                      </label>
                    )}
                    </div>
                  {canManageCustomerFieldPolicy ? (
                    <label className="rf-check">
                      <input
                        type="checkbox"
                        checked={customerFieldRequired}
                        onChange={(e) =>
                          setCustomerFieldRequired(e.target.checked)
                        }
                      />{" "}
                      Bu alanı zorunlu yap
                    </label>
                  ) : (
                    <small>
                      Zorunluluk ve devre dışı bırakma ayarlarını firma
                      yöneticisi yönetir.
                    </small>
                  )}
                  </RecordFormGroup>
                </RecordFormPage>
              )}
              {customerFieldMetadataDefinition && (
                <section className="panel customer-field-history">
                  <div className="panel-heading">
                    <div>
                      <b>
                        {customerFieldMetadataDefinition.code} · sürüm geçmişi
                      </b>
                      <small>
                        Tanım değişiklikleri korunur; geri yükleme yeni sürüm
                        ekler.
                      </small>
                    </div>
                    <button
                      type="button"
                      className="secondary small-button"
                      onClick={() => setCustomerFieldMetadataDefinition(null)}
                    >
                      Kapat
                    </button>
                  </div>
                  <div className="requests-list">
                    {customerFieldMetadataHistory.map((revision) => (
                      <article className="request-row" key={revision.id}>
                        <div className="request-info">
                          <b>
                            v{revision.version} · {revision.label}
                          </b>
                          <small>
                            {customerFieldTypeLabel(revision.dataType)} ·{" "}
                            {revision.isActive ? "Etkin" : "Devre dışı"} ·{" "}
                            {revision.changeKind} ·{" "}
                            {new Date(revision.createdAt).toLocaleString(
                              "tr-TR",
                            )}
                          </small>
                        </div>
                        {canManageCustomerFieldPolicy && (
                          <button
                            type="button"
                            className="secondary small-button"
                            disabled={busy}
                            onClick={() =>
                              void restoreCustomerFieldMetadataRevision(
                                revision,
                              )
                            }
                          >
                            Bu sürümü geri yükle
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </section>
          </div>
        )}
      {salesInvoicesCustomer && (
        <CustomerSalesInvoicesPanel
          token={token}
          customer={salesInvoicesCustomer}
          onClose={() => setSalesInvoicesCustomer(null)}
          onOpenInvoice={(invoiceId) => {
            setSalesInvoicesCustomer(null);
            onOpenSalesInvoice(invoiceId);
          }}
        />
      )}
      {ledgerCustomer && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLedgerCustomer(null);
          }}
        >
          <div
            className="modal ledger-modal customer-ledger-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-ledger-title"
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">
                  {ledgerCustomer.code} · CARİ MUTABAKAT
                </p>
                <h2 id="customer-ledger-title">{ledgerCustomer.name}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Kapat"
                onClick={() => setLedgerCustomer(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="balance-banner">
              <div>
                <small>Güncel bakiye</small>
                <b>
                  {ledgerBalance
                    ? `${Math.abs(ledgerBalance.balance).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance.currencyCode}`
                    : "Hesaplanıyor…"}
                </b>
                <span>
                  {ledgerBalance?.balanceSide === "Debit"
                    ? "Borç bakiyesi"
                    : ledgerBalance?.balanceSide === "Credit"
                      ? "Alacak bakiyesi"
                      : "Denk bakiye"}
                  {ledgerBalance?.riskLimit != null
                    ? ` · Risk limiti ${ledgerBalance.riskLimit.toLocaleString("tr-TR")}`
                    : ""}
                </span>
              </div>
              <span className="ledger-currency">
                {ledgerCustomer.currencyCode}
              </span>
            </div>
            <div className="panel">
              <div className="form-two">
                <label>
                  Dönem başlangıcı
                  <input
                    type="date"
                    value={statementFrom}
                    max={statementTo}
                    onChange={(e) => setStatementFrom(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Dönem bitişi
                  <input
                    type="date"
                    value={statementTo}
                    min={statementFrom}
                    onChange={(e) => setStatementTo(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="modal-foot">
                <span>
                  {statement
                    ? `Dönem açılış ${statement.openingBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} · Borç ${statement.debitTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} · Alacak ${statement.creditTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} · Kapanış ${statement.closingBalance.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${statement.currencyCode}`
                    : "Ekstre yükleniyor…"}
                </span>
                <div>
                  <button
                    className="secondary"
                    onClick={() => void reloadStatement()}
                  >
                    Dönemi getir
                  </button>
                  <button
                    className="secondary"
                    disabled={!statement}
                    onClick={downloadCustomerStatement}
                  >
                    CSV dışa aktar
                  </button>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Karşı taraf ekstresiyle karşılaştır</h3>
                  <p>
                    CSV dosyası tarayıcıda işlenir. Tarih, tutar ve yön
                    karşılaştırılır; karşı taraf yönü varsayılan olarak ters
                    çevrilir.
                  </p>
                </div>
              </div>
              <div className="form-two">
                <label>
                  Ekstredeki yön
                  <select
                    value={externalPerspective}
                    onChange={(e) =>
                      setExternalPerspective(
                        e.target.value as "counterparty" | "same",
                      )
                    }
                  >
                    <option value="counterparty">
                      Karşı taraf yönü (Borç/Alacak ters)
                    </option>
                    <option value="same">ERP ile aynı yön</option>
                  </select>
                </label>
                <label>
                  Ekstre CSV dosyası
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) =>
                      void importCustomerStatement(e.target.files?.[0] || null)
                    }
                  />
                </label>
              </div>
              <div className="modal-foot">
                <span>
                  {externalFileName
                    ? `${externalFileName} · ${externalRows.length} satır · ${reconciliation.matched} eşleşme · ${reconciliation.erpUnmatched} ERP farkı · ${reconciliation.externalUnmatched} karşı taraf farkı`
                    : "CSV başlıkları date, direction, amount; Türkçe karşılıkları da desteklenir."}
                </span>
                {externalRows.length > 0 && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setExternalRows([]);
                      setExternalFileName("");
                    }}
                  >
                    Karşılaştırmayı temizle
                  </button>
                )}
              </div>
              {externalRows.length > 0 && (
                <div className="address-list">
                  <b>Karşılaştırma farkları</b>
                  {visibleReconciliationRows.map((row) => (
                    <div className="address-row" key={row.key}>
                      <span>
                        {row.source === "erp" ? "ERP kaydı" : "Karşı taraf"} ·{" "}
                        {row.item.entryDate} ·{" "}
                        {row.item.direction === "Debit" ? "Borç" : "Alacak"} ·{" "}
                        {row.item.amount.toLocaleString("tr-TR", {
                          minimumFractionDigits: 2,
                        })}{" "}
                        {row.source === "erp"
                          ? row.item.currencyCode
                          : statement?.currencyCode}{" "}
                        · {row.item.description || "Açıklama yok"}
                      </span>
                    </div>
                  ))}
                  {reconciliation.totalUnmatched === 0 && (
                    <div className="address-row">
                      <b>Tüm hareketler eşleşti.</b>
                    </div>
                  )}
                  {reconciliationPageCount > 1 && (
                    <div className="modal-foot reconciliation-pagination">
                      <span>
                        Fark{" "}
                        {(
                          (reconciliationPage - 1) * reconciliationPageSize +
                          1
                        ).toLocaleString("tr-TR")}
                        –
                        {Math.min(
                          reconciliationPage * reconciliationPageSize,
                          reconciliation.totalUnmatched,
                        ).toLocaleString("tr-TR")}{" "}
                        /{" "}
                        {reconciliation.totalUnmatched.toLocaleString("tr-TR")}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="secondary"
                          disabled={reconciliationPage <= 1}
                          onClick={() =>
                            setReconciliationPage((page) =>
                              Math.max(1, page - 1),
                            )
                          }
                        >
                          Önceki
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={
                            reconciliationPage >= reconciliationPageCount
                          }
                          onClick={() =>
                            setReconciliationPage((page) =>
                              Math.min(reconciliationPageCount, page + 1),
                            )
                          }
                        >
                          Sonraki
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="ledger-list">
              <AdvancedDataGrid
                className="customer-table customer-ledger-modal-grid"
                gridId="customer-detail-movements"
                {...screenViewGridDefaults(visibleMovementFields)}
                externalPagination
                hideSearch
                enableRowSelection={false}
              >
                <thead>
                  <tr>
                    {visibleMovementFields.map((field) => (
                      <th key={field.key} className={field.key === "amount" || field.key === "balance" ? "nx-num" : undefined}>
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedStatementItems.map((item) => (
                    <tr key={item.id}>
                      {visibleMovementFields.map((field) => (
                        <td key={field.key} className={field.key === "amount" || field.key === "balance" ? "nx-num" : undefined}>
                          {field.key === "entryDate" ? (
                            item.entryDate.split("-").reverse().join(".")
                          ) : field.key === "direction" ? (
                            item.direction === "Debit" ? "Borç" : "Alacak"
                          ) : field.key === "description" ? (
                            <>
                              {item.description}
                              {item.reversalOfId && (
                                <small className="cell-subtitle">Ters kayıt</small>
                              )}
                              {item.hasReversal && (
                                <small className="cell-subtitle">
                                  İptal edildi · geçmiş kaydı korunuyor
                                </small>
                              )}
                            </>
                          ) : field.key === "amount" ? (
                            <>
                              {item.amount.toLocaleString("tr-TR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              {item.currencyCode}
                            </>
                          ) : field.key === "balance" ? (
                            item.balance.toLocaleString("tr-TR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          ) : field.key === "actions" ? (
                            !item.reversalOfId &&
                            !item.hasReversal && (
                              <button
                                className="row-action"
                                disabled={busy}
                                onClick={() => void reverseMovement(item)}
                              >
                                Ters kayıt
                              </button>
                            )
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {statement?.items.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(visibleMovementFields.length, 1)} className="table-empty">
                        Seçilen dönemde cari hareket yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </AdvancedDataGrid>
            </div>
            {statementPageCount > 1 && (
              <div className="modal-foot statement-pagination">
                <span>
                  Sayfa {statementPage} / {statementPageCount} ·{" "}
                  {statement?.items.length ?? 0} hareket · Sayfa başına 50
                </span>
                <div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={statementPage <= 1}
                    onClick={() =>
                      setStatementPage((page) => Math.max(1, page - 1))
                    }
                  >
                    Önceki
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={statementPage >= statementPageCount}
                    onClick={() =>
                      setStatementPage((page) =>
                        Math.min(statementPageCount, page + 1),
                      )
                    }
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
            <div className="modal-foot">
              <span>
                Toplam {statement?.items.length ?? 0} hareket · Kaydedilen
                hareketler ters kayıtla iptal edilir.
              </span>
              <div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setLedgerCustomer(null)}
                >
                  Kapat
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setError("");
                    setCustomerMovementOpen(true);
                  }}
                >
                  Hareket ekle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {customerMovementOpen && ledgerCustomer && (
        <div
          className="modal-backdrop customer-movement-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setCustomerMovementOpen(false);
          }}
        >
          <section
            className="modal customer-movement-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Yeni hareket"
          >
            <RecordFormPage
              variant="dialog"
              className="prf-flush"
              title="Yeni Hareket"
              mode="create"
              busy={busy}
              saveLabel="Hareketi kaydet"
              onSubmit={createMovement}
              onCancel={() => {
                if (!busy) setCustomerMovementOpen(false);
              }}
              onSaveIntent={setStayOpenAfterSave}
              onReset={() => {
                setMovementAmount("");
                setMovementDescription("");
                setError("");
              }}
              error={error}
              onDismissError={() => setError("")}
              status={
                <>
                  <span>
                    {ledgerCustomer.code} · {ledgerCustomer.name} ·{" "}
                    {ledgerCustomer.currencyCode}
                  </span>
                  <span className="rf-status-warning">
                    Kaydedilen hareket silinemez; iptal ters kayıtla yapılır.
                  </span>
                </>
              }
            >
              <RecordFormGroup title="Hareket Kimliği" bodyClassName="rf-identity prf-identity-3">
                <label>
                  Hareket yönü
                  <select
                    value={movementDirection}
                    onChange={(e) =>
                      setMovementDirection(
                        e.target.value as CustomerLedgerItem["direction"],
                      )
                    }
                  >
                    <option value="Debit">Borç</option>
                    <option value="Credit">Alacak</option>
                  </select>
                </label>
                <label>
                  <span>Tarih <RequiredMark /></span>
                  <input
                    className="rf-must"
                    type="date"
                    value={movementDate}
                    onChange={(e) => setMovementDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Tutar ({ledgerCustomer.currencyCode}) <RequiredMark /></span>
                  <input
                    className="rf-must rf-num"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    required
                  />
                </label>
              </RecordFormGroup>
              <RecordFormGroup title="Açıklama">
                <label>
                  <span>Açıklama <RequiredMark /></span>
                  <input
                    className="rf-must"
                    value={movementDescription}
                    onChange={(e) => setMovementDescription(e.target.value)}
                    maxLength={240}
                    required
                    placeholder="Örn. Açılış bakiyesi"
                  />
                </label>
              </RecordFormGroup>
            </RecordFormPage>
          </section>
        </div>
      )}
      {customerDialog && (
        <div
          className="modal-backdrop customer-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              finishCustomerDialog(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              finishCustomerDialog(null);
            }
          }}
        >
          <section
            className="modal customer-dialog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-dialog-title"
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">CARİ YÖNETİMİ</p>
                <h2 id="customer-dialog-title">{customerDialog.title}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Pencereyi kapat"
                onClick={() => finishCustomerDialog(null)}
              >
                <X size={19} />
              </button>
            </div>
            <p className="customer-dialog-message">{customerDialog.message}</p>
            {customerDialog.kind === "prompt" &&
              (customerDialog.choices ? (
                <label className="customer-dialog-field">
                  {customerDialog.valueLabel}
                  <select
                    autoFocus
                    value={customerDialogValue}
                    onChange={(event) =>
                      setCustomerDialogValue(event.target.value)
                    }
                  >
                    {customerDialog.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="customer-dialog-field">
                  {customerDialog.valueLabel}
                  <input
                    autoFocus
                    type={customerDialog.inputType}
                    min={customerDialog.min}
                    max={customerDialog.max}
                    maxLength={customerDialog.maxLength}
                    value={customerDialogValue}
                    onChange={(event) =>
                      setCustomerDialogValue(event.target.value)
                    }
                  />
                </label>
              ))}
            <div className="modal-foot customer-dialog-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => finishCustomerDialog(null)}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={
                  customerDialog.kind === "confirm" && customerDialog.danger
                    ? "secondary danger-action"
                    : "primary"
                }
                onClick={() =>
                  finishCustomerDialog(
                    customerDialog.kind === "confirm"
                      ? true
                      : customerDialogValue,
                  )
                }
              >
                {customerDialog.kind === "confirm"
                  ? customerDialog.confirmLabel
                  : "Kaydet"}
              </button>
            </div>
          </section>
        </div>
      )}
      {importOpen && (
        <MasterDataImportDialog
          kind="customers"
          token={token}
          onClose={() => setImportOpen(false)}
          onImported={load}
        />
      )}
    </>
  );
}

export { CustomersPage };
