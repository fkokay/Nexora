import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, FilePlus2, Grid3X3, History, LayoutTemplate, Plus, Save, Send, Trash2 } from "lucide-react";
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
type PageComponent = { id: string; type: ComponentType; props: Record<string, string | number | boolean | string[]> };
type PageDefinition = { schemaVersion: 1; components: PageComponent[] };
const palette: { type: ComponentType; label: string; sample: PageComponent["props"] }[] = [
  { type: "heading", label: "Başlık", sample: { text: "Sayfa başlığı" } },
  { type: "text", label: "Açıklama", sample: { text: "Kısa bir açıklama yazın." } },
  { type: "metric", label: "Veri göstergesi", sample: { title: "Toplam kayıt", description: "Seçilen kaynaktaki kayıt sayısı", source: "customers" } },
  { type: "card", label: "Bilgi kartı", sample: { title: "Bilgi kartı", description: "Kart açıklaması" } },
  { type: "section", label: "Bölüm başlığı", sample: { title: "Yeni bölüm" } },
  { type: "divider", label: "Ayırıcı", sample: {} },
  { type: "spacer", label: "Boşluk", sample: {} },
  { type: "button", label: "Eylem düğmesi", sample: { label: "İşlem", variant: "primary", actionType: "workflow", workflowId: "" } },
  { type: "dataTable", label: "Izgara", sample: { title: "Kayıtlar", source: "customers", columns: ["code", "name", "type"], rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" } },
  { type: "form", label: "Özel form", sample: { title: "Form", formCode: "" } },
  { type: "code", label: "Yalıtılmış kod alanı", sample: { title: "Özel bileşen", css: "", javascript: "" } },
  { type: "alert", label: "Bildirim kutusu", sample: { title: "Bilgilendirme", text: "Kullanıcıya kısa bir açıklama gösterin.", variant: "info" } },
  { type: "badge", label: "Durum rozeti", sample: { label: "Aktif", variant: "success" } },
  { type: "list", label: "Madde listesi", sample: { title: "Öne çıkanlar", items: ["Birinci madde", "İkinci madde"] } },
  { type: "progress", label: "İlerleme göstergesi", sample: { title: "Tamamlanma", value: 65 } },
];
const emptyDefinition: PageDefinition = { schemaVersion: 1, components: [] };
const titleFor = (type: ComponentType) => palette.find((item) => item.type === type)?.label ?? type;
const defaultSpan = (type: ComponentType) => type === "metric" ? 3 : type === "heading" || type === "text" || type === "divider" || type === "spacer" ? 12 : 6;
const componentStyle = (type: ComponentType, props: PageComponent["props"]): CSSProperties => {
  const bounded = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = value === "" || value == null ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  return {
    gridColumn: `span ${bounded(props.width, defaultSpan(type), 1, 12)}`,
    margin: `${bounded(props.margin, 0, 0, 64)}px`,
    padding: `${bounded(props.padding, ["card", "section", "dataTable", "metric", "form"].includes(type) ? 16 : 0, 0, 64)}px`,
    backgroundColor: typeof props.backgroundColor === "string" ? props.backgroundColor : undefined,
    color: typeof props.textColor === "string" ? props.textColor : undefined,
    borderRadius: `${bounded(props.borderRadius, 12, 0, 32)}px`,
  };
};
const codePreview = (css: string, javascript: string) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none';"><style>html,body{margin:0;padding:12px;font:14px system-ui,sans-serif;color:#172554}*{box-sizing:border-box}${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="nexora-root">Özel kod bileşeni</div><script>${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;

export default function CustomPagesPage({ token, role, platformOrigin, initialPageId, initialCreate = false, embedded = false }: { token: string; role: string; platformOrigin?: string; initialPageId?: string | null; initialCreate?: boolean; embedded?: boolean }) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [history, setHistory] = useState<PageRevision[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const initialActionDone = useRef(false);
  const canEdit = current
    ? !current.isPublished && !!capabilities?.canUpdate
    : !!capabilities?.canCreate;

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
  useEffect(() => {
    void request<CustomFormSummary[]>("/api/custom-forms/")
      .then((items) => setForms(items.filter((item) => item.status === "Published")))
      .catch(() => setForms([]));
  }, [request]);
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
  useEffect(() => {
    let active = true;
    if (!preview && !embedded) { setPreviewData({}); return () => { active = false; }; }
    setPreviewData({});
    const bound = definition.components.filter((item) =>
      (item.type === "metric" || item.type === "dataTable") && typeof item.props.source === "string" && item.props.source,
    );
    void Promise.all(bound.map(async (component) => {
      const source = String(component.props.source);
      try {
        if (source.startsWith("tenantData:")) {
          const code = source.slice("tenantData:".length);
          const data = await request<{ total: number; items: { id: string; values: Record<string, unknown> }[] }>(
            `/api/custom-data/entities/${encodeURIComponent(code)}/records?page=1&pageSize=5`,
          );
          return [component.id, { totalCount: data.total, rows: data.items.map((item) => ({ id: item.id, ...item.values })) }] as const;
        }
        const selected = sources.find((item) => item.code === source);
        if (!selected) return [component.id, { totalCount: 0, rows: [] }] as const;
        const chosen = Array.isArray(component.props.columns)
          ? component.props.columns.filter((column): column is string => typeof column === "string")
          : [];
        const columns = component.type === "metric"
          ? [selected.columns[0]?.code].filter((column): column is string => !!column)
          : chosen.filter((code) => selected.columns.some((column) => column.code === code)).slice(0, 12);
        const requestColumns = columns.length ? columns : selected.columns.slice(0, 5).map((column) => column.code);
        const result = await request<{ totalCount: number; rows: Record<string, unknown>[] }>("/api/reports/run", {
          method: "POST",
          body: JSON.stringify({ source, columns: requestColumns, filters: [], sortBy: requestColumns[0] ?? "", descending: false, page: 1, pageSize: 5 }),
        });
        return [component.id, { totalCount: result.totalCount, rows: result.rows }] as const;
      } catch {
        return [component.id, { totalCount: 0, rows: [] }] as const;
      }
    })).then((entries) => { if (active) setPreviewData(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [preview, embedded, definition, sources, request]);

  const resetEditor = () => {
    setCurrent(null); setCreating(false); setName(""); setCode(""); setDescription(""); setDefinition(emptyDefinition); setSelectedComponentId(null); setPreview(false); setHistory([]); setHistoryOpen(false); setError(""); setNotice("");
  };
  const openPage = async (item: PageSummary) => {
    setError(""); setNotice(""); setSaving(true);
    try {
      const detail = await request<PageDetail>(`/api/custom-pages/${item.id}`);
      setCurrent(detail); setName(detail.name); setCode(detail.code); setDescription(detail.description || "");
      const loadedDefinition = JSON.parse(detail.definitionJson) as PageDefinition;
      setDefinition(loadedDefinition); setSelectedComponentId(loadedDefinition.components[0]?.id ?? null); setPreview(false); setHistoryOpen(false);
      await refreshHistory(item.id);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const startNew = () => { resetEditor(); setCreating(true); setNotice("Yeni sayfa taslağı hazırlayın; yayımlanana kadar kullanıcılar görmez."); };
  const startCustomerListTemplate = () => {
    if (!capabilities?.canCreate) { setError("Yeni taslak oluşturma yetkiniz yok."); return; }
    resetEditor();
    const baseCode = "cari-listesi";
    let nextCode = baseCode;
    let suffix = 2;
    while (pages.some((page) => page.code === nextCode)) nextCode = `${baseCode}-${suffix++}`;
    const headingId = `heading-${crypto.randomUUID().slice(0, 8)}`;
    const textId = `text-${crypto.randomUUID().slice(0, 8)}`;
    const gridId = `dataTable-${crypto.randomUUID().slice(0, 8)}`;
    setCreating(true);
    setName("Cari Hesaplar");
    setCode(nextCode);
    setDescription("Müşteri ve tedarikçi cari kayıtlarını tek bir ızgarada görüntüleyin.");
    setDefinition({ schemaVersion: 1, components: [
      { id: headingId, type: "heading", props: { text: "Cari Hesaplar", width: 12 } },
      { id: textId, type: "text", props: { text: "Cari kayıtlarınızı görüntüleyin ve ihtiyacınıza göre gösterilecek alanları seçin.", width: 12 } },
      { id: gridId, type: "dataTable", props: { title: "Cari listesi", source: "customers", columns: ["code", "name", "type", "currencyCode", "riskLimit", "paymentTermDays", "isActive"], width: 12, padding: 16, rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" } },
    ] });
    setSelectedComponentId(headingId);
    setNotice("Cari listesi şablonu hazır. Izgarayı seçerek alanları ve görünümü düzenleyin; ardından taslak olarak kaydedin.");
  };
  const createFromPublished = async (page: PageSummary) => {
    if (!capabilities?.canCreate) { setError("Yeni taslak oluşturma yetkiniz yok."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const published = await request<PageDetail>(`/api/custom-pages/${encodeURIComponent(page.code)}/published`);
      const detail = await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: page.code, name: page.name, description: page.description, definition: JSON.parse(published.definitionJson) }) });
      await openPage(detail);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const deletePage = async (page: PageSummary) => {
    if (!capabilities?.canDelete) { setError("Sayfa silme yetkiniz yok."); return; }
    if (!window.confirm(`“${page.name}” sayfası silinsin mi? Yayımlanmışsa ERP'den de kaldırılır.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await request<void>(`/api/custom-pages/${page.id}`, { method: "DELETE" });
      if (current?.id === page.id) resetEditor();
      await refresh();
      setNotice(`“${page.name}” sayfası silindi.`);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const addComponent = (item: typeof palette[number], at?: number) => {
    if (!canEdit) return;
    const id = `${item.type}-${crypto.randomUUID().slice(0, 8)}`;
    setSelectedComponentId(id);
    setDefinition((value) => {
      const components = [...value.components];
      components.splice(at == null ? components.length : Math.max(0, Math.min(at, components.length)), 0, { id, type: item.type, props: { ...item.sample } });
      return { ...value, components };
    });
  };
  const dropOnComponent = (targetIndex: number, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit) return;
    const type = event.dataTransfer.getData("application/x-nexora-component");
    const rawFrom = event.dataTransfer.getData("application/x-nexora-index");
    const from = rawFrom === "" ? Number.NaN : Number(rawFrom);
    if (type) {
      const item = palette.find((entry) => entry.type === type);
      if (item) addComponent(item, targetIndex);
    } else if (Number.isInteger(from) && from >= 0 && from < definition.components.length) {
      setDefinition((state) => {
        const components = [...state.components];
        const [moved] = components.splice(from, 1);
        const insertionIndex = from < targetIndex ? targetIndex - 1 : targetIndex;
        components.splice(Math.max(0, Math.min(insertionIndex, components.length)), 0, moved);
        return { ...state, components };
      });
    }
    setDragging(null);
  };
  const updateComponent = (id: string, key: string, value: string | string[] | number | boolean) => { if (!canEdit) return; setDefinition((state) => ({ ...state, components: state.components.map((component) => component.id === id ? { ...component, props: { ...component.props, [key]: ["width", "margin", "padding", "borderRadius"].includes(key) ? Number(value) : value } } : component) })); };
  const removeComponent = (id: string) => { if (!canEdit) return; setDefinition((state) => ({ ...state, components: state.components.filter((component) => component.id !== id) })); setSelectedComponentId((selected) => selected === id ? null : selected); };
  const duplicateComponent = (id: string) => {
    if (!canEdit) return;
    const original = definition.components.find((component) => component.id === id);
    if (!original) return;
    const copyId = `${original.type}-${crypto.randomUUID().slice(0, 8)}`;
    const duplicate: PageComponent = { ...original, id: copyId, props: Object.fromEntries(Object.entries(original.props).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) };
    setDefinition((state) => {
      const index = state.components.findIndex((component) => component.id === id);
      if (index < 0) return state;
      const components = [...state.components];
      components.splice(index + 1, 0, duplicate);
      return { ...state, components };
    });
    setSelectedComponentId(copyId);
  };
  const moveComponent = (index: number, delta: number) => { if (!canEdit) return; setDefinition((state) => {
    const next = [...state.components]; const target = index + delta;
    if (target < 0 || target >= next.length) return state;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...state, components: next };
  }); };
  const saveDraft = async () => {
    if (!canEdit) { setError("Bu sayfayı düzenleme yetkiniz yok."); return null; }
    if (!name.trim() || !code.trim()) { setError("Sayfa adı ve kodu gerekli."); return null; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = current
        ? await request<PageDetail>(`/api/custom-pages/${current.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: current.revision, name, description: description || null, definition }) })
        : await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: code.trim(), name, description: description || null, definition }) });
      setCurrent(result); setCode(result.code); setNotice("Taslak kaydedildi. Yayımlanana kadar aktif sayfa değişmez.");
      if (current) await refreshHistory(result.id);
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
      const savedDefinition = current ? (() => {
        try { return JSON.stringify(JSON.parse(current.definitionJson)); }
        catch { return ""; }
      })() : "";
      const hasChanges = !current || current.name !== name
        || (current.description || "") !== (description || "")
        || savedDefinition !== JSON.stringify(definition);
      const saved = hasChanges ? await saveDraft() : current;
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
    if (!current) { setError("Önce taslağı kaydedin."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await request<PageDetail>(`/api/custom-pages/${current.id}/publish`, { method: "POST", body: JSON.stringify({ expectedRevision: current.revision }) });
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
    setSaving(true); setError(""); setNotice("");
    try {
      const restored = current.isPublished
        ? await request<PageDetail>(`/api/custom-pages/${current.id}/restore/${revisionId}`, { method: "POST" })
        : await request<PageDetail>(`/api/custom-pages/${current.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: current.revision, name: revision.name, description: revision.description, definition: JSON.parse(revision.definitionJson) }) });
      setCurrent(restored); setName(restored.name); setCode(restored.code); setDescription(restored.description || "");
      const restoredDefinition = JSON.parse(restored.definitionJson) as PageDefinition;
      setDefinition(restoredDefinition); setSelectedComponentId(restoredDefinition.components[0]?.id ?? null); setHistoryOpen(false);
      setNotice("Geçmiş sürüm yeni taslak olarak açıldı; yayımlanan sayfa değişmedi.");
      await refreshHistory(restored.id);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const rendered = useMemo(() => definition.components.map((component) => {
    const props = component.props;
    switch (component.type) {
      case "heading": return <h2 key={component.id} className="custom-page-preview-heading" style={componentStyle(component.type, props)}>{String(props.text || props.title || "Başlık")}</h2>;
      case "text": return <p key={component.id} className="custom-page-preview-text" style={componentStyle(component.type, props)}>{String(props.text || "Metin")}</p>;
      case "metric": { const data = previewData[component.id]; return <article key={component.id} className="custom-page-preview-metric" style={componentStyle(component.type, props)}><small>{String(props.title || "Gösterge")}</small><b>{!props.source ? "Veri kaynağı seçin" : data ? data.totalCount.toLocaleString("tr-TR") : "Yükleniyor…"}</b><span>{String(props.description || sources.find((source) => source.code === props.source)?.label || "")}</span></article>; }
      case "card": case "section": return <article key={component.id} className="custom-page-preview-card" style={componentStyle(component.type, props)}><b>{String(props.title || titleFor(component.type))}</b>{props.description && <p>{String(props.description)}</p>}</article>;
      case "divider": return <hr key={component.id} style={componentStyle(component.type, props)} />;
      case "spacer": return <div key={component.id} className="custom-page-preview-spacer" style={componentStyle(component.type, props)} />;
      case "button": return <div key={component.id} className="custom-page-preview-action" style={componentStyle(component.type, props)}><button type="button" className="custom-page-preview-button">{String(props.label || "İşlem")}</button></div>;
      case "dataTable": { const source = sources.find((item) => item.code === props.source); const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string") : []; const data = previewData[component.id]; const visibleColumns = columns.map((column) => source?.columns.find((field) => field.code === column) ?? { code: column, label: column, dataType: "text" }); const hasRowAction = props.rowActionsEnabled === true; const hasWorkflow = typeof props.rowActionWorkflowId === "string" && !!props.rowActionWorkflowId; return <article key={component.id} className="custom-page-preview-card" style={componentStyle(component.type, props)}><b>{String(props.title || "Liste")}</b><small>{source?.label || "Veri kaynağı seçilmedi"}</small>{!props.source ? <p>Önizleme için veri kaynağı seçin.</p> : !data ? <p role="status">Örnek kayıtlar yükleniyor…</p> : <div className="custom-page-preview-grid-scroll"><table className="custom-page-preview-grid"><thead><tr>{visibleColumns.map((column) => <th key={column.code}>{column.label}</th>)}{hasRowAction && <th scope="col">İşlemler</th>}</tr></thead><tbody>{data.rows.length === 0 ? <tr><td colSpan={visibleColumns.length + (hasRowAction ? 1 : 0)}>Kaynakta gösterilecek kayıt bulunamadı.</td></tr> : data.rows.map((row, rowIndex) => <tr key={String(row.id ?? rowIndex)}>{visibleColumns.map((column) => <td key={column.code}>{row[column.code] == null ? "—" : String(row[column.code])}</td>)}{hasRowAction && <td><button type="button" className="custom-page-preview-row-action" disabled={!hasWorkflow}>{String(props.rowActionLabel || "İşlemi başlat")}</button></td>}</tr>)}</tbody></table></div>}</article>; }
      case "form": return <article key={component.id} className="custom-page-preview-card" style={componentStyle(component.type, props)}><b>{String(props.title || "Form")}</b><p>{forms.find((form) => form.code === props.formCode)?.name || "Yayımlanmış form seçin"}</p></article>;
      case "code": return <iframe key={component.id} className="custom-page-code-preview" title={String(props.title || "Yalıtılmış kod önizlemesi")} sandbox="allow-scripts" referrerPolicy="no-referrer" style={componentStyle(component.type, props)} srcDoc={codePreview(String(props.css || ""), String(props.javascript || ""))} />;
      case "alert": { const variant = ["success", "warning", "danger", "info"].includes(String(props.variant)) ? String(props.variant) : "info"; return <article key={component.id} className={`custom-page-preview-alert tone-${variant}`} style={componentStyle(component.type, props)}><b>{String(props.title || "Bilgilendirme")}</b><p>{String(props.text || "")}</p></article>; }
      case "badge": { const variant = ["success", "warning", "danger", "info"].includes(String(props.variant)) ? String(props.variant) : "info"; return <span key={component.id} className={`custom-page-preview-badge tone-${variant}`} style={componentStyle(component.type, props)}>{String(props.label || "Durum")}</span>; }
      case "list": return <article key={component.id} className="custom-page-preview-card" style={componentStyle(component.type, props)}><b>{String(props.title || "Liste")}</b><ul>{(Array.isArray(props.items) ? props.items : []).map((item, itemIndex) => <li key={itemIndex}>{String(item)}</li>)}</ul></article>;
      case "progress": { const progress = Math.max(0, Math.min(100, Number(props.value) || 0)); return <article key={component.id} className="custom-page-preview-progress" style={componentStyle(component.type, props)}><div><b>{String(props.title || "İlerleme")}</b><span>{progress}%</span></div><progress max={100} value={progress} /></article>; }
    }
  }), [definition, forms, sources, previewData]);

  return <main className={`custom-pages-tool ${embedded ? "is-embedded" : ""}`}>
    {!embedded && <header className="custom-pages-header"><span className="custom-pages-header-icon"><LayoutTemplate size={21}/></span><div><span className="custom-pages-eyebrow">LOW-CODE SAYFA TASARIMI</span><h1>Sayfa tasarımcısı</h1><p>Izgara tabanlı sayfalar tasarlayın; bileşenler ortak tema ve boşluk kurallarıyla otomatik hizalanır.</p></div><div className="custom-pages-toolbar"><button type="button" onClick={startCustomerListTemplate} disabled={!capabilities?.canCreate} title={capabilities?.canCreate ? "" : "Sayfa oluşturma yetkisi bulunamadı"}><Grid3X3 size={15}/>Cari listesi şablonu</button><button type="button" className="custom-pages-primary" onClick={startNew} disabled={!capabilities?.canCreate} title={capabilities?.canCreate ? "" : "Sayfa oluşturma yetkisi bulunamadı"}><FilePlus2 size={16}/> Yeni sayfa</button></div></header>}
    {capabilities && !capabilities.canCreate && <div className="custom-pages-message error" role="status">Yeni sayfa oluşturmak için yetki gerekiyor. Tenant yöneticinizden Sayfa tasarımcısı oluşturma iznini açmasını isteyin.</div>}
    <div className={`custom-pages-layout ${embedded ? "is-embedded" : ""}`}>
      {!embedded && <aside className="custom-pages-catalog"><div className="custom-pages-panel-heading"><div><h2>Sayfalar</h2><p>{pages.length} taslak ve yayımlanmış sayfa</p></div><button type="button" title="Listeyi yenile" onClick={() => void refresh()}>↻</button></div>
        {loading ? <div className="custom-pages-empty">Sayfalar yükleniyor…</div> : pages.length === 0 ? <div className="custom-pages-empty"><LayoutTemplate size={23}/><b>Henüz özel sayfa yok</b><span>Yeni sayfa oluşturarak başlayın.</span></div> : <div className="custom-pages-list">{pages.map((page) => <div key={page.id} className={`custom-pages-list-item ${current?.id === page.id ? "selected" : ""}`}><button type="button" className="custom-pages-list-open" onClick={() => void openPage(page)}><span className="custom-pages-list-icon"><LayoutTemplate size={16}/></span><span className="custom-pages-list-copy"><b>{page.name}</b><small>/{page.code}</small></span><span className={`custom-pages-status ${page.isPublished ? "published" : "draft"}`}>{page.isPublished ? "Yayında" : "Taslak"}</span></button><button type="button" className="custom-pages-delete" aria-label={`${page.name} sayfasını sil`} title={capabilities?.canDelete ? "Sayfayı sil" : "Sayfa silme yetkisi bulunamadı"} onClick={() => void deletePage(page)} disabled={!capabilities?.canDelete || saving}><Trash2 size={14}/></button></div>)}</div>}
      </aside>}
      <section className={`custom-pages-workspace ${embedded ? "is-embedded" : ""}`}>
        {!current && !creating ? <div className="custom-pages-welcome"><span><LayoutTemplate size={28}/></span><h2>İşinize uygun sayfayı tasarlayın</h2><p>Bileşen ekleyin, önizleyin ve taslak olarak kaydedin. Yayınlama ayrı ve yetki kontrollü bir adımdır.</p>{capabilities?.canCreate && <button type="button" className="custom-pages-primary" onClick={startNew}><Plus size={16}/> Sayfa oluştur</button>}</div> : <>
          <div className="custom-pages-editor-heading"><div><span className="custom-pages-eyebrow">{current?.isPublished ? "YAYIMLANMIŞ SAYFA" : current ? "TASLAK DÜZENLEME" : "YENİ SAYFA"}</span><h2>{name || "Yeni sayfa"}</h2></div><div className="custom-pages-toolbar">{current && <button type="button" className={historyOpen ? "active" : ""} onClick={() => setHistoryOpen((value) => !value)}><History size={15}/>Sürüm geçmişi ({history.length})</button>}<button type="button" onClick={() => void openErpPreview()} disabled={saving}><Eye size={15}/>{current?.isPublished ? "ERP'de önizle" : "Taslağı önizle"}</button>{(current ? capabilities?.canUpdate : capabilities?.canCreate) && <button type="button" onClick={() => void saveDraft()} disabled={saving || !canEdit}><Save size={15}/>{saving ? "Kaydediliyor…" : "Taslağı kaydet"}</button>}{current && !current.isPublished && capabilities?.canPublish && <button type="button" className="custom-pages-primary" onClick={() => void publish()} disabled={saving}><Send size={15}/>Yayımla</button>}{current?.isPublished && capabilities?.canCreate && <button type="button" onClick={() => { const page = current; if (page) void createFromPublished(page); }} disabled={saving}><FilePlus2 size={15}/>Düzenle</button>}</div></div>
          {historyOpen && <section className="custom-pages-history"><div><b>Önceki sürümler</b><span>Geri yükleme, yayımlanmış sayfada yeni taslak; açık taslakta yeni revizyon oluşturur.</span></div>{history.length === 0 ? <p>Bu sayfa için geçmiş sürüm bulunamadı.</p> : history.map((revision) => <article key={revision.id}><div><b>#{revision.revision} · {revision.changeKind}</b><small>{new Date(revision.createdAt).toLocaleString("tr-TR")} · {revision.name}</small></div>{(current?.isPublished ? capabilities?.canCreate : capabilities?.canUpdate) && <button type="button" onClick={() => void restoreRevision(revision.id)} disabled={saving}>Bu sürümü geri yükle</button>}</article>)}</section>}
          <div className="custom-pages-metadata"><label>Sayfa adı<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Satış özeti" disabled={!canEdit}/></label><label>Sayfa kodu<input maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))} placeholder="satis-ozeti" disabled={!!current}/></label><label className="wide">Açıklama<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Bu sayfanın amacı" disabled={!canEdit}/></label></div>
          {error && <div className="custom-pages-message error" role="alert">{error}</div>}{notice && <div className="custom-pages-message success" role="status">{notice}</div>}
          <div className={`custom-pages-builder ${embedded ? "is-unified" : preview ? "is-preview" : ""}`}>
            {(!preview || embedded) && <aside className="custom-pages-palette"><h3>Bileşen ekle</h3><p>Sürükleyip tuvale bırakın veya eklemek için seçin.</p>{palette.map((item) => <button type="button" key={item.type} draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData("application/x-nexora-component", item.type); event.dataTransfer.effectAllowed = "copy"; setDragging(item.type); }} onDragEnd={() => setDragging(null)} onClick={() => addComponent(item)} disabled={!canEdit}><Plus size={14}/><span>{item.label}</span></button>)}</aside>}
            <section className="custom-pages-canvas"><div className="custom-pages-canvas-bar"><span>{preview && !embedded ? "Önizleme" : "Sayfa görünümü"}</span><div className="custom-pages-canvas-tools"><small>{definition.components.length} bileşen · 12 kolon</small>{(!preview || embedded) && <button type="button" className={showGrid ? "active" : ""} aria-pressed={showGrid} title="Izgara kılavuzlarını aç veya kapat" onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={14}/><span>Izgara</span></button>}</div></div>{definition.components.length === 0 ? <div className={`custom-pages-canvas-empty ${showGrid ? "show-grid" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnComponent(0, event)}><LayoutTemplate size={23}/><b>Sayfanız henüz boş</b><span>Bileşeni bu alana sürükleyin veya soldaki listeden seçin.</span></div> : preview && !embedded ? <div className="custom-pages-preview">{rendered}</div> : <div className="custom-pages-erp-shell"><div className="custom-pages-erp-topbar"><b>Nexora ERP</b><span>{name || "Yeni çalışma alanı sayfası"}</span><span>Önizleme taslağı</span></div><div className="custom-pages-erp-breadcrumb"><span>Ana Sayfa</span><span>›</span><b>{name || "Yeni sayfa"}</b></div><div className={`custom-pages-components ${showGrid ? "show-grid" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnComponent(definition.components.length, event)}>{definition.components.map((component, index) => {
              const selectedSource = sources.find((source) => source.code === component.props.source);
              const selectedColumns = Array.isArray(component.props.columns) ? component.props.columns : [];
              const span = Math.max(1, Math.min(12, Number(component.props.width) || defaultSpan(component.type)));
              return <article className={`custom-pages-component ${dragging === component.id ? "is-dragging" : ""} ${selectedComponentId === component.id ? "is-selected" : ""}`} key={component.id} style={{ gridColumn: `span ${span}` }} onClick={() => setSelectedComponentId(component.id)} draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData("application/x-nexora-index", String(index)); event.dataTransfer.effectAllowed = "move"; setDragging(component.id); }} onDragEnd={() => setDragging(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnComponent(index, event)}><div className="custom-pages-component-top"><span><b>{titleFor(component.type)}</b><small>{component.id}</small></span><div><button type="button" title="Yukarı taşı" onClick={() => moveComponent(index, -1)} disabled={index === 0 || !canEdit}><ArrowUp size={14}/></button><button type="button" title="Aşağı taşı" onClick={() => moveComponent(index, 1)} disabled={index === definition.components.length - 1 || !canEdit}><ArrowDown size={14}/></button><button type="button" title="Bileşeni kopyala" onClick={(event) => { event.stopPropagation(); duplicateComponent(component.id); }} disabled={!canEdit}><Copy size={14}/></button><button type="button" title="Kaldır" className="danger" onClick={() => removeComponent(component.id)} disabled={!canEdit}><Trash2 size={14}/></button></div></div><div className="custom-pages-design-render" aria-label="ERP bileşen önizlemesi">{rendered[index]}</div>{selectedComponentId === component.id && <div className="custom-pages-component-fields">{component.type === "form" && <><label>Yayımlanmış form<select value={String(component.props.formCode || "")} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "formCode", event.target.value)}><option value="">Form seçin</option>{forms.map((form) => <option key={form.id} value={form.code}>{form.name} · {form.code}</option>)}</select></label><div className="custom-pages-form-actions"><small>Form tasarımını Sayfalar alanından açın.</small><button type="button" onClick={(event) => { event.stopPropagation(); setFormEditorOpen(true); }} disabled={!canEdit}><FilePlus2 size={13}/>Formu tanımla / düzenle</button></div></>}{(component.type === "metric" || component.type === "dataTable") && <label className="custom-pages-source-field">Veri kaynağı<select value={String(component.props.source || "")} disabled={!canEdit} onChange={(event) => { const source = sources.find((item) => item.code === event.target.value); updateComponent(component.id, "source", event.target.value); if (component.type === "dataTable") updateComponent(component.id, "columns", (source?.columns ?? []).slice(0, 5).map((column) => column.code)); }}><option value="">Veri kaynağı seçin</option>{sources.map((source) => <option key={source.code} value={source.code}>{source.label}</option>)}</select>{sources.length === 0 && <small>Kaynak kataloğu yüklenemedi veya erişilebilir kaynak yok.</small>}</label>}{component.type === "dataTable" && <>{selectedSource && <fieldset className="custom-pages-column-picker"><legend>Gösterilecek kolonlar</legend><div>{selectedSource.columns.map((column) => <label key={column.code}><input type="checkbox" checked={selectedColumns.includes(column.code)} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "columns", event.target.checked ? [...selectedColumns, column.code] : selectedColumns.filter((code) => code !== column.code))} /><span>{column.label}</span></label>)}</div></fieldset>}<fieldset className="custom-pages-row-actions"><legend>Satır işlemleri</legend><label className="custom-pages-checkbox"><input type="checkbox" checked={component.props.rowActionsEnabled === true} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "rowActionsEnabled", event.target.checked)} />İşlemler kolonunu göster</label>{component.props.rowActionsEnabled === true && <><label>İşlem düğmesi metni<input value={String(component.props.rowActionLabel || "İşlemi başlat")} maxLength={60} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "rowActionLabel", event.target.value)} /></label><label>Satır işlemi iş akışı<select value={String(component.props.rowActionWorkflowId || "")} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "rowActionWorkflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Satır işlemini kullanmak için önce yayımlanmış bir iş akışı oluşturun.</small>}</label></>}</fieldset></>}{component.type === "button" && <label className="custom-pages-source-field">İş akışı<select value={String(component.props.workflowId || "")} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "workflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce İş akışları bölümünde bir akış oluşturup yayımlayın.</small>}</label>}{component.type === "list" && <label className="custom-pages-code-field">Liste öğeleri<small>Her satıra bir madde yazın.</small><textarea rows={5} value={Array.isArray(component.props.items) ? component.props.items.join("\n") : ""} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "items", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} /></label>}{component.type === "code" && <><label className="custom-pages-code-field">CSS stili<small>Yalnızca iframe içeriğine uygulanır; dış ağ kaynaklarına izin verilmez.</small><textarea rows={6} maxLength={4000} value={String(component.props.css || "")} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "css", event.target.value)} placeholder=".panel { display: grid; gap: 1rem; }" /></label><label className="custom-pages-code-field">JavaScript<small>Yalıtılmış iframe içinde çalışır; ERP oturumuna ve API'lere erişemez.</small><textarea rows={8} maxLength={4000} value={String(component.props.javascript || "")} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "javascript", event.target.value)} placeholder="document.body.textContent = 'Merhaba';" /></label></>}{Object.entries(component.props).filter(([key]) => !["formCode", "source", "columns", "workflowId", "rowActionsEnabled", "rowActionWorkflowId", "rowActionLabel", "actionType", "width", "margin", "padding", "backgroundColor", "textColor", "borderRadius", "css", "javascript", "items"].includes(key)).map(([key, value]) => <label key={key}>{key === "text" ? "Metin" : key === "title" ? "Başlık" : key === "label" ? "Düğme metni" : key === "value" ? "Değer" : key === "description" ? "Açıklama" : key}<input type={key === "value" && component.type === "progress" ? "number" : "text"} min={key === "value" && component.type === "progress" ? 0 : undefined} max={key === "value" && component.type === "progress" ? 100 : undefined} value={Array.isArray(value) ? value.join(", ") : String(value)} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, key, key === "value" && component.type === "progress" ? Number(event.target.value) : event.target.value)} /></label>)}<label>Izgara genişliği<select value={String(component.props.width ?? defaultSpan(component.type))} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "width", event.target.value)}>{[3,4,6,8,9,12].map((width) => <option key={width} value={width}>{width} / 12 kolon</option>)}</select></label><label>İç boşluk (px)<input type="number" min="0" max="64" value={Number(component.props.padding ?? (component.type === "card" || component.type === "section" || component.type === "dataTable" || component.type === "metric" ? 16 : 0))} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "padding", event.target.value)} /></label><label>Dış boşluk (px)<input type="number" min="0" max="64" value={Number(component.props.margin ?? 0)} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "margin", event.target.value)} /></label><label>Köşe yuvarlaklığı (px)<input type="number" min="0" max="32" value={Number(component.props.borderRadius ?? 12)} readOnly={!canEdit} onChange={(event) => updateComponent(component.id, "borderRadius", event.target.value)} /></label><label>Arka plan<input type="color" value={String(component.props.backgroundColor ?? "#ffffff")} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "backgroundColor", event.target.value)} /></label><label>Metin rengi<input type="color" value={String(component.props.textColor ?? "#172554")} disabled={!canEdit} onChange={(event) => updateComponent(component.id, "textColor", event.target.value)} /></label></div>}</article>;
            })}</div></div>}</section>
            {embedded && <aside className="custom-pages-live-preview"><header><span>CANLI ÖNİZLEME</span><b>{name || "Yeni sayfa"}</b><small>{description || "Sayfa açıklaması"}</small></header><div className="custom-pages-live-preview-content">{definition.components.length ? <div className="custom-pages-preview">{rendered}</div> : <div className="custom-pages-canvas-empty"><LayoutTemplate size={23}/><b>Önizleme için bileşen ekleyin</b><span>Soldaki bileşen listesinden sayfaya widget ekleyin.</span></div>}</div></aside>}
          </div>
          <footer className="custom-pages-editor-footer"><span>{current ? `Sürüm ${current.revision} · ${current.isPublished ? "Yayımlandı" : "Taslak"}` : "Henüz kaydedilmedi"}</span><span>Değişiklikler önce taslak olarak saklanır.</span></footer>
        </>}
      </section>
    </div>
    {formEditorOpen && <div className="custom-pages-form-popup" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormEditorOpen(false); }}><section role="dialog" aria-modal="true" aria-label="Form tasarımcısı"><header><div><b>Form tasarımcısı</b><small>Formu oluşturun, alanları düzenleyin ve yayımlayın.</small></div><button type="button" onClick={() => { setFormEditorOpen(false); void request<CustomFormSummary[]>("/api/custom-forms/").then((items) => setForms(items.filter((item) => item.status === "Published"))).catch(() => undefined); }}>Kapat</button></header><CustomFormsPage token={token} role={role}/></section></div>}  </main>;
}
