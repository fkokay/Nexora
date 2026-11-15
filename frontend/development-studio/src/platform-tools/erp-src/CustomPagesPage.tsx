import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Activity, AlignLeft, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, ClipboardList, Code2, Copy, Eye, FilePlus2, Gauge,
  Grid3X3, Heading1, History, Info, Layers, LayoutTemplate, List, Lock, Minus, Monitor, MousePointerClick, MoveVertical, Plus, Redo2,
  Rows3, Save, Search, Send, Settings2, Smartphone, SquareStack, Table2, Tablet, Tag, Trash2, Undo2, X, type LucideIcon,
} from "lucide-react";
import { authenticatedFetch } from "./authApi";
import CustomFormsPage from "./CustomFormsPage";
import "./custom-pages.css";

type PageSummary = { id: string; code: string; name: string; description: string | null; revision: number; isPublished: boolean; updatedAt: string };
type PageDetail = PageSummary & { definitionJson: string };
type PageRevision = { id: string; revision: number; name: string; description: string | null; changeKind: string; changedByUserId: string; createdAt: string; definitionJson: string };
type CustomFormSummary = { id: string; code: string; name: string; status: string };
type WorkflowOption = { id: string; code: string; name: string; status: string };
type ReportSource = { code: string; label: string; columns: { code: string; label: string; dataType: string }[]; aggregates: { code: string; label: string }[] };
type PreviewData = { totalCount: number; rows: Record<string, unknown>[] };
type Capability = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canPublish: boolean; canDelete: boolean };
type ComponentType = "heading" | "text" | "metric" | "card" | "section" | "divider" | "spacer" | "button" | "dataTable" | "form" | "code" | "alert" | "badge" | "list" | "progress";
type PropValue = string | number | boolean | string[];
type PageComponent = { id: string; type: ComponentType; props: Record<string, PropValue>; children?: unknown };
type PageDefinition = { schemaVersion: 1; components: PageComponent[] };
type PaletteItem = { type: ComponentType; label: string; group: string; icon: LucideIcon; sample: PageComponent["props"] };
type Device = "desktop" | "tablet" | "mobile";
type DropTarget = { index: number; edge: "before" | "after" } | null;
type FieldSpec = { key: string; label: string; kind: "text" | "textarea" | "number" | "variant" };

const palette: PaletteItem[] = [
  { type: "heading", label: "Başlık", group: "Metin ve düzen", icon: Heading1, sample: { text: "Sayfa başlığı" } },
  { type: "text", label: "Açıklama", group: "Metin ve düzen", icon: AlignLeft, sample: { text: "Kısa bir açıklama yazın." } },
  { type: "card", label: "Bilgi kartı", group: "Metin ve düzen", icon: SquareStack, sample: { title: "Bilgi kartı", description: "Kart açıklaması" } },
  { type: "section", label: "Bölüm başlığı", group: "Metin ve düzen", icon: Rows3, sample: { title: "Yeni bölüm" } },
  { type: "divider", label: "Ayırıcı", group: "Metin ve düzen", icon: Minus, sample: {} },
  { type: "spacer", label: "Boşluk", group: "Metin ve düzen", icon: MoveVertical, sample: {} },
  { type: "dataTable", label: "Izgara", group: "Veri", icon: Table2, sample: { title: "Kayıtlar", source: "customers", columns: ["code", "name", "type"], rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" } },
  { type: "metric", label: "Veri göstergesi", group: "Veri", icon: Gauge, sample: { title: "Toplam kayıt", description: "Seçilen kaynaktaki kayıt sayısı", source: "customers" } },
  { type: "progress", label: "İlerleme göstergesi", group: "Veri", icon: Activity, sample: { title: "Tamamlanma", value: 65 } },
  { type: "list", label: "Madde listesi", group: "Veri", icon: List, sample: { title: "Öne çıkanlar", items: ["Birinci madde", "İkinci madde"] } },
  { type: "button", label: "Eylem düğmesi", group: "Eylem ve form", icon: MousePointerClick, sample: { label: "İşlem", variant: "primary", actionType: "workflow", workflowId: "" } },
  { type: "form", label: "Özel form", group: "Eylem ve form", icon: ClipboardList, sample: { title: "Form", formCode: "" } },
  { type: "alert", label: "Bildirim kutusu", group: "Bildirim ve gelişmiş", icon: Info, sample: { title: "Bilgilendirme", text: "Kullanıcıya kısa bir açıklama gösterin.", variant: "info" } },
  { type: "badge", label: "Durum rozeti", group: "Bildirim ve gelişmiş", icon: Tag, sample: { label: "Aktif", variant: "success" } },
  { type: "code", label: "Yalıtılmış kod alanı", group: "Bildirim ve gelişmiş", icon: Code2, sample: { title: "Özel bileşen", css: "", javascript: "" } },
];
const paletteGroups = ["Metin ve düzen", "Veri", "Eylem ve form", "Bildirim ve gelişmiş"];
const contentFields: Record<ComponentType, FieldSpec[]> = {
  heading: [{ key: "text", label: "Başlık metni", kind: "text" }],
  text: [{ key: "text", label: "Metin", kind: "textarea" }],
  metric: [{ key: "title", label: "Başlık", kind: "text" }, { key: "description", label: "Açıklama", kind: "text" }],
  card: [{ key: "title", label: "Başlık", kind: "text" }, { key: "description", label: "Açıklama", kind: "textarea" }],
  section: [{ key: "title", label: "Başlık", kind: "text" }, { key: "description", label: "Açıklama", kind: "textarea" }],
  divider: [],
  spacer: [],
  button: [{ key: "label", label: "Düğme metni", kind: "text" }],
  dataTable: [{ key: "title", label: "Başlık", kind: "text" }],
  form: [{ key: "title", label: "Başlık", kind: "text" }],
  code: [{ key: "title", label: "Başlık", kind: "text" }],
  alert: [{ key: "title", label: "Başlık", kind: "text" }, { key: "text", label: "Metin", kind: "textarea" }, { key: "variant", label: "Ton", kind: "variant" }],
  badge: [{ key: "label", label: "Rozet metni", kind: "text" }, { key: "variant", label: "Ton", kind: "variant" }],
  list: [{ key: "title", label: "Başlık", kind: "text" }],
  progress: [{ key: "title", label: "Başlık", kind: "text" }, { key: "value", label: "Değer (%)", kind: "number" }],
};
// Keys the inspector edits with a dedicated control. Anything else found on a component
// (older or hand-written definitions) is still shown as a plain text field so it stays editable.
const managedKeys = new Set(["text", "title", "label", "description", "value", "variant", "formCode", "source", "columns", "workflowId", "rowActionsEnabled", "rowActionWorkflowId", "rowActionLabel", "actionType", "width", "margin", "padding", "backgroundColor", "textColor", "borderRadius", "css", "javascript", "items"]);
const variantOptions = [{ value: "info", label: "Bilgi" }, { value: "success", label: "Başarılı" }, { value: "warning", label: "Uyarı" }, { value: "danger", label: "Kritik" }];
const numericKeys = ["width", "margin", "padding", "borderRadius"];
const emptyDefinition: PageDefinition = { schemaVersion: 1, components: [] };
const titleFor = (type: ComponentType) => palette.find((item) => item.type === type)?.label ?? type;
const iconFor = (type: ComponentType) => palette.find((item) => item.type === type)?.icon ?? LayoutTemplate;
const defaultSpan = (type: ComponentType) => type === "metric" ? 3 : type === "heading" || type === "text" || type === "divider" || type === "spacer" ? 12 : 6;
const defaultPadding = (type: ComponentType) => ["card", "section", "dataTable", "metric", "form"].includes(type) ? 16 : 0;
const spanOf = (component: PageComponent) => Math.max(1, Math.min(12, Number(component.props.width) || defaultSpan(component.type)));
// Mirrors erp-web's tenant-custom-page.css: tablets show every block at half width, phones stack them.
const deviceSpan = (span: number, device: Device) => device === "mobile" ? 12 : device === "tablet" ? 6 : span;
const summaryOf = (component: PageComponent) => {
  const value = component.props.title ?? component.props.text ?? component.props.label;
  return typeof value === "string" && value.trim() ? value : titleFor(component.type);
};
const snapshotOf = (name: string, description: string, definition: PageDefinition) => JSON.stringify({ name, description, definition });
const newId = (type: ComponentType) => `${type}-${crypto.randomUUID().slice(0, 8)}`;
const componentStyle = (type: ComponentType, props: PageComponent["props"]): CSSProperties => {
  const bounded = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = value === "" || value == null ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  return {
    margin: `${bounded(props.margin, 0, 0, 64)}px`,
    padding: `${bounded(props.padding, defaultPadding(type), 0, 64)}px`,
    backgroundColor: typeof props.backgroundColor === "string" ? props.backgroundColor : undefined,
    color: typeof props.textColor === "string" ? props.textColor : undefined,
    borderRadius: `${bounded(props.borderRadius, 12, 0, 32)}px`,
  };
};
const codePreview = (css: string, javascript: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';"><style>html,body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#172554}*{box-sizing:border-box}${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="nexora-root">Özel kod bileşeni</div><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

const block = (type: ComponentType, props: PageComponent["props"]): PageComponent => ({ id: newId(type), type, props });
type Template = { id: string; label: string; description: string; build: () => { name: string; code: string; description: string; components: PageComponent[] } };
const templates: Template[] = [
  { id: "blank", label: "Boş sayfa", description: "Bileşenleri kendiniz ekleyin.", build: () => ({ name: "", code: "", description: "", components: [] }) },
  {
    id: "customers", label: "Cari listesi", description: "Başlık, açıklama ve cari kayıtları ızgarası.",
    build: () => ({
      name: "Cari Hesaplar", code: "cari-listesi", description: "Müşteri ve tedarikçi cari kayıtlarını tek bir ızgarada görüntüleyin.",
      components: [
        block("heading", { text: "Cari Hesaplar", width: 12 }),
        block("text", { text: "Cari kayıtlarınızı görüntüleyin ve ihtiyacınıza göre gösterilecek alanları seçin.", width: 12 }),
        block("dataTable", { title: "Cari listesi", source: "customers", columns: ["code", "name", "type", "currencyCode", "riskLimit", "paymentTermDays", "isActive"], width: 12, padding: 16, rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" }),
      ],
    }),
  },
  {
    id: "dashboard", label: "Gösterge paneli", description: "Gösterge, ilerleme ve bildirim kartları ile bir ızgara.",
    build: () => ({
      name: "Özet paneli", code: "ozet-paneli", description: "Önemli göstergeleri ve son kayıtları tek ekranda izleyin.",
      components: [
        block("heading", { text: "Özet paneli", width: 12 }),
        block("metric", { title: "Toplam cari", description: "Kayıtlı cari hesap sayısı", source: "customers", width: 4, padding: 16 }),
        block("progress", { title: "Aylık hedef", value: 65, width: 4, padding: 16 }),
        block("alert", { title: "Bilgilendirme", text: "Göstergeler her açılışta güncel verilerle hesaplanır.", variant: "info", width: 4 }),
        block("dataTable", { title: "Son cariler", source: "customers", columns: ["code", "name", "type"], width: 12, padding: 16, rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" }),
      ],
    }),
  },
  {
    id: "form", label: "Form sayfası", description: "Açıklama ve yayımlanmış bir özel form.",
    build: () => ({
      name: "Talep formu", code: "talep-formu", description: "Kullanıcıların talep göndereceği form sayfası.",
      components: [
        block("heading", { text: "Talep formu", width: 12 }),
        block("text", { text: "Formu doldurup gönderin; talebiniz ilgili ekibe iletilir.", width: 12 }),
        block("form", { title: "Talep", formCode: "", width: 8, padding: 16 }),
        block("alert", { title: "Not", text: "Zorunlu alanlar işaretlidir.", variant: "info", width: 4 }),
      ],
    }),
  },
];

type Props = { token: string; role: string; platformOrigin?: string; initialPageId?: string | null; initialCreate?: boolean; embedded?: boolean; onBack?: () => void };

export default function CustomPagesPage({ token, role, platformOrigin, initialPageId, initialCreate = false, onBack }: Props) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [history, setHistory] = useState<PageRevision[]>([]);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [forms, setForms] = useState<CustomFormSummary[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [sources, setSources] = useState<ReportSource[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, PreviewData>>({});
  const [capabilities, setCapabilities] = useState<Capability | null>(null);
  const [current, setCurrent] = useState<PageDetail | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<PageDefinition>(emptyDefinition);
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshotOf("", "", emptyDefinition));
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [device, setDevice] = useState<Device>("desktop");
  const [leftTab, setLeftTab] = useState<"components" | "layers" | "templates">("components");
  const [rightMode, setRightMode] = useState<"inspector" | "history">("inspector");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ rowActions: true, style: false });
  const [, setUndoTick] = useState(0);
  const initialActionDone = useRef(false);
  const definitionRef = useRef(definition);
  definitionRef.current = definition;
  const undoStack = useRef<PageDefinition[]>([]);
  const redoStack = useRef<PageDefinition[]>([]);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const canEdit = current
    ? !current.isPublished && !!capabilities?.canUpdate
    : creating && !!capabilities?.canCreate;
  const dirty = (creating || !!current) && snapshotOf(name, description, definition) !== savedSnapshot;
  const selected = definition.components.find((component) => component.id === selectedComponentId) ?? null;

  const request = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await authenticatedFetch(url, token, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null;
      throw new Error(body?.error || body?.detail || body?.title || `İstek başarısız (${response.status})`);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setPages(await request<PageSummary[]>("/api/custom-pages")); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [request]);
  const refreshHistory = useCallback(async (pageId: string) => {
    setHistory(await request<PageRevision[]>(`/api/custom-pages/${pageId}/history`).catch(() => []));
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (initialActionDone.current || loading) return;
    if (initialCreate) {
      if (!capabilities?.canCreate) return;
      initialActionDone.current = true;
      startNew();
      return;
    }
    if (initialPageId) {
      const page = pages.find((item) => item.id === initialPageId);
      if (!page) return;
      initialActionDone.current = true;
      void openPage(page);
    }
  }, [initialCreate, initialPageId, loading, pages, capabilities]);
  useEffect(() => {
    void request<Record<string, Capability>>("/api/low-code/capabilities")
      // Older API deployments exposed this same permission family only as
      // customizationPackages. Keep the designer usable during a staggered rollout.
      .then((items) => setCapabilities(items.customPages ?? items.customizationPackages ?? null))
      .catch(() => setCapabilities(null));
  }, [request]);
  const refreshForms = useCallback(() => request<CustomFormSummary[]>("/api/custom-forms/")
    .then((items) => setForms(items.filter((item) => item.status === "Published")))
    .catch(() => setForms([])), [request]);
  useEffect(() => { void refreshForms(); }, [refreshForms]);
  useEffect(() => {
    void request<ReportSource[]>("/api/reports/catalog")
      .then(async (items) => {
        const entities = await request<{ code: string; name: string; status: string; fields: { code: string; label: string; dataType: string }[] }[]>("/api/custom-data/entities").catch(() => []);
        const tenantSources: ReportSource[] = entities.filter((entity) => entity.status === "Published").map((entity) => ({
          code: `tenantData:${entity.code}`, label: `Özel veri · ${entity.name}`,
          columns: entity.fields.map((field) => ({ code: field.code, label: field.label, dataType: field.dataType === "Decimal" ? "decimal" : field.dataType === "Date" ? "date" : field.dataType === "Boolean" ? "boolean" : "text" })),
          aggregates: [],
        }));
        setSources([...items.filter((item) => item.code !== "customSql"), ...tenantSources]);
      })
      .catch(() => setSources([]));
  }, [request]);
  useEffect(() => {
    void request<WorkflowOption[]>("/api/workflows/definitions")
      .then((items) => setWorkflows(items.filter((item) => item.status === "Published")))
      .catch(() => setWorkflows([]));
  }, [request]);
  // Only data bindings drive the sample-data requests, so typing a title does not refetch every grid.
  const bindingKey = JSON.stringify(definition.components
    .filter((item) => (item.type === "metric" || item.type === "dataTable") && typeof item.props.source === "string" && item.props.source)
    .map((item) => [item.id, item.type, item.props.source, item.props.columns]));
  useEffect(() => {
    let active = true;
    const bound = JSON.parse(bindingKey) as [string, ComponentType, string, unknown][];
    const timer = window.setTimeout(() => {
      void Promise.all(bound.map(async ([id, type, source, rawColumns]) => {
        try {
          if (source.startsWith("tenantData:")) {
            const entityCode = source.slice("tenantData:".length);
            const data = await request<{ total: number; items: { id: string; values: Record<string, unknown> }[] }>(
              `/api/custom-data/entities/${encodeURIComponent(entityCode)}/records?page=1&pageSize=5`,
            );
            return [id, { totalCount: data.total, rows: data.items.map((item) => ({ id: item.id, ...item.values })) }] as const;
          }
          const selectedSource = sources.find((item) => item.code === source);
          if (!selectedSource) return [id, { totalCount: 0, rows: [] }] as const;
          const chosen = Array.isArray(rawColumns) ? rawColumns.filter((column): column is string => typeof column === "string") : [];
          const columns = type === "metric"
            ? [selectedSource.columns[0]?.code].filter((column): column is string => !!column)
            : chosen.filter((columnCode) => selectedSource.columns.some((column) => column.code === columnCode)).slice(0, 12);
          const requestColumns = columns.length ? columns : selectedSource.columns.slice(0, 5).map((column) => column.code);
          const result = await request<{ totalCount: number; rows: Record<string, unknown>[] }>("/api/reports/run", {
            method: "POST",
            body: JSON.stringify({ source, columns: requestColumns, filters: [], sortBy: requestColumns[0] ?? "", descending: false, page: 1, pageSize: 5 }),
          });
          return [id, { totalCount: result.totalCount, rows: result.rows }] as const;
        } catch {
          return [id, { totalCount: 0, rows: [] }] as const;
        }
      })).then((entries) => { if (active) setPreviewData(Object.fromEntries(entries)); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [bindingKey, sources, request]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (selectedComponentId && !definition.components.some((component) => component.id === selectedComponentId)) setSelectedComponentId(null);
  }, [definition, selectedComponentId]);

  const resetUndo = () => { undoStack.current = []; redoStack.current = []; lastCommit.current = null; setUndoTick((tick) => tick + 1); };
  const loadEditor = (pageName: string, pageCode: string, pageDescription: string, pageDefinition: PageDefinition) => {
    setName(pageName); setCode(pageCode); setDescription(pageDescription); setDefinition(pageDefinition); definitionRef.current = pageDefinition;
    setSavedSnapshot(snapshotOf(pageName, pageDescription, pageDefinition));
    resetUndo();
  };
  // Every definition change goes through commit so it can be undone. Typing into one field
  // (same coalesce key within a second) or one resize drag collapses into a single undo step.
  const commit = (update: (value: PageDefinition) => PageDefinition, coalesceKey?: string) => {
    if (!canEdit) return;
    const previous = definitionRef.current;
    const next = update(previous);
    if (next === previous) return;
    const now = Date.now();
    const last = lastCommit.current;
    const coalesce = !!coalesceKey && last?.key === coalesceKey && (coalesceKey.startsWith("resize:") || now - last.at < 1000);
    if (!coalesce) undoStack.current = [...undoStack.current.slice(-79), previous];
    lastCommit.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    redoStack.current = [];
    definitionRef.current = next;
    setDefinition(next);
    setUndoTick((tick) => tick + 1);
  };
  const undo = () => {
    if (!canEdit || undoStack.current.length === 0) return;
    const previous = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, definitionRef.current];
    lastCommit.current = null;
    definitionRef.current = previous; setDefinition(previous); setUndoTick((tick) => tick + 1);
  };
  const redo = () => {
    if (!canEdit || redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, definitionRef.current];
    lastCommit.current = null;
    definitionRef.current = next; setDefinition(next); setUndoTick((tick) => tick + 1);
  };

  const openPage = async (item: PageSummary) => {
    setError(""); setNotice(""); setSaving(true);
    try {
      const detail = await request<PageDetail>(`/api/custom-pages/${item.id}`);
      const loadedDefinition = JSON.parse(detail.definitionJson) as PageDefinition;
      setCurrent(detail); setCreating(false);
      loadEditor(detail.name, detail.code, detail.description || "", loadedDefinition);
      setSelectedComponentId(null); setRightMode("inspector");
      await refreshHistory(item.id);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const startNew = () => {
    setCurrent(null); setCreating(true); setHistory([]); setError(""); setSelectedComponentId(null); setRightMode("inspector");
    loadEditor("", "", "", emptyDefinition);
    setLeftTab("templates");
    setNotice("Yeni sayfa taslağı hazırlayın; yayımlanana kadar kullanıcılar görmez. Bir şablonla başlayabilirsiniz.");
  };
  const applyTemplate = (template: Template) => {
    if (!canEdit) { setError(current?.isPublished ? "Yayımlanmış sayfaya şablon uygulamak için önce yeni taslak oluşturun." : "Bu sayfayı düzenleme yetkiniz yok."); return; }
    if (definition.components.length > 0 && !window.confirm(`“${template.label}” şablonu mevcut bileşenlerin yerine geçsin mi? Geri al ile dönebilirsiniz.`)) return;
    const built = template.build();
    commit(() => ({ schemaVersion: 1, components: built.components }));
    if (!current) {
      if (!name.trim()) setName(built.name);
      if (!description.trim()) setDescription(built.description);
      if (!code.trim() && built.code) {
        let nextCode = built.code; let suffix = 2;
        while (pages.some((page) => page.code === nextCode)) nextCode = `${built.code}-${suffix++}`;
        setCode(nextCode);
      }
    }
    setSelectedComponentId(null); setLeftTab("components"); setError("");
    setNotice(`“${template.label}” şablonu uygulandı. Bileşenleri seçerek düzenleyin, ardından taslağı kaydedin.`);
  };
  const createFromPublished = async (page: PageSummary) => {
    if (!capabilities?.canCreate) { setError("Yeni taslak oluşturma yetkiniz yok."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const published = await request<PageDetail>(`/api/custom-pages/${encodeURIComponent(page.code)}/published`);
      const detail = await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: page.code, name: page.name, description: page.description, definition: JSON.parse(published.definitionJson) }) });
      await openPage(detail);
      await refresh();
      setNotice("Yayımlanmış sürümden yeni bir taslak açıldı. Yayımlayana kadar kullanıcılar eski sürümü görür.");
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const deleteCurrent = async () => {
    if (!current) return;
    if (!capabilities?.canDelete) { setError("Sayfa silme yetkiniz yok."); return; }
    if (!window.confirm(`“${current.name}” sayfası silinsin mi? Yayımlanmışsa ERP'den de kaldırılır.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await request<void>(`/api/custom-pages/${current.id}`, { method: "DELETE" });
      setSavedSnapshot(snapshotOf(name, description, definition));
      onBack?.();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const insertIndex = () => {
    const index = definition.components.findIndex((component) => component.id === selectedComponentId);
    return index < 0 ? definition.components.length : index + 1;
  };
  const addComponent = (item: PaletteItem, at?: number) => {
    if (!canEdit) return;
    const id = newId(item.type);
    const props = Object.fromEntries(Object.entries(item.sample).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
    commit((value) => {
      const components = [...value.components];
      components.splice(at == null ? components.length : Math.max(0, Math.min(at, components.length)), 0, { id, type: item.type, props });
      return { ...value, components };
    });
    setSelectedComponentId(id);
  };
  const dropAt = (targetIndex: number, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null); setDragging(null);
    if (!canEdit) return;
    const type = event.dataTransfer.getData("application/x-nexora-component");
    const rawFrom = event.dataTransfer.getData("application/x-nexora-index");
    const from = rawFrom === "" ? Number.NaN : Number(rawFrom);
    if (type) {
      const item = palette.find((entry) => entry.type === type);
      if (item) addComponent(item, targetIndex);
    } else if (Number.isInteger(from) && from >= 0 && from < definition.components.length) {
      commit((state) => {
        const components = [...state.components];
        const [moved] = components.splice(from, 1);
        const insertion = from < targetIndex ? targetIndex - 1 : targetIndex;
        components.splice(Math.max(0, Math.min(insertion, components.length)), 0, moved);
        return components.every((component, index) => component === state.components[index]) ? state : { ...state, components };
      });
    }
  };
  const dragOverBlock = (index: number, component: PageComponent, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontal = deviceSpan(spanOf(component), device) < 12;
    const before = horizontal ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2;
    const edge = before ? "before" : "after";
    if (dropTarget?.index !== index || dropTarget.edge !== edge) setDropTarget({ index, edge });
  };
  const updateComponent = (id: string, key: string, value: PropValue) => commit((state) => ({
    ...state,
    components: state.components.map((component) => component.id === id ? { ...component, props: { ...component.props, [key]: numericKeys.includes(key) ? Number(value) : value } } : component),
  }), `${id}:${key}`);
  const clearProp = (id: string, key: string) => commit((state) => ({
    ...state,
    components: state.components.map((component) => {
      if (component.id !== id || !(key in component.props)) return component;
      const props = { ...component.props };
      delete props[key];
      return { ...component, props };
    }),
  }));
  const removeComponent = (id: string) => { commit((state) => ({ ...state, components: state.components.filter((component) => component.id !== id) })); setSelectedComponentId((value) => value === id ? null : value); };
  const duplicateComponent = (id: string) => {
    const original = definitionRef.current.components.find((component) => component.id === id);
    if (!original || !canEdit) return;
    const copyId = newId(original.type);
    const duplicate: PageComponent = { ...original, id: copyId, props: Object.fromEntries(Object.entries(original.props).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) };
    commit((state) => {
      const index = state.components.findIndex((component) => component.id === id);
      if (index < 0) return state;
      const components = [...state.components];
      components.splice(index + 1, 0, duplicate);
      return { ...state, components };
    });
    setSelectedComponentId(copyId);
  };
  const moveComponent = (index: number, delta: number) => commit((state) => {
    const next = [...state.components]; const target = index + delta;
    if (target < 0 || target >= next.length) return state;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...state, components: next };
  });
  const startResize = (component: PageComponent, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!canEdit || device !== "desktop" || !gridRef.current) return;
    event.preventDefault(); event.stopPropagation();
    const grid = gridRef.current;
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    const column = (grid.clientWidth + gap) / 12;
    const startX = event.clientX;
    const startSpan = spanOf(component);
    const key = `resize:${component.id}:${Date.now()}`;
    const move = (moveEvent: PointerEvent) => {
      const span = Math.max(1, Math.min(12, startSpan + Math.round((moveEvent.clientX - startX) / column)));
      if (span !== spanOf(definitionRef.current.components.find((item) => item.id === component.id) ?? component)) {
        commit((state) => ({ ...state, components: state.components.map((item) => item.id === component.id ? { ...item, props: { ...item.props, width: span } } : item) }), key);
      }
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); document.body.classList.remove("pd-resizing"); };
    document.body.classList.add("pd-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const saveDraft = async () => {
    if (!canEdit) { setError("Bu sayfayı düzenleme yetkiniz yok."); return null; }
    if (!name.trim() || !code.trim()) { setError("Sayfa adı ve kodu gerekli. Sağdaki sayfa ayarlarından girin."); setSelectedComponentId(null); setRightMode("inspector"); return null; }
    setSaving(true); setError(""); setNotice("");
    const sentSnapshot = snapshotOf(name, description, definition);
    try {
      const result = current
        ? await request<PageDetail>(`/api/custom-pages/${current.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: current.revision, name, description: description || null, definition }) })
        : await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: code.trim(), name, description: description || null, definition }) });
      setCurrent(result); setCreating(false); setCode(result.code); setSavedSnapshot(sentSnapshot);
      setNotice("Taslak kaydedildi. Yayımlanana kadar aktif sayfa değişmez.");
      await refreshHistory(result.id);
      await refresh();
      return result;
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
    return null;
  };
  const openErpPreview = async () => {
    if (!platformOrigin) { setError("ERP adresi bulunamadı. Studio'yu ERP ekranındaki bağlantıdan açın."); return; }
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) { setError("ERP önizlemesi açılamadı. Tarayıcı açılır pencereyi engelledi."); return; }
    previewWindow.opener = null;
    try {
      if (current?.isPublished) {
        const destination = new URL("/", platformOrigin);
        destination.searchParams.set("customPage", current.code);
        previewWindow.location.replace(destination.toString());
        return;
      }
      const saved = dirty || !current ? await saveDraft() : current;
      if (!saved) { previewWindow.close(); return; }
      const destination = new URL("/", platformOrigin);
      destination.searchParams.set("customPagePreview", saved.id);
      previewWindow.location.replace(destination.toString());
    } catch {
      previewWindow.close();
      setError("ERP önizlemesi açılamadı. Taslağı kaydedip yeniden deneyin.");
    }
  };
  const publish = async () => {
    if (!capabilities?.canPublish) { setError("Sayfa yayımlama yetkiniz yok."); return; }
    const target = dirty || !current ? await saveDraft() : current;
    if (!target) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await request<PageDetail>(`/api/custom-pages/${target.id}/publish`, { method: "POST", body: JSON.stringify({ expectedRevision: target.revision }) });
      setCurrent(result); setNotice("Sayfa yayımlandı ve tenant çalışma alanında kullanılabilir.");
      await refreshHistory(result.id);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const restoreRevision = async (revisionId: string) => {
    if (!current) return;
    const revision = history.find((item) => item.id === revisionId);
    if (!revision) { setError("Seçilen geçmiş sürüm bulunamadı. Geçmişi yenileyin."); return; }
    if (current.isPublished ? !capabilities?.canCreate : !capabilities?.canUpdate) { setError("Bu sürümü geri yükleme yetkiniz yok."); return; }
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikleriniz kaybolacak. Geçmiş sürüm yüklensin mi?")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const restored = current.isPublished
        ? await request<PageDetail>(`/api/custom-pages/${current.id}/restore/${revisionId}`, { method: "POST" })
        : await request<PageDetail>(`/api/custom-pages/${current.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: current.revision, name: revision.name, description: revision.description, definition: JSON.parse(revision.definitionJson) }) });
      setCurrent(restored);
      loadEditor(restored.name, restored.code, restored.description || "", JSON.parse(restored.definitionJson) as PageDefinition);
      setSelectedComponentId(null); setRightMode("inspector");
      setNotice("Geçmiş sürüm yeni taslak olarak açıldı; yayımlanan sayfa değişmedi.");
      await refreshHistory(restored.id);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const goBack = () => {
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikler kaybolacak. Sayfa listesine dönülsün mü?")) return;
    onBack?.();
  };

  // Keyboard shortcuts work on the canvas; typing in inspector fields keeps native editing (except Ctrl+S).
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => undefined);
  shortcuts.current = (event: KeyboardEvent) => {
    if (formEditorOpen) return;
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const mod = event.ctrlKey || event.metaKey;
    const keyName = event.key.toLowerCase();
    if (mod && keyName === "s") { event.preventDefault(); if (canEdit && !saving) void saveDraft(); return; }
    if (typing) return;
    if (mod && keyName === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (mod && (keyName === "y" || (keyName === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
    else if (mod && keyName === "d" && selectedComponentId) { event.preventDefault(); duplicateComponent(selectedComponentId); }
    else if ((event.key === "Delete" || event.key === "Backspace") && selectedComponentId && canEdit) { event.preventDefault(); removeComponent(selectedComponentId); }
    else if (event.key === "Escape") setSelectedComponentId(null);
    else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.altKey && selectedComponentId) {
      event.preventDefault();
      const index = definition.components.findIndex((component) => component.id === selectedComponentId);
      if (index >= 0) moveComponent(index, event.key === "ArrowUp" ? -1 : 1);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const rendered = useMemo(() => definition.components.map((component) => {
    const props = component.props;
    const style = componentStyle(component.type, props);
    switch (component.type) {
      case "heading": return <h2 key={component.id} className="custom-page-preview-heading" style={style}>{String(props.text || props.title || "Başlık")}</h2>;
      case "text": return <p key={component.id} className="custom-page-preview-text" style={style}>{String(props.text || "Metin")}</p>;
      case "metric": { const data = previewData[component.id]; return <article key={component.id} className="custom-page-preview-metric" style={style}><small>{String(props.title || "Gösterge")}</small><b>{!props.source ? "Veri kaynağı seçin" : data ? data.totalCount.toLocaleString("tr-TR") : "Yükleniyor…"}</b><span>{String(props.description || sources.find((source) => source.code === props.source)?.label || "")}</span></article>; }
      case "card": case "section": return <article key={component.id} className={`custom-page-preview-card ${component.type === "section" ? "is-section" : ""}`} style={style}><b>{String(props.title || titleFor(component.type))}</b>{props.description && <p>{String(props.description)}</p>}</article>;
      case "divider": return <hr key={component.id} className="custom-page-preview-divider" style={style} />;
      case "spacer": return <div key={component.id} className="custom-page-preview-spacer" style={style} />;
      case "button": return <div key={component.id} className="custom-page-preview-action" style={style}><button type="button" tabIndex={-1} className="custom-page-preview-button">{String(props.label || "İşlem")}</button></div>;
      case "dataTable": {
        const source = sources.find((item) => item.code === props.source);
        const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string") : [];
        const data = previewData[component.id];
        const visibleColumns = columns.map((column) => source?.columns.find((field) => field.code === column) ?? { code: column, label: column, dataType: "text" });
        const hasRowAction = props.rowActionsEnabled === true;
        return <article key={component.id} className="custom-page-preview-card" style={style}><div className="custom-page-preview-card-head"><b>{String(props.title || "Liste")}</b><small>{source?.label || "Veri kaynağı seçilmedi"}</small></div>{!props.source ? <p>Önizleme için veri kaynağı seçin.</p> : !data ? <p role="status">Örnek kayıtlar yükleniyor…</p> : <div className="custom-page-preview-grid-scroll"><table className="custom-page-preview-grid"><thead><tr>{visibleColumns.map((column) => <th key={column.code}>{column.label}</th>)}{hasRowAction && <th scope="col">İşlemler</th>}</tr></thead><tbody>{data.rows.length === 0 ? <tr><td colSpan={visibleColumns.length + (hasRowAction ? 1 : 0)}>Kaynakta gösterilecek kayıt bulunamadı.</td></tr> : data.rows.map((row, rowIndex) => <tr key={String(row.id ?? rowIndex)}>{visibleColumns.map((column) => <td key={column.code}>{row[column.code] == null ? "—" : String(row[column.code])}</td>)}{hasRowAction && <td><span className="custom-page-preview-row-action">{String(props.rowActionLabel || "İşlemi başlat")}</span></td>}</tr>)}</tbody></table></div>}</article>;
      }
      case "form": return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String(props.title || "Form")}</b><p>{forms.find((form) => form.code === props.formCode)?.name || "Yayımlanmış form seçin"}</p></article>;
      case "code": return <iframe key={component.id} className="custom-page-code-preview" title={String(props.title || "Yalıtılmış kod önizlemesi")} sandbox="allow-scripts" referrerPolicy="no-referrer" style={style} srcDoc={codePreview(String(props.css || ""), String(props.javascript || ""))} />;
      case "alert": { const variant = ["success", "warning", "danger", "info"].includes(String(props.variant)) ? String(props.variant) : "info"; return <article key={component.id} className={`custom-page-preview-alert tone-${variant}`} style={style}><b>{String(props.title || "Bilgilendirme")}</b><p>{String(props.text || "")}</p></article>; }
      case "badge": { const variant = ["success", "warning", "danger", "info"].includes(String(props.variant)) ? String(props.variant) : "info"; return <span key={component.id} className={`custom-page-preview-badge tone-${variant}`} style={style}>{String(props.label || "Durum")}</span>; }
      case "list": return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String(props.title || "Liste")}</b><ul>{(Array.isArray(props.items) ? props.items : []).map((item, itemIndex) => <li key={itemIndex}>{String(item)}</li>)}</ul></article>;
      case "progress": { const progress = Math.max(0, Math.min(100, Number(props.value) || 0)); return <article key={component.id} className="custom-page-preview-progress" style={style}><div><b>{String(props.title || "İlerleme")}</b><span>{progress}%</span></div><progress max={100} value={progress} /></article>; }
      default: return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String((component as PageComponent).type)}</b></article>;
    }
  }), [definition, forms, sources, previewData]);

  const status = current?.isPublished ? { label: "Yayında", tone: "published" } : current ? { label: "Taslak", tone: "draft" } : { label: "Yeni", tone: "new" };
  const searchText = paletteSearch.trim().toLocaleLowerCase("tr-TR");
  const visiblePalette = palette.filter((item) => !searchText || item.label.toLocaleLowerCase("tr-TR").includes(searchText) || item.group.toLocaleLowerCase("tr-TR").includes(searchText));
  const toggleSection = (key: string) => setCollapsed((value) => ({ ...value, [key]: !value[key] }));
  const section = (key: string, title: string, body: ReactNode) => <section className="pd-inspector-section" key={key}>
    <button type="button" className="pd-inspector-section-toggle" aria-expanded={!collapsed[key]} onClick={() => toggleSection(key)}>{collapsed[key] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<span>{title}</span></button>
    {!collapsed[key] && <div className="pd-inspector-section-body">{body}</div>}
  </section>;

  if (!current && !creating) {
    const notFound = !loading && !saving && !!initialPageId && !pages.some((page) => page.id === initialPageId);
    const noCreate = !loading && initialCreate && capabilities !== null && !capabilities.canCreate;
    return <main className="pd-shell pd-shell-state">
      <div className="pd-state-card">
        <span><LayoutTemplate size={26}/></span>
        {error ? <><b>Sayfa açılamadı</b><p role="alert">{error}</p></>
          : notFound ? <><b>Sayfa bulunamadı</b><p>Sayfa silinmiş ya da erişiminiz kaldırılmış olabilir.</p></>
          : noCreate ? <><b>Yeni sayfa oluşturma yetkiniz yok</b><p>Tenant yöneticinizden Sayfa tasarımcısı oluşturma iznini açmasını isteyin.</p></>
          : <><b>Sayfa açılıyor…</b><p>Bileşenler ve veri kaynakları yükleniyor.</p></>}
        {onBack && <button type="button" onClick={onBack}><ArrowLeft size={15}/>Sayfa listesine dön</button>}
      </div>
    </main>;
  }

  const selectedIndex = selected ? definition.components.findIndex((component) => component.id === selected.id) : -1;
  const selectedSource = selected ? sources.find((source) => source.code === selected.props.source) : undefined;
  const selectedColumns = selected && Array.isArray(selected.props.columns) ? selected.props.columns.filter((column): column is string => typeof column === "string") : [];
  const SelectedIcon = selected ? iconFor(selected.type) : Settings2;

  return <main className="pd-shell">
    <header className="pd-topbar">
      {onBack && <button type="button" className="pd-icon-button" onClick={goBack} title="Sayfa listesine dön" aria-label="Sayfa listesine dön"><ArrowLeft size={17}/></button>}
      <div className="pd-title">
        <div><h2>{name || "Adsız sayfa"}</h2><span className={`pd-status ${status.tone}`}>{status.label}{current ? ` · v${current.revision}` : ""}</span></div>
        <small>{code ? `/${code}` : "Kod henüz belirlenmedi"}{dirty ? <em className="pd-dirty"> · Kaydedilmemiş değişiklikler</em> : current ? <span className="pd-clean"> · Tüm değişiklikler kaydedildi</span> : null}</small>
      </div>
      <div className="pd-topbar-actions">
        <div className="pd-button-group">
          <button type="button" className="pd-icon-button" onClick={undo} disabled={!canEdit || undoStack.current.length === 0} title="Geri al (Ctrl+Z)" aria-label="Geri al"><Undo2 size={16}/></button>
          <button type="button" className="pd-icon-button" onClick={redo} disabled={!canEdit || redoStack.current.length === 0} title="Yinele (Ctrl+Y)" aria-label="Yinele"><Redo2 size={16}/></button>
        </div>
        {current && <button type="button" className={`pd-button ${rightMode === "history" ? "active" : ""}`} onClick={() => setRightMode((value) => value === "history" ? "inspector" : "history")}><History size={15}/>Geçmiş<span className="pd-count">{history.length}</span></button>}
        <button type="button" className="pd-button" onClick={() => void openErpPreview()} disabled={saving}><Eye size={15}/>{current?.isPublished ? "ERP'de aç" : "ERP'de önizle"}</button>
        {(current ? capabilities?.canUpdate : capabilities?.canCreate) && !current?.isPublished && <button type="button" className="pd-button" onClick={() => void saveDraft()} disabled={saving || !canEdit || (!dirty && !!current)} title="Kaydet (Ctrl+S)"><Save size={15}/>{saving ? "Kaydediliyor…" : "Kaydet"}</button>}
        {!current?.isPublished && capabilities?.canPublish && <button type="button" className="pd-button primary" onClick={() => void publish()} disabled={saving || !canEdit}><Send size={15}/>{dirty || !current ? "Kaydet ve yayımla" : "Yayımla"}</button>}
        {current?.isPublished && capabilities?.canCreate && <button type="button" className="pd-button primary" onClick={() => void createFromPublished(current)} disabled={saving}><FilePlus2 size={15}/>Yeni taslakta düzenle</button>}
      </div>
    </header>
    {(error || notice || (current && !canEdit)) && <div className="pd-messages">
      {current && !canEdit && <div className="pd-message readonly"><Lock size={14}/><span>{current.isPublished ? "Yayımlanmış sürüm salt okunur. Değişiklik yapmak için yeni bir taslak oluşturun." : "Bu taslağı düzenleme yetkiniz yok; yalnızca görüntüleyebilirsiniz."}</span></div>}
      {error && <div className="pd-message error" role="alert"><span>{error}</span><button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={14}/></button></div>}
      {notice && !error && <div className="pd-message success" role="status"><span>{notice}</span><button type="button" aria-label="Kapat" onClick={() => setNotice("")}><X size={14}/></button></div>}
    </div>}

    <div className="pd-workspace">
      <aside className="pd-left" aria-label="Bileşenler ve katmanlar">
        <div className="pd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={leftTab === "components"} className={leftTab === "components" ? "active" : ""} onClick={() => setLeftTab("components")}><Plus size={14}/>Bileşenler</button>
          <button type="button" role="tab" aria-selected={leftTab === "layers"} className={leftTab === "layers" ? "active" : ""} onClick={() => setLeftTab("layers")}><Layers size={14}/>Katmanlar<span className="pd-count">{definition.components.length}</span></button>
          <button type="button" role="tab" aria-selected={leftTab === "templates"} className={leftTab === "templates" ? "active" : ""} onClick={() => setLeftTab("templates")}><LayoutTemplate size={14}/>Şablon</button>
        </div>
        {leftTab === "components" && <div className="pd-left-body">
          <label className="pd-search"><Search size={14}/><input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="Bileşen ara" aria-label="Bileşen ara"/></label>
          <p className="pd-hint">Tuvale sürükleyin ya da tıklayarak seçili bileşenin altına ekleyin.</p>
          {paletteGroups.map((group) => {
            const items = visiblePalette.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return <div className="pd-palette-group" key={group}><h4>{group}</h4>{items.map((item) => {
              const Icon = item.icon;
              return <button type="button" key={item.type} className="pd-palette-item" draggable={canEdit} disabled={!canEdit}
                onDragStart={(event) => { event.dataTransfer.setData("application/x-nexora-component", item.type); event.dataTransfer.effectAllowed = "copy"; setDragging(item.type); }}
                onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                onClick={() => addComponent(item, insertIndex())}><span className="pd-palette-icon"><Icon size={15}/></span><span>{item.label}</span></button>;
            })}</div>;
          })}
          {visiblePalette.length === 0 && <p className="pd-empty-note">“{paletteSearch}” ile eşleşen bileşen yok.</p>}
        </div>}
        {leftTab === "layers" && <div className="pd-left-body">
          {definition.components.length === 0 ? <p className="pd-empty-note">Sayfada henüz bileşen yok.</p> : <ol className="pd-layers">{definition.components.map((component, index) => {
            const Icon = iconFor(component.type);
            return <li key={component.id} className={`${selectedComponentId === component.id ? "is-selected" : ""} ${dropTarget?.index === index ? `drop-${dropTarget.edge}-v` : ""}`}
              draggable={canEdit}
              onDragStart={(event) => { event.dataTransfer.setData("application/x-nexora-index", String(index)); event.dataTransfer.effectAllowed = "move"; setDragging(component.id); }}
              onDragEnd={() => { setDragging(null); setDropTarget(null); }}
              onDragOver={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after"; if (dropTarget?.index !== index || dropTarget.edge !== edge) setDropTarget({ index, edge }); }}
              onDrop={(event) => dropAt(dropTarget?.index === index && dropTarget.edge === "after" ? index + 1 : index, event)}>
              <button type="button" className="pd-layer-open" onClick={() => setSelectedComponentId(component.id)}><Icon size={14}/><span><b>{summaryOf(component)}</b><small>{titleFor(component.type)} · {spanOf(component)}/12</small></span></button>
              <span className="pd-layer-actions">
                <button type="button" title="Yukarı taşı" aria-label="Yukarı taşı" disabled={!canEdit || index === 0} onClick={() => moveComponent(index, -1)}><ArrowUp size={13}/></button>
                <button type="button" title="Aşağı taşı" aria-label="Aşağı taşı" disabled={!canEdit || index === definition.components.length - 1} onClick={() => moveComponent(index, 1)}><ArrowDown size={13}/></button>
              </span>
            </li>;
          })}</ol>}
        </div>}
        {leftTab === "templates" && <div className="pd-left-body">
          <p className="pd-hint">Şablon, sayfadaki bileşenlerin yerine geçer; Geri al ile dönebilirsiniz.</p>
          {templates.map((template) => <button type="button" key={template.id} className="pd-template" disabled={!canEdit} onClick={() => applyTemplate(template)}><b>{template.label}</b><small>{template.description}</small></button>)}
        </div>}
      </aside>

      <section className="pd-center" aria-label="Sayfa tuvali">
        <div className="pd-canvas-toolbar">
          <div className="pd-button-group" role="group" aria-label="Cihaz genişliği">
            {([["desktop", Monitor, "Masaüstü"], ["tablet", Tablet, "Tablet"], ["mobile", Smartphone, "Mobil"]] as const).map(([value, Icon, label]) => <button type="button" key={value} className={`pd-icon-button ${device === value ? "active" : ""}`} aria-pressed={device === value} title={label} aria-label={label} onClick={() => setDevice(value)}><Icon size={15}/></button>)}
          </div>
          <button type="button" className={`pd-button ${showGrid ? "active" : ""}`} aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={14}/>Izgara</button>
          <span className="pd-canvas-meta">{definition.components.length} bileşen · {device === "desktop" ? "12 kolon" : device === "tablet" ? "Tablet: bloklar yarım genişlik" : "Mobil: bloklar alt alta"}</span>
        </div>
        <div className="pd-canvas-scroll" onClick={() => setSelectedComponentId(null)}>
          <div className={`pd-frame device-${device}`}>
            <div className="pd-frame-top"><b>Nexora ERP</b><span>{name || "Yeni sayfa"}</span></div>
            <div className="pd-frame-breadcrumb"><span>Ana sayfa</span><span>›</span><b>{name || "Yeni sayfa"}</b></div>
            <div ref={gridRef} className={`pd-grid ${dragging ? "is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); if (event.target === event.currentTarget && dropTarget) setDropTarget(null); }}
              onDrop={(event) => dropAt(definition.components.length, event)}>
              {showGrid && <div className="pd-grid-guides" aria-hidden="true">{Array.from({ length: device === "desktop" ? 12 : device === "tablet" ? 2 : 1 }, (_, column) => <span key={column}/>)}</div>}
              {definition.components.length === 0 && <div className="pd-canvas-empty"><LayoutTemplate size={26}/><b>Sayfanız henüz boş</b><span>Soldan bir bileşen sürükleyin, tıklayarak ekleyin ya da bir şablonla başlayın.</span>{canEdit && <button type="button" className="pd-button" onClick={(event) => { event.stopPropagation(); setLeftTab("templates"); }}><LayoutTemplate size={14}/>Şablonları göster</button>}</div>}
              {definition.components.map((component, index) => {
                const isSelected = selectedComponentId === component.id;
                const drop = dropTarget?.index === index ? dropTarget.edge : null;
                const horizontal = deviceSpan(spanOf(component), device) < 12;
                return <div key={component.id}
                  className={`pd-block ${isSelected ? "is-selected" : ""} ${dragging === component.id ? "is-dragging" : ""} ${drop ? `drop-${drop}-${horizontal ? "h" : "v"}` : ""}`}
                  style={{ gridColumn: `span ${deviceSpan(spanOf(component), device)}` }}
                  draggable={canEdit}
                  onClick={(event) => { event.stopPropagation(); setSelectedComponentId(component.id); }}
                  onDragStart={(event) => { event.dataTransfer.setData("application/x-nexora-index", String(index)); event.dataTransfer.effectAllowed = "move"; setDragging(component.id); }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                  onDragOver={(event) => dragOverBlock(index, component, event)}
                  onDrop={(event) => dropAt(drop === "after" ? index + 1 : index, event)}>
                  <span className="pd-block-label">{titleFor(component.type)} · {spanOf(component)}/12</span>
                  {isSelected && canEdit && <div className="pd-block-toolbar" onClick={(event) => event.stopPropagation()}>
                    <button type="button" title="Yukarı taşı (Alt+↑)" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => moveComponent(index, -1)}><ArrowUp size={13}/></button>
                    <button type="button" title="Aşağı taşı (Alt+↓)" aria-label="Aşağı taşı" disabled={index === definition.components.length - 1} onClick={() => moveComponent(index, 1)}><ArrowDown size={13}/></button>
                    <button type="button" title="Kopyala (Ctrl+D)" aria-label="Kopyala" onClick={() => duplicateComponent(component.id)}><Copy size={13}/></button>
                    <button type="button" title="Sil (Delete)" aria-label="Sil" className="danger" onClick={() => removeComponent(component.id)}><Trash2 size={13}/></button>
                  </div>}
                  <div className="pd-block-render">{rendered[index]}</div>
                  {isSelected && canEdit && device === "desktop" && <span className="pd-resize" role="presentation" title="Genişliği sürükleyerek değiştirin" onPointerDown={(event) => startResize(component, event)} onClick={(event) => event.stopPropagation()}/>}
                </div>;
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="pd-right" aria-label={rightMode === "history" ? "Sürüm geçmişi" : "Özellikler"}>
        {rightMode === "history" ? <div className="pd-right-body">
          <div className="pd-right-head"><History size={16}/><div><b>Sürüm geçmişi</b><small>Geri yükleme yayımlanmış sayfada yeni taslak, açık taslakta yeni revizyon oluşturur.</small></div><button type="button" className="pd-icon-button" aria-label="Kapat" onClick={() => setRightMode("inspector")}><X size={15}/></button></div>
          {history.length === 0 ? <p className="pd-empty-note">Bu sayfa için geçmiş sürüm bulunamadı.</p> : <ol className="pd-history">{history.map((revision) => <li key={revision.id}><div><b>#{revision.revision} · {revision.changeKind}</b><small>{new Date(revision.createdAt).toLocaleString("tr-TR")}</small><small>{revision.name}</small></div>{(current?.isPublished ? capabilities?.canCreate : capabilities?.canUpdate) && <button type="button" className="pd-button small" onClick={() => void restoreRevision(revision.id)} disabled={saving}>Geri yükle</button>}</li>)}</ol>}
        </div> : selected ? <div className="pd-right-body">
          <div className="pd-right-head"><SelectedIcon size={16}/><div><b>{titleFor(selected.type)}</b><small>{selected.id}</small></div><button type="button" className="pd-icon-button" aria-label="Seçimi kaldır" title="Sayfa ayarlarına dön (Esc)" onClick={() => setSelectedComponentId(null)}><X size={15}/></button></div>
          <fieldset className="pd-fieldset" disabled={!canEdit}>
            {(contentFields[selected.type].length > 0 || Object.keys(selected.props).some((key) => !managedKeys.has(key))) && section("content", "İçerik", <>
              {contentFields[selected.type].map((field) => {
                const value = selected.props[field.key];
                if (field.kind === "variant") return <label key={field.key} className="pd-field">{field.label}<div className="pd-segment">{variantOptions.map((option) => <button type="button" key={option.value} className={`tone-${option.value} ${String(value ?? "info") === option.value ? "active" : ""}`} onClick={() => updateComponent(selected.id, field.key, option.value)}>{option.label}</button>)}</div></label>;
                if (field.kind === "textarea") return <label key={field.key} className="pd-field">{field.label}<textarea rows={3} value={String(value ?? "")} onChange={(event) => updateComponent(selected.id, field.key, event.target.value)}/></label>;
                if (field.kind === "number") return <label key={field.key} className="pd-field">{field.label}<div className="pd-range"><input type="range" min={0} max={100} value={Number(value) || 0} onChange={(event) => updateComponent(selected.id, field.key, Number(event.target.value))}/><input type="number" min={0} max={100} value={Number(value) || 0} onChange={(event) => updateComponent(selected.id, field.key, Math.max(0, Math.min(100, Number(event.target.value))))}/></div></label>;
                return <label key={field.key} className="pd-field">{field.label}<input value={String(value ?? "")} maxLength={field.key === "label" ? 60 : 200} onChange={(event) => updateComponent(selected.id, field.key, event.target.value)}/></label>;
              })}
              {Object.entries(selected.props).filter(([key]) => !managedKeys.has(key)).map(([key, value]) => <label key={key} className="pd-field">{key}<input value={Array.isArray(value) ? value.join(", ") : String(value)} onChange={(event) => updateComponent(selected.id, key, event.target.value)}/></label>)}
              {selected.type === "list" && <label className="pd-field">Liste öğeleri<small>Her satıra bir madde yazın.</small><textarea rows={5} value={Array.isArray(selected.props.items) ? selected.props.items.join("\n") : ""} onChange={(event) => updateComponent(selected.id, "items", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}/></label>}
            </>)}
            {(selected.type === "metric" || selected.type === "dataTable") && section("data", "Veri", <>
              <label className="pd-field">Veri kaynağı<select value={String(selected.props.source || "")} onChange={(event) => { const source = sources.find((item) => item.code === event.target.value); updateComponent(selected.id, "source", event.target.value); if (selected.type === "dataTable") updateComponent(selected.id, "columns", (source?.columns ?? []).slice(0, 5).map((column) => column.code)); }}><option value="">Veri kaynağı seçin</option>{sources.map((source) => <option key={source.code} value={source.code}>{source.label}</option>)}</select>{sources.length === 0 && <small>Kaynak kataloğu yüklenemedi veya erişilebilir kaynak yok.</small>}</label>
              {selected.type === "dataTable" && selectedSource && <div className="pd-field">Kolonlar<small>{selectedColumns.length} seçili · sırayı oklarla değiştirin.</small><ul className="pd-columns">
                {[...selectedColumns.map((columnCode) => selectedSource.columns.find((column) => column.code === columnCode) ?? { code: columnCode, label: columnCode, dataType: "text" }), ...selectedSource.columns.filter((column) => !selectedColumns.includes(column.code))].map((column) => {
                  const position = selectedColumns.indexOf(column.code);
                  const moveColumn = (delta: number) => { const next = [...selectedColumns]; const target = position + delta; if (target < 0 || target >= next.length) return; [next[position], next[target]] = [next[target], next[position]]; updateComponent(selected.id, "columns", next); };
                  return <li key={column.code} className={position >= 0 ? "is-on" : ""}>
                    <label><input type="checkbox" checked={position >= 0} onChange={(event) => updateComponent(selected.id, "columns", event.target.checked ? [...selectedColumns, column.code] : selectedColumns.filter((item) => item !== column.code))}/><span>{column.label}</span></label>
                    {position >= 0 && <span className="pd-column-actions"><button type="button" aria-label={`${column.label} kolonunu yukarı taşı`} disabled={position === 0} onClick={() => moveColumn(-1)}><ArrowUp size={12}/></button><button type="button" aria-label={`${column.label} kolonunu aşağı taşı`} disabled={position === selectedColumns.length - 1} onClick={() => moveColumn(1)}><ArrowDown size={12}/></button></span>}
                  </li>;
                })}
              </ul></div>}
            </>)}
            {selected.type === "dataTable" && section("rowActions", "Satır işlemi", <>
              <label className="pd-check"><input type="checkbox" checked={selected.props.rowActionsEnabled === true} onChange={(event) => updateComponent(selected.id, "rowActionsEnabled", event.target.checked)}/>İşlemler kolonunu göster</label>
              {selected.props.rowActionsEnabled === true && <>
                <label className="pd-field">Düğme metni<input value={String(selected.props.rowActionLabel || "İşlemi başlat")} maxLength={60} onChange={(event) => updateComponent(selected.id, "rowActionLabel", event.target.value)}/></label>
                <label className="pd-field">İş akışı<select value={String(selected.props.rowActionWorkflowId || "")} onChange={(event) => updateComponent(selected.id, "rowActionWorkflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce yayımlanmış bir iş akışı oluşturun.</small>}</label>
              </>}
            </>)}
            {selected.type === "button" && section("action", "Eylem", <label className="pd-field">İş akışı<select value={String(selected.props.workflowId || "")} onChange={(event) => updateComponent(selected.id, "workflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce İş akışları bölümünde bir akış oluşturup yayımlayın.</small>}</label>)}
            {selected.type === "form" && section("form", "Form", <>
              <label className="pd-field">Yayımlanmış form<select value={String(selected.props.formCode || "")} onChange={(event) => updateComponent(selected.id, "formCode", event.target.value)}><option value="">Form seçin</option>{forms.map((form) => <option key={form.id} value={form.code}>{form.name} · {form.code}</option>)}</select></label>
              <button type="button" className="pd-button small" onClick={() => setFormEditorOpen(true)}><FilePlus2 size={13}/>Formu tanımla / düzenle</button>
            </>)}
            {selected.type === "code" && section("code", "Kod", <>
              <label className="pd-field">CSS<small>Yalnızca iframe içeriğine uygulanır; dış ağ kaynaklarına izin verilmez.</small><textarea className="pd-code" rows={6} maxLength={4000} value={String(selected.props.css || "")} onChange={(event) => updateComponent(selected.id, "css", event.target.value)} placeholder=".panel { display: grid; gap: 1rem; }"/></label>
              <label className="pd-field">JavaScript<small>Yalıtılmış iframe içinde çalışır; ERP oturumuna ve API'lere erişemez.</small><textarea className="pd-code" rows={8} maxLength={4000} value={String(selected.props.javascript || "")} onChange={(event) => updateComponent(selected.id, "javascript", event.target.value)} placeholder="document.body.textContent = 'Merhaba';"/></label>
            </>)}
            {section("style", "Görünüm", <>
              <div className="pd-field">Genişlik<small>Tuvalde bloğun sağ kenarını sürükleyerek de değiştirebilirsiniz.</small><div className="pd-segment">{[3, 4, 6, 8, 9, 12].map((width) => <button type="button" key={width} className={spanOf(selected) === width ? "active" : ""} onClick={() => updateComponent(selected.id, "width", width)}>{width}</button>)}{![3, 4, 6, 8, 9, 12].includes(spanOf(selected)) && <button type="button" className="active">{spanOf(selected)}</button>}</div></div>
              <div className="pd-field-row">
                <label className="pd-field">İç boşluk<input type="number" min="0" max="64" value={Number(selected.props.padding ?? defaultPadding(selected.type))} onChange={(event) => updateComponent(selected.id, "padding", event.target.value)}/></label>
                <label className="pd-field">Dış boşluk<input type="number" min="0" max="64" value={Number(selected.props.margin ?? 0)} onChange={(event) => updateComponent(selected.id, "margin", event.target.value)}/></label>
                <label className="pd-field">Köşe<input type="number" min="0" max="32" value={Number(selected.props.borderRadius ?? 12)} onChange={(event) => updateComponent(selected.id, "borderRadius", event.target.value)}/></label>
              </div>
              {([["backgroundColor", "Arka plan", "#ffffff"], ["textColor", "Metin rengi", "#172554"]] as const).map(([key, label, fallback]) => <div className="pd-field" key={key}>{label}<div className="pd-color"><input type="color" aria-label={label} value={String(selected.props[key] ?? fallback)} onChange={(event) => updateComponent(selected.id, key, event.target.value)}/><span>{typeof selected.props[key] === "string" ? String(selected.props[key]) : "Tema rengi"}</span>{typeof selected.props[key] === "string" && <button type="button" className="pd-button small" onClick={() => clearProp(selected.id, key)}>Sıfırla</button>}</div></div>)}
            </>)}
          </fieldset>
          {canEdit && <div className="pd-inspector-footer">
            <button type="button" className="pd-button small" disabled={selectedIndex <= 0} onClick={() => moveComponent(selectedIndex, -1)}><ArrowUp size={13}/>Yukarı</button>
            <button type="button" className="pd-button small" onClick={() => duplicateComponent(selected.id)}><Copy size={13}/>Kopyala</button>
            <button type="button" className="pd-button small danger" onClick={() => removeComponent(selected.id)}><Trash2 size={13}/>Sil</button>
          </div>}
        </div> : <div className="pd-right-body">
          <div className="pd-right-head"><Settings2 size={16}/><div><b>Sayfa ayarları</b><small>Bir bileşeni düzenlemek için tuvalde seçin.</small></div></div>
          <fieldset className="pd-fieldset" disabled={!canEdit}>
            <label className="pd-field">Sayfa adı<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Satış özeti"/></label>
            <label className="pd-field">Sayfa kodu<small>{current ? "Kaydedildikten sonra değiştirilemez." : "Adres olarak kullanılır: küçük harf, rakam, - ve _."}</small><input maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))} placeholder="satis-ozeti" disabled={!!current}/></label>
            <label className="pd-field">Açıklama<textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Bu sayfanın amacı"/></label>
          </fieldset>
          <dl className="pd-facts">
            <div><dt>Durum</dt><dd>{status.label}</dd></div>
            <div><dt>Sürüm</dt><dd>{current ? current.revision : "—"}</dd></div>
            <div><dt>Bileşen</dt><dd>{definition.components.length}</dd></div>
            <div><dt>Son kayıt</dt><dd>{current ? new Date(current.updatedAt).toLocaleString("tr-TR") : "Kaydedilmedi"}</dd></div>
          </dl>
          <div className="pd-shortcuts"><b>Kısayollar</b><span><kbd>Ctrl</kbd>+<kbd>S</kbd> Kaydet</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> Geri al / yinele</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> Kopyala</span><span><kbd>Delete</kbd> Sil · <kbd>Alt</kbd>+<kbd>↑↓</kbd> Taşı</span></div>
          {current && capabilities?.canDelete && <button type="button" className="pd-button small danger pd-delete-page" onClick={() => void deleteCurrent()} disabled={saving}><Trash2 size={13}/>Sayfayı sil</button>}
        </div>}
      </aside>
    </div>
    {formEditorOpen && <div className="custom-pages-form-popup" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFormEditorOpen(false); void refreshForms(); } }}><section role="dialog" aria-modal="true" aria-label="Form tasarımcısı"><header><div><b>Form tasarımcısı</b><small>Formu oluşturun, alanları düzenleyin ve yayımlayın.</small></div><button type="button" onClick={() => { setFormEditorOpen(false); void refreshForms(); }}>Kapat</button></header><CustomFormsPage token={token} role={role}/></section></div>}
  </main>;
}
