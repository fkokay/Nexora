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
  Boxes,
  Check,
  ChevronRight,
  Code2,
  Eye,
  EyeOff,
  FileText,
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
const PublicationsPage = lazy(() =>
  import("./publications/PublicationsPage").then((module) => ({
    default: module.PublicationsPage,
  })),
);
const PeoplePage = lazy(() =>
  import("./people/PeoplePage").then((module) => ({
    default: module.PeoplePage,
  })),
);
const ConnectionsPage = lazy(() =>
  import("./connections/ConnectionsPage").then((module) => ({
    default: module.ConnectionsPage,
  })),
);
const HomePage = lazy(() =>
  import("./home/HomePage").then((module) => ({
    default: module.HomePage,
  })),
);
const NativePlatformTool = lazy(
  () => import("./platform-tools/NativePlatformTool"),
);
import "./studio-dashboard.css";
import { resolvePlatformOrigin } from "./platformOrigin";
import { confirmDialog } from "./ui/confirmDialog";
import { Dialog } from "./ui/Dialog";
import { NoStudioAccess } from "./shell/NoStudioAccess";
import { RoleSwitcher } from "./shell/RoleSwitcher";
import { SectionTabs } from "./shell/SectionTabs";
import {
  resolveShellRoute,
  routeHash,
  SECTION_TABS,
} from "./shell/shellRoute";
import {
  menuFor,
  roleLabel as menuRoleLabel,
  type StudioMenuRole,
  type StudioSection,
} from "./shell/studioNav";
import { useStudioAccess } from "./shell/useStudioAccess";

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
  isMine: boolean;
  stage: "New" | "Staging" | "Production";
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

const authSteps = [
  { title: "İhtiyacı yazın", hint: "Talep doğru projeye bağlanır" },
  {
    title: "Ayrı çalışma alanında hazırlanır",
    hint: "Canlı sisteme dokunmaz",
  },
  { title: "Siz onaylayınca uygulanır", hint: "Onaysız değişiklik yok" },
];

/** Giriş ve firma seçiminin iki bölmeli kabuğu: solda tanıtım paneli, sağda form. */
function AuthShell({
  labelledBy,
  panel,
  children,
}: {
  labelledBy: string;
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="st-auth">
      <main className="st-auth-card" aria-labelledby={labelledBy}>
        <aside className="st-auth-panel">
          <StudioBrand />
          {panel}
        </aside>
        <div className="st-auth-main">{children}</div>
      </main>
    </div>
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
  const [showPassword, setShowPassword] = useState(false);
  const [tenantQuery, setTenantQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requests, setRequests] = useState<DevelopmentRequest[]>([]);
  // Ana sayfa kartları talep listesinin ayrı yüklenme durumunu gösterir.
  const [requestsStatus, setRequestsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [projects, setProjects] = useState<DevelopmentProject[]>([]);
  const [marketplaceModules, setMarketplaceModules] = useState<
    MarketplaceModule[]
  >([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState("");
  const [marketplaceNotice, setMarketplaceNotice] = useState("");
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceTab, setMarketplaceTab] = useState<
    "catalog" | "samples" | "starters"
  >("catalog");
  const [marketplaceBusy, setMarketplaceBusy] = useState("");
  const [sampleInstallBusy, setSampleInstallBusy] = useState("");
  const [installedSamples, setInstalledSamples] = useState<string[]>([]);
  const projectsRequestId = useRef(0);
  const moduleStarterPrompted = useRef(false);
  // Proje/talep yüklemesi başarısız olduysa üst çubuktaki bağlantı rozeti hatayı gösterir.
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const requestsLoadedFor = useRef("");
  const projectsLoadedFor = useRef("");
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
  const [hash, setHash] = useState(() => window.location.hash);
  const access = useStudioAccess(token, tenant?.id ?? "");
  const shellRoute = resolveShellRoute(hash, access.active, access.held);
  // Adres başka rolün bölümünü açıyorsa o rol bu çizimde de kullanılır; etkin rol etkide saklanır.
  const activeRole = shellRoute.role;
  const activeSection: StudioSection = shellRoute.route.section;
  const activeTab = shellRoute.tab;
  // Kod ve çalışma alanı uçları yalnız Yazılımcıya (ya da firma yöneticisine) açık; Danışman proje listesini okuyamaz.
  const canReadProjects =
    access.status === "ready" && access.held.some((role) => role !== "consultant");
  const isConsultant = activeRole === "consultant";
  const needsRequests = (
    ["home", "my-requests", "incoming-requests", "company-module"] as StudioSection[]
  ).includes(activeSection);
  const needsProjects =
    canReadProjects &&
    ((["incoming-requests", "company-module"] as StudioSection[]).includes(
      activeSection,
    ) ||
      (showRequest && !isConsultant));
  function navigate(next: string) {
    if (window.location.hash !== next) window.location.hash = next;
    setHash(next);
  }
  function changeRole(role: StudioMenuRole) {
    // Yeni rolün menüsünde bu bölüm yoksa ana sayfaya geçilir; yoksa adres eski rolü geri seçerdi.
    const keep = menuFor(role).some((item) => item.section === activeSection);
    access.setActive(role);
    if (!keep) navigate("#home");
  }
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

  // Firma ya da oturum değişince önceki firmanın listeleri gösterilmez, yeniden yüklenir.
  const dataScope = token ? tenant?.id || "" : "";
  useEffect(() => {
    requestsLoadedFor.current = "";
    projectsLoadedFor.current = "";
    setRequests([]);
    setProjects([]);
    setDataLoadFailed(false);
  }, [dataScope]);

  // Talepler yalnız onları gösteren bölüm açıkken bir kez yüklenir.
  useEffect(() => {
    if (!token || !tenant || access.status !== "ready" || !needsRequests) return;
    if (requestsLoadedFor.current === tenant.id) return;
    requestsLoadedFor.current = tenant.id;
    let current = true;
    let done = false;
    setRequestsStatus("loading");
    api<DevelopmentRequest[]>("/studio/requests/", token)
      .then((items) => {
        done = true;
        if (!current) return;
        setRequests(items);
        setRequestsStatus("ready");
        setDataLoadFailed(false);
      })
      .catch((e) => {
        done = true;
        if (!current) return;
        requestsLoadedFor.current = "";
        setRequestsStatus("error");
        setError((e as Error).message);
        setDataLoadFailed(true);
      });
    return () => {
      current = false;
      if (!done) requestsLoadedFor.current = "";
    };
  }, [token, tenant?.id, access.status, needsRequests]);

  // Projeler yalnız rol izin veriyorsa ve onları kullanan bölüm (ya da Yazılımcının talep formu) açıkken yüklenir.
  useEffect(() => {
    if (!token || !tenant || !needsProjects) return;
    if (projectsLoadedFor.current === tenant.id) return;
    projectsLoadedFor.current = tenant.id;
    let current = true;
    let done = false;
    const requestId = ++projectsRequestId.current;
    api<DevelopmentProject[]>("/studio/projects/", token)
      .then((registeredProjects) => {
        done = true;
        if (!current) return;
        setDataLoadFailed(false);
        if (requestId === projectsRequestId.current)
          setProjects(
            registeredProjects.map((project) => ({
              ...project,
              githubAuthorized:
                project.githubAuthorized ?? project.gitHubAuthorized ?? false,
            })),
          );
      })
      .catch((e) => {
        done = true;
        if (!current) return;
        projectsLoadedFor.current = "";
        setError((e as Error).message);
        setDataLoadFailed(true);
      });
    return () => {
      current = false;
      if (!done) projectsLoadedFor.current = "";
    };
  }, [token, tenant?.id, needsProjects]);

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
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Adres başka bir rolün bölümünü açıyorsa o rol etkin olur ve saklanır; eski adresler kanonik adrese çevrilir.
  const canonicalHash = routeHash(shellRoute.route);
  useEffect(() => {
    if (access.status !== "ready") return;
    if (shellRoute.role !== access.active) access.setActive(shellRoute.role);
    if (hash && hash !== canonicalHash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${canonicalHash}`,
      );
      setHash(canonicalHash);
    }
  }, [access.status, access.active, hash, shellRoute.role, canonicalHash]);

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
      if (moduleRequestDraft && canReadProjects) {
        navigate("#company-module/code");
        setNotice(
          "Modül geliştirme talebi kaydedildi. Firma modülü bölümünden yetkili deponuzda izole çalışma alanı isteyin.",
        );
      } else if (moduleRequestDraft)
        setNotice(
          "Modül geliştirme talebi kaydedildi. Yazılımcı talebi Gelen talepler bölümünde görür.",
        );
      else setNotice("Geliştirme talebi Studio’ya kaydedildi.");
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
      <AuthShell
        labelledBy="studio-login-title"
        panel={
          <>
            <p className="st-auth-lead">
              ERP'nizi kod yazmadan ve güvenle geliştirin
            </p>
            <ol className="st-auth-steps">
              {authSteps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <b>{step.title}</b>
                    <small>{step.hint}</small>
                  </div>
                </li>
              ))}
            </ol>
          </>
        }
      >
        <div className="st-auth-copy">
          <h1 id="studio-login-title">Oturum açın</h1>
          <p>Nexora Platform hesabınızla giriş yapın.</p>
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
              placeholder="ad@firma.com"
            />
          </label>
          <div className="ns-field">
            <label className="ns-field-label" htmlFor="studio-login-password">
              Parola
            </label>
            <div className="st-password">
              <input
                id="studio-login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="st-password-toggle"
                aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <button
            className="ns-btn ns-btn-primary st-auth-submit"
            disabled={busy}
          >
            {busy ? "Giriş yapılıyor…" : "Giriş yap"}
          </button>
        </form>
        <p className="st-auth-foot">
          <ShieldCheck size={14} aria-hidden="true" />
          Kimlik doğrulaması Platform API üzerinden yapılır.
        </p>
      </AuthShell>
    );

  if (!tenant) {
    const welcomeName = localStorage.getItem("aierp.user");
    const visibleTenants = tenants.filter((item) =>
      item.name
        .toLocaleLowerCase("tr-TR")
        .includes(tenantQuery.trim().toLocaleLowerCase("tr-TR")),
    );
    return (
      <AuthShell
        labelledBy="studio-tenant-title"
        panel={
          <>
            <p className="st-auth-lead">
              {welcomeName ? `Hoş geldiniz, ${welcomeName}` : "Hoş geldiniz"}
            </p>
            <p className="st-auth-sub">
              Studio oturumu seçtiğiniz firmanın yetkileriyle sınırlandırılır.
            </p>
          </>
        }
      >
        <div className="st-auth-copy">
          <h1 id="studio-tenant-title">Firma seçin</h1>
          <p>Çalışmak istediğiniz firmayı seçin.</p>
        </div>
        {error && (
          <div className="st-alert is-danger" role="alert">
            {error}
          </div>
        )}
        {tenants.length > 5 && (
          <label className="st-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Firma ara"
              placeholder="Firma ara"
              value={tenantQuery}
              onChange={(event) => setTenantQuery(event.target.value)}
            />
          </label>
        )}
        {tenants.length ? (
          visibleTenants.length ? (
            <ul className="st-tenant-options" aria-label="Firmalar">
              {visibleTenants.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="st-tenant-option"
                    disabled={busy}
                    onClick={() => void selectTenant(item)}
                  >
                    <span className="st-avatar" aria-hidden="true">
                      {item.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
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
            <p className="st-auth-empty">Aramanızla eşleşen firma yok.</p>
          )
        ) : (
          <p className="st-auth-empty">
            Hesabınıza bağlı bir firma bulunamadı.
          </p>
        )}
        <button
          className="ns-btn ns-btn-ghost st-auth-switch"
          type="button"
          onClick={logout}
        >
          <LogOut size={15} aria-hidden="true" />
          Farklı hesapla giriş yap
        </button>
      </AuthShell>
    );
  }

  if (
    access.status === "denied" ||
    access.status === "error" ||
    (access.status === "ready" && access.held.length === 0)
  )
    return (
      <NoStudioAccess
        variant={access.status === "error" ? "error" : "denied"}
        tenantName={tenant.name}
        onLogout={logout}
        onSwitchTenant={
          tenants.length > 1 && selectionToken
            ? () => {
                try {
                  localStorage.removeItem(activeTenantKey);
                } catch {
                  /* depolama kapalı olabilir */
                }
                setTenant(null);
              }
            : undefined
        }
      />
    );
  if (access.status === "loading")
    return (
      <div className="st-auth">
        <div className="st-loading" role="status">
          Studio yükleniyor…
        </div>
      </div>
    );

  const filteredMarketplaceModules = marketplaceModules.filter((item) =>
    `${item.manifest?.displayName || ""} ${item.moduleCode} ${item.publisher}`
      .toLocaleLowerCase("tr-TR")
      .includes(marketplaceQuery.toLocaleLowerCase("tr-TR")),
  );
  const menuItems = menuFor(activeRole);
  const sectionTitle =
    menuItems.find((item) => item.section === activeSection)?.label ||
    "Ana sayfa";
  const sectionTabs = SECTION_TABS[activeSection];
  const activeToolId =
    activeSection === "menus"
      ? "custom-menus"
      : sectionTabs?.find((tab) => tab.id === activeTab)?.toolId;
  // "Kod ve sürümler" sekmesi proje ekranıdır; diğer sekmeler Studio içindeki uyarlama aracıdır.
  const nativeToolId =
    activeToolId && activeToolId !== "source-workspaces"
      ? activeToolId
      : undefined;
  const sectionTabsBar =
    sectionTabs && activeTab ? (
      <SectionTabs
        tabs={sectionTabs}
        active={activeTab}
        onSelect={(id) => navigate(`#${activeSection}/${id}`)}
      />
    ) : null;
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
  return (
    <div
      className={`studio-root studio-dashboard studio-dashboard-reference studio-section-${activeSection} st-shell`}
    >
      <aside className="st-side" aria-label="Studio kenar çubuğu">
        <a
          className="st-side-brand"
          href="#home"
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
        <RoleSwitcher
          held={access.held}
          active={activeRole}
          onChange={changeRole}
        />
        <nav className="st-side-nav" aria-label="Studio gezinme">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const count =
              item.section === "my-requests"
                ? requests.filter((request) => request.isMine).length
                : item.section === "incoming-requests"
                  ? requests.length
                  : 0;
            return (
              <a
                key={item.section}
                href={`#${item.section}`}
                aria-current={activeSection === item.section ? "page" : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
                {count > 0 && <span className="st-side-count">{count}</span>}
              </a>
            );
          })}
        </nav>
        <div className="st-profile">
          <span className="st-avatar is-round" aria-hidden="true">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <span className="st-profile-text">
            <b>{userName}</b>
            <small>{menuRoleLabel(activeRole)}</small>
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
            {dataLoadFailed ? (
              <span className="ns-badge is-danger">Veriler yüklenemedi</span>
            ) : (
              <span className="ns-badge is-success">Studio API bağlı</span>
            )}
            {isConsultant && (
              <button
                type="button"
                className="ns-btn ns-btn-primary ns-btn-sm"
                onClick={openNewRequest}
              >
                <Plus size={15} aria-hidden="true" />
                Yazılımcıdan iste
              </button>
            )}
          </div>
        </header>

        <main className="st-content studio-dashboard-main" id="overview">
          {activeSection === "marketplace" ? (
            <>
              <header className="st-hero">
                <div className="st-hero-text">
                  <h1>Modül pazaryeri</h1>
                  <p>Yayımlanmış modüller ve başlangıç şablonları</p>
                </div>
                <div className="st-hero-actions">
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
                </div>
              </header>
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
              <div className="st-toolbar">
                <div
                  className="st-segmented"
                  role="group"
                  aria-label="Pazaryeri bölümü"
                >
                  {(
                    [
                      ["catalog", "Firma kataloğu", marketplaceModules.length],
                      ["samples", "Low-code örnekleri", lowCodeSamples.length],
                      ["starters", "Kod şablonları", studioModuleStarters.length],
                    ] as const
                  ).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={marketplaceTab === id}
                      onClick={() => setMarketplaceTab(id)}
                    >
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                {marketplaceTab === "catalog" && (
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
                )}
              </div>
              {marketplaceTab === "catalog" && (
                <section
                  className="st-section"
                  aria-label="Firma modül kataloğu"
                >
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
                            : "Platform yayın yöneticisi modül yayımladığında burada görünür. Bu arada low-code örneklerini veya kod şablonlarını deneyebilirsiniz."}
                        </span>
                        {!marketplaceModules.length && (
                          <button
                            className="ns-btn ns-btn-sm"
                            type="button"
                            onClick={() => setMarketplaceTab("samples")}
                          >
                            Örneklere göz at
                          </button>
                        )}
                      </EmptyState>
                    </div>
                  ) : (
                    <div className="ns-card st-module-list">
                      {filteredMarketplaceModules.map((item) => {
                        const name =
                          item.manifest?.displayName || item.moduleCode;
                        const canUpdate =
                          item.isActivated &&
                          item.activatedVersion !== item.version;
                        return (
                          <article
                            className="st-module-row"
                            key={`${item.moduleCode}@${item.version}`}
                          >
                            <span className="st-tile-icon" aria-hidden="true">
                              <Boxes size={16} />
                            </span>
                            <div className="st-module-main">
                              <div className="st-module-title">
                                <h3>{name}</h3>
                                {item.isActivated && (
                                  <span className="ns-badge is-success">
                                    Etkin · v
                                    {item.activatedVersion || "?"}
                                  </span>
                                )}
                                {item.runtimeStatus !== "Ready" && (
                                  <span className="ns-badge is-danger">
                                    Runtime engelli
                                  </span>
                                )}
                              </div>
                              <p className="st-tile-meta">
                                <code>{item.moduleCode}</code> · v
                                {item.version} · {item.publisher}
                              </p>
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
                            </div>
                            {tenant.role === "TenantAdmin" && (
                              <div className="st-module-actions">
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
                  <p className="st-quick-note">
                    <ShieldCheck size={14} aria-hidden="true" />
                    <span>
                      Paketler imza ve runtime doğrulamasıyla etkinleşir;
                      etkinleştirme firma yöneticisi yetkisi ve lisans
                      sınırlarına tabidir.
                    </span>
                  </p>
                </section>
              )}
              {marketplaceTab === "samples" && (
                <section
                  className="st-section"
                  aria-label="Hazır low-code örnekleri"
                >
                  <p className="st-tab-desc">
                    Örnek tanımları firmanıza taslak olarak kurun; inceleyip
                    yayımladıktan sonra kullanıma açın. Veri kaydı oluşturmaz.
                  </p>
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
              )}
              {marketplaceTab === "starters" && (
                <section className="st-section" aria-label="Kod şablonları">
                  <p className="st-tab-desc">
                    Doğrudan kurulmaz: şablon kaynak kodunu temel alıp WASM
                    modülü geliştirme talebi açar.
                  </p>
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
              )}
            </>
          ) : nativeToolId ? (
            <>
              {sectionTabsBar}
              <div className="studio-native-tool">
                <Suspense
                  fallback={
                    <div className="st-loading" role="status">
                      Uyarlama aracı yükleniyor…
                    </div>
                  }
                >
                  <NativePlatformTool
                    key={nativeToolId}
                    toolId={nativeToolId}
                    token={token}
                    role={tenant.role}
                    platformOrigin={platformOrigin}
                    tenant={tenant}
                    backHref={`#${activeSection}`}
                  />
                </Suspense>
              </div>
            </>
          ) : activeSection === "company-module" ? (
            <>
              {pageAlerts}
              {sectionTabsBar}
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
                    projectRequestCount={
                      requests.filter(
                        (request) =>
                          request.projectId &&
                          projects.some(
                            (project) => project.id === request.projectId,
                          ),
                      ).length
                    }
                  />
                </Suspense>
              </div>
            </>
          ) : activeSection === "my-requests" ||
            activeSection === "incoming-requests" ? (
            <>
              {pageAlerts}
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
                    mode={activeSection === "my-requests" ? "mine" : "incoming"}
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
          ) : activeSection === "publications" ? (
            <>
              {pageAlerts}
              <Suspense
                fallback={
                  <div className="st-loading" role="status">
                    Yayınlar yükleniyor…
                  </div>
                }
              >
                <PublicationsPage token={token} includeModules={canReadProjects} />
              </Suspense>
            </>
          ) : activeSection === "people" ? (
            <>
              {pageAlerts}
              <Suspense
                fallback={
                  <div className="st-loading" role="status">
                    Kişiler yükleniyor…
                  </div>
                }
              >
                <PeoplePage token={token} />
              </Suspense>
            </>
          ) : activeSection === "connections" ? (
            <>
              {pageAlerts}
              <Suspense
                fallback={
                  <div className="st-loading" role="status">
                    Bağlantılar yükleniyor…
                  </div>
                }
              >
                <ConnectionsPage token={token} />
              </Suspense>
            </>
          ) : activeSection === "ai" ? (
            <>
              <header className="ns-page-head st-page-head">
                <div>
                  <h1>Yapay zekâ tanımlaması</h1>
                  <p>Kurumun AI sağlayıcılarını ve çalışma ayarlarını yönetin.</p>
                </div>
              </header>
              <iframe
                className="st-tool-frame"
                title="Yapay zekâ tanımlaması · Studio"
                src={platformToolHref("settings")}
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
              <Suspense
                fallback={
                  <div className="st-loading" role="status">
                    Ana sayfa yükleniyor…
                  </div>
                }
              >
                <HomePage
                  token={token}
                  role={activeRole}
                  tenantName={tenant.name}
                  userName={userName}
                  requests={requests}
                  requestsStatus={requestsStatus}
                  onNewRequest={openNewRequest}
                />
              </Suspense>
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
                {editingRequestId ? "Talebi düzenle" : "Yeni talep"}
              </h2>
              <p id="studio-request-desc">
                {tenant.name} ·{" "}
                {editingRequestId
                  ? "işleme alınmış talepler düzenlenemez"
                  : "ne değişmesini istediğinizi anlatın"}
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
              {error && (
                <div className="st-alert is-danger" role="alert">
                  {error}
                </div>
              )}
              {!isConsultant && (
              <label className="ns-field">
                <span className="ns-field-label">Proje</span>
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
                  Seçmezseniz talep firma genelinde görünür.
                </small>
              </label>
              )}
              <label className="ns-field">
                <span className="ns-field-label">Başlık</span>
                <input
                  ref={requestTitleRef}
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                  required
                  maxLength={180}
                  placeholder="Örn. Stok kartına garanti süresi ekle"
                />
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
              <div className="ns-field">
                <div className="st-field-head">
                  <label
                    className="ns-field-label"
                    htmlFor="studio-request-description"
                  >
                    Açıklama
                  </label>
                  <span className="st-field-count" aria-live="polite">
                    {requestDescription.length} / 8000
                  </span>
                </div>
                <div
                  className="st-template-chips"
                  role="group"
                  aria-label="Açıklamaya bölüm ekle"
                >
                  {["Mevcut durum", "Beklenen davranış", "İş kuralları"].map(
                    (section) => (
                      <button
                        key={section}
                        type="button"
                        onClick={() =>
                          setRequestDescription((value) =>
                            `${value.trimEnd()}${value.trim() ? "\n\n" : ""}${section}:\n`.slice(
                              0,
                              8000,
                            ),
                          )
                        }
                      >
                        <Plus size={12} aria-hidden="true" />
                        {section}
                      </button>
                    ),
                  )}
                </div>
                <textarea
                  id="studio-request-description"
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  required
                  maxLength={8000}
                  rows={6}
                  placeholder="İş ihtiyacını ve beklenen sonucu anlatın…"
                />
              </div>
            </div>
            <footer className="ns-dialog-foot st-dialog-foot">
              <span className="st-dialog-scope">
                <ShieldCheck size={15} aria-hidden="true" />
                Onaysız değişiklik uygulanmaz
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
                    : "Talebi gönder"}
              </button>
            </footer>
          </form>
        </Dialog>
      )}
    </div>
  );
}
