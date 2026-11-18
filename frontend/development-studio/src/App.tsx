import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Database,
  FileText,
  FolderKanban,
  GitBranch,
  ListTodo,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ChevronsUpDown,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { api, migrateLegacyRefreshToken } from "./api";
import { moduleStarterFiles } from "./moduleStarterFiles";
const StudioProjects = lazy(() =>
  import("./StudioProjects").then((module) => ({
    default: module.StudioProjects,
  })),
);
const DevelopmentRequestsPage = lazy(() =>
  import("./DevelopmentRequestsPage").then((module) => ({
    default: module.DevelopmentRequestsPage,
  })),
);
const NativePlatformTool = lazy(
  () => import("./platform-tools/NativePlatformTool"),
);
import "./studio-dashboard.css";
import { resolvePlatformOrigin } from "./platformOrigin";
import { confirmDialog } from "./ui/confirmDialog";
import { Dialog } from "./ui/Dialog";

type Tenant = { id: string; name: string; slug: string; role: string };
type DevelopmentProject = {
  id: string;
  name: string;
  repositoryUrl: string;
  defaultBranch: string;
  accessLevel: string;
  createdAt: string;
  githubAuthorized: boolean;
  gitHubAuthorized?: boolean;
};
type DevelopmentRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  canEdit: boolean;
};
type MarketplaceModule = {
  moduleCode: string;
  version: string;
  publisher: string;
  artifactSha256: string;
  publishedAt: string | null;
  manifest: {
    displayName?: string;
    dependencies: { moduleCode: string; minimumVersion: string }[];
    permissions: { code: string; description: string }[];
  } | null;
  isActivated: boolean;
  activatedVersion: string | null;
  runtimeStatus: string;
};
const studioModuleStarters = [
  {
    id: "greeting",
    name: "Selamlama modülü",
    moduleCode: "ornek.selamlama",
    description:
      "Bir ad alır ve kişiselleştirilmiş bir karşılama mesajı döndürür.",
  },
  {
    id: "price",
    name: "Fiyat hesaplama modülü",
    moduleCode: "ornek.fiyat-hesapla",
    description: "Birim fiyat, adet ve indirim oranından net tutarı hesaplar.",
  },
  {
    id: "text-summary",
    name: "Metin özeti modülü",
    moduleCode: "ornek.metin-ozeti",
    description: "Metindeki kelime ve karakter sayısını hesaplar.",
  },
] as const;
type LowCodeSample = {
  id: string;
  name: string;
  description: string;
  category: string;
  package: {
    schemaVersion: number;
    exportedAt: string;
    forms: { code: string; name: string; description: string; fieldsJson: string }[];
    workflows: { code: string; name: string; description: string; stepsJson: string }[];
    businessRules: { code: string; name: string; description: string; trigger: string; conditionsJson: string; workflowCode: string }[];
    screenViews: unknown[];
    reports: unknown[];
    customMenus: unknown[];
    customFields: unknown[];
    standardMenuLayoutJson: null;
  };
};
const lowCodeSamples: LowCodeSample[] = [
  {
    id: "customer-feedback",
    name: "Müşteri geri bildirim formu",
    description: "Müşteriden konu, öncelik ve açıklama bilgilerini alan düzenlenebilir bir form taslağı kurar.",
    category: "Form",
    package: {
      schemaVersion: 1, exportedAt: "2026-01-01T00:00:00Z",
      forms: [{ code: "ornek_musteri_geri_bildirim", name: "Müşteri geri bildirimi", description: "Müşteri talep ve geri bildirimlerini toplayın.", fieldsJson: JSON.stringify([
        { code: "customerName", label: "Ad Soyad", dataType: "Text", isRequired: true, maxLength: 120, placeholder: "Adınızı yazın", sectionTitle: "İletişim" },
        { code: "email", label: "E-posta", dataType: "Text", isRequired: true, maxLength: 254, textFormat: "Email" },
        { code: "subject", label: "Konu", dataType: "Choice", isRequired: true, maxLength: 0, options: ["Ürün", "Teslimat", "Fatura", "Diğer"], sectionTitle: "Geri bildirim" },
        { code: "priority", label: "Öncelik", dataType: "Choice", isRequired: true, maxLength: 0, options: ["Normal", "Yüksek", "Acil"] },
        { code: "message", label: "Açıklama", dataType: "Text", isRequired: true, maxLength: 1000, minLength: 10, isMultiline: true, placeholder: "Talebinizi açıklayın" },
      ]) }],
      workflows: [], businessRules: [], screenViews: [], reports: [], customMenus: [], customFields: [], standardMenuLayoutJson: null,
    },
  },
  {
    id: "purchase-order-approval",
    name: "Yüksek tutarlı sipariş onayı",
    description: "10.000 üzerindeki yeni satın alma siparişleri için yönetici onay taslağı ve otomasyon kuralı kurar.",
    category: "Otomasyon",
    package: {
      schemaVersion: 1, exportedAt: "2026-01-01T00:00:00Z", forms: [],
      workflows: [{ code: "ornek_satinalma_yuksek_tutar", name: "Yüksek tutarlı satın alma onayı", description: "Yönetici onay adımı içeren örnek akış.", stepsJson: JSON.stringify([{ name: "Yönetici onayı", approverRole: "TenantAdmin" }]) }],
      businessRules: [{ code: "ornek_satinalma_tutar_kontrolu", name: "Yüksek tutarlı siparişi onaya gönder", description: "10.000 üzerindeki yeni satın alma siparişlerinde yönetici onay akışını başlatır.", trigger: "purchase-order.created", conditionsJson: JSON.stringify([{ field: "grandTotal", operator: "GreaterThan", value: "10000" }]), workflowCode: "ornek_satinalma_yuksek_tutar" }],
      screenViews: [], reports: [], customMenus: [], customFields: [], standardMenuLayoutJson: null,
    },
  },
];
type LoginResponse = {
  accessToken: string;
  displayName: string;
  tenants: Tenant[];
};
type TenantSelectionResponse = { accessToken: string; tenant: Tenant };

const tokenKey = "aierp.accessToken";
const activeTenantKey = "aierp.tenant";
const tenantSelectionKey = "aierp.studioSelectionToken";
const tenantListKey = "aierp.studioTenants";
const refreshTokenKey = "aierp.studioRefreshToken";

function readTenant(): Tenant | null {
  try {
    return JSON.parse(
      localStorage.getItem(activeTenantKey) || "null",
    ) as Tenant | null;
  } catch {
    return null;
  }
}

function roleLabel(role: string) {
  return (
    ({
      TenantAdmin: "Firma yöneticisi",
      TenantUser: "Kullanıcı",
      Developer: "Geliştirici",
    } as Record<
      string,
      string
    >)[role] || role
  );
}

function StudioBrand() {
  return (
    <span className="st-brand">
      <span className="st-brand-mark" aria-hidden="true">
        <Sparkles size={16} />
      </span>
      <span>
        Nexora <em>Studio</em>
      </span>
    </span>
  );
}

type KpiTone = "accent" | "info" | "success" | "warning";

/** Studio genelinde kullanılan KPI kartı: ikon, etiket, değer ve kısa açıklama. */
function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  children,
}: {
  icon: LucideIcon;
  tone: KpiTone;
  label: string;
  value: ReactNode;
  hint: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="st-kpi">
      <div className="st-kpi-head">
        <span className={`st-kpi-icon is-${tone}`} aria-hidden="true">
          <Icon size={16} />
        </span>
        <small>{label}</small>
      </div>
      <b className="st-kpi-value">{value}</b>
      <span className="st-kpi-hint">{hint}</span>
      {children}
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="ns-empty st-empty">
      <span className="st-empty-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <b>{title}</b>
      {children}
    </div>
  );
}

const requestStatusTone: Record<string, string> = {
  Submitted: "is-warning",
  Planned: "is-accent",
  InReview: "is-warning",
  InProgress: "is-info",
  Completed: "is-success",
  Rejected: "is-danger",
};

function AnalyticsSparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (value, index) =>
        `${(index * 88) / Math.max(1, values.length - 1) + 3},${36 - (value / max) * 30}`,
    )
    .join(" ");
  return (
    <svg
      className="st-sparkline"
      viewBox="0 0 94 42"
      aria-hidden="true"
    >
      <polygon
        points={`3,42 ${points} 91,42`}
        fill="currentColor"
        opacity=".09"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(tokenKey) || "");
  const [selectionToken, setSelectionToken] = useState(
    localStorage.getItem(tenantSelectionKey) || "",
  );
  const [tenant, setTenant] = useState<Tenant | null>(readTenant);
  const [tenants, setTenants] = useState<Tenant[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(tenantListKey) || "[]",
      ) as Tenant[];
    } catch {
      return [];
    }
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requests, setRequests] = useState<DevelopmentRequest[]>([]);
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [marketplaceModules, setMarketplaceModules] = useState<
    MarketplaceModule[]
  >([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [marketplaceNotice, setMarketplaceNotice] = useState("");
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [toolQuery, setToolQuery] = useState("");
  const [marketplaceBusy, setMarketplaceBusy] = useState("");
  const [sampleInstallBusy, setSampleInstallBusy] = useState("");
  const [installedSamples, setInstalledSamples] = useState<string[]>([]);
  const [analyticsRange, setAnalyticsRange] = useState(180);
  const [analyticsProject, setAnalyticsProject] = useState("all");
  const projectsRequestId = useRef(0);
  const moduleStarterPrompted = useRef(false);
  // İlk proje/talep yüklemesinin sonucu; üst çubuktaki bağlantı rozeti bundan beslenir.
  const [dataStatus, setDataStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  );
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const tenantSwitchRef = useRef<HTMLDivElement>(null);
  const tenantButtonRef = useRef<HTMLButtonElement>(null);
  const requestTitleRef = useRef<HTMLInputElement>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestProjectId, setRequestProjectId] = useState("");
  const [moduleRequestDraft, setModuleRequestDraft] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const contextParams = new URLSearchParams(window.location.search);
  const contextPage = (contextParams.get("contextPage") || "")
    .trim()
    .slice(0, 100);
  const configuredPlatformOrigin = import.meta.env.VITE_PLATFORM_URL?.trim();
  const platformOrigin = resolvePlatformOrigin(
    contextParams.get("platformOrigin"),
    configuredPlatformOrigin,
    window.location.origin,
  );
  const contextualScreen = (
    contextParams.get("contextLabel") ||
    contextPage
      .replace(/^(inventory|sales|finance|manufacturing)-/, "")
      .replaceAll("-", " ")
  )
    .trim()
    .slice(0, 100);
  const contextualModuleCode =
    /^module:([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*):/i.exec(contextPage)?.[1] || "";
  const [moduleStarterId, setModuleStarterId] = useState(() =>
    ["greeting", "price", "text-summary"].includes(
      contextParams.get("moduleStarter") || "",
    )
      ? contextParams.get("moduleStarter") || ""
      : "",
  );
  const [moduleDisplayName, setModuleDisplayName] = useState(contextualScreen);
  const [moduleCode, setModuleCode] = useState(contextualModuleCode);
  const [activeSection, setActiveSection] = useState(
    window.location.hash.slice(1) || "overview",
  );
  const contextSection = window.location.hash.slice(1);
  const platformTools = [
    {
      id: "modules",
      title: "Modül pazaryeri",
      description: "ERP modüllerini inceleyin ve çalışma alanınıza ekleyin.",
      icon: Package,
    },
    {
      id: "source-workspaces",
      title: "Kod çalışma alanları",
      description:
        "Yetkili projelerde izole kod çalışma alanlarını açın ve değişiklikleri inceleyin.",
      icon: GitBranch,
    },
    {
      id: "custom-forms",
      title: "Özel formlar",
      description: "İş süreçlerinize uygun formlar ve alanlar tanımlayın.",
      icon: FileText,
    },
    {
      id: "custom-pages",
      title: "Sayfa tasarımcısı",
      description: "Yeni sayfalar oluşturun, ızgara ekleyin ve veri kolonlarını düzenleyin.",
      icon: Pencil,
    },
    {
      id: "custom-data",
      title: "Veri modelleri",
      description: "Tenant’a özel kayıt türleri ve alanlar tanımlayıp sayfalara veri kaynağı olarak bağlayın.",
      icon: Database,
    },
    {
      id: "workflows",
      title: "İş akışları",
      description: "Onay ve görev adımlarını görsel olarak düzenleyin.",
      icon: ClipboardCheck,
    },
    {
      id: "business-rules",
      title: "İş kuralları",
      description: "Süreçlerin koşullarını ve otomatik davranışlarını yönetin.",
      icon: Zap,
    },
    {
      id: "reports",
      title: "Rapor oluşturucu",
      description: "İş verileri için raporları yapılandırın.",
      icon: Activity,
    },
    {
      id: "custom-menus",
      title: "Özel menüler",
      description: "Tenant çalışma alanına özel gezinme menüleri oluşturun.",
      icon: FolderKanban,
    },
    {
      id: "settings",
      title: "Yapay zekâ tanımlaması",
      description: "Kurumun AI sağlayıcılarını ve çalışma ayarlarını yönetin.",
      icon: Sparkles,
    },
  ];
  const availablePlatformTools = platformTools.filter(
    (tool) =>
      (tool.id !== "custom-menus" && tool.id !== "settings") ||
      tenant?.role === "TenantAdmin",
  );
  const normalizeToolSearch = (value: string) =>
    value
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("ı", "i");
  const filteredPlatformTools = availablePlatformTools.filter((tool) =>
    normalizeToolSearch(`${tool.title} ${tool.description}`).includes(
      normalizeToolSearch(toolQuery.trim()),
    ),
  );
  const adaptationFlows = [
    {
      title: "Sayfa ve ekran tasarımcısı",
      description:
        "Boş ERP sayfası üzerinde bileşenleri yerleştir; formları, veri modellerini, listeleri ve mevcut ekranları aynı çalışma alanında düzenle.",
      icon: FileText,
      toolIds: ["custom-pages", "custom-data"],
    },
    {
      title: "İş süreçlerini otomatikleştir",
      description:
        "Onay adımlarını ve koşullara bağlı iş kurallarını tek akışta kur.",
      icon: Zap,
      toolIds: ["workflows", "business-rules"],
    },
    {
      title: "Çalışma alanını kişiselleştir",
      description:
        "Menüleri ve raporları düzenleyerek ekibi için sadeleştir.",
      icon: FolderKanban,
      toolIds: ["custom-menus", "reports"],
    },
  ].map((flow) => ({
    ...flow,
    tools: flow.toolIds
      .map((id) => availablePlatformTools.find((tool) => tool.id === id))
      .filter((tool): tool is (typeof availablePlatformTools)[number] => !!tool),
  }));
  const filteredAdaptationFlows = adaptationFlows
    .map((flow) => ({
      ...flow,
      tools: flow.tools.filter((tool) => filteredPlatformTools.includes(tool)),
    }))
    .filter((flow) => flow.tools.length > 0);
  const advancedPlatformTools = filteredPlatformTools.filter((tool) =>
    ["modules", "source-workspaces", "settings"].includes(tool.id),
  );
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const platformToolHref = (toolId: string) => {
    const url = new URL("/", platformOrigin);
    url.searchParams.set("platformTool", toolId);
    url.searchParams.set("embeddedStudio", "1");
    return url.toString();
  };

  async function refreshProjects() {
    const requestId = ++projectsRequestId.current;
    const apiProjects = await api<DevelopmentProject[]>(
      "/studio/projects/",
      token,
    );
    const registeredProjects = apiProjects.map((project) => ({
      ...project,
      githubAuthorized:
        project.githubAuthorized ?? project.gitHubAuthorized ?? false,
    }));
    if (requestId === projectsRequestId.current)
      setProjects(registeredProjects);
    return registeredProjects;
  }

  async function refreshMarketplace() {
    setMarketplaceLoading(true);
    setMarketplaceError("");
    try {
      setMarketplaceModules(
        await api<MarketplaceModule[]>(
          "/api/tenant/modules/marketplace",
          token,
        ),
      );
      try {
        const pkg = await api<{
          forms?: { code: string }[];
          workflows?: { code: string }[];
          businessRules?: { code: string }[];
        }>("/api/tenant-customizations/packages/export", token);
        const installed = lowCodeSamples
          .filter((sample) => {
            const formCodes = new Set((pkg.forms || []).map((item) => item.code));
            const workflowCodes = new Set((pkg.workflows || []).map((item) => item.code));
            const ruleCodes = new Set((pkg.businessRules || []).map((item) => item.code));
            if (sample.id === "customer-feedback") return formCodes.has("ornek_musteri_geri_bildirim");
            return workflowCodes.has("ornek_satinalma_yuksek_tutar") || ruleCodes.has("ornek_satinalma_tutar_kontrolu");
          })
          .map((sample) => sample.id);
        setInstalledSamples(installed);
      } catch {
        // Marketplace module access can be available without low-code package read access.
      }
    } catch (cause) {
      setMarketplaceError((cause as Error).message);
    } finally {
      setMarketplaceLoading(false);
    }
  }

  async function toggleMarketplaceModule(
    item: MarketplaceModule,
    remove = false,
  ) {
    if (
      remove &&
      !(await confirmDialog({
        title: `${item.manifest?.displayName || item.moduleCode} kataloğunuzdan çıkarılsın mı?`,
        message: "Modül bu firmanın kataloğundan kaldırılır. Daha sonra pazaryerinden yeniden ekleyebilirsiniz.",
        confirmLabel: "Kataloğdan çıkar",
      }))
    )
      return;
    setMarketplaceBusy(item.moduleCode);
    setMarketplaceError("");
    setMarketplaceNotice("");
    try {
      if (remove) {
        await api<void>(
          `/api/tenant/modules/${encodeURIComponent(item.moduleCode)}`,
          token,
          { method: "DELETE" },
        );
        setMarketplaceNotice(
          `${item.moduleCode} firma kataloğundan çıkarıldı.`,
        );
      } else {
        await api("/api/tenant/modules/activate", token, {
          method: "POST",
          body: JSON.stringify({
            moduleCode: item.moduleCode,
            version: item.version,
          }),
        });
        setMarketplaceNotice(
          `${item.moduleCode}@${item.version} firmaya eklendi.`,
        );
      }
      await refreshMarketplace();
    } catch (cause) {
      setMarketplaceError((cause as Error).message);
    } finally {
      setMarketplaceBusy("");
    }
  }

  useEffect(() => {
    if (!token || !tenant) return;
    let current = true;
    const requestId = ++projectsRequestId.current;
    setDataStatus("loading");
    void Promise.all([
      api<DevelopmentRequest[]>("/studio/requests/", token),
      api<DevelopmentProject[]>("/studio/projects/", token),
    ])
      .then(([items, registeredProjects]) => {
        if (!current) return;
        setRequests(items);
        if (requestId === projectsRequestId.current)
          setProjects(registeredProjects);
        setDataStatus("ok");
      })
      .catch((e) => {
        if (!current) return;
        setError((e as Error).message);
        setDataStatus("error");
      });
    return () => {
      current = false;
    };
  }, [token, tenant?.id]);

  useEffect(() => {
    if (activeSection === "marketplace" && token && tenant)
      void refreshMarketplace();
  }, [activeSection, token, tenant?.id]);

  useEffect(() => {
    if (!moduleStarterId || !token || !tenant || moduleStarterPrompted.current)
      return;
    moduleStarterPrompted.current = true;
    openModuleStarterRequest();
  }, [
    moduleStarterId,
    token,
    tenant?.id,
    contextualScreen,
    contextualModuleCode,
  ]);

  useEffect(() => {
    const updateActiveSection = () =>
      setActiveSection(window.location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", updateActiveSection);
    return () => window.removeEventListener("hashchange", updateActiveSection);
  }, []);

  useEffect(() => {
    if (!tenantMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!tenantSwitchRef.current?.contains(event.target as Node))
        setTenantMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTenantMenuOpen(false);
      tenantButtonRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tenantMenuOpen]);

  useEffect(() => {
    if (contextSection !== "requests" || !token || !tenant) return;
    const timer = window.setTimeout(
      () =>
        document
          .getElementById("requests")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [contextSection, token, tenant?.id, requests.length]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<LoginResponse>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem(tokenKey, result.accessToken);
      localStorage.removeItem(refreshTokenKey);
      localStorage.setItem("aierp.user", result.displayName);
      localStorage.setItem(tenantSelectionKey, result.accessToken);
      localStorage.setItem(tenantListKey, JSON.stringify(result.tenants));
      setToken(result.accessToken);
      setSelectionToken(result.accessToken);
      setTenants(result.tenants);
      if (result.tenants.length === 1)
        await selectTenant(result.tenants[0], result.accessToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function selectTenant(item: Tenant, access = selectionToken) {
    setBusy(true);
    setError("");
    try {
      const result = await api<TenantSelectionResponse>(
        "/api/auth/select-tenant",
        access,
        {
          method: "POST",
          headers: { "X-Studio-Session": "cookie" },
          body: JSON.stringify({ tenantId: item.id }),
        },
      );
      localStorage.setItem(tokenKey, result.accessToken);
      localStorage.removeItem(refreshTokenKey);
      localStorage.setItem(activeTenantKey, JSON.stringify(result.tenant));
      setTenant(result.tenant);
      setToken(result.accessToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    void fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Session": "cookie",
      },
      body: "{}",
    }).catch(() => undefined);
    for (const key of [
      tokenKey,
      refreshTokenKey,
      activeTenantKey,
      tenantSelectionKey,
      tenantListKey,
      "aierp.user",
    ])
      localStorage.removeItem(key);
    setToken("");
    setSelectionToken("");
    setTenant(null);
    setTenants([]);
    setError("");
  }

  useEffect(() => {
    const onSessionExpired = () => {
      logout();
      setError("Oturum süresi doldu. Lütfen yeniden giriş yapın.");
    };
    const onAccessTokenRefreshed = (event: Event) => {
      const refreshedToken = (event as CustomEvent<string>).detail;
      if (refreshedToken) setToken(refreshedToken);
    };
    window.addEventListener("aierp:session-expired", onSessionExpired);
    window.addEventListener(
      "aierp:access-token-refreshed",
      onAccessTokenRefreshed,
    );
    return () => {
      window.removeEventListener("aierp:session-expired", onSessionExpired);
      window.removeEventListener(
        "aierp:access-token-refreshed",
        onAccessTokenRefreshed,
      );
    };
  }, []);

  useEffect(() => {
    void migrateLegacyRefreshToken().catch((e) =>
      setError((e as Error).message),
    );
  }, []);

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const moduleMetadata = moduleRequestDraft
        ? `\n\nModül adı: ${moduleDisplayName.trim()}\nModül kodu: ${moduleCode.trim().toLowerCase()}\nModül şablonu: ${moduleStarterId}`
        : "";
      await api<DevelopmentRequest>("/studio/requests/", token, {
        method: "POST",
        body: JSON.stringify({
          title: requestTitle,
          description: `${requestDescription.trim()}${moduleMetadata}`,
          projectId: requestProjectId || null,
        }),
      });
      closeRequestDialog();
      if (moduleRequestDraft) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}#projects`,
        );
        setActiveSection("projects");
        setNotice(
          "Modül geliştirme talebi kaydedildi. Projeler bölümünden yetkili deponuzda izole çalışma alanı isteyin.",
        );
      } else setNotice("Geliştirme talebi Studio’ya kaydedildi.");
      setRequests(await api<DevelopmentRequest[]>("/studio/requests/", token));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateRequest(event: FormEvent) {
    event.preventDefault();
    if (!editingRequestId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<DevelopmentRequest>(
        `/studio/requests/${encodeURIComponent(editingRequestId)}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            title: requestTitle,
            description: requestDescription,
            projectId: requestProjectId || null,
          }),
        },
      );
      closeRequestDialog();
      setNotice("Geliştirme talebi güncellendi.");
      setRequests(await api<DevelopmentRequest[]>("/studio/requests/", token));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRequest(request: DevelopmentRequest) {
    if (!request.canEdit || request.status !== "Submitted") return;
    if (
      !(await confirmDialog({
        title: "Talep silinsin mi?",
        message: `“${request.title}” kalıcı olarak silinir. Bu işlem geri alınamaz.`,
        tone: "danger",
        confirmLabel: "Talebi sil",
      }))
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<void>(
        `/studio/requests/${encodeURIComponent(request.id)}`,
        token,
        { method: "DELETE" },
      );
      setRequests((items) => items.filter((item) => item.id !== request.id));
      setNotice("Geliştirme talebi silindi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function closeRequestDialog() {
    setShowRequest(false);
    setEditingRequestId(null);
    setRequestTitle("");
    setRequestDescription("");
    setRequestProjectId("");
    setModuleRequestDraft(false);
  }

  function openNewRequest() {
    setEditingRequestId(null);
    setRequestTitle("");
    setRequestDescription("");
    setRequestProjectId("");
    setModuleRequestDraft(false);
    setError("");
    setShowRequest(true);
  }

  function openModuleStarterRequest(
    starter?: (typeof studioModuleStarters)[number],
  ) {
    const starterId = starter?.id || moduleStarterId;
    const displayName = starter?.name || contextualScreen;
    const code = starter?.moduleCode || contextualModuleCode;
    setModuleStarterId(starterId);
    setEditingRequestId(null);
    setModuleRequestDraft(true);
    setModuleDisplayName(displayName);
    setModuleCode(code);
    setRequestTitle(
      `${displayName.replace(/\s+modülü?$/i, "") || "Yeni"} modülünü geliştirme`,
    );
    setRequestDescription(
      `${displayName} başlangıç şablonunu temel alarak kendi modülümü geliştirmek istiyorum. Modül kodu: ${code}. manifest.json, Cargo.toml ve src/lib.rs dosyalarını seçilen GitHub projesinde oluşturup düzenleyin.`,
    );
    setRequestProjectId("");
    setError("");
    setShowRequest(true);
  }

  async function installLowCodeSample(sample: LowCodeSample) {
    if (!token || !tenant || sampleInstallBusy) return;
    setSampleInstallBusy(sample.id);
    setMarketplaceError("");
    setMarketplaceNotice("");
    try {
      const result = await api<{ imported: string[]; skipped: string[]; note?: string }>(
        "/api/tenant-customizations/packages/import",
        token,
        {
          method: "POST",
          body: JSON.stringify({ package: sample.package, confirmImmediateApply: false }),
        },
      );
      setInstalledSamples((current) => current.includes(sample.id) ? current : [...current, sample.id]);
      setMarketplaceNotice(
        `${sample.name} kuruldu. ${result.imported.length} taslak tanım eklendi${result.skipped.length ? `; ${result.skipped.length} mevcut tanım atlandı` : ""}. Taslakları ilgili Formlar veya İş akışları aracından gözden geçirip yayımlayın.`,
      );
    } catch (reason) {
      setMarketplaceError((reason as Error).message || "Örnek kurulamadı.");
    } finally {
      setSampleInstallBusy("");
    }
  }

  function openRequestForEdit(request: DevelopmentRequest) {
    setEditingRequestId(request.id);
    setModuleRequestDraft(false);
    setRequestTitle(request.title);
    setRequestDescription(request.description);
    setRequestProjectId(request.projectId || "");
    setError("");
    setShowRequest(true);
  }

  if (!token || (!tenant && tenants.length === 0))
    return (
      <div className="st-auth">
        <main className="st-auth-card" aria-labelledby="studio-login-title">
          <StudioBrand />
          <div className="st-auth-copy">
            <h1 id="studio-login-title">Oturum açın</h1>
            <p>
              AI Development Studio, Platform hesabınızla ayrı ve yetkili
              oturum açar.
            </p>
          </div>
          {error && (
            <div className="st-alert is-danger" role="alert">
              {error}
            </div>
          )}
          <form className="st-auth-form" onSubmit={login}>
            <label className="ns-field">
              <span className="ns-field-label">E-posta</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className="ns-field">
              <span className="ns-field-label">Parola</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <button className="ns-btn ns-btn-primary st-auth-submit" disabled={busy}>
              {busy ? "Giriş yapılıyor…" : "Giriş yap"}
            </button>
          </form>
          <p className="st-auth-foot">
            <ShieldCheck size={14} aria-hidden="true" />
            Kimlik doğrulaması Platform API üzerinden yapılır.
          </p>
        </main>
      </div>
    );

  if (!tenant)
    return (
      <div className="st-auth">
        <main className="st-auth-card" aria-labelledby="studio-tenant-title">
          <StudioBrand />
          <div className="st-auth-copy">
            <h1 id="studio-tenant-title">Firma seçin</h1>
            <p>
              Studio oturumu seçtiğiniz firmanın yetkileriyle sınırlandırılır.
            </p>
          </div>
          {error && (
            <div className="st-alert is-danger" role="alert">
              {error}
            </div>
          )}
          {tenants.length ? (
            <ul className="st-tenant-options" aria-label="Firmalar">
              {tenants.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="st-tenant-option"
                    disabled={busy}
                    onClick={() => void selectTenant(item)}
                  >
                    <span className="st-avatar" aria-hidden="true">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="st-tenant-text">
                      <b>{item.name}</b>
                      <small>{roleLabel(item.role)}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button className="ns-btn" type="button" onClick={logout}>
              Oturumu kapat
            </button>
          )}
        </main>
      </div>
    );

  const connectedProjects = projects.filter(
    (project) => project.githubAuthorized,
  ).length;
  const submittedRequests = requests.filter(
    (request) => request.status === "Submitted",
  ).length;
  const recentRequests = [...requests]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const analyticsNow = new Date();
  const analyticsStart = new Date(
    analyticsNow.getTime() - analyticsRange * 86400000,
  );
  const analyticsScopedRequests = requests.filter(
    (item) => analyticsProject === "all" || item.projectId === analyticsProject,
  );
  const analyticsRequests = analyticsScopedRequests.filter((item) => {
    const created = Date.parse(item.createdAt);
    return (
      Number.isFinite(created) &&
      created >= analyticsStart.getTime() &&
      created <= analyticsNow.getTime()
    );
  });
  const analyticsPreviousStart = new Date(
    analyticsStart.getTime() - analyticsRange * 86400000,
  );
  const analyticsPreviousCount = analyticsScopedRequests.filter((item) => {
    const created = Date.parse(item.createdAt);
    return (
      Number.isFinite(created) &&
      created >= analyticsPreviousStart.getTime() &&
      created < analyticsStart.getTime()
    );
  }).length;
  const analyticsChange = analyticsPreviousCount
    ? Math.round(
        ((analyticsRequests.length - analyticsPreviousCount) /
          analyticsPreviousCount) *
          100,
      )
    : null;
  const closedStatuses = [
    "completed",
    "closed",
    "rejected",
    "cancelled",
    "canceled",
  ];
  const analyticsOpenCount = analyticsRequests.filter(
    (item) => !closedStatuses.includes(item.status.toLowerCase()),
  ).length;
  const analyticsLinkedCount = analyticsRequests.filter(
    (item) => item.projectId,
  ).length;
  const analyticsBucketCount =
    analyticsRange <= 30
      ? 5
      : analyticsRange <= 90
        ? 13
        : analyticsRange <= 180
          ? 6
          : 12;
  const analyticsBuckets = Array.from(
    { length: analyticsBucketCount },
    (_, index) => {
      const from = new Date(
        analyticsStart.getTime() +
          (analyticsRange * 86400000 * index) / analyticsBucketCount,
      );
      const to = new Date(
        analyticsStart.getTime() +
          (analyticsRange * 86400000 * (index + 1)) / analyticsBucketCount,
      );
      const bucketRequests = analyticsRequests.filter((item) => {
        const created = Date.parse(item.createdAt);
        return (
          created >= from.getTime() &&
          (index === analyticsBucketCount - 1
            ? created <= to.getTime()
            : created < to.getTime())
        );
      });
      return {
        key: `${from.toISOString()}-${index}`,
        label:
          analyticsRange <= 90
            ? new Intl.DateTimeFormat("tr-TR", {
                day: "numeric",
                month: "short",
              }).format(from)
            : new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(from),
        count: bucketRequests.length,
        open: bucketRequests.filter(
          (item) => !closedStatuses.includes(item.status.toLowerCase()),
        ).length,
        linked: bucketRequests.filter((item) => item.projectId).length,
        projects: new Set(
          bucketRequests
            .filter((item) => item.projectId)
            .map((item) => item.projectId),
        ).size,
      };
    },
  );
  const analyticsStatuses = Object.entries(
    analyticsRequests.reduce<Record<string, number>>((counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const analyticsProjects = Object.entries(
    analyticsRequests
      .filter((item) => item.projectId)
      .reduce<Record<string, number>>((counts, item) => {
        counts[item.projectId!] = (counts[item.projectId!] || 0) + 1;
        return counts;
      }, {}),
  )
    .map(([id, count]) => ({
      id,
      count,
      name:
        projects.find((project) => project.id === id)?.name ||
        analyticsRequests.find((item) => item.projectId === id)?.projectName ||
        "Proje",
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"))
    .slice(0, 5);
  const analyticsMaxBucket = Math.max(
    1,
    ...analyticsBuckets.map((item) => item.count),
  );
  const analyticsMaxStatus = Math.max(
    1,
    ...analyticsStatuses.map(([, count]) => count),
  );
  const analyticsMaxProject = Math.max(
    1,
    ...analyticsProjects.map((item) => item.count),
  );
  const analyticsRecentRequests = [...analyticsRequests]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);
  const statusLabel = (status: string) =>
    ({
      Submitted: "Alındı",
      Planned: "Planlandı",
      InReview: "İncelemede",
      InProgress: "Devam ediyor",
      Completed: "Tamamlandı",
      Rejected: "Reddedildi",
      Cancelled: "İptal edildi",
    })[status] || status;
  const filteredMarketplaceModules = marketplaceModules.filter((item) =>
    `${item.manifest?.displayName || ""} ${item.moduleCode} ${item.publisher}`
      .toLocaleLowerCase("tr-TR")
      .includes(marketplaceQuery.toLocaleLowerCase("tr-TR")),
  );
  const formatShortDate = (value: string) =>
    new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(
      new Date(value),
    );
  const openRequestCount = requests.filter(
    (item) => !closedStatuses.includes(item.status.toLowerCase()),
  ).length;
  const sectionTitle = activeSection.startsWith("tool-")
    ? platformTools.find((tool) => tool.id === activeSection.slice(5))?.title ||
      "Uyarlama aracı"
    : activeSection === "marketplace"
      ? "Modül pazaryeri"
      : activeSection === "adaptation"
        ? "Platform uyarlama"
        : activeSection === "requests"
          ? "Geliştirme talepleri"
          : activeSection === "analytics"
            ? "Analitik"
            : activeSection === "projects"
              ? "Projeler"
              : "Genel bakış";
  const isAdaptationSection =
    activeSection === "adaptation" || activeSection.startsWith("tool-");
  const canSwitchTenant = tenants.length > 1 && !!selectionToken;
  const userName = localStorage.getItem("aierp.user") || "Kullanıcı";
  const pageAlerts = (
    <>
      {error && (
        <div className="st-alert is-danger" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="st-alert is-success" role="status">
          {notice}
        </div>
      )}
    </>
  );
  const recentRequestsTable = (items: DevelopmentRequest[]) => (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">Talep</th>
            <th scope="col">Proje</th>
            <th scope="col">Durum</th>
            <th scope="col">Tarih</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <b>{item.title}</b>
              </td>
              <td>{item.projectName || "Genel talep"}</td>
              <td>
                <span
                  className={`ns-badge ${requestStatusTone[item.status] || ""}`.trim()}
                >
                  {statusLabel(item.status)}
                </span>
              </td>
              <td className="st-num">{formatShortDate(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const analyticsContent = (
    <section
      className="st-analytics"
      id="analytics"
      aria-labelledby="studio-analytics-title"
    >
      <header className="ns-page-head st-page-head">
        <div>
          <h1 id="studio-analytics-title">Analitik</h1>
          <p>
            Talep hacmini, iş akışını ve proje dağılımını tek ekrandan takip
            edin.
          </p>
        </div>
        <div className="st-filters">
          <label className="st-select">
            <CalendarDays size={15} aria-hidden="true" />
            <select
              aria-label="Rapor dönemi"
              value={analyticsRange}
              onChange={(event) =>
                setAnalyticsRange(Number(event.target.value))
              }
            >
              <option value={30}>Son 30 gün</option>
              <option value={90}>Son 90 gün</option>
              <option value={180}>Son 6 ay</option>
              <option value={365}>Son 12 ay</option>
            </select>
          </label>
          <label className="st-select">
            <FolderKanban size={15} aria-hidden="true" />
            <select
              aria-label="Proje filtresi"
              value={analyticsProject}
              onChange={(event) => setAnalyticsProject(event.target.value)}
            >
              <option value="all">Tüm projeler</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <section className="st-kpis" aria-label="Analitik özeti">
        <KpiCard
          icon={ListTodo}
          tone="accent"
          label="Toplam talep"
          value={analyticsRequests.length}
          hint={
            analyticsChange === null ? (
              "Önceki dönemde kayıt yok"
            ) : (
              <>
                <TrendingUp size={13} aria-hidden="true" /> Önceki döneme göre{" "}
                <b>
                  {analyticsChange > 0 ? "+" : ""}
                  {analyticsChange}%
                </b>
              </>
            )
          }
        >
          <AnalyticsSparkline
            values={analyticsBuckets.map((item) => item.count)}
          />
        </KpiCard>
        <KpiCard
          icon={Activity}
          tone="info"
          label="Açık iş"
          value={analyticsOpenCount}
          hint="İş akışında devam eden talepler"
        >
          <AnalyticsSparkline
            values={analyticsBuckets.map((item) => item.open)}
          />
        </KpiCard>
        <KpiCard
          icon={FolderKanban}
          tone="success"
          label="Projeye bağlı"
          value={analyticsLinkedCount}
          hint={`${
            analyticsRequests.length
              ? Math.round(
                  (analyticsLinkedCount / analyticsRequests.length) * 100,
                )
              : 0
          }% proje bağlantısı`}
        >
          <AnalyticsSparkline
            values={analyticsBuckets.map((item) => item.linked)}
          />
        </KpiCard>
        <KpiCard
          icon={GitBranch}
          tone="warning"
          label="Aktif proje"
          value={
            new Set(
              analyticsRequests
                .filter((item) => item.projectId)
                .map((item) => item.projectId),
            ).size
          }
          hint="Seçili dönemde talep alan"
        >
          <AnalyticsSparkline
            values={analyticsBuckets.map((item) => item.projects)}
          />
        </KpiCard>
      </section>
      <div className="st-grid st-grid-wide">
        <article className="ns-card st-card">
          <header className="st-card-head">
            <div>
              <h2>Geliştirme talebi eğilimi</h2>
              <p>
                Seçilen dönem içindeki kayıtlar · {analyticsRequests.length}{" "}
                talep
              </p>
            </div>
          </header>
          {analyticsRequests.length ? (
            <div className="st-trend">
              <div className="st-trend-scale" aria-hidden="true">
                {[1, 0.75, 0.5, 0.25, 0].map((factor) => (
                  <span key={factor}>
                    {(analyticsMaxBucket * factor).toLocaleString("tr-TR", {
                      maximumFractionDigits: 1,
                    })}
                  </span>
                ))}
              </div>
              <div
                className="st-trend-bars"
                style={{
                  gridTemplateColumns: `repeat(${analyticsBucketCount}, minmax(0, 1fr))`,
                }}
                role="img"
                aria-label={`Talep eğilimi: ${analyticsBuckets.map((item) => `${item.label}: ${item.count}`).join(", ")}`}
              >
                {analyticsBuckets.map((item) => (
                  <div
                    className="st-trend-column"
                    title={`${item.label}: ${item.count} talep`}
                    key={item.key}
                  >
                    <b>{item.count}</b>
                    <span>
                      <i
                        style={{
                          height: `${item.count ? Math.round((item.count / analyticsMaxBucket) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <small>{item.label}</small>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={Activity} title="Bu dönemde talep bulunmuyor">
              <span>
                Farklı bir dönem veya proje seçerek kayıtları görüntüleyin.
              </span>
            </EmptyState>
          )}
        </article>
        <article className="ns-card st-card">
          <header className="st-card-head">
            <div>
              <h2>Talep durumları</h2>
              <p>Durumlara göre kayıt dağılımı</p>
            </div>
          </header>
          {analyticsStatuses.length ? (
            <ul className="st-bars">
              {analyticsStatuses.map(([status, count]) => (
                <li key={status}>
                  <div>
                    <span>{statusLabel(status)}</span>
                    <b>{count}</b>
                  </div>
                  <i>
                    <span
                      style={{
                        width: `${Math.round((count / analyticsMaxStatus) * 100)}%`,
                      }}
                    />
                  </i>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ListTodo} title="Durum verisi yok">
              <span>Seçilen aralıkta talep bulunamadı.</span>
            </EmptyState>
          )}
        </article>
      </div>
      <div className="st-grid st-grid-wide-end">
        <article className="ns-card st-card">
          <header className="st-card-head">
            <div>
              <h2>Talep alan projeler</h2>
              <p>En fazla talep içeren ilk 5 proje</p>
            </div>
          </header>
          {analyticsProjects.length ? (
            <ol className="st-bars is-ranked">
              {analyticsProjects.map(({ id, name, count }) => (
                <li key={id}>
                  <div>
                    <span>{name}</span>
                    <b>{count}</b>
                  </div>
                  <i>
                    <span
                      style={{
                        width: `${Math.round((count / analyticsMaxProject) * 100)}%`,
                      }}
                    />
                  </i>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={FolderKanban} title="Proje dağılımı yok">
              <span>Projelere bağlanan talepler burada listelenir.</span>
            </EmptyState>
          )}
        </article>
        <article className="ns-card st-card">
          <header className="st-card-head">
            <div>
              <h2>Güncel talepler</h2>
              <p>Seçilen dönemin en yeni kayıtları</p>
            </div>
            <a className="ns-btn ns-btn-ghost ns-btn-sm" href="#requests">
              Tümü
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </header>
          {analyticsRecentRequests.length ? (
            recentRequestsTable(analyticsRecentRequests)
          ) : (
            <EmptyState icon={FileText} title="Henüz kayıt yok">
              <span>Yeni geliştirme talepleri burada görünür.</span>
            </EmptyState>
          )}
        </article>
      </div>
    </section>
  );

  return (
    <div
      className={`studio-root studio-dashboard studio-dashboard-reference studio-section-${activeSection} st-shell`}
    >
      <aside className="st-side" aria-label="Studio kenar çubuğu">
        <a
          className="st-side-brand"
          href="#overview"
          aria-label="Nexora Studio ana sayfa"
        >
          <StudioBrand />
        </a>
        <div className="st-tenant-switch" ref={tenantSwitchRef}>
          {canSwitchTenant ? (
            <button
              type="button"
              ref={tenantButtonRef}
              className="st-tenant-box"
              aria-expanded={tenantMenuOpen}
              aria-controls="studio-tenant-menu"
              title="Firmayı değiştir"
              disabled={busy}
              onClick={() => setTenantMenuOpen((open) => !open)}
            >
              <span className="st-avatar" aria-hidden="true">
                {tenant.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="st-tenant-text">
                <b>{tenant.name}</b>
                <small>{roleLabel(tenant.role)}</small>
                <span className="ns-sr-only">, firmayı değiştir</span>
              </span>
              <ChevronsUpDown size={15} aria-hidden="true" />
            </button>
          ) : (
            <div className="st-tenant-box">
              <span className="st-avatar" aria-hidden="true">
                {tenant.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="st-tenant-text">
                <b>{tenant.name}</b>
                <small>{roleLabel(tenant.role)}</small>
              </span>
            </div>
          )}
          {canSwitchTenant && tenantMenuOpen && (
            <ul
              id="studio-tenant-menu"
              className="st-tenant-menu"
              aria-label="Firma değiştir"
            >
              {tenants.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={item.id === tenant.id ? "true" : undefined}
                    disabled={busy}
                    onClick={() => {
                      setTenantMenuOpen(false);
                      if (item.id !== tenant.id) void selectTenant(item);
                    }}
                  >
                    <span className="st-avatar" aria-hidden="true">
                      {item.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="st-tenant-text">
                      <b>{item.name}</b>
                      <small>{roleLabel(item.role)}</small>
                    </span>
                    {item.id === tenant.id && (
                      <Check size={15} aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav className="st-side-nav" aria-label="Studio gezinme">
          <p className="st-side-label">Geliştirme</p>
          <a
            href="#overview"
            aria-current={activeSection === "overview" ? "page" : undefined}
          >
            <Code2 size={16} aria-hidden="true" />
            Genel bakış
          </a>
          <a
            href="#projects"
            aria-current={activeSection === "projects" ? "page" : undefined}
          >
            <FolderKanban size={16} aria-hidden="true" />
            Projeler
            <span className="st-side-count">{projects.length}</span>
          </a>
          <a
            href="#requests"
            aria-current={activeSection === "requests" ? "page" : undefined}
          >
            <ListTodo size={16} aria-hidden="true" />
            Geliştirme talepleri
            <span className="st-side-count">{requests.length}</span>
          </a>
          <a
            href="#analytics"
            aria-current={activeSection === "analytics" ? "page" : undefined}
          >
            <Activity size={16} aria-hidden="true" />
            Analitik
          </a>
          <p className="st-side-label">Platform uyarlama</p>
          <a
            href="#adaptation"
            aria-current={isAdaptationSection ? "page" : undefined}
          >
            <Boxes size={16} aria-hidden="true" />
            Uyarlama araçları
          </a>
          <a
            href="#marketplace"
            aria-current={activeSection === "marketplace" ? "page" : undefined}
          >
            <Package size={16} aria-hidden="true" />
            Modül pazaryeri
          </a>
        </nav>
        <div className="st-profile">
          <span className="st-avatar is-round" aria-hidden="true">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="st-profile-text">
            <b>{userName}</b>
            <small>{roleLabel(tenant.role)}</small>
          </span>
          <button
            type="button"
            className="st-icon-btn"
            aria-label="Oturumu kapat"
            title="Oturumu kapat"
            onClick={logout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="st-main">
        <header className="st-top">
          <nav className="st-crumb" aria-label="Konum">
            <span>Studio</span>
            <ChevronRight size={14} aria-hidden="true" />
            <b aria-current="page">{sectionTitle}</b>
          </nav>
          <div className="st-top-actions">
            {dataStatus === "ok" && (
              <span className="ns-badge is-success">Studio API bağlı</span>
            )}
            {dataStatus === "error" && (
              <span className="ns-badge is-danger">Veriler yüklenemedi</span>
            )}
            <button
              type="button"
              className="ns-btn ns-btn-primary ns-btn-sm"
              onClick={openNewRequest}
            >
              <Plus size={15} aria-hidden="true" />
              Yeni talep
            </button>
          </div>
        </header>

        <main className="st-content studio-dashboard-main" id="overview">
          {activeSection === "marketplace" ? (
            <>
              <header className="ns-page-head st-page-head">
                <div>
                  <h1>Modül pazaryeri</h1>
                  <p>
                    Yayımlanmış modülleri yönetin veya örnek şablonları temel
                    alarak kendi modülünüzü geliştirin.
                  </p>
                </div>
                <button
                  className="ns-btn"
                  type="button"
                  onClick={() => void refreshMarketplace()}
                  disabled={marketplaceLoading}
                >
                  <RefreshCw
                    size={15}
                    aria-hidden="true"
                    className={marketplaceLoading ? "st-spin" : undefined}
                  />
                  {marketplaceLoading ? "Yenileniyor…" : "Kataloğu yenile"}
                </button>
              </header>
              <p className="st-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  Yayımlanmış paketler imza ve runtime doğrulamasıyla
                  etkinleşir. Örnek şablonlar geliştirme başlangıcıdır;
                  yayımlanmış modül olarak firmaya eklenmez.
                </span>
              </p>
              {marketplaceError && (
                <div className="st-alert is-danger" role="alert">
                  {marketplaceError}
                </div>
              )}
              {marketplaceNotice && (
                <div className="st-alert is-success" role="status">
                  {marketplaceNotice}
                </div>
              )}
              <section
                className="st-section"
                aria-labelledby="studio-samples-title"
              >
                <header className="st-section-head">
                  <div>
                    <h2 id="studio-samples-title">Hazır low-code örnekleri</h2>
                    <p>
                      Örnek tanımları firmanıza taslak olarak kurun; inceleyip
                      yayımladıktan sonra kullanıma açın.
                    </p>
                  </div>
                  <span className="ns-badge">{lowCodeSamples.length} örnek</span>
                </header>
                <div className="st-card-grid">
                  {lowCodeSamples.map((sample) => {
                    const installed = installedSamples.includes(sample.id);
                    return (
                      <article className="ns-card st-tile" key={sample.id}>
                        <div className="st-tile-top">
                          <span className="st-tile-icon" aria-hidden="true">
                            {sample.category === "Form" ? (
                              <FileText size={17} />
                            ) : (
                              <Zap size={17} />
                            )}
                          </span>
                          <span className="ns-badge is-accent">
                            {sample.category}
                          </span>
                        </div>
                        <h3>{sample.name}</h3>
                        <p>{sample.description}</p>
                        <small className="st-tile-meta">
                          {sample.category === "Form"
                            ? "Özel form taslağı"
                            : "İş akışı ve iş kuralı taslağı"}{" "}
                          · veri kaydı oluşturmaz
                        </small>
                        <div className="st-tile-actions">
                          <button
                            className={`ns-btn ns-btn-sm ${installed ? "" : "ns-btn-primary"}`.trim()}
                            type="button"
                            disabled={!!sampleInstallBusy || installed}
                            onClick={() => void installLowCodeSample(sample)}
                          >
                            {sampleInstallBusy === sample.id ? (
                              <RefreshCw
                                size={14}
                                className="st-spin"
                                aria-hidden="true"
                              />
                            ) : installed ? (
                              <Check size={14} aria-hidden="true" />
                            ) : (
                              <Plus size={14} aria-hidden="true" />
                            )}
                            {sampleInstallBusy === sample.id
                              ? "Kuruluyor…"
                              : installed
                                ? "Kuruldu"
                                : "Firmaya kur"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
              <section
                className="st-section"
                aria-labelledby="studio-starters-title"
              >
                <header className="st-section-head">
                  <div>
                    <h2 id="studio-starters-title">Kod modülü geliştirme</h2>
                    <p>
                      Bunlar doğrudan kurulan modül değildir. Kaynak kodu temel
                      alıp WASM modülü geliştirme talebi açar.
                    </p>
                  </div>
                  <span className="ns-badge">
                    {studioModuleStarters.length} şablon
                  </span>
                </header>
                <div className="st-card-grid">
                  {studioModuleStarters.map((starter) => {
                    const files = moduleStarterFiles(
                      starter.id,
                      starter.moduleCode,
                      starter.name,
                    );
                    return (
                      <article className="ns-card st-tile" key={starter.id}>
                        <div className="st-tile-top">
                          <span className="st-tile-icon" aria-hidden="true">
                            <Code2 size={17} />
                          </span>
                          <span className="ns-badge">WASM</span>
                        </div>
                        <h3>{starter.name}</h3>
                        <p>{starter.description}</p>
                        <code className="st-code-chip">
                          {starter.moduleCode}
                        </code>
                        <details className="st-details">
                          <summary>Şablon dosyalarını incele</summary>
                          <div>
                            {files.map((file) => (
                              <details key={file.path}>
                                <summary>{file.path}</summary>
                                <pre>{file.content}</pre>
                              </details>
                            ))}
                          </div>
                        </details>
                        <div className="st-tile-actions">
                          <button
                            className="ns-btn ns-btn-primary ns-btn-sm"
                            type="button"
                            onClick={() => openModuleStarterRequest(starter)}
                          >
                            <Code2 size={14} aria-hidden="true" />
                            Bu şablonla geliştir
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
              <section
                className="st-section"
                aria-labelledby="studio-catalog-title"
              >
                <header className="st-section-head">
                  <div>
                    <h2 id="studio-catalog-title">Firma modül kataloğu</h2>
                    <p>
                      Etkinleştirme firma yöneticisi yetkisi ve platform lisans
                      sınırlarına tabidir.
                    </p>
                  </div>
                  <label className="st-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      value={marketplaceQuery}
                      onChange={(event) =>
                        setMarketplaceQuery(event.target.value)
                      }
                      placeholder="Ad, kod veya yayıncı ara"
                      aria-label="Modül kataloğunda ara"
                    />
                  </label>
                </header>
                {marketplaceLoading && marketplaceModules.length === 0 ? (
                  <div className="ns-card">
                    <EmptyState
                      icon={RefreshCw}
                      title="Yayımlanmış modüller yükleniyor…"
                    />
                  </div>
                ) : filteredMarketplaceModules.length === 0 ? (
                  <div className="ns-card">
                    <EmptyState
                      icon={Package}
                      title={
                        marketplaceModules.length
                          ? "Eşleşen modül yok"
                          : "Henüz yayımlanmış modül yok"
                      }
                    >
                      <span>
                        {marketplaceModules.length
                          ? "Arama terimini değiştirip yeniden deneyin."
                          : "Platform yayın yöneticisi modül yayımladığında burada görünür."}
                      </span>
                    </EmptyState>
                  </div>
                ) : (
                  <div className="st-card-grid">
                    {filteredMarketplaceModules.map((item) => {
                      const name =
                        item.manifest?.displayName || item.moduleCode;
                      const canUpdate =
                        item.isActivated &&
                        item.activatedVersion !== item.version;
                      return (
                        <article
                          className="ns-card st-tile"
                          key={`${item.moduleCode}@${item.version}`}
                        >
                          <div className="st-tile-top">
                            <span className="st-tile-icon" aria-hidden="true">
                              <Boxes size={17} />
                            </span>
                            <span
                              className={`ns-badge ${item.runtimeStatus === "Ready" ? "is-success" : "is-danger"}`}
                            >
                              {item.runtimeStatus === "Ready"
                                ? "Runtime hazır"
                                : "Runtime engelli"}
                            </span>
                          </div>
                          <h3>{name}</h3>
                          <p className="st-tile-meta">
                            <code>{item.moduleCode}</code> · v{item.version} ·{" "}
                            {item.publisher}
                          </p>
                          <small className="st-tile-meta">
                            {item.isActivated
                              ? `Firmada etkin · ${item.activatedVersion || "sürüm bilinmiyor"}`
                              : "Firmada etkin değil"}
                          </small>
                          {item.manifest && (
                            <details className="st-details">
                              <summary>İzin ve bağımlılıklar</summary>
                              <div>
                                <p>
                                  Bağımlılıklar:{" "}
                                  {item.manifest.dependencies.length
                                    ? item.manifest.dependencies
                                        .map(
                                          (dependency) =>
                                            `${dependency.moduleCode} ≥ ${dependency.minimumVersion}`,
                                        )
                                        .join(", ")
                                    : "Yok"}
                                </p>
                                <p>
                                  İzinler:{" "}
                                  {item.manifest.permissions.length
                                    ? item.manifest.permissions
                                        .map((permission) => permission.code)
                                        .join(", ")
                                    : "Yok"}
                                </p>
                              </div>
                            </details>
                          )}
                          {tenant.role === "TenantAdmin" && (
                            <div className="st-tile-actions">
                              {(!item.isActivated || canUpdate) && (
                                <button
                                  className="ns-btn ns-btn-primary ns-btn-sm"
                                  type="button"
                                  disabled={
                                    !!marketplaceBusy ||
                                    item.runtimeStatus !== "Ready"
                                  }
                                  onClick={() =>
                                    void toggleMarketplaceModule(item)
                                  }
                                >
                                  {marketplaceBusy === item.moduleCode ? (
                                    "Doğrulanıyor…"
                                  ) : (
                                    <>
                                      <Check size={14} aria-hidden="true" />
                                      {canUpdate
                                        ? `v${item.version} sürümüne geç`
                                        : "Firmaya ekle"}
                                    </>
                                  )}
                                </button>
                              )}
                              {item.isActivated && (
                                <button
                                  className="ns-btn ns-btn-sm"
                                  type="button"
                                  disabled={!!marketplaceBusy}
                                  onClick={() =>
                                    void toggleMarketplaceModule(item, true)
                                  }
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  Firmadan çıkar
                                </button>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : activeSection === "adaptation" ? (
            <>
              <header className="ns-page-head st-page-head">
                <div>
                  <h1>Platform uyarlama</h1>
                  <p>
                    {tenant.name} için ERP deneyimini iş süreçlerinize göre
                    şekillendirin. Tüm araçlar Studio içinde açılır.
                  </p>
                </div>
                <label className="st-search">
                  <Search size={15} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Uyarlama araçlarında ara"
                    placeholder="Araç ara…"
                    value={toolQuery}
                    onChange={(event) => setToolQuery(event.target.value)}
                  />
                </label>
              </header>
              <section
                className="st-section"
                aria-labelledby="studio-flows-title"
              >
                <header className="st-section-head">
                  <div>
                    <h2 id="studio-flows-title">Neyi düzenlemek istiyorsunuz?</h2>
                    <p>İhtiyacınızı seçin; ilgili tasarım adımlarını burada bulun.</p>
                  </div>
                  <span className="ns-badge" role="status">
                    {filteredAdaptationFlows.reduce(
                      (count, flow) => count + flow.tools.length,
                      0,
                    ) +
                      (showAdvancedTools || !!toolQuery.trim()
                        ? advancedPlatformTools.length
                        : 0)}{" "}
                    araç erişilebilir
                  </span>
                </header>
                {filteredAdaptationFlows.length > 0 && (
                  <div className="st-card-grid">
                    {filteredAdaptationFlows.map((flow) => {
                      const FlowIcon = flow.icon;
                      return (
                        <article className="ns-card st-tile" key={flow.title}>
                          <div className="st-tile-top">
                            <span className="st-tile-icon" aria-hidden="true">
                              <FlowIcon size={18} />
                            </span>
                          </div>
                          <h3>{flow.title}</h3>
                          <p>{flow.description}</p>
                          <div className="st-tile-links">
                            {flow.tools.map((tool) => (
                              <a href={`#tool-${tool.id}`} key={tool.id}>
                                {tool.title}
                                <ArrowUpRight size={13} aria-hidden="true" />
                              </a>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {advancedPlatformTools.length > 0 && (
                  <section className="ns-card st-advanced">
                    <button
                      type="button"
                      className="st-advanced-toggle"
                      aria-expanded={showAdvancedTools || !!toolQuery.trim()}
                      onClick={() => setShowAdvancedTools((value) => !value)}
                    >
                      <span>
                        {showAdvancedTools || toolQuery.trim()
                          ? "Gelişmiş araçları gizle"
                          : "Gelişmiş araçları göster"}
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                    {(showAdvancedTools || !!toolQuery.trim()) && (
                      <div className="st-advanced-list">
                        {advancedPlatformTools.map((tool) => {
                          const ToolIcon = tool.icon;
                          const href =
                            tool.id === "modules"
                              ? "#marketplace"
                              : tool.id === "source-workspaces"
                                ? "#projects"
                                : `#tool-${tool.id}`;
                          return (
                            <a href={href} key={tool.id}>
                              <span className="st-tile-icon" aria-hidden="true">
                                <ToolIcon size={16} />
                              </span>
                              <span>
                                <b>{tool.title}</b>
                                <small>{tool.description}</small>
                              </span>
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
                {filteredPlatformTools.length === 0 && (
                  <div className="ns-card">
                    <EmptyState
                      icon={Search}
                      title="Aramanızla eşleşen araç bulunamadı"
                    >
                      <span>
                        Araç adı veya açıklamasındaki bir kelimeyle tekrar
                        arayın.
                      </span>
                      <button
                        className="ns-btn ns-btn-sm"
                        type="button"
                        onClick={() => setToolQuery("")}
                      >
                        Aramayı temizle
                      </button>
                    </EmptyState>
                  </div>
                )}
              </section>
            </>
          ) : activeSection.startsWith("tool-") ? (
            (() => {
              const tool = availablePlatformTools.find(
                (item) => item.id === activeSection.slice(5),
              );
              if (!tool)
                return (
                  <div className="ns-card">
                    <EmptyState icon={Boxes} title="Uyarlama aracı bulunamadı">
                      <a className="ns-btn ns-btn-sm" href="#adaptation">
                        Uyarlama araçlarına dön
                      </a>
                    </EmptyState>
                  </div>
                );
              const nativeToolIds = [
                "custom-forms",
                "workflows",
                "business-rules",
                "reports",
                "custom-menus",
                "custom-pages",
                "custom-data",
              ];
              return (
                <>
                  {nativeToolIds.includes(tool.id) ? (
                    <div className="studio-native-tool">
                      <Suspense
                        fallback={
                          <div className="st-loading" role="status">
                            Uyarlama aracı yükleniyor…
                          </div>
                        }
                      >
                        <NativePlatformTool
                          toolId={tool.id}
                          token={token}
                          role={tenant.role}
                          platformOrigin={platformOrigin}
                        />
                      </Suspense>
                    </div>
                  ) : (
                    <>
                      <header className="ns-page-head st-page-head">
                        <div>
                          <h1>{tool.title}</h1>
                          <p>{tool.description}</p>
                        </div>
                        <a className="ns-btn" href="#adaptation">
                          Uyarlama araçlarına dön
                        </a>
                      </header>
                      <iframe
                        className="st-tool-frame"
                        title={`${tool.title} · Studio`}
                        src={platformToolHref(tool.id)}
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                        onLoad={(event) =>
                          event.currentTarget.contentWindow?.postMessage(
                            { type: "NEXORA_STUDIO_AUTH", token, tenant },
                            platformOrigin,
                          )
                        }
                      />
                    </>
                  )}
                </>
              );
            })()
          ) : activeSection === "projects" ? (
            <>
              {pageAlerts}
              <header className="ns-page-head st-page-head">
                <div>
                  <h1>Projeler</h1>
                  <p>
                    {tenant.name} firmasındaki yetkilendirilmiş depoları ve
                    proje erişimlerini yönetin.
                  </p>
                </div>
                <button
                  className="ns-btn ns-btn-primary"
                  type="button"
                  onClick={openNewRequest}
                >
                  <Plus size={16} aria-hidden="true" />
                  Yeni geliştirme talebi
                </button>
              </header>
              <section className="st-kpis" aria-label="Proje özeti">
                <KpiCard
                  icon={FolderKanban}
                  tone="accent"
                  label="Toplam proje"
                  value={projects.length}
                  hint="Erişilebilir proje"
                />
                <KpiCard
                  icon={GitBranch}
                  tone="success"
                  label="GitHub bağlantısı"
                  value={
                    <>
                      {connectedProjects}
                      <small> / {projects.length}</small>
                    </>
                  }
                  hint="Yetkilendirilmiş depo"
                />
                <KpiCard
                  icon={ShieldCheck}
                  tone="info"
                  label="Yönetilebilir proje"
                  value={
                    projects.filter((project) =>
                      ["TenantAdmin", "Maintainer"].includes(
                        project.accessLevel,
                      ),
                    ).length
                  }
                  hint="Yönetim erişiminiz olan projeler"
                />
                <KpiCard
                  icon={ListTodo}
                  tone="warning"
                  label="Proje talepleri"
                  value={
                    requests.filter(
                      (request) =>
                        request.projectId &&
                        projects.some(
                          (project) => project.id === request.projectId,
                        ),
                    ).length
                  }
                  hint="Projeye bağlı geliştirme talebi"
                />
              </section>
              <div id="projects" className="studio-projects-page-content">
                <Suspense
                  fallback={
                    <div className="st-loading" role="status">
                      Projeler yükleniyor…
                    </div>
                  }
                >
                  <StudioProjects
                    token={token}
                    tenant={tenant}
                    projects={projects}
                    setProjects={setProjects}
                    refreshProjects={refreshProjects}
                  />
                </Suspense>
              </div>
              <p className="st-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  Depo erişimi proje ve firma yetkileriyle denetlenir. Kaynak
                  kodu paylaşımı ve çalışma alanı değişiklikleri ayrıca onay
                  gerektirir.
                </span>
              </p>
            </>
          ) : activeSection === "requests" ? (
            <>
              {pageAlerts}
              <header className="ns-page-head st-page-head">
                <div>
                  <h1>Geliştirme talepleri</h1>
                  <p>
                    {tenant.name} firmasındaki geliştirme ihtiyaçları ve
                    durumları.
                  </p>
                </div>
                <button
                  className="ns-btn ns-btn-primary"
                  type="button"
                  onClick={openNewRequest}
                >
                  <Plus size={16} aria-hidden="true" />
                  Yeni geliştirme talebi
                </button>
              </header>
              <Suspense
                fallback={
                  <div className="st-loading" role="status">
                    Talepler yükleniyor…
                  </div>
                }
              >
                {/* Bileşen bir fragment döndürür; düz blok kap, iç boşluklarının eskisi gibi kalmasını sağlar. */}
                <div className="st-embed">
                  <DevelopmentRequestsPage
                    requests={requests}
                    projects={projects}
                    busy={busy}
                    onCreate={openNewRequest}
                    onEdit={openRequestForEdit}
                    onDelete={(item) => void deleteRequest(item)}
                  />
                </div>
              </Suspense>
            </>
          ) : activeSection === "analytics" ? (
            analyticsContent
          ) : (
            <>
              {pageAlerts}
              {contextualScreen && (
                <section className="ns-card st-context">
                  <span className="st-tile-icon" aria-hidden="true">
                    <Code2 size={18} />
                  </span>
                  <div>
                    <small>
                      {moduleStarterId
                        ? "Modül şablonu · Studio editörü"
                        : "ERP geliştirici modu · aktif ekran"}
                    </small>
                    <b>
                      {contextualScreen}
                      {contextualModuleCode && (
                        <code className="st-code-chip">
                          {contextualModuleCode}
                        </code>
                      )}
                    </b>
                    <p>
                      {moduleStarterId
                        ? "Şablon manifestini ve kaynak kodunu ERP’deki örnek karttan alın. Proje seçip izole çalışma alanı isteyin; Cargo.toml, manifest.json ve src/lib.rs dosyalarını proje gezgininde düzenleyebilirsiniz."
                        : "Modül kodu talebe taşınır. İlgili kaynak deposunu ayrıca seçin; proje gezgininde kodu düzenleyip farkları inceleyerek onaylayabilirsiniz."}
                    </p>
                  </div>
                  <button
                    className="ns-btn ns-btn-sm"
                    type="button"
                    onClick={() => {
                      if (moduleStarterId) {
                        openModuleStarterRequest();
                        return;
                      }
                      setEditingRequestId(null);
                      setRequestTitle(
                        moduleStarterId
                          ? `${contextualScreen} modülünü geliştirme`
                          : `${contextualScreen} ekranını uyarlama`,
                      );
                      setRequestDescription(
                        moduleStarterId
                          ? `${contextualScreen} başlangıç şablonunu temel alarak kendi modülümü geliştirmek istiyorum. Modül kodu: ${contextualModuleCode}. Şablon: ${moduleStarterId}. manifest.json, Cargo.toml ve src/lib.rs dosyalarını seçilen GitHub projesinde oluşturup düzenleyin.`
                          : `${contextualScreen} ekranı için istenen değişiklikleri açıklayın.${contextualModuleCode ? ` Modül kodu: ${contextualModuleCode}.` : ""} İlgili kaynak deposunu seçin; değişiklikler onaylı izole çalışma alanında hazırlanır.`,
                      );
                      setRequestProjectId("");
                      setError("");
                      setShowRequest(true);
                    }}
                  >
                    <Plus size={14} aria-hidden="true" />
                    {moduleStarterId
                      ? "Modül geliştirme talebi"
                      : "Uyarlama talebi"}
                  </button>
                </section>
              )}
              <header className="ns-page-head st-page-head">
                <div>
                  <h1>Genel bakış</h1>
                  <p>
                    {tenant.name} · projeler, geliştirme talepleri ve yetki
                    kapsamı
                  </p>
                </div>
                <a className="ns-btn" href="#projects">
                  <FolderKanban size={16} aria-hidden="true" />
                  Projeleri görüntüle
                </a>
              </header>

              <section className="st-kpis" aria-label="Studio özeti">
                <KpiCard
                  icon={FolderKanban}
                  tone="accent"
                  label="Erişilebilir proje"
                  value={projects.length}
                  hint="Bu firmada"
                />
                <KpiCard
                  icon={GitBranch}
                  tone="success"
                  label="GitHub bağlantısı"
                  value={
                    <>
                      {connectedProjects}
                      <small> / {projects.length}</small>
                    </>
                  }
                  hint="Yetkilendirilmiş depo"
                />
                <KpiCard
                  icon={ListTodo}
                  tone="info"
                  label="Geliştirme talebi"
                  value={requests.length}
                  hint={`${submittedRequests} yeni kayıt`}
                />
                <KpiCard
                  icon={Activity}
                  tone="warning"
                  label="Açık talep"
                  value={openRequestCount}
                  hint="İş akışında devam eden"
                />
              </section>

              <div className="st-grid st-grid-wide">
                <section
                  className="ns-card st-card"
                  aria-labelledby="studio-recent-title"
                >
                  <header className="st-card-head">
                    <div>
                      <h2 id="studio-recent-title">Son talepler</h2>
                      <p>En yeni geliştirme talepleri</p>
                    </div>
                    <a className="ns-btn ns-btn-ghost ns-btn-sm" href="#requests">
                      Tümü
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </header>
                  {recentRequests.length ? (
                    recentRequestsTable(recentRequests)
                  ) : (
                    <EmptyState icon={ListTodo} title="Henüz talep yok">
                      <span>Yeni talepleriniz ve durumları burada görünür.</span>
                      <button
                        className="ns-btn ns-btn-primary ns-btn-sm"
                        type="button"
                        onClick={openNewRequest}
                      >
                        <Plus size={14} aria-hidden="true" />
                        Yeni talep
                      </button>
                    </EmptyState>
                  )}
                </section>
                <section
                  className="ns-card st-card"
                  aria-labelledby="studio-flow-title"
                >
                  <header className="st-card-head">
                    <div>
                      <h2 id="studio-flow-title">Geliştirme akışı</h2>
                      <p>Her değişiklik insan onayından geçer</p>
                    </div>
                  </header>
                  <ol className="st-steps">
                    <li>
                      <span aria-hidden="true">1</span>
                      <div>
                        <b>Projeyi seçin</b>
                        <small>Yetkili depoya güvenli erişim</small>
                      </div>
                    </li>
                    <li>
                      <span aria-hidden="true">2</span>
                      <div>
                        <b>Çalışma alanı isteyin</b>
                        <small>Değişiklik için ayrı checkout</small>
                      </div>
                    </li>
                    <li>
                      <span aria-hidden="true">3</span>
                      <div>
                        <b>İnceleyip onaylayın</b>
                        <small>Onaysız değişiklik uygulanmaz</small>
                      </div>
                    </li>
                  </ol>
                  <a className="ns-btn ns-btn-sm st-card-foot" href="#projects">
                    Projelere git
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </section>
              </div>
              <p className="st-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  Studio ayrı frontend ve API servisi kullanır. Depo erişimi,
                  kod paylaşımı ve değişiklik uygulaması proje ve firma
                  yetkileriyle denetlenir.
                </span>
              </p>
            </>
          )}
        </main>
      </div>
      {showRequest && (
        <Dialog
          onClose={closeRequestDialog}
          labelledBy="studio-request-title"
          describedBy="studio-request-desc"
          className="st-request-dialog"
          backdropClassName="st-request-backdrop"
          initialFocus={requestTitleRef}
        >
          <header className="st-dialog-head">
            <div>
              <h2 id="studio-request-title">
                {editingRequestId
                  ? "Geliştirme talebini düzenle"
                  : "Yeni geliştirme talebi"}
              </h2>
              <p id="studio-request-desc">
                {editingRequestId
                  ? "Talep bilgilerini güncelleyin. İşleme alınmış talepler düzenlenemez."
                  : "İhtiyacınızı paylaşın; doğru projeyle eşleştirip takip etmeyi kolaylaştıralım."}
              </p>
            </div>
            <button
              type="button"
              className="st-icon-btn"
              aria-label="Kapat"
              onClick={closeRequestDialog}
            >
              <X size={18} />
            </button>
          </header>
          <form
            className="st-dialog-form"
            onSubmit={editingRequestId ? updateRequest : createRequest}
          >
            <div className="st-dialog-body">
              <p className="st-note is-compact">
                <ListTodo size={15} aria-hidden="true" />
                <span>
                  Talep <b>{tenant.name}</b> firmasına kaydedilir. İsterseniz
                  erişiminiz olan bir projeye bağlayabilirsiniz.
                </span>
              </p>
              {error && (
                <div className="st-alert is-danger" role="alert">
                  {error}
                </div>
              )}
              <label className="ns-field">
                <span className="ns-field-label">Talep başlığı</span>
                <input
                  ref={requestTitleRef}
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                  required
                  maxLength={180}
                  placeholder="Örn. Stok kartına garanti süresi ekle"
                />
                <small className="ns-field-hint">
                  İhtiyacı kısa ve anlaşılır biçimde özetleyin.
                </small>
              </label>
              {moduleRequestDraft && (
                <div className="st-field-row">
                  <label className="ns-field">
                    <span className="ns-field-label">Modül adı</span>
                    <input
                      value={moduleDisplayName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setModuleDisplayName(value);
                        setRequestTitle(
                          `${value.replace(/\s+modülü?$/i, " ").trim() || "Yeni"} modülünü geliştirme`,
                        );
                      }}
                      required
                      maxLength={120}
                      placeholder="Örn. Selamlama Modülü"
                    />
                    <small className="ns-field-hint">
                      Kullanıcıların ERP içinde göreceği ad.
                    </small>
                  </label>
                  <label className="ns-field">
                    <span className="ns-field-label">Modül kodu</span>
                    <input
                      className="ns-mono"
                      value={moduleCode}
                      onChange={(e) =>
                        setModuleCode(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9.-]/g, ""),
                        )
                      }
                      required
                      maxLength={100}
                      pattern="[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*"
                      title="Küçük harfle başlayın; harf, rakam, nokta ve tire kullanın."
                      placeholder="ornek.selamlama"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                    <small className="ns-field-hint">
                      Teknik kimlik ve modules/{moduleCode || "modul-kodu"}{" "}
                      klasör adı.
                    </small>
                  </label>
                </div>
              )}
              <label className="ns-field">
                <span className="ns-field-label">İhtiyaç açıklaması</span>
                <textarea
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  required
                  maxLength={8000}
                  rows={5}
                  placeholder="İş ihtiyacını, mevcut durumu ve beklenen davranışı anlatın…"
                />
                <small className="ns-field-hint">
                  Beklenen sonucu ve önemli iş kurallarını ekleyin.
                </small>
              </label>
              <label className="ns-field">
                <span className="ns-field-label">İlgili proje</span>
                <select
                  value={requestProjectId}
                  onChange={(e) => setRequestProjectId(e.target.value)}
                >
                  <option value="">Genel talep (projeye bağlı değil)</option>
                  {projects
                    .filter(
                      (p) =>
                        p.accessLevel === "TenantAdmin" ||
                        p.accessLevel === "Contributor" ||
                        p.accessLevel === "Maintainer",
                    )
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <small className="ns-field-hint">
                  Proje seçmezseniz talep firma genelinde görünür.
                </small>
              </label>
            </div>
            <footer className="ns-dialog-foot st-dialog-foot">
              <span className="st-dialog-scope">
                <ShieldCheck size={15} aria-hidden="true" />
                {requestProjectId
                  ? projects.find((p) => p.id === requestProjectId)?.name
                  : tenant.name}{" "}
                alanında kaydedilecek
              </span>
              <button
                type="button"
                className="ns-btn"
                onClick={closeRequestDialog}
              >
                Vazgeç
              </button>
              <button disabled={busy} className="ns-btn ns-btn-primary">
                {editingRequestId ? (
                  <Pencil size={15} aria-hidden="true" />
                ) : (
                  <Plus size={15} aria-hidden="true" />
                )}
                {busy
                  ? "Kaydediliyor…"
                  : editingRequestId
                    ? "Talebi güncelle"
                    : "Talebi kaydet"}
              </button>
            </footer>
          </form>
        </Dialog>
      )}
    </div>
  );
}
