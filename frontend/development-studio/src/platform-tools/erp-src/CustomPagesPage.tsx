import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Activity, AlignLeft, AppWindow, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, ClipboardList, Code2, Copy, Database, Eye, FilePlus2, Filter, Gauge,
  Grid3X3, Heading1, History, ImageIcon, Info, Layers, LayoutTemplate, List, Lock, Maximize2, Minimize2, Minus, Monitor, MousePointerClick, MoveVertical, PanelRight, PanelTop, PanelsTopLeft, Plus, Redo2,
  Rows3, Save, Search, SquarePen, ListPlus, Send, Settings2, SlidersHorizontal, Smartphone, SquareStack, Table2, Tablet, Tag, TextCursorInput, Trash2, Type, Undo2, X, type LucideIcon,
} from "lucide-react";
import { authenticatedFetch } from "./authApi";
import CustomFormsPage from "./CustomFormsPage";
import CustomPageAccessPanel from "./CustomPageAccessPanel";
import { formatCell, parseColumnFormats } from "./page-designer/cellFormat";
import { ActionBarPreview, BadgePreview, ContextPanelPreview, CustomFieldsPreview, DialogPreview, EditableGridPreview, FacetPanelPreview, FilterChipsPreview, FormCardPreview, GridPreview, ImagePreview, LookupPreview, MetricPreview, TabsPreview, toneOf, type FacetPreviewGroup } from "./page-designer/CanvasPreviews";
import { ColumnFormatEditor, IconSelect, ToneMapEditor, ToneSelect, sanitizeSafeValue } from "./page-designer/DesignLanguageFields";
import BindingInput, { type BindingSuggestion } from "./page-designer/BindingInput";
import QueriesPanel, { MAX_QUERIES, NAME_PATTERN, isOperationQuery, isWriteKind, nameProblem, queryKindLabels, syncParameters, type PageQuery, type QueryParameterType, type QueryPreview } from "./page-designer/QueriesPanel";
import { ERP_WRITE_PREVIEW_BLOCKED, buildReadRequest, collectionParameterFor, findOperation, loadErpOperations, mapReadResult, unboundRequiredParameter, wireParameters, type ErpCatalog, type ErpOperation } from "./page-designer/erpOperations";
import type { SqlSchemaTable } from "./page-designer/SqlQueryEditor";
import { bindingPath, coerceParameter, interpolate, resolvePath, type PageScope } from "./page-designer/pageBindings";
import { collectTexts, COUNTS_ROOT, isCountableSource, referencedCountCodes } from "./page-designer/pageCounts";
import VariablesPanel from "./page-designer/VariablesPanel";
import { CodePreviewFrame } from "./page-designer/CodePreviewFrame";
import { MAX_JAVASCRIPT_LENGTH, type StubHostData } from "./page-designer/codeBridgeStub";
import { FieldListEditor, InputPicker, isSafeColumnCode, type PickerInput } from "./page-designer/LayoutFields";
import { actionBarOf, movedButtonIds } from "./page-designer/pageActions";
import { MAX_DIALOG_IDS, MAX_ROW_ACTIONS, chipText, dialogOwnedIds, idList, ownableCandidates, ownedInputIds, parseFieldList, parseTabs, rowActionIds, tabOwnedIds } from "./page-designer/layoutRefs";
import { MAX_SEQUENCE_STEPS, SequenceFields, parseSequenceWhen } from "./page-designer/SequenceFields";
import { RowActionsFields } from "./page-designer/RowActionsFields";
import { EditableGridFields } from "./page-designer/EditableGridFields";
import { CustomFieldsBlockFields } from "./page-designer/CustomFieldsBlockFields";
import { DialogFields, sequencePatch } from "./page-designer/DialogFields";
import { parseGridColumns } from "./page-designer/gridColumns";
import { conditionProblem } from "./page-designer/conditions";
import { ConditionFields } from "./page-designer/ConditionFields";
import { TabsFields, tabsValue, type TabEntry } from "./page-designer/TabsFields";
import { DEFAULT_PAGE_SIZE, MAX_FOOTER_META, MAX_PAGE_SIZE, MIN_PAGE_SIZE, PAGING_PROPS, isPagedTable, pageBinding, pageSizeBinding, pagedTableProblem, pagingParams, stripPagingProps, supportsServerPaging, tableSearchInputIds, withPagingBindings, withoutPagingBindings } from "./page-designer/paging";
import "./custom-pages.css";

type PageSummary = { id: string; code: string; name: string; description: string | null; revision: number; isPublished: boolean; updatedAt: string };
type PageDetail = PageSummary & { definitionJson: string };
type PageRevision = { id: string; revision: number; name: string; description: string | null; changeKind: string; changedByUserId: string; createdAt: string; definitionJson: string };
type CustomFormSummary = { id: string; code: string; name: string; status: string };
type WorkflowOption = { id: string; code: string; name: string; status: string };
type ReportSource = { code: string; label: string; columns: { code: string; label: string; dataType: string }[]; aggregates: { code: string; label: string }[] };
type PreviewData = { totalCount: number; rows: Record<string, unknown>[] };
type Capability = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canPublish: boolean; canDelete: boolean };
type ComponentType = "heading" | "text" | "label" | "input" | "metric" | "card" | "section" | "divider" | "spacer" | "button" | "dataTable" | "form" | "code" | "alert" | "badge" | "list" | "progress" | "formCard" | "contextPanel" | "filterChips" | "facetPanel" | "actionBar" | "tabs" | "editableGrid" | "customFieldsBlock" | "dialog" | "image";
type PropValue = string | number | boolean | string[];
type PageComponent = { id: string; type: ComponentType; name?: string; props: Record<string, PropValue>; children?: unknown };
// Studio her zaman schemaVersion 2 kaydeder; v1 tanımlar açılırken v2'ye yükseltilir (v1 içeriği v2'de de geçerlidir).
type PageDefinition = { schemaVersion: 2; queries: PageQuery[]; components: PageComponent[] };
type PaletteItem = { type: ComponentType; label: string; group: string; icon: LucideIcon; sample: PageComponent["props"] };
type Device = "desktop" | "tablet" | "mobile";
type DropTarget = { index: number; edge: "before" | "after" } | null;
type FieldSpec = { key: string; label: string; kind: "text" | "textarea" | "number" | "variant" };

const palette: PaletteItem[] = [
  { type: "actionBar", label: "İşlem Çubuğu", group: "Tasarım dili", icon: PanelTop, sample: {} },
  { type: "formCard", label: "Form kartı", group: "Tasarım dili", icon: ClipboardList, sample: { title: "Form kartı", inputs: [], columns: 2 } },
  { type: "contextPanel", label: "Bağlam paneli", group: "Tasarım dili", icon: PanelRight, sample: { title: "Bağlam paneli", fields: [] } },
  { type: "filterChips", label: "Filtre çipleri", group: "Tasarım dili", icon: Filter, sample: { inputs: [] } },
  { type: "facetPanel", label: "Yan filtre paneli", group: "Tasarım dili", icon: SlidersHorizontal, sample: { title: "Filtreler", inputs: [] } },
  { type: "tabs", label: "Sekmeler", group: "Tasarım dili", icon: PanelsTopLeft, sample: { tabs: ["Genel=", "Ayrıntı="], defaultTab: 0 } },
  { type: "dialog", label: "Pencere", group: "Tasarım dili", icon: AppWindow, sample: { title: "Pencere", contains: [], presentation: "dialog" } },
  { type: "heading", label: "Başlık", group: "Metin ve düzen", icon: Heading1, sample: { text: "Sayfa başlığı" } },
  { type: "text", label: "Açıklama", group: "Metin ve düzen", icon: AlignLeft, sample: { text: "Kısa bir açıklama yazın." } },
  { type: "label", label: "Etiket", group: "Metin ve düzen", icon: Type, sample: { text: "Etiket metni" } },
  { type: "card", label: "Bilgi kartı", group: "Metin ve düzen", icon: SquareStack, sample: { title: "Bilgi kartı", description: "Kart açıklaması" } },
  { type: "section", label: "Bölüm başlığı", group: "Metin ve düzen", icon: Rows3, sample: { title: "Yeni bölüm" } },
  { type: "divider", label: "Ayırıcı", group: "Metin ve düzen", icon: Minus, sample: {} },
  { type: "spacer", label: "Boşluk", group: "Metin ve düzen", icon: MoveVertical, sample: {} },
  { type: "dataTable", label: "Izgara", group: "Veri", icon: Table2, sample: { title: "Kayıtlar", source: "customers", columns: ["code", "name", "type"], rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" } },
  { type: "metric", label: "Veri göstergesi", group: "Veri", icon: Gauge, sample: { title: "Toplam kayıt", description: "Seçilen kaynaktaki kayıt sayısı", source: "customers", variant: "info", icon: "chart" } },
  { type: "progress", label: "İlerleme göstergesi", group: "Veri", icon: Activity, sample: { title: "Tamamlanma", value: 65 } },
  { type: "list", label: "Madde listesi", group: "Veri", icon: List, sample: { title: "Öne çıkanlar", items: ["Birinci madde", "İkinci madde"] } },
  { type: "image", label: "Görsel", group: "Veri", icon: ImageIcon, sample: { title: "Görsel", value: "", height: 160 } },
  { type: "button", label: "Eylem düğmesi", group: "Eylem ve form", icon: MousePointerClick, sample: { label: "İşlem", variant: "primary", actionType: "workflow", workflowId: "" } },
  { type: "form", label: "Özel form", group: "Eylem ve form", icon: ClipboardList, sample: { title: "Form", formCode: "" } },
  { type: "input", label: "Giriş kutusu", group: "Eylem ve form", icon: TextCursorInput, sample: { inputType: "text", label: "Giriş", placeholder: "", defaultValue: "" } },
  { type: "editableGrid", label: "Düzenlenebilir tablo", group: "Eylem ve form", icon: ListPlus, sample: { title: "Satırlar", gridMode: "list", gridColumns: ["code|Kod|text|required"] } },
  { type: "customFieldsBlock", label: "Özel alanlar", group: "Eylem ve form", icon: SquarePen, sample: { title: "Özel alanlar", columns: 2 } },
  { type: "alert", label: "Bildirim kutusu", group: "Bildirim ve gelişmiş", icon: Info, sample: { title: "Bilgilendirme", text: "Kullanıcıya kısa bir açıklama gösterin.", variant: "info" } },
  { type: "badge", label: "Durum rozeti", group: "Bildirim ve gelişmiş", icon: Tag, sample: { label: "Aktif", variant: "success" } },
  { type: "code", label: "Yalıtılmış kod alanı", group: "Bildirim ve gelişmiş", icon: Code2, sample: { title: "Özel bileşen", css: "", javascript: "" } },
];
const paletteGroups = ["Tasarım dili", "Metin ve düzen", "Veri", "Eylem ve form", "Bildirim ve gelişmiş"];
const blockedPreviewNotice = "Tarayıcı yeni pencereyi engelledi; önizleme hazır.";
const contentFields: Record<ComponentType, FieldSpec[]> = {
  heading: [{ key: "text", label: "Başlık metni", kind: "text" }],
  text: [{ key: "text", label: "Metin", kind: "textarea" }],
  label: [{ key: "text", label: "Etiket metni", kind: "textarea" }],
  input: [{ key: "label", label: "Etiket", kind: "text" }, { key: "placeholder", label: "Yer tutucu", kind: "text" }, { key: "defaultValue", label: "Varsayılan değer", kind: "text" }],
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
  formCard: [{ key: "title", label: "Başlık", kind: "text" }],
  contextPanel: [{ key: "title", label: "Başlık", kind: "text" }],
  filterChips: [],
  facetPanel: [{ key: "title", label: "Başlık", kind: "text" }],
  actionBar: [],
  tabs: [],
  editableGrid: [{ key: "title", label: "Başlık", kind: "text" }, { key: "description", label: "Açıklama", kind: "text" }],
  customFieldsBlock: [{ key: "title", label: "Başlık", kind: "text" }],
  dialog: [{ key: "title", label: "Başlık", kind: "text" }],
  image: [{ key: "title", label: "Alternatif metin", kind: "text" }],
};
// Keys the inspector edits with a dedicated control. Anything else found on a component
// (older or hand-written definitions) is still shown as a plain text field so it stays editable.
const managedKeys = new Set(["text", "title", "label", "description", "value", "variant", "formCode", "source", "columns", "workflowId", "rowActionsEnabled", "rowActionWorkflowId", "rowActionLabel", "actionType", "width", "margin", "padding", "backgroundColor", "textColor", "borderRadius", "css", "javascript", "hidden", "items", "query", "inputType", "placeholder", "defaultValue", "optionsQuery", "optionLabelColumn", "optionValueColumn", "queryId", "confirmEnabled", "confirmText", "refreshQueries", "successMessage", "errorMessage", "icon", "trendQuery", "filterInput", "filterValue", "toneMap", "density", "columnFormats", "totals", "inputs", "table", "fields", "relatedQuery", "relatedTitle", "facetCounts", "newInputs", "saveQuery", "deleteQuery", "focusInput", "printEnabled", "exportTable", "moreButtons",
  // Proje 2 Faz A: koşullar, sekmeler, arama kutusu, sunucu sayfalı liste ve doğrulama (sunucudaki SafePropsV2).
  "visibleWhen", "disabledWhen", "disabledReason", "tabs", "defaultTab", "optionDescriptionColumn", "minChars", "staticOptions", "allowClear",
  "paging", "pageParam", "pageSizeParam", "pageSize", "searchInput", "footerMeta", "required", "upperCase", "min", "max", "step", "maxLength", "pattern", "patternMessage",
  // Proje 2 Faz B: kayıt dizisi, satır işlemleri, gerekçe, düzenlenebilir tablo, özel alanlar, pencere, görsel ve değişiklik izleme.
  "saveSequence", "stopOnError", "sequenceWhen", "rowActions", "emptyText", "limit", "promptLabel", "promptRequired", "dialogId",
  "gridMode", "sourceQuery", "rowKey", "gridColumns", "maxRows", "addLabel", "fixedRowLabel", "matrixCode", "matrixName",
  "definitionsQuery", "valuesQuery", "contains", "presentation", "saveLabel", "closeOnSave", "resetOnOpen", "height", "fit", "recordKey", "trackChanges"]);
// schemaVersion 2'de {{yol}} ifadesi alabilen alanlar (sunucudaki BindableProps ile aynı). Düğmenin sorgu eylemi
// mesajları (confirmText, successMessage, errorMessage) "Eylem" bölümünde kendi BindingInput alanlarıyla düzenlenir.
const bindableKeys = new Set(["text", "title", "description", "label", "value", "placeholder", "defaultValue", "confirmText", "successMessage", "errorMessage", "disabledReason",
  "promptLabel", "fixedRowLabel", "matrixCode", "matrixName", "recordKey"]);
const inputTypeOptions = [{ value: "text", label: "Metin" }, { value: "number", label: "Sayı" }, { value: "date", label: "Tarih" }, { value: "checkbox", label: "Onay kutusu" }, { value: "select", label: "Açılır liste" }, { value: "lookup", label: "Arama kutusu" }];
/** Yalnız arama kutusunda (inputType lookup) geçerli özellikler; tür değişince silinir. */
const lookupReset: Record<string, undefined> = { optionDescriptionColumn: undefined, minChars: undefined, staticOptions: undefined, allowClear: undefined };
const LOOKUP_HELP = "Sunucuda aramak için sorgunun arama parametresini {{<ad>.search}} ile bağlayın; bağlamazsanız sonuçlar tarayıcıda süzülür.";
const STATIC_OPTION = /^[^=]{0,128}=[^=]{1,60}$/;
const MAX_STATIC_OPTIONS = 20;
/** Listenin sorgusu değişince sayfalama kalkar (yeni sorgunun sayfa bağlamaları yoktur). */
const pagingReset: Record<string, undefined> = Object.fromEntries(PAGING_PROPS.map((key) => [key, undefined]));
/** Arama kutusunun sabit seçenekleri ("değer=Etiket"; değer boş olabilir, ör. "=Tüm depolar"). */
const parseStaticOptions = (value: unknown) => (Array.isArray(value) ? value : [])
  .filter((entry): entry is string => typeof entry === "string" && STATIC_OPTION.test(entry))
  .map((entry) => ({ value: entry.slice(0, entry.indexOf("=")), label: entry.slice(entry.indexOf("=") + 1) }));
const MAX_REFRESH_QUERIES = 10;
const buttonActionTypes: [string, string][] = [["workflow", "İş akışı"], ["query", "Sorgu"], ["sequence", "Kayıt dizisi"], ["openDialog", "Pencere aç"]];
const bindingNote = "Değerler SQL'e her zaman parametre olarak gider.";
const variantOptions = [{ value: "info", label: "Bilgi" }, { value: "success", label: "Olumlu" }, { value: "warning", label: "Dikkat" }, { value: "danger", label: "Hata" }];
const numericKeys = ["width", "margin", "padding", "borderRadius"];
/**
 * Bileşenin silinen, yazma türüne ya da okumaya çevrilen sorguya başvurularını kaldırır. Okuma başvuruları (liste, gösterge,
 * seçenek, yenileme, ızgara/blok kaynakları) silmede ve yazmaya çevrilmede; yazma başvuruları (kayıt dizisi adımı, pencerenin
 * kaydet sorgusu) silmede ve okumaya çevrilmede kalkar. Düğmenin kendi sorgusu (queryId) yalnız silmede kalkar.
 */
type QueryChange = "removed" | "toWrite" | "toRead";
function dropQueryReferences(component: PageComponent, queryId: string, change: QueryChange): PageComponent {
  const removed = change === "removed";
  const readGone = change !== "toRead";
  const writeGone = change !== "toWrite";
  const refresh = component.props.refreshQueries;
  const staleRefresh = readGone && Array.isArray(refresh) && refresh.includes(queryId);
  // Faz B: kayıt dizisi adımı (silinince ya da okumaya çevrilince; yazma kalırsa adım geçerlidir), ızgara/blok kaynakları
  // (yalnız okuma sorgusu olabilir) ve pencerenin kaydet sorgusu.
  const sequence = component.props.saveSequence;
  const staleSequence = writeGone && Array.isArray(sequence) && sequence.includes(queryId);
  const readRefs = readGone ? ["sourceQuery", "definitionsQuery", "valuesQuery"].filter((key) => component.props[key] === queryId) : [];
  const staleDialogSave = writeGone && component.type === "dialog" && component.props.saveQuery === queryId;
  const readRef = readGone && (component.props.query === queryId || component.props.trendQuery === queryId || component.props.optionsQuery === queryId);
  if (!readRef && !staleRefresh && !(removed && component.props.queryId === queryId)
    && !staleSequence && readRefs.length === 0 && !staleDialogSave) return component;
  const props = { ...component.props };
  if (staleSequence) {
    const next = (sequence as string[]).filter((item) => item !== queryId);
    if (next.length > 0) {
      props.saveSequence = next;
      const when = (Array.isArray(props.sequenceWhen) ? props.sequenceWhen : []).filter((entry): entry is string => typeof entry === "string" && !entry.startsWith(`${queryId}=`));
      if (when.length > 0) props.sequenceWhen = when; else delete props.sequenceWhen;
    } else { delete props.saveSequence; delete props.sequenceWhen; delete props.stopOnError; }
  }
  for (const key of readRefs) delete props[key];
  if (staleDialogSave) delete props.saveQuery;
  // Sunucu sayfalaması ERP işlemi sorgusuna bağlıdır; sorgu kalkınca sayfalama özellikleri de kalkar.
  if (readGone && props.query === queryId) { delete props.query; delete props.totals; delete props.columnFormats; delete props.toneMap; for (const key of PAGING_PROPS) delete props[key]; }
  if (readGone && props.trendQuery === queryId) delete props.trendQuery;
  // Seçenek sütunları (arama kutusunun açıklama sütunu dahil) sorguya bağlıdır; sabit seçenekler, en az karakter ve
  // temizlenebilir sorgudan bağımsızdır, kalır (sabit seçenekli arama kutusu sorgusuz da geçerlidir).
  if (readGone && props.optionsQuery === queryId) { delete props.optionsQuery; delete props.optionLabelColumn; delete props.optionValueColumn; delete props.optionDescriptionColumn; }
  if (removed && props.queryId === queryId) delete props.queryId;
  if (staleRefresh) { const next = (refresh as string[]).filter((item) => item !== queryId); if (next.length > 0) props.refreshQueries = next; else delete props.refreshQueries; }
  return { ...component, props };
}
/** Giriş türü değişince silinen, türe bağlı doğrulama özellikleri ("Zorunlu" türden bağımsızdır, kalır). */
const validationReset: Record<string, undefined> = { min: undefined, max: undefined, step: undefined, maxLength: undefined, pattern: undefined, patternMessage: undefined, upperCase: undefined };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** .NET'te olup ECMAScript'te olmayan yapılar (satır içi seçenekler `(?i)`, `\A`, `\Z`, `\z`); sunucudaki kuralın aynısı. */
const UNSUPPORTED_PATTERN = /\(\?[imnsx-]+[):]|(?:^|[^\\])(?:\\\\)*\\[AZz]/;
/** Biçim (pattern) sorunu: sunucu .NET Regex ile derler; burada JavaScript ile ("u" bayrağı olmadan, ERP'deki gibi) denetlenir. */
const patternProblem = (pattern: string): string | null => {
  if (/[<>]|\{\{|\}\}/.test(pattern)) return "Biçim < > {{ }} içeremez.";
  if (UNSUPPORTED_PATTERN.test(pattern)) return "Desen tarayıcıda desteklenmeyen bir yapı içeriyor.";
  try { new RegExp(`^(?:${pattern})$`); return null; } catch { return "'pattern' geçerli bir düzenli ifade değil."; }
};
/** Görünürlük koşulu olan bileşen: tasarımcıda gizlenmez, tuvalde "Koşullu" işaretiyle gösterilir. */
const isConditional = (component: PageComponent) => typeof component.props.visibleWhen === "string" && component.props.visibleWhen.trim() !== "";
/** Koşul kökü olabilecek sayfa adları: adlı bileşenler ve sorgular. */
const pageNamesOf = (definition: PageDefinition) => [
  ...definition.queries.map((query) => query.name).filter(Boolean),
  ...definition.components.map((component) => component.name).filter((name): name is string => !!name),
];
const isFacetInput = (component: PageComponent) => component.props.inputType === "select" && typeof component.props.optionsQuery === "string" && component.props.optionsQuery !== "";
const FACET_COUNT = /^[^=]{1,64}=[^=]{1,128}$/;
/** Sunucu sayfalı listenin altbilgi üst bilgisi: "anahtar=Etiket" (sunucudaki kural). */
const FOOTER_META = /^[A-Za-z_][A-Za-z0-9_]{0,63}=[^=]{1,60}$/;
const sameList = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((item, index) => item === b[index]);
/**
 * Düzen bileşenlerinin (formCard, contextPanel, filterChips, facetPanel) başvurularını tanımla tutarlı tutar; sunucunun
 * reddedeceği tanım üretilmez: silinen/uygunsuz girişler, ikinci sahip, geçersiz tablo, silinen sorgu ve sayı sütunu temizlenir.
 * Değişiklik yoksa aynı nesneyi döndürür (geri alma yığını ve commit karşılaştırması bozulmaz).
 */
type ReconcileOptions = { catalog?: ErpCatalog; previous?: PageDefinition; queryEditable?: boolean };
/** `disabledWhen` / `disabledReason` alabilen türler (sunucu kuralı). */
const DISABLEABLE_TYPES: ComponentType[] = ["button", "input", "editableGrid", "customFieldsBlock"];
/** Satır işlemi olabilen düğme eylem türleri. */
const ROW_ACTION_TYPES = ["query", "sequence", "openDialog"];
/**
 * Kayıt dizisi özelliklerini yerinde temizler (İşlem Çubuğu, Pencere, dizi düğmesi): adımlar var olan tekil yazma sorguları
 * (en çok 8), koşullar yalnız dizideki adımlar için; dizi yoksa `stopOnError` ve `sequenceWhen` kalkar, dizi varsa `saveQuery`
 * kalkar (ikisi birlikte olamaz). Değişiklik olduysa true döner.
 */
function cleanSequence(props: Record<string, PropValue>, writeKinds: Map<string, PageQuery["kind"]>): boolean {
  let touched = false;
  if ("saveSequence" in props) {
    const steps = idList(props.saveSequence, MAX_SEQUENCE_STEPS).filter((id) => isWriteKind(writeKinds.get(id) ?? "read"));
    if (!sameList(props.saveSequence, steps)) { if (steps.length > 0) props.saveSequence = steps; else delete props.saveSequence; touched = true; }
  }
  const steps = Array.isArray(props.saveSequence) ? props.saveSequence as string[] : [];
  if ("sequenceWhen" in props) {
    const conditions = parseSequenceWhen(props.sequenceWhen);
    const kept = steps.filter((id) => id in conditions).map((id) => `${id}=${conditions[id]}`);
    if (!sameList(props.sequenceWhen, kept)) { if (kept.length > 0) props.sequenceWhen = kept; else delete props.sequenceWhen; touched = true; }
  }
  if (steps.length === 0 && "stopOnError" in props) { delete props.stopOnError; touched = true; }
  if (steps.length > 0 && "saveQuery" in props) { delete props.saveQuery; touched = true; }
  return touched;
}
function reconcileLayoutRefs(definition: PageDefinition, options: ReconcileOptions = {}): PageDefinition {
  const catalog = options.catalog;
  let changed = false;
  // `disabledReason` yalnız `disabledWhen` ile geçerlidir (sunucu kuralı); koşul silinince neden de kalkar. İkisi de yalnız
  // düğme, giriş, düzenlenebilir tablo ve özel alanlar bloğunda geçerlidir; başka türde kalanlar silinir.
  const reasoned = definition.components.map((component) => {
    const disableable = DISABLEABLE_TYPES.includes(component.type);
    const dropWhen = !disableable && "disabledWhen" in component.props;
    const dropReason = "disabledReason" in component.props
      && (!disableable || !(typeof component.props.disabledWhen === "string" && component.props.disabledWhen !== ""));
    if (!dropWhen && !dropReason) return component;
    const props = { ...component.props };
    if (dropWhen) delete props.disabledWhen;
    if (dropReason) delete props.disabledReason;
    changed = true;
    return { ...component, props };
  });
  // Sunucu sayfalı liste: sayfalama özellikleri yalnız `paging: "server"` ile ve ERP işlemi sorgusunda geçerlidir. Katalog hazır
  // değilken işlem denetimi ve üst bilgi süzmesi yapılmaz (erken bir düzenleme sayfalamayı silmesin). Arama girişi var olan,
  // metin türünde, form kartı / yan filtre paneline ve başka listeye ait olmayan bir giriş olmalıdır.
  const inputsById = new Map(reasoned.filter((component) => component.type === "input").map((component) => [component.id, component]));
  // Sekmedeki giriş de arama girişi olamaz (sekme önce gelir; sekme kuralı arama girişlerini zaten dışarıda bırakır).
  const cardOwned = new Set([...ownedInputIds(reasoned), ...tabOwnedIds(reasoned), ...dialogOwnedIds(reasoned)]);
  const queriesById = new Map(definition.queries.map((query) => [query.id, query]));
  const claimedSearch = new Set<string>();
  const source = reasoned.map((component) => {
    if (component.type !== "dataTable") return component;
    const props = component.props;
    const hasPagingProps = PAGING_PROPS.some((key) => key in props);
    if (!hasPagingProps) return component;
    const query = typeof props.query === "string" ? queriesById.get(props.query) : undefined;
    const op = query && isOperationQuery(query) && catalog ? findOperation(catalog, query.operation) : undefined;
    const unsupported = props.paging !== "server" || !query || !isOperationQuery(query) || (catalog?.status === "ready" && !!query.operation && (!op || !supportsServerPaging(op)));
    if (unsupported) { changed = true; return { ...component, props: stripPagingProps(props) }; }
    const next = { ...props };
    let touched = false;
    if ("searchInput" in next) {
      const id = typeof next.searchInput === "string" ? next.searchInput : "";
      const input = inputsById.get(id);
      const ok = !!input && String(input.props.inputType || "text") === "text" && !cardOwned.has(id) && !claimedSearch.has(id);
      if (ok) claimedSearch.add(id); else { delete next.searchInput; touched = true; }
    }
    if ("footerMeta" in next && op) {
      const offered = new Set(op.result.metaPaths ?? []);
      const seen = new Set<string>();
      const kept = (Array.isArray(next.footerMeta) ? next.footerMeta : []).filter((entry): entry is string => {
        if (typeof entry !== "string" || !FOOTER_META.test(entry)) return false;
        const key = entry.slice(0, entry.indexOf("="));
        if (!offered.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, MAX_FOOTER_META);
      if (!sameList(next.footerMeta, kept)) { if (kept.length > 0) next.footerMeta = kept; else delete next.footerMeta; touched = true; }
    }
    if (!touched) return component;
    changed = true;
    return { ...component, props: next };
  });
  const readIds = new Set(definition.queries.filter((query) => !isWriteKind(query.kind)).map((query) => query.id));
  const writeKinds = new Map(definition.queries.map((query) => [query.id, query.kind]));
  const dialogIds = new Set(source.filter((component) => component.type === "dialog").map((component) => component.id));
  // Düğmeler (Faz B): eylem türüne bağlı özellikler. Pencere silinince pencere açan düğmenin eylemi de kalkar; kayıt dizisi
  // yalnız "sequence" düğmesinde, gerekçe yalnız sorgu/dizi düğmesinde, `promptRequired` yalnız `promptLabel` ile geçerlidir.
  const buttoned = source.map((component) => {
    if (component.type !== "button") return component;
    const next = { ...component.props };
    let touched = false;
    const drop = (...keys: string[]) => { for (const key of keys) if (key in next) { delete next[key]; touched = true; } };
    const actionType = next.actionType;
    if (actionType === "openDialog") {
      if ("dialogId" in next && !(typeof next.dialogId === "string" && dialogIds.has(next.dialogId))) drop("actionType", "dialogId");
    } else drop("dialogId");
    if (next.actionType === "sequence") { drop("queryId"); if (cleanSequence(next, writeKinds)) touched = true; }
    else drop("saveSequence", "sequenceWhen", "stopOnError");
    if (next.actionType !== "query" && next.actionType !== "sequence") drop("promptLabel", "promptRequired");
    if (!(typeof next.promptLabel === "string" && next.promptLabel !== "")) drop("promptRequired");
    if (!touched) return component;
    changed = true;
    return { ...component, props: next };
  });
  const byId = new Map(buttoned.map((component) => [component.id, component]));
  // Sahiplik sunucudaki sırayla çözülür: sekmeler, pencere içerikleri, liste satır işlemleri. Bir kimliğin tek sahibi olur.
  const preLayoutOwned = ownedInputIds(buttoned);
  const preSearchInputs = new Set(buttoned.filter((component) => component.type === "dataTable" && typeof component.props.searchInput === "string").map((component) => String(component.props.searchInput)));
  const claimed = new Set<string>();
  const tabResult = new Map<string, TabEntry[]>();
  for (const component of buttoned) {
    if (component.type !== "tabs") continue;
    tabResult.set(component.id, parseTabs(component.props.tabs).map((tab) => ({ label: tab.label, ids: tab.ids.filter((id) => {
      const target = byId.get(id);
      if (!target || target.type === "tabs" || target.type === "actionBar" || target.type === "dialog" || claimed.has(id)) return false;
      if (target.type === "input" && (preLayoutOwned.has(id) || preSearchInputs.has(id))) return false;
      claimed.add(id);
      return true;
    }) })));
  }
  const dialogResult = new Map<string, string[]>();
  for (const component of buttoned) {
    if (component.type !== "dialog") continue;
    dialogResult.set(component.id, idList(component.props.contains, MAX_DIALOG_IDS).filter((id) => {
      const target = byId.get(id);
      if (!target || id === component.id || target.type === "dialog" || target.type === "actionBar" || claimed.has(id)) return false;
      if (target.type === "input" && (preLayoutOwned.has(id) || preSearchInputs.has(id))) return false;
      claimed.add(id);
      return true;
    }));
  }
  const rowActionResult = new Map<string, string[]>();
  for (const component of buttoned) {
    if (component.type !== "dataTable" || !("rowActions" in component.props)) continue;
    const queryBound = typeof component.props.query === "string" && component.props.query !== "";
    rowActionResult.set(component.id, !queryBound ? [] : idList(component.props.rowActions, MAX_ROW_ACTIONS).filter((id) => {
      const target = byId.get(id);
      if (!target || target.type !== "button" || !ROW_ACTION_TYPES.includes(String(target.props.actionType ?? "")) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    }));
  }
  const rowActionOwned = new Set([...rowActionResult.values()].flat());
  const owned = new Set<string>();
  let barSeen = false;
  const components = buttoned.map((component): PageComponent | null => {
    const props = component.props;
    if (component.type === "tabs") {
      const tabs = tabResult.get(component.id) ?? [];
      const wanted = tabsValue(tabs);
      const next = { ...props };
      let touched = false;
      if (!sameList(props.tabs, wanted)) { next.tabs = wanted; touched = true; }
      if ("defaultTab" in props) {
        const raw = Number(props.defaultTab);
        const clamped = tabs.length === 0 ? undefined : Number.isInteger(raw) ? Math.max(0, Math.min(raw, tabs.length - 1)) : 0;
        if (clamped === undefined) { delete next.defaultTab; touched = true; } else if (clamped !== props.defaultTab) { next.defaultTab = clamped; touched = true; }
      }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "formCard" || component.type === "facetPanel" || component.type === "filterChips") {
      const wanted = idList(props.inputs).filter((id) => {
        const input = byId.get(id);
        if (!input || input.type !== "input") return false;
        if (component.type === "facetPanel" && !isFacetInput(input)) return false;
        if (component.type !== "filterChips") { if (owned.has(id)) return false; owned.add(id); }
        return true;
      });
      const next = { ...props };
      let touched = false;
      if (!sameList(props.inputs, wanted)) { next.inputs = wanted; touched = true; }
      if (component.type === "facetPanel" && "facetCounts" in props) {
        const counts = (Array.isArray(props.facetCounts) ? props.facetCounts : []).filter((entry): entry is string => typeof entry === "string" && FACET_COUNT.test(entry) && wanted.includes(entry.slice(0, entry.indexOf("="))));
        if (!sameList(props.facetCounts, counts)) { if (counts.length > 0) next.facetCounts = counts; else delete next.facetCounts; touched = true; }
      }
      if (component.type === "formCard" && ![1, 2, 3].includes(Number(props.columns))) { next.columns = 2; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "dialog") {
      const wanted = dialogResult.get(component.id) ?? [];
      const next = { ...props };
      let touched = false;
      if (!sameList(props.contains, wanted)) { next.contains = wanted; touched = true; }
      if (cleanSequence(next, writeKinds)) touched = true;
      if ("saveQuery" in next && !(typeof next.saveQuery === "string" && isWriteKind(writeKinds.get(next.saveQuery) ?? "read"))) { delete next.saveQuery; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "dataTable") {
      // Satır işlemleri yalnız sorgulu listede; `limit` sorgulu ve sunucu sayfalı olmayan listede geçerlidir.
      const next = { ...props };
      let touched = false;
      if ("rowActions" in props) {
        const wanted = rowActionResult.get(component.id) ?? [];
        if (!sameList(props.rowActions, wanted)) { if (wanted.length > 0) next.rowActions = wanted; else delete next.rowActions; touched = true; }
      }
      if ("limit" in next && (!(typeof next.query === "string" && next.query !== "") || next.paging === "server")) { delete next.limit; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "editableGrid" || component.type === "customFieldsBlock") {
      // Izgaranın kaynağı ve bloğun tanım/değer sorguları yalnız okuma sorgusu olabilir.
      const next = { ...props };
      let touched = false;
      for (const key of ["sourceQuery", "definitionsQuery", "valuesQuery"]) {
        if (key in next && !(typeof next[key] === "string" && readIds.has(next[key] as string))) { delete next[key]; touched = true; }
      }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "contextPanel") {
      const table = typeof props.table === "string" ? byId.get(props.table) : undefined;
      const tableOk = !!table && table.type === "dataTable" && !!table.name && typeof table.props.query === "string" && table.props.query !== "";
      const next = { ...props };
      let touched = false;
      if (!tableOk && "table" in next) { delete next.table; touched = true; }
      if ("relatedQuery" in next && !(typeof next.relatedQuery === "string" && readIds.has(next.relatedQuery))) { delete next.relatedQuery; delete next.relatedTitle; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "actionBar") {
      // Sayfada en çok bir İşlem Çubuğu olabilir; sunucu ikincisini reddeder.
      if (barSeen) { changed = true; return null; }
      barSeen = true;
      const next = { ...props };
      let touched = false;
      const list = (key: string, max: number, ok: (id: string) => boolean) => {
        if (!(key in next)) return;
        const wanted = idList(next[key], max).filter(ok);
        if (sameList(next[key], wanted)) return;
        if (wanted.length > 0) next[key] = wanted; else delete next[key];
        touched = true;
      };
      const single = (key: string, ok: (id: string) => boolean) => {
        if (key in next && !(typeof next[key] === "string" && ok(next[key] as string))) { delete next[key]; touched = true; }
      };
      const isInput = (id: string) => byId.get(id)?.type === "input";
      list("newInputs", 12, isInput);
      // Satır işlemi düğmesi İşlem Çubuğu menüsünde kullanılamaz (liste sahipliği önce gelir).
      list("moreButtons", 10, (id) => byId.get(id)?.type === "button" && !rowActionOwned.has(id));
      single("focusInput", isInput);
      single("saveQuery", (id) => writeKinds.get(id) === "insert" || writeKinds.get(id) === "update");
      single("deleteQuery", (id) => writeKinds.get(id) === "delete");
      if (cleanSequence(next, writeKinds)) touched = true;
      single("exportTable", (id) => { const table = byId.get(id); return table?.type === "dataTable" && typeof table.props.query === "string" && table.props.query !== ""; });
      if ("printEnabled" in next && next.printEnabled !== true) { delete next.printEnabled; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    return component;
  }).filter((component): component is PageComponent => component !== null);
  // Sorgu parametreleri yalnız sorgu düzenleme yetkisiyle (queryEditable) yeniden yazılır; aksi halde yalnız bileşenler uzlaştırılır.
  if (!options.queryEditable) return changed ? { ...definition, components } : definition;
  // Bu adımdan önce sayfalı olan (adı değişen, sayfalaması kapanan ya da silinen) listenin {{<tablo>.sayfa}} /
  // {{<tablo>.sayfaBoyutu}} bağlamaları yalnız o listenin önceki sorgusundan temizlenir; elle yazılmış diğer bağlamalara dokunulmaz.
  const stillPaged = (name: string, queryId: string) => components.some((component) => isPagedTable(component) && component.name === name && component.props.query === queryId);
  let queries = definition.queries;
  for (const before of options.previous?.components ?? []) {
    if (!isPagedTable(before) || !before.name || typeof before.props.query !== "string" || stillPaged(before.name, before.props.query)) continue;
    const table = before.name;
    queries = queries.map((query) => query.id === before.props.query ? withoutPagingBindings(query, table) : query);
  }
  // Sayfalı listenin sorgusunda sayfa bağlamaları eksikse (ör. ad değişti, sorgunun işlemi yeniden seçildi) yeniden yazılır.
  for (const component of components) {
    if (!isPagedTable(component) || !component.name || typeof component.props.query !== "string") continue;
    const table = component.name;
    const params = pagingParams(component.props);
    const bound = (query: PageQuery, name: string, binding: string) => query.parameters.some((parameter) => parameter.name.toLowerCase() === name.toLowerCase() && parameter.binding.trim() === binding);
    queries = queries.map((query) => query.id !== component.props.query || !isOperationQuery(query) || (bound(query, params.page, pageBinding(table)) && bound(query, params.pageSize, pageSizeBinding(table))) ? query
      : withPagingBindings(query, table, params));
  }
  if (queries.some((query, index) => query !== definition.queries[index])) changed = true;
  return changed ? { ...definition, components, queries } : definition;
}
const emptyDefinition: PageDefinition = { schemaVersion: 2, queries: [], components: [] };
const normalizeDefinition = (raw: unknown): PageDefinition => {
  const value = (raw ?? {}) as { components?: unknown; queries?: unknown };
  return { schemaVersion: 2, queries: Array.isArray(value.queries) ? value.queries as PageQuery[] : [], components: Array.isArray(value.components) ? value.components as PageComponent[] : [] };
};
/**
 * Sunucuya gönderilen tanım: ERP işlemi sorgusunda `sql` yoktur, SQL sorgusunda `operation` yoktur. İşlem katalogda
 * bulunursa bağlanmamış parametreler atılır; katalog yoksa parametreler olduğu gibi gönderilir. Düzenleyici durumu değişmez.
 */
const wireDefinition = (definition: PageDefinition, catalog: ErpCatalog): PageDefinition => ({
  ...definition,
  queries: definition.queries.map((query) => {
    const { sql, operation, ...rest } = query;
    if (!isOperationQuery(query)) return { ...rest, sql: sql ?? "" };
    const op = findOperation(catalog, operation);
    return { ...rest, operation, parameters: op ? wireParameters(op, rest.parameters) : rest.parameters };
  }),
});
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
// erp-web TenantCustomPage ile aynı oturum değişkenleri: kimlik belirteçteki sub, ad yerel depodaki kullanıcı adı,
// rol oturumdaki üyelik rolü (Studio'da `role` özelliği; ERP'de belirteçteki role iddiası).
const sessionUser = (token: string, role: string) => {
  let id = "";
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    id = String((JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { sub?: unknown }).sub ?? "");
  } catch { /* geçersiz belirteç */ }
  let name = "";
  try { name = localStorage.getItem("aierp.user") ?? ""; } catch { /* depolama kapalı */ }
  return { id, ad: name, rol: role };
};
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Bağlama yoluna eklenebilen sütun kodu: tek ad ya da düzleştirilmiş "nesne.alan" adları. */
const columnPath = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const titleFor = (type: ComponentType) => palette.find((item) => item.type === type)?.label ?? type;
const iconFor = (type: ComponentType) => palette.find((item) => item.type === type)?.icon ?? LayoutTemplate;
const defaultSpan = (type: ComponentType) => type === "metric" || type === "image" ? 3 : type === "editableGrid" || type === "customFieldsBlock" || type === "dialog" || type === "formCard" || type === "filterChips" || type === "actionBar" || type === "tabs" ? 12 : type === "contextPanel" ? 4 : type === "facetPanel" ? 3 : type === "heading" || type === "text" || type === "label" || type === "divider" || type === "spacer" ? 12 : 6;
// ERP tasarım dili varsayılanları (kart iç boşluğu 12px, köşe 8px); ERP gösterimi aynı değerleri kullanır.
const DEFAULT_RADIUS = 8;
const defaultPadding = (type: ComponentType) => ["card", "section", "dataTable", "metric", "form", "alert", "list", "progress", "formCard", "contextPanel", "facetPanel", "tabs", "editableGrid", "customFieldsBlock", "dialog"].includes(type) ? 12 : 0;
const spanOf = (component: PageComponent) => Math.max(1, Math.min(12, Number(component.props.width) || defaultSpan(component.type)));
// Mirrors erp-web's tenant-custom-page.css: tablets show every block at half width, phones stack them.
const deviceSpan = (span: number, device: Device) => device === "mobile" ? 12 : device === "tablet" ? 6 : span;
const summaryOf = (component: PageComponent) => {
  const value = component.props.title ?? component.props.text ?? component.props.label;
  return typeof value === "string" && value.trim() ? value : titleFor(component.type);
};
const snapshotOf = (name: string, description: string, definition: PageDefinition) => JSON.stringify({ name, description, definition });
const FULLSCREEN_STORAGE_KEY = "nexora.pageDesigner.fullscreen";
const QUERY_PAGE_ADMIN_ONLY = "Bu sayfa SQL sorgusu içerdiği için yalnız yöneticiler düzenleyebilir.";
/** Sunucudaki TenantCustomPageQueries.HasQueries ile aynı: schemaVersion 2 ve boş olmayan queries dizisi. */
const definitionHasQueries = (definitionJson: string | undefined) => {
  if (!definitionJson) return false;
  try {
    const raw = JSON.parse(definitionJson) as { schemaVersion?: unknown; queries?: unknown };
    return raw?.schemaVersion === 2 && Array.isArray(raw.queries) && raw.queries.length > 0;
  } catch { return false; }
};
/** Faz B bileşenlerinin zorunlu başvuruları (sunucu da reddeder; metinler sunucudakiyle aynı). Sorun yoksa null. */
const fazBProblem = (component: PageComponent, label: string): string | null => {
  const props = component.props;
  if ((component.type === "editableGrid" || component.type === "customFieldsBlock") && !component.name)
    return component.type === "editableGrid" ? `Düzenlenebilir tablonun adı olmalıdır: ${component.id}` : `Özel alanlar bloğunun adı olmalıdır: ${component.id}`;
  if (component.type === "dialog" && idList(props.contains, MAX_DIALOG_IDS).length === 0) return `${label} için pencerede gösterilecek en az bir bileşen seçin.`;
  if (component.type === "dataTable" && idList(props.rowActions, MAX_ROW_ACTIONS).length > 0 && !component.name) return `Satır işlemleri için veri listesinin adı olmalıdır: ${component.id}`;
  if (component.type === "button") {
    if (props.actionType === "sequence" && idList(props.saveSequence, MAX_SEQUENCE_STEPS).length === 0) return "Kayıt dizisi düğmesi için 'saveSequence' gerekli.";
    if (props.actionType === "openDialog" && !(typeof props.dialogId === "string" && props.dialogId !== "")) return "Pencere açan düğme için 'dialogId' gerekli.";
    if (typeof props.promptLabel === "string" && props.promptLabel !== "" && !component.name) return `Gerekçe soran düğmenin adı olmalıdır: ${component.id}`;
  }
  return null;
};
/** Adı zorunlu türlerin otomatik ad tabanı (tablo1, ozelAlanlar1…); diğer türler adsız başlar. */
const requiredNameBase = (type: ComponentType) => type === "editableGrid" ? "tablo" : type === "customFieldsBlock" ? "ozelAlanlar" : null;
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
    borderRadius: `${bounded(props.borderRadius, DEFAULT_RADIUS, 0, 32)}px`,
  };
};

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
        block("dataTable", { title: "Cari listesi", source: "customers", columns: ["code", "name", "type", "currencyCode", "riskLimit", "paymentTermDays", "isActive"], width: 12, padding: 12, rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" }),
      ],
    }),
  },
  {
    id: "dashboard", label: "Gösterge paneli", description: "Gösterge, ilerleme ve bildirim kartları ile bir ızgara.",
    build: () => ({
      name: "Özet paneli", code: "ozet-paneli", description: "Önemli göstergeleri ve son kayıtları tek ekranda izleyin.",
      components: [
        block("heading", { text: "Özet paneli", width: 12 }),
        block("metric", { title: "Toplam cari", description: "Kayıtlı cari hesap sayısı", source: "customers", width: 4, padding: 12 }),
        block("progress", { title: "Aylık hedef", value: 65, width: 4, padding: 12 }),
        block("alert", { title: "Bilgilendirme", text: "Göstergeler her açılışta güncel verilerle hesaplanır.", variant: "info", width: 4 }),
        block("dataTable", { title: "Son cariler", source: "customers", columns: ["code", "name", "type"], width: 12, padding: 12, rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" }),
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
        block("form", { title: "Talep", formCode: "", width: 8, padding: 12 }),
        block("alert", { title: "Not", text: "Zorunlu alanlar işaretlidir.", variant: "info", width: 4 }),
      ],
    }),
  },
];

/**
 * Arama kutusunun sabit seçenekleri: metin yerelde tutulur (yeni satır yazılabilsin); kaydedilen değer boş satırları
 * içermez ve en çok 20 öğedir. Fazlası için uyarı gösterilir. Değer dışarıdan değişirse (geri al) metin yeniden kurulur.
 */
function StaticOptionsField({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState(() => value.join("\n"));
  const linesOf = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
  const joined = value.join("\n");
  // Yalnız dış değer değişince eşitlenir (yazarken taslaktaki boş satırlar korunur).
  useEffect(() => {
    if (!sameList(value, linesOf(draft).slice(0, MAX_STATIC_OPTIONS))) setDraft(joined);
  }, [joined]);
  const tooMany = linesOf(draft).length > MAX_STATIC_OPTIONS;
  return <>
    <textarea rows={3} value={draft} spellCheck={false} onChange={(event) => {
      setDraft(event.target.value);
      const next = linesOf(event.target.value).slice(0, MAX_STATIC_OPTIONS);
      if (!sameList(value, next)) onChange(next);
    }}/>
    {tooMany && <small className="pd-query-warning">En fazla {MAX_STATIC_OPTIONS} seçenek; fazlası kaydedilmez.</small>}
  </>;
}

type Props = { token: string; role: string; platformOrigin?: string; initialPageId?: string | null; initialCreate?: boolean; embedded?: boolean; onBack?: () => void };

export default function CustomPagesPage({ token, role, platformOrigin, initialPageId, initialCreate = false, onBack }: Props) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [history, setHistory] = useState<PageRevision[]>([]);
  const [formEditorOpen, setFormEditorOpen] = useState(false);
  const [forms, setForms] = useState<CustomFormSummary[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [sources, setSources] = useState<ReportSource[]>([]);
  // {{sayilar.x}} önizlemesi: yalnız sayfada geçen rapor kaynaklarının kayıt sayısı istenir.
  const [counts, setCounts] = useState<Record<string, number>>({});
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
  const [previewHref, setPreviewHref] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [device, setDevice] = useState<Device>("desktop");
  const [leftTab, setLeftTab] = useState<"components" | "layers" | "queries" | "templates">("components");
  const [rightMode, setRightMode] = useState<"inspector" | "history">("inspector");
  // Tam ekran: Studio menüsü ve üst çubuğu gizlenir, tasarımcı tüm pencereyi kullanır. Tercih tarayıcıda hatırlanır.
  const [fullscreen, setFullscreen] = useState(() => { try { return localStorage.getItem(FULLSCREEN_STORAGE_KEY) === "1"; } catch { return false; } });
  const [paletteSearch, setPaletteSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ rowActions: true, style: false });
  const [, setUndoTick] = useState(0);
  const [queryPreviews, setQueryPreviews] = useState<Record<string, QueryPreview>>({});
  const [erpCatalog, setErpCatalog] = useState<ErpCatalog>({ status: "loading" });
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  // İşlem Çubuğunda "Kaydet dizisi" seçildi ama henüz adım eklenmedi (boş dizi özelliği kaydedilmez).
  const [barSaveChoice, setBarSaveChoice] = useState<{ id: string; mode: "query" | "sequence" } | null>(null);
  const [sqlSchema, setSqlSchema] = useState<SqlSchemaTable[]>([]);
  const parameterMemory = useRef(new Map<string, PageQuery["parameters"][number]>());
  const initialActionDone = useRef(false);
  const definitionRef = useRef(definition);
  definitionRef.current = definition;
  const undoStack = useRef<PageDefinition[]>([]);
  const redoStack = useRef<PageDefinition[]>([]);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const isAdmin = role === "TenantAdmin";
  // Kayıtlı tanımı SQL sorgusu içeren sayfayı (sunucudaki kuralla aynı) yalnız tenant yöneticisi değiştirebilir.
  const storedHasQueries = useMemo(() => definitionHasQueries(current?.definitionJson), [current?.definitionJson]);
  const queryPageLocked = storedHasQueries && !isAdmin;
  const canEdit = current
    ? !current.isPublished && !!capabilities?.canUpdate && !queryPageLocked
    : creating && !!capabilities?.canCreate;
  // Sorgu eklemek, SQL düzenlemek ve önizlemek yalnız tenant yöneticisine açıktır.
  const queryEditable = canEdit && isAdmin;
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
  // ERP işlem kataloğu: alınamazsa ERP işlemi modu kapalı kalır, SQL modu etkilenmez.
  useEffect(() => {
    let active = true;
    void loadErpOperations(request)
      .then((operations) => { if (active) setErpCatalog({ status: "ready", operations }); })
      .catch(() => { if (active) setErpCatalog({ status: "failed" }); });
    return () => { active = false; };
  }, [request]);
  useEffect(() => {
    if (!isAdmin) return;
    void request<SqlSchemaTable[]>("/api/reports/sql-schema").then((tables) => setSqlSchema(Array.isArray(tables) ? tables : [])).catch(() => setSqlSchema([]));
  }, [request, isAdmin]);
  useEffect(() => {
    void request<WorkflowOption[]>("/api/workflows/definitions")
      .then((items) => setWorkflows(items.filter((item) => item.status === "Published")))
      .catch(() => setWorkflows([]));
  }, [request]);
  // Only data bindings drive the sample-data requests, so typing a title does not refetch every grid.
  const bindingKey = JSON.stringify(definition.components
    .filter((item) => (item.type === "metric" || item.type === "dataTable") && typeof item.props.query !== "string" && typeof item.props.source === "string" && item.props.source)
    .map((item) => [item.id, item.type, item.props.source, item.props.columns]));
  const countKey = referencedCountCodes(collectTexts([definition.components.map((component) => component.props), definition.queries.map((query) => query.parameters)])).join(",");
  useEffect(() => {
    let active = true;
    const codes = countKey ? countKey.split(",") : [];
    const timer = window.setTimeout(() => {
      void Promise.all(codes.map(async (code) => {
        const source = sources.find((item) => item.code === code);
        const column = source?.columns[0]?.code;
        if (!source || !column || !isCountableSource(code)) return null;
        try {
          const result = await request<{ totalCount: number }>("/api/reports/run", {
            method: "POST",
            body: JSON.stringify({ source: code, columns: [column], filters: [], sortBy: column, descending: false, page: 1, pageSize: 1 }),
          });
          return typeof result.totalCount === "number" ? [code, result.totalCount] as const : null;
        } catch { return null; }
      })).then((entries) => { if (active) setCounts(Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => !!entry))); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [countKey, sources, request]);
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
    setQueryPreviews({}); setSelectedQueryId(pageDefinition.queries[0]?.id ?? null);
    resetUndo();
  };
  // Every definition change goes through commit so it can be undone. Typing into one field
  // (same coalesce key within a second) or one resize drag collapses into a single undo step.
  const commit = (update: (value: PageDefinition) => PageDefinition, coalesceKey?: string) => {
    if (!canEdit) return;
    const previous = definitionRef.current;
    const next = reconcileLayoutRefs(update(previous), { catalog: erpCatalog, previous, queryEditable });
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
      const loadedDefinition = normalizeDefinition(JSON.parse(detail.definitionJson));
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
    commit((value) => ({ ...value, components: built.components }));
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
      // Çalışma zamanı uç noktası sorgu SQL'ini göndermez; tam tanım kimlikle okunur.
      const published = await request<PageDetail>(`/api/custom-pages/${encodeURIComponent(page.id)}`);
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
    if (item.type === "actionBar" && actionBarOf(definitionRef.current.components)) return; // sayfada en çok bir İşlem Çubuğu
    const id = newId(item.type);
    const props = Object.fromEntries(Object.entries(item.sample).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
    // Düzenlenebilir tablo ve özel alanlar bloğu adsız olamaz: ilk boş ad (tablo1, ozelAlanlar1…) verilir.
    const autoName = requiredNameBase(item.type);
    const name = autoName ? freeName(autoName) : undefined;
    if (autoName && !name) return;
    commit((value) => {
      const components = [...value.components];
      fillLayoutDefaults(item.type, props, value);
      components.splice(at == null ? components.length : Math.max(0, Math.min(at, components.length)), 0, { id, type: item.type, ...(name ? { name } : {}), props });
      return { ...value, components };
    });
    setSelectedComponentId(id);
  };
  // Palet'ten eklenen düzen bileşenleri sunucunun kabul etmediği boş liste yerine sayfanın uygun girişleri/tablosuyla başlar.
  const fillLayoutDefaults = (type: ComponentType, props: PageComponent["props"], state: PageDefinition) => {
    // Sekmedeki girişler de sahipli sayılır: yeni form kartı onları sekmeden çekip almaz.
    const owned = new Set([...ownedInputIds(state.components), ...tabOwnedIds(state.components), ...dialogOwnedIds(state.components), ...tableSearchInputIds(state.components)]);
    const inputs = state.components.filter((component) => component.type === "input");
    if (type === "formCard") props.inputs = inputs.filter((component) => !owned.has(component.id)).slice(0, 12).map((component) => component.id);
    else if (type === "filterChips") props.inputs = inputs.slice(0, 12).map((component) => component.id);
    else if (type === "facetPanel") props.inputs = inputs.filter((component) => !owned.has(component.id) && isFacetInput(component)).slice(0, 12).map((component) => component.id);
    else if (type === "contextPanel") {
      const table = state.components.find((component) => component.type === "dataTable" && !!component.name && typeof component.props.query === "string" && component.props.query !== "");
      if (!table) return;
      props.table = table.id;
      const columns = queryColumns(String(table.props.query));
      props.fields = columns.filter((column) => isSafeColumnCode(column.code) && !column.code.includes("=")).slice(0, 6)
        .map((column) => `${column.code}=${sanitizeSafeValue(column.label || column.code).slice(0, 60) || "Alan"}`);
    }
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
  // Tek geri alma adımında birden çok özelliği değiştirir; undefined değer özelliği siler (boş dize sunucuda geçersiz olabilir).
  const patchComponent = (id: string, patch: Record<string, PropValue | undefined>) => commit((state) => ({
    ...state,
    components: state.components.map((component) => {
      if (component.id !== id) return component;
      const props = { ...component.props };
      for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete props[key]; else props[key] = value; }
      return { ...component, props };
    }),
  }));
  // Sunucu sayfalı listenin sayfa bağlamaları tablo adını içerir; ad değişince uzlaştırma (reconcileLayoutRefs) eski
  // bağlamaları temizler ve yeni adla aynı adımda yeniden yazar.
  const setComponentName = (id: string, value: string) => commit((state) => ({
    ...state,
    components: state.components.map((component) => {
      if (component.id !== id) return component;
      const next = { ...component };
      if (value) next.name = value; else delete next.name;
      return next;
    }),
  }), `${id}:name`);
  // Sorgu ve bileşen adları sayfada büyük/küçük harf duyarsız benzersizdir.
  const takenNames = (except: { queryId?: string; componentId?: string }) => [
    ...definition.queries.filter((query) => query.id !== except.queryId).map((query) => query.name.toLowerCase()),
    ...definition.components.filter((component) => component.id !== except.componentId && component.name).map((component) => component.name!.toLowerCase()),
  ];
  /** Sayfada kullanılmayan ilk "<taban><n>" adı (n = 1, 2, …). */
  const freeName = (base: string) => {
    const taken = takenNames({});
    for (let index = 1; index <= 999; index++) if (!nameProblem(`${base}${index}`, taken)) return `${base}${index}`;
    return null;
  };
  const defaultParameterBinding = (parameterName: string) => {
    const input = definitionRef.current.components.find((component) => component.type === "input" && component.name?.toLowerCase() === parameterName.toLowerCase());
    return input?.name ? `{{${input.name}.value}}` : "";
  };
  const addQuery = () => {
    if (!queryEditable || definition.queries.length >= MAX_QUERIES) return;
    const taken = takenNames({});
    let index = definition.queries.length + 1;
    while (taken.includes(`sorgu${index}`)) index++;
    const query: PageQuery = { id: `q-${crypto.randomUUID().slice(0, 8)}`, name: `sorgu${index}`, kind: "read", sql: "SELECT 1 AS Deger", parameters: [], runOn: "load" };
    commit((state) => ({ ...state, queries: [...state.queries, query] }));
    setSelectedQueryId(query.id);
  };
  const updateQuery = (id: string, patch: Partial<PageQuery>, coalesceKey?: string) => {
    if (!queryEditable) return;
    commit((state) => ({
      ...state,
      queries: state.queries.map((query) => {
        if (query.id !== id) return query;
        const next = { ...query, ...patch };
        // SQL moduna dönüşte `operation` anahtarı tamamen kalkar (anahtarın varlığı ERP işlemi modunu belirler).
        if ("operation" in patch && patch.operation === undefined) delete next.operation;
        if (isOperationQuery(next)) return next;
        // Parametre adları SQL'den gelir; var olanların (ve bu oturumda SQL'den geçici düşenlerin) bağlaması ve türü korunur.
        if (!isOperationQuery(query)) for (const parameter of query.parameters) parameterMemory.current.set(`${id}:${parameter.name.toLowerCase()}`, parameter);
        if (patch.sql !== undefined) next.parameters = syncParameters(patch.sql, next.parameters, (name) => parameterMemory.current.get(`${id}:${name.toLowerCase()}`), defaultParameterBinding);
        return next;
      }),
      // Izgara, gösterge ve açılır liste yalnız okuma sorgusuna bağlanabilir; yazma türüne çevrilen sorgunun başvuruları aynı adımda kalkar.
      // Okumaya çevrilen sorgu kayıt dizisi adımı ya da pencerenin kaydet sorgusu olamaz; onlar da aynı adımda kalkar.
      components: patch.kind ? state.components.map((component) => dropQueryReferences(component, id, isWriteKind(patch.kind!) ? "toWrite" : "toRead")) : state.components,
    }), coalesceKey);
  };
  const removeQuery = (id: string) => {
    const query = definition.queries.find((item) => item.id === id);
    if (!queryEditable || !query || !window.confirm(`“${query.name}” sorgusu silinsin mi? Ona bağlı ızgara, gösterge ve açılır listeler sorgusuz kalır.`)) return;
    // Silinen sorguya bağlı bileşen başvuruları da aynı adımda kaldırılır; aksi halde tanım kaydedilemez.
    commit((state) => ({
      ...state,
      queries: state.queries.filter((item) => item.id !== id),
      components: state.components.map((component) => dropQueryReferences(component, id, "removed")),
    }));
    setQueryPreviews((current) => { const next = { ...current }; delete next[id]; return next; });
    setSelectedQueryId(definition.queries.find((item) => item.id !== id)?.id ?? null);
  };
  // Güncelleme işleminin kaynak okuma sorgusunu ekler; `id` parametresi ilk adlı ızgaranın seçili satırına bağlanır.
  const addSourceQuery = (operation: ErpOperation) => {
    if (!queryEditable || definitionRef.current.queries.length >= MAX_QUERIES) return;
    const taken = takenNames({});
    const segment = operation.name.split(".")[1] ?? "";
    const base = NAME_PATTERN.test(segment) && segment.length <= 56 ? segment : "kaynak";
    let queryName = base;
    for (let index = 2; nameProblem(queryName, taken); index++) queryName = `${base}${index}`;
    const table = definitionRef.current.components.find((component) => component.type === "dataTable" && !!component.name && identifier.test(component.name));
    const query: PageQuery = {
      id: `q-${crypto.randomUUID().slice(0, 8)}`, name: queryName, kind: operation.pageKind, operation: operation.name,
      runOn: operation.kind === "read" ? "load" : "manual",
      parameters: operation.parameters.map((parameter) => ({
        name: parameter.name, type: parameter.type as QueryParameterType,
        binding: parameter.name.toLowerCase() === "id" && table?.name ? `{{${table.name}.seciliSatir.id}}` : "",
      })),
    };
    commit((state) => ({ ...state, queries: [...state.queries, query] }));
  };
  // Önizleme parametreleri tasarım zamanı kapsamından çözülür: oturum, diğer sorguların son önizlemesi,
  // ızgaraların ilk önizleme satırı (seçili satır yerine) ve girişlerin varsayılan değerleri.
  const designScope = (): PageScope => {
    const scope: PageScope = { kullanici: sessionUser(token, role), bugun: localToday(), [COUNTS_ROOT]: counts };
    const state = definitionRef.current;
    for (const query of state.queries) {
      if (isWriteKind(query.kind)) continue;
      const preview = queryPreviews[query.id];
      if (preview) scope[query.name] = { rows: preview.rows, rowCount: preview.rowCount, columns: preview.columns, truncated: preview.truncated, meta: preview.meta ?? {} };
    }
    for (const component of state.components) {
      if (!component.name) continue;
      if (component.type === "dataTable" && typeof component.props.query === "string") scope[component.name] = {
        seciliSatir: queryPreviews[component.props.query]?.rows[0] ?? null,
        // Sunucu sayfalı liste tasarımda hep ilk sayfadadır.
        ...(isPagedTable(component) ? { sayfa: 1, sayfaBoyutu: typeof component.props.pageSize === "number" ? component.props.pageSize : DEFAULT_PAGE_SIZE } : {}),
      };
    }
    for (const component of state.components) {
      if (!component.name || component.type !== "input") continue;
      const raw = interpolate(String(component.props.defaultValue ?? ""), scope);
      const inputType = String(component.props.inputType ?? "text");
      const value = inputType === "checkbox" ? /^(true|1|evet)$/i.test(raw.trim())
        : inputType === "number" ? (raw.trim() === "" || !Number.isFinite(Number(raw)) ? null : Number(raw)) : raw === "" ? null : raw;
      if (inputType === "lookup") {
        // Arama kutusu: tasarımda arama metni yoktur; seçili satır, varsayılan değerle eşleşen seçenek satırıdır.
        const preview = typeof component.props.optionsQuery === "string" ? queryPreviews[component.props.optionsQuery] : undefined;
        const valueColumn = String(component.props.optionValueColumn || "") || preview?.columns[0]?.code || "";
        const row = value === null || !valueColumn ? undefined : preview?.rows.find((item) => item[valueColumn] != null && String(item[valueColumn]) === String(value));
        scope[component.name] = { value, search: null, seciliSatir: row ?? null };
        continue;
      }
      scope[component.name] = { value };
    }
    return scope;
  };
  // Tuvaldeki kod bileşenlerinin taklit köprüsü: yalnız tasarım zamanı kapsamını ve sorgu önizlemelerini okur.
  const bridgeHost = useRef<StubHostData>({ get: () => null, query: () => ({ kind: "unknown" }), operation: () => undefined });
  bridgeHost.current = {
    get: (path) => { const value = resolvePath(designScope(), path); return value === undefined ? null : value; },
    query: (queryName) => {
      const query = definitionRef.current.queries.find((item) => item.name === queryName);
      if (!query) return { kind: "unknown" };
      if (isWriteKind(query.kind)) return { kind: "write" };
      const preview = queryPreviews[query.id];
      return preview ? { kind: "read", rows: preview.rows, rowCount: preview.rowCount } : { kind: "noPreview" };
    },
    operation: (operationName) => findOperation(erpCatalog, operationName)?.kind,
  };
  const removeComponent = (id: string) => { commit((state) => ({ ...state, components: state.components.filter((component) => component.id !== id).map((component) => { if (component.props.filterInput !== id) return component; const props = { ...component.props }; delete props.filterInput; delete props.filterValue; return { ...component, props }; }) })); setSelectedComponentId((value) => value === id ? null : value); };
  const duplicateComponent = (id: string) => {
    const original = definitionRef.current.components.find((component) => component.id === id);
    if (!original || !canEdit || original.type === "actionBar") return;
    const copyId = newId(original.type);
    const duplicate: PageComponent = { ...original, id: copyId, props: Object.fromEntries(Object.entries(original.props).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) };
    delete duplicate.name; // Ad sayfada benzersiz olmalı; kopya adsız başlar (adı zorunlu türler yeni bir boş ad alır).
    const copyBase = requiredNameBase(duplicate.type);
    if (copyBase) { const copyName = freeName(copyBase); if (!copyName) return; duplicate.name = copyName; }
    // Satır işlemleri ve pencere içeriği tek sahiplidir; kopya bunları sahiplenmez.
    if (duplicate.type === "dataTable") delete duplicate.props.rowActions;
    if (duplicate.type === "dialog") duplicate.props.contains = [];
    // Sayfalama sorgunun parametrelerini tablonun adıyla bağlar ve arama girişini sahiplenir; adsız kopya sayfasız başlar.
    if (duplicate.type === "dataTable") duplicate.props = stripPagingProps(duplicate.props);
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
    const stop = () => {
      resizing.current = false;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("pd-resizing");
    };
    resizing.current = true;
    document.body.classList.add("pd-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  const saveDraft = async () => {
    if (!canEdit) { setError("Bu sayfayı düzenleme yetkiniz yok."); return null; }
    // Yüklenmiş ama düzenlenmemiş sayfalar da temizlensin; değişiklik editör durumuna işlenir ki kaydedilenle aynı olsun.
    const reconciled = reconcileLayoutRefs(definitionRef.current, { catalog: erpCatalog, queryEditable });
    if (reconciled !== definitionRef.current) commit(() => reconciled);
    const definition = normalizeDefinition(reconciled);
    if (!name.trim() || !code.trim()) { setError("Sayfa adı ve kodu gerekli. Sağdaki sayfa ayarlarından girin."); setSelectedComponentId(null); setRightMode("inspector"); return null; }
    // Düzen bileşenlerinin zorunlu başvuruları: sunucu da reddeder; burada bileşen adıyla anlaşılır mesaj verilir.
    for (const component of definition.components) {
      const label = `“${summaryOf(component)}”`;
      const empty = component.type === "formCard" || component.type === "filterChips" || component.type === "facetPanel" ? idList(component.props.inputs).length === 0 ? `${label} için en az bir giriş kutusu seçin.` : null
        : component.type === "contextPanel" ? !component.props.table ? `${label} için bir tablo seçin.` : parseFieldList(component.props.fields).length === 0 ? `${label} için en az bir alan ekleyin.` : null
          : component.type === "tabs" ? parseTabs(component.props.tabs).length === 0 ? `${label} için en az bir sekme ekleyin.` : null
            : component.type === "input" && component.props.inputType === "lookup" ? !component.props.optionsQuery && parseStaticOptions(component.props.staticOptions).length === 0 ? "Arama kutusu için seçenek sorgusu veya sabit seçenek gerekli."
              : Array.isArray(component.props.staticOptions) && component.props.staticOptions.some((entry) => typeof entry !== "string" || !STATIC_OPTION.test(entry)) ? "'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır." : null
              : component.type === "dataTable" ? pagedTableProblem(component, definition.queries.find((query) => query.id === component.props.query)) ?? fazBProblem(component, label)
                : fazBProblem(component, label);
      // Koşul sözdizimi ve kök adları: sunucu da reddeder; burada aynı metinle ve bileşen seçilerek gösterilir.
      const condition = empty ?? conditionProblem("visibleWhen", component.props.visibleWhen, pageNamesOf(definition))
        ?? conditionProblem("disabledWhen", component.props.disabledWhen, pageNamesOf(definition));
      if (condition) { setError(condition); setSelectedComponentId(component.id); setRightMode("inspector"); return null; }
    }
    // ERP işlemi sorguları: işlem seçilmeli ve zorunlu parametreler bağlanmalı (katalog alınamadıysa sunucu denetler).
    for (const query of definition.queries) {
      if (!isOperationQuery(query)) continue;
      const op = findOperation(erpCatalog, query.operation);
      const problem = !query.operation ? `“${query.name}” sorgusu için bir ERP işlemi seçin.`
        : op ? (() => { const missing = unboundRequiredParameter(op, query.parameters); return missing ? `Zorunlu parametre bağlanmadı: ${missing}` : null; })() : null;
      if (problem) { setError(problem); setLeftTab("queries"); setSelectedQueryId(query.id); return null; }
    }
    setSaving(true); setError(""); setNotice("");
    const sentSnapshot = snapshotOf(name, description, definition);
    const wire = wireDefinition(definition, erpCatalog);
    try {
      const result = current
        ? await request<PageDetail>(`/api/custom-pages/${current.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: current.revision, name, description: description || null, definition: wire }) })
        : await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: code.trim(), name, description: description || null, definition: wire }) });
      setCurrent(result); setCreating(false); setCode(result.code); setSavedSnapshot(sentSnapshot);
      setNotice("Taslak kaydedildi. Yayımlanana kadar aktif sayfa değişmez.");
      await refreshHistory(result.id);
      await refresh();
      return result;
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
    return null;
  };
  // Önizleme taslak tanımla çalışır: kaydedilmemiş değişiklik varsa önce taslak kaydedilir.
  const runQueryPreview = async (queryId: string, confirmWrite: boolean): Promise<number | null> => {
    const operationQuery = definitionRef.current.queries.find((item) => item.id === queryId);
    if (operationQuery && isOperationQuery(operationQuery)) return runOperationPreview(operationQuery);
    if (current?.isPublished) throw new Error("Önizleme yalnız taslakta çalışır; önce yeni taslak oluşturun.");
    const saved = dirty || !current ? await saveDraft() : current;
    if (!saved) throw new Error("Taslak kaydedilemedi; üstteki hata mesajına bakın.");
    const query = definitionRef.current.queries.find((item) => item.id === queryId);
    if (!query) throw new Error("Sorgu bulunamadı.");
    const scope = designScope();
    const parameters = Object.fromEntries(query.parameters.map((parameter) => {
      const path = bindingPath(parameter.binding);
      return [parameter.name, path ? coerceParameter(resolvePath(scope, path), parameter.type) : null];
    }));
    const url = `/api/custom-pages/${saved.id}/preview/queries/${encodeURIComponent(queryId)}/run`;
    if (isWriteKind(query.kind)) {
      const written = await request<{ affectedRows: number }>(url, { method: "POST", body: JSON.stringify({ parameters, confirmWrite }) });
      return written.affectedRows;
    }
    const result = await request<QueryPreview>(url, { method: "POST", body: JSON.stringify({ parameters }) });
    setQueryPreviews((value) => ({ ...value, [queryId]: result }));
    return null;
  };
  // ERP okuma işlemi önizlemesi: katalogdaki yol kullanıcının kendi oturumuyla doğrudan çağrılır (taslak kaydı gerekmez).
  // Yazma işlemleri Studio'da hiçbir koşulda çalıştırılmaz.
  const runOperationPreview = async (query: PageQuery): Promise<null> => {
    const op = findOperation(erpCatalog, query.operation);
    if (!op) throw new Error(query.operation ? `ERP işlemi bulunamadı: ${query.operation}` : "Önce bir ERP işlemi seçin.");
    if (op.kind === "write" || isWriteKind(query.kind)) throw new Error(ERP_WRITE_PREVIEW_BLOCKED);
    const scope = designScope();
    const values = Object.fromEntries(query.parameters.map((parameter) => {
      const path = bindingPath(parameter.binding);
      return [parameter.name, path ? coerceParameter(resolvePath(scope, path), parameter.type) : null];
    }));
    const built = buildReadRequest(op, values);
    const json = await request<unknown>(built.url, { method: built.method, ...(built.body !== undefined ? { body: built.body } : {}) });
    const result: QueryPreview = mapReadResult(op, json);
    setQueryPreviews((value) => ({ ...value, [query.id]: result }));
    return null;
  };
  const openErpPreview = async () => {
    if (!platformOrigin) { setError("ERP adresi bulunamadı. Studio'yu ERP ekranındaki bağlantıdan açın."); return; }
    setPreviewHref(null);
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      // The browser blocked the new window. Still prepare the preview (saving the draft
      // if needed) and offer a normal link, which popup blockers do not stop.
      try {
        const destination = new URL("/", platformOrigin);
        if (current?.isPublished) destination.searchParams.set("customPage", current.code);
        else {
          const saved = dirty || !current ? await saveDraft() : current;
          if (!saved) return;
          destination.searchParams.set("customPagePreview", saved.id);
        }
        setError("");
        setNotice(blockedPreviewNotice);
        setPreviewHref(destination.toString());
      } catch {
        setError("ERP önizlemesi açılamadı. Taslağı kaydedip yeniden deneyin.");
      }
      return;
    }
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
      loadEditor(restored.name, restored.code, restored.description || "", normalizeDefinition(JSON.parse(restored.definitionJson)));
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
    // Monaco (SQL editörü) da yazım alanıdır: Delete/Ctrl+Z bileşen yerine editörde çalışmalı.
    const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || !!target.closest(".monaco-editor"));
    const mod = event.ctrlKey || event.metaKey;
    const keyName = event.key.toLowerCase();
    if (mod && keyName === "s") { event.preventDefault(); if (canEdit && !saving) void saveDraft(); return; }
    if (typing) return;
    if (mod && keyName === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (mod && (keyName === "y" || (keyName === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
    else if (mod && keyName === "d" && selectedComponentId) { event.preventDefault(); duplicateComponent(selectedComponentId); }
    else if ((event.key === "Delete" || event.key === "Backspace") && selectedComponentId && canEdit) { event.preventDefault(); removeComponent(selectedComponentId); }
    else if (event.key === "Escape") { if (selectedComponentId) setSelectedComponentId(null); else if (fullscreen) setFullscreen(false); }
    else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.altKey && selectedComponentId) {
      event.preventDefault();
      const index = definition.components.findIndex((component) => component.id === selectedComponentId);
      if (index >= 0) moveComponent(index, event.key === "ArrowUp" ? -1 : 1);
    }
  };
  useEffect(() => {
    try { localStorage.setItem(FULLSCREEN_STORAGE_KEY, fullscreen ? "1" : "0"); } catch { /* depolama kapalı */ }
    document.documentElement.classList.toggle("pd-fullscreen-active", fullscreen);
    return () => document.documentElement.classList.remove("pd-fullscreen-active");
  }, [fullscreen]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Form kartı / yan filtre paneli girişleri ve sunucu sayfalı listelerin arama girişleri üst düzeyde çizilmez.
  const ownedIds = useMemo(() => new Set([...ownedInputIds(definition.components), ...tableSearchInputIds(definition.components)]), [definition]);
  // "İşlemler" menüsüne taşınan düğmeler ERP'de kendi yerinde çizilmez; tuvalde de gizlenir (katmanlardan seçilebilir kalır).
  const movedIds = useMemo(() => movedButtonIds(definition.components), [definition]);
  // Sekmelere alınan bileşenler üst düzeyde çizilmez; Sekmeler bileşeninin içinde varsayılan (ya da tıklanan) sekmede görünür.
  const tabIds = useMemo(() => tabOwnedIds(definition.components), [definition]);
  // Pencerenin içerdiği bileşenler ve listelerin satır işlemi düğmeleri de üst düzeyde çizilmez (pencerede / İşlemler sütununda görünür).
  const nestedIds = useMemo(() => new Set([...dialogOwnedIds(definition.components), ...rowActionIds(definition.components)]), [definition]);
  const rendered = useMemo(() => {
  const owned = ownedInputIds(definition.components);
  // Sunucu sayfalı listenin arama girişi listenin başlığında çizilir (ERP ile aynı), üst düzeyde değil.
  const searchOwned = tableSearchInputIds(definition.components);
  const inputById = new Map(definition.components.filter((item) => item.type === "input").map((item) => [item.id, item]));
  const optionRows = (inputProps: Record<string, PropValue>) => {
    const preview = typeof inputProps.optionsQuery === "string" ? queryPreviews[inputProps.optionsQuery] : undefined;
    const valueColumn = String(inputProps.optionValueColumn || "") || preview?.columns[0]?.code || "";
    const labelColumn = String(inputProps.optionLabelColumn || "") || valueColumn;
    const show = (value: unknown) => value == null ? "" : String(value);
    return { ready: !!preview, rows: (preview?.rows ?? []).map((row) => ({ value: show(row[valueColumn]), label: show(row[labelColumn]) || show(row[valueColumn]), row })) };
  };
  const renderInput = (component: PageComponent, style: CSSProperties) => {
    const props = component.props;
    const inputType = String(props.inputType || "text");
    const optionsQuery = definition.queries.find((query) => query.id === props.optionsQuery);
    // Varsayılan değer {{…}} içerebileceğinden tuvalde ham metin olarak gösterilir.
    const control = inputType === "checkbox" ? <input type="checkbox" tabIndex={-1} readOnly checked={/^(true|1|evet)$/i.test(String(props.defaultValue ?? ""))}/>
      : inputType === "select" ? <select tabIndex={-1}><option>{optionsQuery ? `Seçenekler: ${optionsQuery.name}` : "Seçin"}</option></select>
        : inputType === "lookup" ? (() => {
          // Sabit seçenekler önce, ardından seçenek sorgusunun önizleme satırları (etiket ve açıklama sütunu).
          const { ready, rows } = optionRows(props);
          const descriptionColumn = String(props.optionDescriptionColumn || "");
          const options = [
            ...parseStaticOptions(props.staticOptions).map((option) => ({ label: option.label, description: "" })),
            ...rows.map(({ label, row }) => ({ label, description: descriptionColumn && row[descriptionColumn] != null ? String(row[descriptionColumn]) : "" })),
          ];
          return <LookupPreview placeholder={String(props.placeholder || "")} value={String(props.defaultValue ?? "")} options={options} ready={ready || !optionsQuery}/>;
        })()
        : <input tabIndex={-1} readOnly placeholder={String(props.placeholder || "")} value={String(props.defaultValue ?? "")}/>;
    return <div key={component.id} className={`pd-binding-preview-input is-${inputType}`} style={style}><label>{props.label ? <span>{String(props.label)}</span> : null}{control}</label></div>;
  };
  const byComponentId = new Map(definition.components.map((item) => [item.id, item]));
  const rowActionLabelsOf = (tableProps: Record<string, PropValue>) => idList(tableProps.rowActions, MAX_ROW_ACTIONS)
    .map((id) => byComponentId.get(id)).filter((item): item is PageComponent => !!item).map((item) => String(item.props.label || item.name || "İşlem"));
  // Sekmeler bileşeni sahiplendiği bileşenleri bu işlevle kendi içinde çizer (sekme bir sekme içermez; özyineleme bir düzeydir).
  const renderOne = (component: PageComponent): ReactNode => {
    const props = component.props;
    const style = componentStyle(component.type, props);
    switch (component.type) {
      case "heading": return <h2 key={component.id} className="custom-page-preview-heading" style={style}>{String(props.text || props.title || "Başlık")}</h2>;
      case "text": return <p key={component.id} className="custom-page-preview-text" style={style}>{String(props.text || "Metin")}</p>;
      case "label": return <p key={component.id} className="custom-page-preview-text pd-binding-label" style={style}>{String(props.text || "Etiket")}</p>;
      case "input": return owned.has(component.id) || searchOwned.has(component.id) ? null : renderInput(component, style);
      case "metric": if (typeof props.query === "string") {
        const query = definition.queries.find((item) => item.id === props.query);
        const preview = queryPreviews[String(props.query)];
        const first = preview?.columns[0]?.code;
        const value = preview && first && preview.rows.length > 0 && preview.rows[0][first] != null ? String(preview.rows[0][first]) : preview ? "—" : "Önizleme yok";
        return <MetricPreview key={component.id} title={String(props.title || "Gösterge")} value={value} description={String(props.description || (query ? `Sorgu · ${query.name}` : ""))} tone={toneOf(props.variant)} icon={props.icon} trendRows={typeof props.trendQuery === "string" ? queryPreviews[props.trendQuery]?.rows : undefined} style={style} />;
      } else if (!props.source && typeof props.value === "string") {
        const shown = interpolate(props.value, designScope());
        return <MetricPreview key={component.id} title={String(props.title || "Gösterge")} value={shown || "Değer girin"} description={String(props.description || "")} tone={toneOf(props.variant)} icon={props.icon} trendRows={typeof props.trendQuery === "string" ? queryPreviews[props.trendQuery]?.rows : undefined} style={style} />;
      } else { const data = previewData[component.id]; return <MetricPreview key={component.id} title={String(props.title || "Gösterge")} value={!props.source ? "Veri kaynağı seçin" : data ? data.totalCount.toLocaleString("tr-TR") : "Yükleniyor…"} description={String(props.description || sources.find((source) => source.code === props.source)?.label || "")} tone={toneOf(props.variant)} icon={props.icon} trendRows={typeof props.trendQuery === "string" ? queryPreviews[props.trendQuery]?.rows : undefined} style={style} />; }
      case "card": case "section": return <article key={component.id} className={`custom-page-preview-card ${component.type === "section" ? "is-section" : ""}`} style={style}><b>{String(props.title || titleFor(component.type))}</b>{props.description && <p>{String(props.description)}</p>}</article>;
      case "divider": return <hr key={component.id} className="custom-page-preview-divider" style={style} />;
      case "spacer": return <div key={component.id} className="custom-page-preview-spacer" style={style} />;
      case "button": return <div key={component.id} className="custom-page-preview-action" style={style}><button type="button" tabIndex={-1} className="custom-page-preview-button">{String(props.label || "İşlem")}</button></div>;
      case "dataTable": if (typeof props.query === "string") {
        const query = definition.queries.find((item) => item.id === props.query);
        const preview = queryPreviews[String(props.query)];
        const chosen = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string") : [];
        const picked = preview ? preview.columns.filter((column) => chosen.includes(column.code)) : [];
        const visible = (picked.length > 0 ? picked : preview?.columns ?? []).slice(0, 20);
        // Arama girişi üst düzeyde çizilmez; önizleme yokken de listenin başlığında görünür.
        const searchInput = isPagedTable(component) && typeof props.searchInput === "string" ? inputById.get(props.searchInput) : undefined;
        if (!preview) return <article key={component.id} className="custom-page-preview-card" style={style}><div className="custom-page-preview-card-head"><b>{String(props.title || "Liste")}</b><small>{query ? `Sorgu · ${query.name}` : "Sorgu seçilmedi"}</small></div>{searchInput && <div className="pd-grid-search">{renderInput(searchInput, {})}</div>}<p>Örnek satırlar için Sorgular sekmesinde “Çalıştır ve önizle”yi kullanın.</p>
          {rowActionLabelsOf(props).length > 0 && <p>İşlemler: {rowActionLabelsOf(props).map((label, index) => <span key={index} className="custom-page-preview-row-action" style={index > 0 ? { marginLeft: 4 } : undefined}>{label}</span>)}</p>}</article>;
        const shownRows = preview.rows.slice(0, 5);
        const paging = isPagedTable(component) ? {
          pageSize: typeof props.pageSize === "number" && props.pageSize > 0 ? props.pageSize : DEFAULT_PAGE_SIZE, total: preview.rowCount,
          meta: parseFieldList(props.footerMeta).map((entry) => ({ label: entry.label, value: preview.meta?.[entry.code] == null ? "—" : String(preview.meta[entry.code]) })),
          search: searchInput ? renderInput(searchInput, {}) : undefined,
        } : undefined;
        const limited = typeof props.limit === "number" && props.limit > 0 ? shownRows.slice(0, props.limit) : shownRows;
        return <GridPreview key={component.id} title={String(props.title || "Liste")} subtitle={query ? `Sorgu · ${query.name}` : "Sorgu seçilmedi"} columns={visible} rows={limited} truncated={!paging && (preview.truncated || limited.length < preview.rows.length)} props={props}
          emptyText={typeof props.emptyText === "string" && props.emptyText ? props.emptyText : "Sorgu kayıt döndürmedi."} showTotals paging={paging} rowActionLabels={rowActionLabelsOf(props)} style={style} />;
      } else {
        const source = sources.find((item) => item.code === props.source);
        const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string") : [];
        const data = previewData[component.id];
        const visibleColumns = columns.map((column) => source?.columns.find((field) => field.code === column) ?? { code: column, label: column, dataType: "text" });
        const hasRowAction = props.rowActionsEnabled === true;
        if (!props.source || !data) return <article key={component.id} className="custom-page-preview-card" style={style}><div className="custom-page-preview-card-head"><b>{String(props.title || "Liste")}</b><small>{source?.label || "Veri kaynağı seçilmedi"}</small></div>{!props.source ? <p>Önizleme için veri kaynağı seçin.</p> : <p role="status">Örnek kayıtlar yükleniyor…</p>}</article>;
        return <GridPreview key={component.id} title={String(props.title || "Liste")} subtitle={source?.label || "Veri kaynağı seçilmedi"} columns={visibleColumns} rows={data.rows} truncated={data.totalCount > data.rows.length} props={props} emptyText="Kaynakta gösterilecek kayıt bulunamadı." rowAction={hasRowAction ? String(props.rowActionLabel || "İşlemi başlat") : undefined} style={style} />;
      }
      case "form": return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String(props.title || "Form")}</b><p>{forms.find((form) => form.code === props.formCode)?.name || "Yayımlanmış form seçin"}</p></article>;
      case "code": return <CodePreviewFrame key={component.id} className="custom-page-code-preview" title={String(props.title || component.name || "Yalıtılmış kod önizlemesi")} hidden={props.hidden === true} style={style} css={String(props.css || "")} javascript={String(props.javascript || "")} host={bridgeHost} />;
      case "alert": { const variant = ["success", "warning", "danger", "info"].includes(String(props.variant)) ? String(props.variant) : "info"; return <article key={component.id} className={`custom-page-preview-alert tone-${variant}`} style={style}><b>{String(props.title || "Bilgilendirme")}</b><p>{String(props.text || "")}</p></article>; }
      case "badge": return <BadgePreview key={component.id} text={String(props.label || "Durum")} variant={props.variant} toneMap={props.toneMap} style={style} />;
      case "list": return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String(props.title || "Liste")}</b><ul>{(Array.isArray(props.items) ? props.items : []).map((item, itemIndex) => <li key={itemIndex}>{String(item)}</li>)}</ul></article>;
      case "progress": { const progress = Math.max(0, Math.min(100, Number(props.value) || 0)); return <article key={component.id} className="custom-page-preview-progress" style={style}><div><b>{String(props.title || "İlerleme")}</b><span>{progress}%</span></div><progress max={100} value={progress} /></article>; }
      case "formCard": {
        const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
        const members = idList(props.inputs).map((id) => inputById.get(id)).filter((item): item is PageComponent => !!item);
        return <FormCardPreview key={component.id} title={String(props.title || "")} columns={columns} style={style}>{members.map((input) => renderInput(input, {}))}</FormCardPreview>;
      }
      case "filterChips": {
        const chips = idList(props.inputs).flatMap((id) => {
          const input = inputById.get(id);
          if (!input) return [];
          const inputType = String(input.props.inputType || "text");
          const raw = inputType === "checkbox" ? /^(true|1|evet)$/i.test(String(input.props.defaultValue ?? "")) : input.props.defaultValue;
          const text = chipText(raw, inputType, inputType === "select" ? optionRows(input.props).rows : undefined);
          return text === null ? [] : [{ id, label: String(input.props.label || input.name || id), text }];
        });
        return <FilterChipsPreview key={component.id} chips={chips} style={style} />;
      }
      case "facetPanel": {
        const countColumns = Object.fromEntries(parseFieldList(props.facetCounts).map((entry) => [entry.code, entry.label]));
        const groups = idList(props.inputs).flatMap((id): FacetPreviewGroup[] => {
          const input = inputById.get(id);
          if (!input || input.props.inputType !== "select") return [];
          const { ready, rows } = optionRows(input.props);
          const countColumn = countColumns[id];
          return [{ id, label: String(input.props.label || input.name || id), ready, options: rows.map(({ label, row }) => {
            const cell = countColumn ? row[countColumn] : undefined;
            const count = cell == null || cell === "" ? Number.NaN : Number(cell);
            return { label, count: Number.isFinite(count) ? count : undefined };
          }) }];
        });
        return <FacetPanelPreview key={component.id} title={String(props.title || "")} groups={groups} style={style} />;
      }
      case "contextPanel": {
        const table = typeof props.table === "string" ? definition.components.find((item) => item.id === props.table && item.type === "dataTable") : undefined;
        const tablePreview = table && typeof table.props.query === "string" ? queryPreviews[table.props.query] : undefined;
        const row = tablePreview && tablePreview.rows.length > 0 ? tablePreview.rows[0] : null;
        const formats = parseColumnFormats(table?.props.columnFormats);
        const fields = parseFieldList(props.fields).map((field) => ({ ...field, text: row ? formatCell(row[field.code], formats[field.code]) : "" }));
        const relatedPreview = typeof props.relatedQuery === "string" ? queryPreviews[props.relatedQuery] : undefined;
        const relatedCodes = (relatedPreview?.columns ?? []).slice(0, 2).map((column) => column.code);
        const related = typeof props.relatedQuery === "string" ? {
          title: String(props.relatedTitle || "İlgili kayıtlar"),
          rows: (relatedPreview?.rows ?? []).map((relatedRow) => relatedCodes.map((code) => relatedRow[code] == null ? "" : String(relatedRow[code])).filter(Boolean).join(" · ")),
        } : undefined;
        return <ContextPanelPreview key={component.id} title={String(props.title || "")} row={row} fields={fields} related={row ? related : undefined} style={style} />;
      }
      case "actionBar": return <ActionBarPreview key={component.id} style={style} bound={{
        new: idList(props.newInputs).length > 0, save: typeof props.saveQuery === "string" && props.saveQuery !== "", remove: typeof props.deleteQuery === "string" && props.deleteQuery !== "",
        filter: typeof props.focusInput === "string" && props.focusInput !== "", print: props.printEnabled === true, excel: typeof props.exportTable === "string" && props.exportTable !== "",
      }} moreCount={idList(props.moreButtons, 10).length} />;
      case "tabs": return <TabsPreview key={component.id} style={style} tabs={parseTabs(props.tabs)} defaultTab={Number(props.defaultTab ?? 0)}
        onSelect={setSelectedComponentId}
        spanFor={(id) => { const child = byComponentId.get(id); return child ? deviceSpan(spanOf(child), device) : 12; }}
        renderOwned={(id) => {
          const child = byComponentId.get(id);
          if (!child || child.type === "tabs" || child.type === "dialog") return null;
          return <>{isConditional(child) && <span className="pd-cond-chip">Koşullu</span>}{renderOne(child)}</>;
        }} />;
      case "dialog": {
        const ids = idList(props.contains, MAX_DIALOG_IDS);
        const hasSave = (typeof props.saveQuery === "string" && props.saveQuery !== "") || idList(props.saveSequence, MAX_SEQUENCE_STEPS).length > 0;
        // Pencere Sekmeler içerebilir (sekmeler pencere içeremez); özyineleme en çok iki düzeydir.
        return <DialogPreview key={component.id} style={style} title={String(props.title || "")} presentation={props.presentation === "drawer" ? "drawer" : "dialog"} ids={ids}
          saveLabel={hasSave ? String(props.saveLabel || "") : null} onSelect={setSelectedComponentId}
          spanFor={(id) => { const child = byComponentId.get(id); return child ? deviceSpan(spanOf(child), device) : 12; }}
          renderOwned={(id) => {
            const child = byComponentId.get(id);
            if (!child || child.type === "dialog") return null;
            return <>{isConditional(child) && <span className="pd-cond-chip">Koşullu</span>}{renderOne(child)}</>;
          }} />;
      }
      case "editableGrid": {
        const mode = props.gridMode === "stage" || props.gridMode === "matrix" ? props.gridMode : "list";
        return <EditableGridPreview key={component.id} style={style} title={String(props.title || "")} mode={mode} columns={parseGridColumns(props.gridColumns)}
          fixedRowLabel={String(props.fixedRowLabel || "")} addLabel={String(props.addLabel || "")} />;
      }
      case "customFieldsBlock": {
        const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
        const preview = typeof props.definitionsQuery === "string" ? queryPreviews[props.definitionsQuery] : undefined;
        return <CustomFieldsPreview key={component.id} style={style} title={String(props.title || "")} columns={columns} definitions={preview ? preview.rows : null} />;
      }
      case "image": {
        const height = typeof props.height === "number" ? Math.max(40, Math.min(400, props.height)) : 160;
        return <ImagePreview key={component.id} style={style} title={String(props.title || "")} value={String(props.value || "")} height={height} />;
      }
      default: return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String((component as PageComponent).type)}</b></article>;
    }
  };
  // Sekmedeki ve penceredeki bileşenler yalnız sahibinin içinde, satır işlemi düğmeleri listenin İşlemler sütununda çizilir
  // (kod bileşeni iki kez çalışmasın diye üst düzeyde hiç oluşturulmaz).
  const nested = new Set([...tabOwnedIds(definition.components), ...dialogOwnedIds(definition.components), ...rowActionIds(definition.components)]);
  return definition.components.map((component) => nested.has(component.id) ? null : renderOne(component));
  }, [definition, forms, sources, previewData, queryPreviews, counts, token, role, device]);

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
  // Sorgunun sütunları: son önizleme; önizleme yoksa ERP işlemi sorgusunda katalogdaki sonuç sütunları. Kod tekildir.
  const queryColumns = (queryId: string): { code: string; label: string; dataType: string }[] => {
    const preview = queryPreviews[queryId]?.columns ?? [];
    const query = definition.queries.find((item) => item.id === queryId);
    const op = query && isOperationQuery(query) ? findOperation(erpCatalog, query.operation) : undefined;
    const seen = new Set<string>();
    return [...preview, ...(op?.result.columns ?? [])].filter((column) => !seen.has(column.code) && !!seen.add(column.code));
  };
  // {{ önerileri: sorgu sonuçları (son önizleme sütunları), adlı girişler, sorguya bağlı adlı ızgaraların seçili satırı ve oturum.
  const bindingSuggestions: BindingSuggestion[] = [];
  for (const query of definition.queries) {
    if (!identifier.test(query.name)) continue;
    if (isWriteKind(query.kind)) {
      // ERP yazma işleminin yanıtı (record) {{sorgu.sonuc.alan}} olarak bağlanabilir.
      const op = isOperationQuery(query) ? findOperation(erpCatalog, query.operation) : undefined;
      if (op?.result.shape === "record") for (const column of op.result.columns) if (identifier.test(column.code))
        bindingSuggestions.push({ path: `${query.name}.sonuc.${column.code}`, detail: `İşlem sonucu · ${column.label || column.dataType}`, group: "Sorgular" });
      continue;
    }
    bindingSuggestions.push({ path: `${query.name}.rows`, detail: "Sorgu satırları", group: "Sorgular" }, { path: `${query.name}.rowCount`, detail: "Satır sayısı", group: "Sorgular" });
    // Düzleştirilmiş işlemlerin sütun kodları noktalıdır ("balance.code"); bağlama iç nesne üzerinden aynı değere çözülür.
    for (const column of queryColumns(query.id)) if (columnPath.test(column.code)) bindingSuggestions.push({ path: `${query.name}.rows[0].${column.code}`, detail: `İlk satır · ${column.dataType}`, group: "Sorgular" });
    const op = isOperationQuery(query) ? findOperation(erpCatalog, query.operation) : undefined;
    for (const key of op?.result.metaPaths ?? []) if (identifier.test(key))
      bindingSuggestions.push({ path: `${query.name}.meta.${key}`, detail: `Üst bilgi${queryPreviews[query.id]?.meta?.[key] != null ? ` (şu an ${String(queryPreviews[query.id]?.meta?.[key])})` : ""}`, group: "Sorgular" });
  }
  for (const component of definition.components) {
    if (!component.name || !identifier.test(component.name)) continue;
    if (component.type === "input") bindingSuggestions.push({ path: `${component.name}.value`, detail: "Giriş değeri", group: "Girişler" });
    if (component.type === "input" && component.props.inputType === "lookup") {
      bindingSuggestions.push({ path: `${component.name}.search`, detail: "Arama kutusuna yazılan metin (en az karakterden kısaysa boş)", group: "Girişler" });
      if (typeof component.props.optionsQuery === "string")
        for (const column of queryColumns(component.props.optionsQuery)) if (columnPath.test(column.code)) bindingSuggestions.push({ path: `${component.name}.seciliSatir.${column.code}`, detail: "Arama kutusunda seçilen satır", group: "Girişler" });
    }
    if (component.type === "dataTable" && typeof component.props.query === "string")
      for (const column of queryColumns(component.props.query)) if (columnPath.test(column.code)) bindingSuggestions.push({ path: `${component.name}.seciliSatir.${column.code}`, detail: "Izgarada seçili satır", group: "Izgarada seçili satır" });
    if (isPagedTable(component)) bindingSuggestions.push(
      { path: `${component.name}.sayfa`, detail: "Listenin açık sayfası (1'den başlar)", group: "Izgarada seçili satır" },
      { path: `${component.name}.sayfaBoyutu`, detail: "Listenin sayfa boyutu", group: "Izgarada seçili satır" });
    if (component.type === "editableGrid") {
      const grid = component.name;
      bindingSuggestions.push(
        { path: `${grid}.satirlar`, detail: "Tablonun satırları (liste parametresine)", group: "Düzenlenebilir tablolar" },
        { path: `${grid}.eklenenSayisi`, detail: "Eklenen satır sayısı", group: "Düzenlenebilir tablolar" },
        { path: `${grid}.silinenSayisi`, detail: "Silinecek satır sayısı", group: "Düzenlenebilir tablolar" },
        { path: `${grid}.degisti`, detail: "Tabloda kaydedilmemiş değişiklik var mı", group: "Düzenlenebilir tablolar" });
      if (component.props.gridMode === "stage") {
        const gridCodes = parseGridColumns(component.props.gridColumns).map((column) => column.code);
        const sourceCodes = typeof component.props.sourceQuery === "string" ? queryColumns(component.props.sourceQuery).map((column) => column.code) : [];
        for (const code of gridCodes) if (columnPath.test(code)) bindingSuggestions.push({ path: `${grid}.eklenenSatir.${code}`, detail: "Kayıt dizisinde her satır için", group: "Düzenlenebilir tablolar" });
        for (const code of [...new Set([...gridCodes, ...sourceCodes])]) if (columnPath.test(code)) bindingSuggestions.push({ path: `${grid}.silinenSatir.${code}`, detail: "Kayıt dizisinde her satır için", group: "Düzenlenebilir tablolar" });
      }
    }
    if (component.type === "customFieldsBlock") bindingSuggestions.push(
      { path: `${component.name}.degerler`, detail: "Özel alan değerleri (eşlem parametresine)", group: "Özel alanlar" },
      { path: `${component.name}.degisti`, detail: "Özel alanlarda kaydedilmemiş değişiklik var mı", group: "Özel alanlar" });
    if (component.type === "dialog") bindingSuggestions.push({ path: `${component.name}.acik`, detail: "Pencere açık mı", group: "Pencereler" });
    if (component.type === "button" && typeof component.props.promptLabel === "string" && component.props.promptLabel !== "")
      bindingSuggestions.push({ path: `${component.name}.yanit`, detail: "Düğmenin sorduğu gerekçenin yanıtı (yalnız o çalıştırmada)", group: "Düğmeler" });
  }
  bindingSuggestions.push({ path: "kullanici.id", detail: "Oturumdaki kullanıcı kimliği", group: "Oturum" }, { path: "kullanici.ad", detail: "Oturumdaki kullanıcı adı", group: "Oturum" },
    { path: "kullanici.rol", detail: "Oturumdaki kullanıcının rolü", group: "Oturum" }, { path: "bugun", detail: "Bugünün tarihi (YYYY-AA-GG)", group: "Oturum" });
  for (const source of sources) if (isCountableSource(source.code))
    bindingSuggestions.push({ path: `${COUNTS_ROOT}.${source.code}`, detail: `${source.label} · kayıt sayısı${typeof counts[source.code] === "number" ? ` (şu an ${counts[source.code].toLocaleString("tr-TR")})` : ""}`, group: "Sayılar" });
  // Aynı yol birden çok kaynaktan gelebilir (ör. ızgara sütunu hem eklenen hem kaynak); ilk geçen kalır.
  {
    const seenPaths = new Set<string>();
    const unique = bindingSuggestions.filter((item) => !seenPaths.has(item.path) && !!seenPaths.add(item.path));
    bindingSuggestions.splice(0, bindingSuggestions.length, ...unique);
  }
  // {{onceki.sonuc.X}} yalnız bir kayıt dizisi adımı olan sorgunun parametrelerinde önerilir: dizide bu adımdan önceki
  // yazma adımlarının (ERP işlemi kayıt yanıtı) sütunları.
  const sequenceSuggestions: BindingSuggestion[] = (() => {
    const query = definition.queries.find((item) => item.id === selectedQueryId);
    if (!query) return [];
    const codes = new Set<string>();
    let isStep = false;
    for (const component of definition.components) {
      const steps = idList(component.props.saveSequence, MAX_SEQUENCE_STEPS);
      const index = steps.indexOf(query.id);
      if (index < 0) continue;
      isStep = true;
      for (const stepId of steps.slice(0, index)) {
        const step = definition.queries.find((item) => item.id === stepId);
        const op = step && isOperationQuery(step) ? findOperation(erpCatalog, step.operation) : undefined;
        if (op?.result.shape === "record") for (const column of op.result.columns) if (columnPath.test(column.code)) codes.add(column.code);
      }
    }
    if (!isStep) return [];
    return [...codes].map((code) => ({ path: `onceki.sonuc.${code}`, detail: "Dizide bir önceki adımın sonucu", group: "Kayıt dizisi" }));
  })();
  const readQueries = definition.queries.filter((query) => !isWriteKind(query.kind));
  const buttonAction = selected?.type === "button" && ["query", "sequence", "openDialog"].includes(String(selected.props.actionType)) ? String(selected.props.actionType) : "workflow";
  const writeQueries = definition.queries.filter((query) => isWriteKind(query.kind));
  const pageDialogs = definition.components.filter((component) => component.type === "dialog");
  const actionQuery = selected && typeof selected.props.queryId === "string" ? definition.queries.find((query) => query.id === selected.props.queryId) : undefined;
  const refreshIds = selected && Array.isArray(selected.props.refreshQueries) ? selected.props.refreshQueries.filter((id): id is string => typeof id === "string" && readQueries.some((query) => query.id === id)) : [];
  const refreshOptions = readQueries.filter((query) => !refreshIds.includes(query.id));
  const selectedQueryRef = selected && typeof selected.props.query === "string" ? selected.props.query : null;
  // Göstergenin "Değer" modu: sorgu ve rapor kaynağı yok, değer metni (sabit sayı ya da {{değişken}}) var.
  const metricValueMode = !!selected && selected.type === "metric" && !selectedQueryRef && !selected.props.source && typeof selected.props.value === "string";
  const filterInputId = selected && typeof selected.props.filterInput === "string" ? selected.props.filterInput : "";
  const namedInputs = definition.components.filter((component) => component.type === "input" && !!component.name).map((component) => ({ id: component.id, name: component.name as string }));
  const toneMapEntries = selected && Array.isArray(selected.props.toneMap) ? selected.props.toneMap.filter((item): item is string => typeof item === "string") : [];
  const columnFormatEntries = selected && Array.isArray(selected.props.columnFormats) ? selected.props.columnFormats.filter((item): item is string => typeof item === "string") : [];
  const hasStatusFormat = columnFormatEntries.some((item) => item.endsWith("=status"));
  const totalsSelected = selected && Array.isArray(selected.props.totals) ? selected.props.totals.filter((item): item is string => typeof item === "string") : [];
  const selectedQueryColumns = selectedQueryRef ? queryPreviews[selectedQueryRef]?.columns ?? [] : [];
  const formatSourceColumns: { code: string; label: string; dataType?: string }[] = selectedQueryRef ? selectedQueryColumns : selectedSource?.columns ?? [];
  const formatColumns = formatSourceColumns.filter((column) => !column.code.includes("=") && (selectedColumns.length === 0 || selectedColumns.includes(column.code)));
  const totalsFormats = parseColumnFormats(columnFormatEntries);
  const totalsCandidatesBase = formatColumns.filter((column) => totalsFormats[column.code] ? totalsFormats[column.code] === "number" || totalsFormats[column.code] === "money" : column.dataType === "number" || column.dataType === "decimal");
  // Biçim ya da gösterilen sütunlar değişince adaylıktan düşen seçili toplam girdileri de listelenir; böylece işaretleri kaldırılabilir.
  const totalsCandidates = [...totalsCandidatesBase, ...totalsSelected.filter((code) => !totalsCandidatesBase.some((column) => column.code === code)).map((code) => ({ code, label: code }))];

  // Düzen bileşenleri (formCard, contextPanel, filterChips, facetPanel) için müfettiş verileri.
  const pageInputs: PickerInput[] = definition.components.filter((component) => component.type === "input").map((component) => ({
    id: component.id, name: component.name, label: String(component.props.label || component.name || "Giriş"), inputType: String(component.props.inputType || "text"),
    hasOptions: typeof component.props.optionsQuery === "string" && readQueries.some((query) => query.id === component.props.optionsQuery),
  }));
  const layoutOwners: Record<string, string> = {};
  if (selected) for (const component of definition.components) {
    if (component.id === selected.id || (component.type !== "formCard" && component.type !== "facetPanel")) continue;
    for (const id of idList(component.props.inputs)) layoutOwners[id] = summaryOf(component);
  }
  // Sunucu sayfalı listenin arama girişi listeye aittir: başka yerleşime alınamaz; listeler de birbirinin girişini alamaz.
  if (selected) for (const component of definition.components) {
    if (component.id === selected.id || !isPagedTable(component) || typeof component.props.searchInput !== "string") continue;
    layoutOwners[component.props.searchInput] = `${summaryOf(component)} · arama`;
  }
  const layoutInputIds = selected ? idList(selected.props.inputs) : [];
  // İşlem Çubuğu müfettişi: bağlanabilir düğmeler, sorgulu ızgaralar ve seçili listeler.
  const pageButtons: PickerInput[] = definition.components.filter((component) => component.type === "button").map((component) => ({
    id: component.id, name: component.name, label: String(component.props.label || component.name || "Düğme"), inputType: "button", hasOptions: false,
  }));
  const queryTables = definition.components.filter((component) => component.type === "dataTable" && typeof component.props.query === "string" && component.props.query !== "");
  const barNewInputs = selected?.type === "actionBar" ? idList(selected.props.newInputs) : [];
  const barMoreButtons = selected?.type === "actionBar" ? idList(selected.props.moreButtons, 10) : [];
  // Satır işlemi düğmeleri listeye aittir; İşlem Çubuğu menüsüne alınamaz (soluk gösterilir).
  const rowActionOwners: Record<string, string> = {};
  if (selected?.type === "actionBar") for (const component of definition.components) {
    if (component.type !== "dataTable") continue;
    for (const id of idList(component.props.rowActions, MAX_ROW_ACTIONS)) rowActionOwners[id] = `${summaryOf(component)} · satır işlemi`;
  }
  // İşlem Çubuğunun kaydetme yolu: dizi doluysa "Kaydet dizisi"; boş dizi seçimi bileşen kimliğiyle birlikte hatırlanır.
  const barSaveMode: "query" | "sequence" = selected?.type !== "actionBar" ? "query"
    : idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS).length > 0 ? "sequence"
      : typeof selected.props.saveQuery === "string" && selected.props.saveQuery !== "" ? "query"
        : barSaveChoice?.id === selected.id ? barSaveChoice.mode : "query";
  const eligibleTables = definition.components.filter((component) => component.type === "dataTable" && !!component.name && typeof component.props.query === "string" && component.props.query !== "");
  const contextTable = selected?.type === "contextPanel" && typeof selected.props.table === "string" ? eligibleTables.find((component) => component.id === selected.props.table) : undefined;
  const contextColumns = contextTable ? queryPreviews[String(contextTable.props.query)]?.columns ?? [] : [];
  const contextFields = selected?.type === "contextPanel" ? parseFieldList(selected.props.fields) : [];
  const facetCountEntries = selected && Array.isArray(selected.props.facetCounts) ? selected.props.facetCounts.filter((item): item is string => typeof item === "string") : [];
  const setFacetCount = (inputId: string, column: string) => {
    if (!selected) return;
    const rest = facetCountEntries.filter((entry) => entry.slice(0, entry.indexOf("=")) !== inputId);
    const next = column ? [...rest, `${inputId}=${column}`] : rest;
    patchComponent(selected.id, { facetCounts: next.length ? next : undefined });
  };
  // Tek alan yazımı: değer varsa birleştirilen geri alma adımıyla yazılır, boşsa özellik silinir.
  const setOptionalProp = (id: string, key: string, value: PropValue | undefined) => {
    if (value === undefined) patchComponent(id, { [key]: undefined }); else updateComponent(id, key, value);
  };
  // "Giriş" bölümünün arama kutusu alanları. Seçenek sütunları önizleme yoksa katalogdaki sonuç sütunlarından listelenir.
  const renderLookupFields = (input: PageComponent) => {
    const props = input.props;
    const optionsQueryId = typeof props.optionsQuery === "string" ? props.optionsQuery : "";
    const columns = optionsQueryId ? queryColumns(optionsQueryId).filter((column) => column.code.length <= 128) : [];
    const columnField = (key: "optionLabelColumn" | "optionValueColumn" | "optionDescriptionColumn", label: string, empty: string) => {
      const chosen = typeof props[key] === "string" ? String(props[key]) : "";
      return <label key={key} className="pd-field">{label}
        {columns.length > 0
          ? <select value={chosen} onChange={(event) => patchComponent(input.id, { [key]: event.target.value || undefined })}><option value="">{empty}</option>{columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}{chosen && !columns.some((column) => column.code === chosen) && <option value={chosen}>{chosen}</option>}</select>
          : <input value={chosen} maxLength={128} spellCheck={false} placeholder="Sütun adı" onChange={(event) => patchComponent(input.id, { [key]: event.target.value.trim() || undefined })}/>}
      </label>;
    };
    const minChars = typeof props.minChars === "number" ? props.minChars : 1;
    const staticOptions = Array.isArray(props.staticOptions) ? props.staticOptions.filter((item): item is string => typeof item === "string") : [];
    const badStatic = staticOptions.find((entry) => !STATIC_OPTION.test(entry));
    return <>
      <label className="pd-field">Seçenek sorgusu<select value={optionsQueryId} onChange={(event) => patchComponent(input.id, { optionsQuery: event.target.value || undefined, optionLabelColumn: undefined, optionValueColumn: undefined, optionDescriptionColumn: undefined })}><option value="">Sorgu seçin</option>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select>
        <small>{LOOKUP_HELP.replace("<ad>", input.name || "<ad>")}</small>
        {readQueries.length === 0 && <small>Önce Sorgular sekmesinde bir okuma sorgusu ekleyin.</small>}</label>
      {optionsQueryId && <>
        {columnField("optionLabelColumn", "Etiket sütunu", "(Değer sütunu kullanılır)")}
        {columnField("optionValueColumn", "Değer sütunu", "(İlk sütun kullanılır)")}
        {columnField("optionDescriptionColumn", "Açıklama sütunu", "(Açıklama yok)")}
      </>}
      <label className="pd-field">Sabit seçenekler<small>Her satıra bir “değer=Etiket” yazın; boş değer için “=Tüm depolar”. Sorgu sonuçlarından önce gösterilir (en fazla {MAX_STATIC_OPTIONS}).</small>
        <StaticOptionsField key={input.id} value={staticOptions} onChange={(next) => patchComponent(input.id, { staticOptions: next.length > 0 ? next : undefined })}/>
        {badStatic !== undefined && <small className="pd-query-warning">'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır.</small>}</label>
      {!optionsQueryId && parseStaticOptions(staticOptions).length === 0 && <small className="pd-query-warning">Arama kutusu için seçenek sorgusu veya sabit seçenek gerekli.</small>}
      <label className="pd-field">En az karakter<small>Arama bu kadar karakterden sonra başlar (0–5).</small>
        <input type="number" min={0} max={5} step={1} value={minChars} onChange={(event) => {
          const raw = Number(event.target.value);
          if (event.target.value === "" || !Number.isInteger(raw)) return;
          const clamped = Math.max(0, Math.min(5, raw));
          patchComponent(input.id, { minChars: clamped === 1 ? undefined : clamped });
        }}/></label>
      <label className="pd-check"><input type="checkbox" checked={props.allowClear === true} onChange={(event) => patchComponent(input.id, { allowClear: event.target.checked ? true : undefined })}/>Temizlenebilir</label>
    </>;
  };
  // "Giriş" bölümünün Doğrulama alanları (türe göre). İstemci denetimi kolaylıktır; sunucu doğrulaması her zaman çalışır.
  const renderValidationFields = (input: PageComponent) => {
    const props = input.props;
    const inputType = String(props.inputType || "text");
    const numberOf = (raw: string) => raw.trim() === "" || !Number.isFinite(Number(raw)) ? undefined : Number(raw);
    const minValue = props.min;
    const maxValue = props.max;
    const rangeProblem = inputType === "number" && typeof minValue === "number" && typeof maxValue === "number" && minValue > maxValue
      || inputType === "date" && typeof minValue === "string" && typeof maxValue === "string" && minValue > maxValue
      ? "En az değeri en fazla değerinden büyük olamaz." : null;
    const step = props.step;
    const stepProblem = typeof step === "number" && (step <= 0 || step > 1_000_000) ? "Adım 0'dan büyük ve en fazla 1.000.000 olmalıdır." : null;
    const maxLength = props.maxLength;
    const lengthProblem = typeof maxLength === "number" && (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4000) ? "En fazla karakter 1 ile 4.000 arasında bir tam sayı olmalıdır." : null;
    const pattern = typeof props.pattern === "string" ? props.pattern : "";
    const bound = (key: "min" | "max", label: string) => inputType === "date"
      ? <label className="pd-field">{label}<input type="date" value={typeof props[key] === "string" && ISO_DATE.test(String(props[key])) ? String(props[key]) : ""} onChange={(event) => setOptionalProp(input.id, key, ISO_DATE.test(event.target.value) ? event.target.value : undefined)}/></label>
      : <label className="pd-field">{label}<input type="number" value={typeof props[key] === "number" ? props[key] as number : ""} onChange={(event) => setOptionalProp(input.id, key, numberOf(event.target.value))}/></label>;
    return <div className="pd-validation">
      <div className="pd-field">Doğrulama<small>ERP'de kayıttan önce denetlenir; sunucudaki doğrulamanın yerini almaz.</small></div>
      <label className="pd-check"><input type="checkbox" checked={props.required === true} onChange={(event) => patchComponent(input.id, { required: event.target.checked ? true : undefined })}/>Zorunlu</label>
      {(inputType === "number" || inputType === "date") && <div className="pd-field-row">{bound("min", "En az")}{bound("max", "En fazla")}</div>}
      {rangeProblem && <small className="pd-query-warning">{rangeProblem}</small>}
      {inputType === "number" && <label className="pd-field">Adım<small>Ör. 0.01 kuruş, 1 tam sayı.</small><input type="number" min={0} value={typeof step === "number" ? step : ""} onChange={(event) => setOptionalProp(input.id, "step", numberOf(event.target.value))}/>
        {stepProblem && <small className="pd-query-warning">{stepProblem}</small>}</label>}
      {inputType === "text" && <>
        <label className="pd-field">En fazla karakter<input type="number" min={1} max={4000} value={typeof maxLength === "number" ? maxLength : ""} onChange={(event) => setOptionalProp(input.id, "maxLength", numberOf(event.target.value))}/>
          {lengthProblem && <small className="pd-query-warning">{lengthProblem}</small>}</label>
        <label className="pd-field">Biçim (düzenli ifade)<small>Değerin tamamı eşleşmelidir, ör. [A-Z]{"{3}"}-\d+</small>
          <input className="pd-condition-input" value={pattern} maxLength={200} spellCheck={false} onChange={(event) => {
            const next = event.target.value;
            if (next === "") patchComponent(input.id, { pattern: undefined, patternMessage: undefined }); else updateComponent(input.id, "pattern", next);
          }}/>
          {pattern && patternProblem(pattern) && <small className="pd-query-warning">{patternProblem(pattern)}</small>}</label>
        {pattern && <label className="pd-field">Biçim hatası mesajı<small>Boşsa “Değer beklenen biçimde değil.” gösterilir.</small>
          <input value={typeof props.patternMessage === "string" ? props.patternMessage : ""} maxLength={120} onChange={(event) => setOptionalProp(input.id, "patternMessage", sanitizeSafeValue(event.target.value, false) || undefined)}/></label>}
        <label className="pd-check"><input type="checkbox" checked={props.upperCase === true} onChange={(event) => patchComponent(input.id, { upperCase: event.target.checked ? true : undefined })}/>Büyük harfe çevir</label>
      </>}
    </div>;
  };
  // Sekmeler müfettişi: sekmeye alınabilecek bileşenler (sunucudaki sekme kuralı) ve başka Sekmeler bileşenlerinin sahiplikleri.
  const tabCandidates: PickerInput[] = selected?.type === "tabs" ? (() => {
    return ownableCandidates(definition.components, { id: selected.id, type: "tabs" })
      .map((component) => {
        const summary = summaryOf(component);
        const title = titleFor(component.type);
        return { id: component.id, name: component.name, label: summary === title ? title : `${title}: ${summary}`, inputType: component.type, hasOptions: false };
      });
  })() : [];
  const tabsTakenElsewhere: Record<string, string> = {};
  if (selected?.type === "tabs") for (const component of definition.components) {
    if (component.type !== "tabs" || component.id === selected.id) continue;
    for (const tab of parseTabs(component.props.tabs)) for (const id of tab.ids) tabsTakenElsewhere[id] = `${summaryOf(component)} · ${tab.label}`;
  }
  // Pencereye alınmış bileşenler de başka bir sahibe aittir (sekmede soluk gösterilir).
  if (selected?.type === "tabs") for (const component of definition.components) {
    if (component.type !== "dialog") continue;
    for (const id of idList(component.props.contains, MAX_DIALOG_IDS)) tabsTakenElsewhere[id] = `${summaryOf(component)} · pencere`;
  }
  const setTabs = (id: string, tabs: TabEntry[], defaultTab: number) => patchComponent(id, { tabs: tabsValue(tabs), defaultTab: tabs.length > 0 ? defaultTab : undefined });
  // "Sayfalama" bölümü (veri listesi): sunucu sayfalaması adlı, ERP işlemine bağlı ve işlemi page/pageSize alan listede açılabilir.
  const pagedQuery = selected?.type === "dataTable" && selectedQueryRef ? definition.queries.find((query) => query.id === selectedQueryRef) : undefined;
  const pagedOp = pagedQuery && isOperationQuery(pagedQuery) ? findOperation(erpCatalog, pagedQuery.operation) : undefined;
  const pagingOn = !!selected && isPagedTable(selected);
  const pagingSharedWith = pagedQuery ? definition.components.find((component) => component.id !== selected?.id && isPagedTable(component) && component.props.query === pagedQuery.id) : undefined;
  const pagingBlocked = !selected?.name || !identifier.test(selected.name) ? "Önce listeye bir Ad verin."
    : !pagedQuery || !isOperationQuery(pagedQuery) ? "Liste bir ERP işlemi sorgusuna bağlı olmalıdır."
      : erpCatalog.status !== "ready" ? "ERP işlem listesi yükleniyor."
        : !supportsServerPaging(pagedOp) ? "Bu ERP işlemi sayfalamayı desteklemiyor (page / pageSize parametresi yok)."
          : pagingSharedWith ? `Bu sorgu zaten “${summaryOf(pagingSharedWith)}” listesinde sayfalı kullanılıyor.`
            : !queryEditable ? "Sayfalama sorgu parametrelerini değiştirir; yalnız tenant yöneticisi açabilir."
              : null;
  const setServerPaging = (on: boolean) => {
    if (!selected || !pagedQuery || !queryEditable) return;
    if (on && (pagingBlocked || !selected.name)) return;
    const table = selected.name ?? "";
    commit((state) => ({
      ...state,
      queries: state.queries.map((query) => query.id !== pagedQuery.id ? query
        : on ? withPagingBindings(query, table, { page: "page", pageSize: "pageSize" }) : withoutPagingBindings(query, table)),
      components: state.components.map((component) => component.id !== selected.id ? component
        : { ...component, props: on ? { ...component.props, paging: "server", pageParam: "page", pageSizeParam: "pageSize", pageSize: DEFAULT_PAGE_SIZE } : stripPagingProps(component.props) }),
    }));
  };
  // Arama girişi adayları: metin türündeki girişler; form kartı / yan filtre paneli / sekme / başka listeye ait olanlar soluk.
  const searchOwners: Record<string, string> = { ...layoutOwners };
  if (pagingOn) for (const component of definition.components) {
    if (component.type !== "tabs") continue;
    for (const tab of parseTabs(component.props.tabs)) for (const id of tab.ids) searchOwners[id] ??= `${summaryOf(component)} · ${tab.label}`;
  }
  const pageSizeValue = selected && typeof selected.props.pageSize === "number" ? selected.props.pageSize : DEFAULT_PAGE_SIZE;
  const pageSizeProblem = !Number.isInteger(pageSizeValue) || pageSizeValue < MIN_PAGE_SIZE || pageSizeValue > MAX_PAGE_SIZE ? `Sayfa boyutu ${MIN_PAGE_SIZE} ile ${MAX_PAGE_SIZE} arasında bir tam sayı olmalıdır.` : null;
  const metaColumns = (pagedOp?.result.metaPaths ?? []).filter((key) => identifier.test(key) && key.length <= 64).map((key) => ({ code: key, label: key }));
  const footerMetaEntries = selected && Array.isArray(selected.props.footerMeta) ? selected.props.footerMeta.filter((item): item is string => typeof item === "string") : [];

  return <main className={`pd-shell${fullscreen ? " pd-fullscreen" : ""}`}>
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
        <button type="button" className={`pd-icon-button pd-fullscreen-toggle${fullscreen ? " active" : ""}`} onClick={() => setFullscreen((value) => !value)} aria-pressed={fullscreen} title={fullscreen ? "Tam ekrandan çık (Esc)" : "Tam ekran"} aria-label={fullscreen ? "Tam ekrandan çık" : "Tam ekran"}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
        {current && <button type="button" className={`pd-button ${rightMode === "history" ? "active" : ""}`} onClick={() => setRightMode((value) => value === "history" ? "inspector" : "history")}><History size={15}/>Geçmiş<span className="pd-count">{history.length}</span></button>}
        <button type="button" className="pd-button" onClick={() => void openErpPreview()} disabled={saving}><Eye size={15}/>{current?.isPublished ? "ERP'de aç" : "ERP'de önizle"}</button>
        {(current ? capabilities?.canUpdate : capabilities?.canCreate) && !current?.isPublished && <button type="button" className="pd-button" onClick={() => void saveDraft()} disabled={saving || !canEdit || (!dirty && !!current)} title="Kaydet (Ctrl+S)"><Save size={15}/>{saving ? "Kaydediliyor…" : "Kaydet"}</button>}
        {!current?.isPublished && capabilities?.canPublish && <button type="button" className="pd-button primary" onClick={() => void publish()} disabled={saving || !canEdit}><Send size={15}/>{dirty || !current ? "Kaydet ve yayımla" : "Yayımla"}</button>}
        {current?.isPublished && capabilities?.canCreate && !queryPageLocked && <button type="button" className="pd-button primary" onClick={() => void createFromPublished(current)} disabled={saving}><FilePlus2 size={15}/>Yeni taslakta düzenle</button>}
      </div>
    </header>
    {(error || notice || (current && !canEdit)) && <div className="pd-messages">
      {current && !canEdit && <div className="pd-message readonly"><Lock size={14}/><span>{current.isPublished && !queryPageLocked ? "Yayımlanmış sürüm salt okunur. Değişiklik yapmak için yeni bir taslak oluşturun." : queryPageLocked ? QUERY_PAGE_ADMIN_ONLY : "Bu taslağı düzenleme yetkiniz yok; yalnızca görüntüleyebilirsiniz."}</span></div>}
      {error && <div className="pd-message error" role="alert"><span>{error}</span><button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={14}/></button></div>}
      {notice && !error && <div className="pd-message success" role="status"><span>{notice}{previewHref && notice === blockedPreviewNotice && <> <a href={previewHref} target="_blank" rel="noopener noreferrer" onClick={() => { setPreviewHref(null); setNotice(""); }}>ERP önizlemesini aç</a></>}</span><button type="button" aria-label="Kapat" onClick={() => { setNotice(""); setPreviewHref(null); }}><X size={14}/></button></div>}
    </div>}

    <div className={`pd-workspace${leftTab === "queries" ? " pd-query-wide" : ""}`}>
      <aside className="pd-left" aria-label="Bileşenler ve katmanlar">
        <div className="pd-tabs pd-query-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={leftTab === "components"} className={leftTab === "components" ? "active" : ""} onClick={() => setLeftTab("components")}><Plus size={14}/>Bileşenler</button>
          <button type="button" role="tab" aria-selected={leftTab === "layers"} className={leftTab === "layers" ? "active" : ""} onClick={() => setLeftTab("layers")}><Layers size={14}/>Katmanlar<span className="pd-count">{definition.components.length}</span></button>
          <button type="button" role="tab" aria-selected={leftTab === "queries"} className={leftTab === "queries" ? "active" : ""} onClick={() => setLeftTab("queries")}><Database size={14}/>Sorgular<span className="pd-count">{definition.queries.length}</span></button>
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
              const taken = item.type === "actionBar" && !!actionBarOf(definition.components);
              return <button type="button" key={item.type} className="pd-palette-item" draggable={canEdit && !taken} disabled={!canEdit || taken} title={taken ? "Sayfada zaten bir İşlem Çubuğu var" : undefined}
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
        {leftTab === "queries" && <QueriesPanel queries={definition.queries} selectedId={selectedQueryId} onSelect={setSelectedQueryId}
          editable={queryEditable} readOnlyReason={!isAdmin ? "Sorguları yalnız tenant yöneticisi ekleyip düzenleyebilir; bu sekmeyi salt okunur görüyorsunuz." : null}
          schema={sqlSchema} suggestions={sequenceSuggestions.length > 0 ? [...bindingSuggestions, ...sequenceSuggestions] : bindingSuggestions} previews={queryPreviews} components={definition.components}
          previewBlockedReason={current?.isPublished ? "Önizleme yalnız taslakta çalışır; önce yeni taslak oluşturun." : null}
          takenNames={(queryId) => takenNames({ queryId })} onAdd={addQuery} onUpdate={updateQuery} onRemove={removeQuery} onPreview={runQueryPreview}
          catalog={erpCatalog} onAddSourceQuery={addSourceQuery}/>}
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
                  className={`pd-block ${ownedIds.has(component.id) || tabIds.has(component.id) || nestedIds.has(component.id) || (component.type === "button" && movedIds.has(component.id)) ? "is-owned" : ""} ${isSelected ? "is-selected" : ""} ${dragging === component.id ? "is-dragging" : ""} ${drop ? `drop-${drop}-${horizontal ? "h" : "v"}` : ""}`}
                  style={{ gridColumn: `span ${deviceSpan(spanOf(component), device)}` }}
                  draggable={canEdit}
                  onClick={(event) => { event.stopPropagation(); setSelectedComponentId(component.id); }}
                  onDragStart={(event) => { if (resizing.current) { event.preventDefault(); return; } event.dataTransfer.setData("application/x-nexora-index", String(index)); event.dataTransfer.effectAllowed = "move"; setDragging(component.id); }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                  onDragOver={(event) => dragOverBlock(index, component, event)}
                  onDrop={(event) => dropAt(drop === "after" ? index + 1 : index, event)}>
                  <span className="pd-block-label">{titleFor(component.type)} · {spanOf(component)}/12</span>
                  {isConditional(component) && <span className="pd-cond-chip" title={String(component.props.visibleWhen)}>Koşullu</span>}
                  {isSelected && canEdit && <div className="pd-block-toolbar" onClick={(event) => event.stopPropagation()}>
                    <button type="button" title="Yukarı taşı (Alt+↑)" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => moveComponent(index, -1)}><ArrowUp size={13}/></button>
                    <button type="button" title="Aşağı taşı (Alt+↓)" aria-label="Aşağı taşı" disabled={index === definition.components.length - 1} onClick={() => moveComponent(index, 1)}><ArrowDown size={13}/></button>
                    <button type="button" title="Kopyala (Ctrl+D)" aria-label="Kopyala" disabled={component.type === "actionBar"} onClick={() => duplicateComponent(component.id)}><Copy size={13}/></button>
                    <button type="button" title="Sil (Delete)" aria-label="Sil" className="danger" onClick={() => removeComponent(component.id)}><Trash2 size={13}/></button>
                  </div>}
                  <div className="pd-block-render">{rendered[index]}</div>
                  {isSelected && canEdit && device === "desktop" && <span className="pd-resize" role="presentation" draggable={false} title="Genişliği sürükleyerek değiştirin" onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => startResize(component, event)} onClick={(event) => event.stopPropagation()}/>}
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
            <label className="pd-field">Ad<small>Bağlamada kullanılır{selected.type === "input" ? ", ör. {{ad.value}}" : selected.type === "dataTable" ? ", ör. {{ad.seciliSatir.Sutun}}" : selected.type === "editableGrid" ? ", ör. {{ad.satirlar}}" : selected.type === "customFieldsBlock" ? ", ör. {{ad.degerler}}" : selected.type === "dialog" ? ", ör. {{ad.acik}}" : ""}. {requiredNameBase(selected.type) ? "Zorunlu." : "İsteğe bağlı."}</small>
              <input className="pd-binding-name" value={selected.name ?? ""} maxLength={64} spellCheck={false} placeholder={selected.type === "input" ? "gunEsigi" : selected.type === "dataTable" ? "izgara" : selected.type === "editableGrid" ? "tablo1" : selected.type === "customFieldsBlock" ? "ozelAlanlar1" : ""} onChange={(event) => setComponentName(selected.id, event.target.value.trim())}/>
              {selected.name && nameProblem(selected.name, takenNames({ componentId: selected.id })) && <small className="pd-query-warning">{nameProblem(selected.name, takenNames({ componentId: selected.id }))}</small>}
            </label>
            {(contentFields[selected.type].length > 0 || Object.keys(selected.props).some((key) => !managedKeys.has(key))) && section("content", "İçerik", <>
              {contentFields[selected.type].map((field) => {
                const value = selected.props[field.key];
                if (field.kind === "variant") return <label key={field.key} className="pd-field">{field.label}<div className="pd-segment">{variantOptions.map((option) => <button type="button" key={option.value} className={`tone-${option.value} ${String(value ?? "info") === option.value ? "active" : ""}`} onClick={() => updateComponent(selected.id, field.key, option.value)}>{option.label}</button>)}</div></label>;
                if ((field.kind === "text" || field.kind === "textarea") && bindableKeys.has(field.key)) return <label key={field.key} className="pd-field">{field.label}<BindingInput value={String(value ?? "")} multiline={field.kind === "textarea"} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel={field.label} onChange={(next) => updateComponent(selected.id, field.key, next)}/></label>;
                if (field.kind === "textarea") return <label key={field.key} className="pd-field">{field.label}<textarea rows={3} value={String(value ?? "")} onChange={(event) => updateComponent(selected.id, field.key, event.target.value)}/></label>;
                if (field.kind === "number") return <label key={field.key} className="pd-field">{field.label}<div className="pd-range"><input type="range" min={0} max={100} value={Number(value) || 0} onChange={(event) => updateComponent(selected.id, field.key, Number(event.target.value))}/><input type="number" min={0} max={100} value={Number(value) || 0} onChange={(event) => updateComponent(selected.id, field.key, Math.max(0, Math.min(100, Number(event.target.value))))}/></div></label>;
                return <label key={field.key} className="pd-field">{field.label}<input value={String(value ?? "")} maxLength={field.key === "label" ? 60 : 200} onChange={(event) => updateComponent(selected.id, field.key, event.target.value)}/></label>;
              })}
              {Object.entries(selected.props).filter(([key]) => !managedKeys.has(key)).map(([key, value]) => <label key={key} className="pd-field">{key}<input value={Array.isArray(value) ? value.join(", ") : String(value)} onChange={(event) => updateComponent(selected.id, key, event.target.value)}/></label>)}
              {contentFields[selected.type].some((field) => bindableKeys.has(field.key) && field.kind !== "number" && field.kind !== "variant") && <p className="pd-binding-note">Metinlere <code>{"{{"}</code> yazarak ya da aşağıdaki <b>Kullanılabilir değişkenler</b> listesinden tıklayarak değişken ekleyin. {bindingNote}</p>}
              {selected.type === "badge" && <div className="pd-field">Değere göre ton<ToneMapEditor value={toneMapEntries} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { toneMap: next.length ? next : undefined })}/><small>Metin bu değerlerden biriyse ton otomatik seçilir; eşleşmezse yukarıdaki ton kullanılır.</small></div>}
              {selected.type === "list" && <label className="pd-field">Liste öğeleri<small>Her satıra bir madde yazın.</small><textarea rows={5} value={Array.isArray(selected.props.items) ? selected.props.items.join("\n") : ""} onChange={(event) => updateComponent(selected.id, "items", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}/></label>}
            </>)}
            {selected.type === "input" && section("input", "Giriş", <>
              <label className="pd-field">Giriş türü<select value={String(selected.props.inputType || "text")} onChange={(event) => patchComponent(selected.id, {
                ...(event.target.value === "select" || event.target.value === "lookup" ? { inputType: event.target.value } : { inputType: event.target.value, optionsQuery: undefined, optionLabelColumn: undefined, optionValueColumn: undefined }),
                // Arama kutusuna özgü özellikler başka türde sunucuda reddedilir.
                ...(event.target.value !== "lookup" ? lookupReset : {}),
                // Doğrulama özellikleri türe bağlıdır (sayı/tarih sınırı, metin uzunluğu…); tür değişince yalnız "Zorunlu" kalır.
                ...(event.target.value !== String(selected.props.inputType || "text") ? validationReset : {}),
              })}>{inputTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              {selected.props.inputType === "select" && <>
                <label className="pd-field">Seçenek sorgusu<select value={String(selected.props.optionsQuery || "")} onChange={(event) => patchComponent(selected.id, { optionsQuery: event.target.value || undefined, optionLabelColumn: undefined, optionValueColumn: undefined })}><option value="">Sorgu seçin</option>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select>{readQueries.length === 0 && <small>Önce Sorgular sekmesinde bir okuma sorgusu ekleyin.</small>}</label>
                {typeof selected.props.optionsQuery === "string" && (["optionValueColumn", "optionLabelColumn"] as const).map((key) => {
                  const columns = queryPreviews[String(selected.props.optionsQuery)]?.columns ?? [];
                  const chosen = String(selected.props[key] || "");
                  return <label key={key} className="pd-field">{key === "optionValueColumn" ? "Değer sütunu" : "Görünen sütun"}
                    {columns.length > 0
                      ? <select value={chosen} onChange={(event) => patchComponent(selected.id, { [key]: event.target.value || undefined })}><option value="">{key === "optionValueColumn" ? "İlk sütun" : "Değer sütunu"}</option>{columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}{chosen && !columns.some((column) => column.code === chosen) && <option value={chosen}>{chosen}</option>}</select>
                      : <input value={chosen} maxLength={128} spellCheck={false} placeholder="Sütun adı" onChange={(event) => patchComponent(selected.id, { [key]: event.target.value.trim() || undefined })}/>}
                  </label>;
                })}
              </>}
              {selected.props.inputType === "lookup" && renderLookupFields(selected)}
              {renderValidationFields(selected)}
            </>)}
            {(selected.type === "metric" || selected.type === "dataTable") && section("data", "Veri", <>
              <div className="pd-field">Veri kaynağı<div className="pd-segment">
                <button type="button" className={!selectedQueryRef && !metricValueMode ? "active" : ""} onClick={() => { if (selectedQueryRef || metricValueMode) patchComponent(selected.id, { query: undefined, value: undefined, totals: undefined, columnFormats: undefined, toneMap: undefined, ...(selected.type === "dataTable" ? { columns: [] } : {}) }); }}>Rapor kaynağı</button>
                <button type="button" className={selectedQueryRef ? "active" : ""} disabled={readQueries.length === 0} title={readQueries.length === 0 ? "Önce Sorgular sekmesinde bir okuma sorgusu ekleyin." : undefined} onClick={() => { if (!selectedQueryRef && readQueries[0]) patchComponent(selected.id, { query: readQueries[0].id, value: undefined, ...(selected.type === "dataTable" ? { columnFormats: undefined, toneMap: undefined } : {}), ...(selected.type === "dataTable" ? { columns: [] } : {}) }); }}>Sorgu</button>
                {selected.type === "metric" && <button type="button" className={metricValueMode ? "active" : ""} onClick={() => { if (!metricValueMode) patchComponent(selected.id, { query: undefined, source: undefined, value: "", totals: undefined }); }}>Değer</button>}
              </div>{readQueries.length === 0 && !metricValueMode && <small>Sorguya bağlamak için önce Sorgular sekmesinde bir okuma sorgusu ekleyin.</small>}
              {selected.type === "metric" && <small className="pd-metric-explain">{metricValueMode
                ? "Gösterge, aşağıya yazdığınız değeri gösterir: sabit bir sayı ya da {{sayilar.customers}} gibi bir değişken."
                : selectedQueryRef ? "Gösterge, sorgunun ilk satırındaki ilk sütunu gösterir."
                : "Gösterge, seçilen rapor kaynağındaki kayıt sayısını otomatik hesaplar; sayı elle yazılmaz."}</small>}</div>
              {metricValueMode ? <label className="pd-field">Değer<BindingInput value={String(selected.props.value ?? "")} maxLength={200} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Değer" placeholder="{{sayilar.customers}} ya da 42" onChange={(next) => updateComponent(selected.id, "value", next)}/>
                <small>Kullanılabilir değişkenler listesindeki <b>Sayılar</b> grubundan bir kaynak seçebilirsiniz.</small></label>
              : selectedQueryRef ? <>
                <label className="pd-field">Sorgu<select value={selectedQueryRef} onChange={(event) => patchComponent(selected.id, { query: event.target.value, totals: undefined, columnFormats: undefined, toneMap: undefined, ...pagingReset, ...(selected.type === "dataTable" ? { columns: [] } : {}) })}>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select>
                  <small>{selected.type === "metric" ? "Gösterge, ilk satırın ilk sütununu gösterir." : "Seçim yoksa tüm sütunlar gösterilir."}</small></label>
                {selected.type === "dataTable" && (selectedQueryColumns.length === 0 ? <p className="pd-binding-note">Sütunları seçmek için sorguyu Sorgular sekmesinde önizleyin.</p>
                  : <div className="pd-field">Kolonlar<small>{selectedColumns.length || "Tüm"} sütun gösterilecek.</small><ul className="pd-columns">{selectedQueryColumns.map((column) => <li key={column.code} className={selectedColumns.includes(column.code) ? "is-on" : ""}><label><input type="checkbox" checked={selectedColumns.includes(column.code)} onChange={(event) => updateComponent(selected.id, "columns", event.target.checked ? [...selectedColumns, column.code] : selectedColumns.filter((item) => item !== column.code))}/><span>{column.label || column.code}</span></label></li>)}</ul></div>)}
              </> : <>
              <label className="pd-field">Rapor kaynağı<select value={String(selected.props.source || "")} onChange={(event) => { const source = sources.find((item) => item.code === event.target.value); updateComponent(selected.id, "source", event.target.value); if (selected.type === "dataTable") patchComponent(selected.id, { columns: (source?.columns ?? []).slice(0, 5).map((column) => column.code), columnFormats: undefined, toneMap: undefined, totals: undefined }); }}><option value="">Veri kaynağı seçin</option>{sources.map((source) => <option key={source.code} value={source.code}>{source.label}</option>)}</select>{sources.length === 0 && <small>Kaynak kataloğu yüklenemedi veya erişilebilir kaynak yok.</small>}</label>
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
              </>}
              {selected.type === "metric" && <>
                <label className="pd-field">Eğilim<select value={typeof selected.props.trendQuery === "string" ? selected.props.trendQuery : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { trendQuery: event.target.value || undefined })}><option value="">Yok</option>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select><small>Sorgunun ilk sayısal sütunu, satır sırasıyla çizilir.</small></label>
                <label className="pd-field">Tıklayınca süz<select value={filterInputId} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { filterInput: event.target.value || undefined, ...(event.target.value ? {} : { filterValue: undefined }) })}><option value="">Süzme yok</option>{namedInputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}{filterInputId && !namedInputs.some((input) => input.id === filterInputId) && <option value={filterInputId}>{filterInputId}</option>}</select>{namedInputs.length === 0 && <small>Önce sayfaya adlı bir giriş kutusu ekleyin.</small>}</label>
                {filterInputId && <label className="pd-field">Süzme değeri<input value={String(selected.props.filterValue ?? "")} maxLength={200} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { filterValue: sanitizeSafeValue(event.target.value, false) || undefined })} onBlur={(event) => { const trimmed = event.target.value.trim(); if (trimmed !== event.target.value) patchComponent(selected.id, { filterValue: trimmed || undefined }); }}/><small>Karta tıklanınca giriş kutusuna bu değer yazılır.</small></label>}
              </>}
              {selected.type === "dataTable" && <>
                <div className="pd-field">Yoğunluk<div className="pd-segment">{([["dense", "Sık"], ["comfort", "Rahat"]] as const).map(([value, label]) => <button type="button" key={value} disabled={!canEdit} className={(selected.props.density === "comfort" ? "comfort" : "dense") === value ? "active" : ""} onClick={() => patchComponent(selected.id, { density: value === "dense" ? undefined : value })}>{label}</button>)}</div></div>
                {formatColumns.length > 0 && <div className="pd-field">Sütun biçimleri<ColumnFormatEditor columns={formatColumns} value={columnFormatEntries} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { columnFormats: next.length ? next : undefined, ...(next.some((item) => item.endsWith("=status")) ? {} : { toneMap: undefined }) })}/></div>}
                {hasStatusFormat && <div className="pd-field">Durum tonları<ToneMapEditor value={toneMapEntries} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { toneMap: next.length ? next : undefined })}/><small>Durum etiketi sütunlarında metin bu değerlerden biriyse ton otomatik seçilir.</small></div>}
                {selectedQueryRef && totalsCandidates.length > 0 && <div className="pd-field">Toplam satırı<small>Seçilen sütunların toplamı tablonun altında gösterilir.</small><ul className="pd-columns">{totalsCandidates.map((column) => <li key={column.code} className={totalsSelected.includes(column.code) ? "is-on" : ""}><label><input type="checkbox" disabled={!canEdit || (!totalsSelected.includes(column.code) && totalsSelected.length >= 12)} checked={totalsSelected.includes(column.code)} onChange={(event) => { const next = event.target.checked ? [...totalsSelected, column.code] : totalsSelected.filter((item) => item !== column.code); patchComponent(selected.id, { totals: next.length ? next : undefined }); }}/><span>{column.label || column.code}</span></label></li>)}</ul></div>}
              </>}
            </>)}
            {selected.type === "dataTable" && selectedQueryRef && section("paging", "Sayfalama", <>
              <label className="pd-check" title={!pagingOn && pagingBlocked ? pagingBlocked : undefined}><input type="checkbox" checked={pagingOn} disabled={pagingOn ? !queryEditable : !!pagingBlocked} onChange={(event) => setServerPaging(event.target.checked)}/>Sunucu sayfalı</label>
              <small>{pagingOn ? `Sorgunun page / pageSize parametreleri ${pageBinding(selected.name ?? "")} ve ${pageSizeBinding(selected.name ?? "")} ile bağlandı; ERP her sayfayı sunucudan ister.` : pagingBlocked ?? "Açılınca liste kayıtları sayfa sayfa sunucudan ister; sorgunun page / pageSize parametreleri bu listeye bağlanır."}</small>
              {pagingOn && <>
                <label className="pd-field">Sayfa boyutu<small>{MIN_PAGE_SIZE}–{MAX_PAGE_SIZE} satır.</small>
                  <input type="number" min={MIN_PAGE_SIZE} max={MAX_PAGE_SIZE} step={1} value={pageSizeValue} onChange={(event) => {
                    const raw = Number(event.target.value);
                    if (event.target.value !== "" && Number.isFinite(raw)) updateComponent(selected.id, "pageSize", Math.round(raw));
                  }} onBlur={() => { const clamped = Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, Math.round(pageSizeValue) || DEFAULT_PAGE_SIZE)); if (clamped !== pageSizeValue) updateComponent(selected.id, "pageSize", clamped); }}/>
                  {pageSizeProblem && <small className="pd-query-warning">{pageSizeProblem}</small>}</label>
                <div className="pd-field">Arama girişi<small>Listenin başlığında çizilen metin girişi; değişince liste 1. sayfaya döner. Sorgunun arama parametresini bu girişin değerine bağlayın.</small>
                  <InputPicker inputs={pageInputs} value={typeof selected.props.searchInput === "string" ? [selected.props.searchInput] : []} max={1} owned={searchOwners} takenLabel="Başka yerde"
                    filter={(input) => input.inputType === "text"} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { searchInput: next[0] })}/>
                  {!pageInputs.some((input) => input.inputType === "text") && <small>Önce sayfaya bir metin giriş kutusu ekleyin.</small>}
                </div>
                <div className="pd-field">Altbilgi üst bilgileri<small>İşlemin yanıtındaki üst bilgiler “Etiket: değer” olarak altbilgide gösterilir (en fazla {MAX_FOOTER_META}).</small>
                  {metaColumns.length > 0 ? <FieldListEditor columns={metaColumns} value={footerMetaEntries} max={MAX_FOOTER_META} addLabel="Üst bilgi ekle" disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { footerMeta: next.length > 0 ? next : undefined })}/>
                    : <small>{erpCatalog.status === "ready" ? "Bu işlem üst bilgi döndürmüyor." : "ERP işlem listesi yükleniyor."}</small>}
                </div>
              </>}
            </>)}
            {selected.type === "dataTable" && selectedQueryRef && section("rowButtons", "Satır eylemleri", <RowActionsFields table={selected} components={definition.components}
              labelOf={(component) => String(component.props.label || component.name || summaryOf(component as PageComponent))} serverPaged={pagingOn} disabled={!canEdit}
              onPatch={(patch) => patchComponent(selected.id, patch)}/>)}
            {selected.type === "dataTable" && section("rowActions", "Satır işlemi", <>
              <label className="pd-check"><input type="checkbox" checked={selected.props.rowActionsEnabled === true} onChange={(event) => updateComponent(selected.id, "rowActionsEnabled", event.target.checked)}/>İşlemler kolonunu göster</label>
              {selected.props.rowActionsEnabled === true && <>
                <label className="pd-field">Düğme metni<input value={String(selected.props.rowActionLabel || "İşlemi başlat")} maxLength={60} onChange={(event) => updateComponent(selected.id, "rowActionLabel", event.target.value)}/></label>
                <label className="pd-field">İş akışı<select value={String(selected.props.rowActionWorkflowId || "")} onChange={(event) => updateComponent(selected.id, "rowActionWorkflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce yayımlanmış bir iş akışı oluşturun.</small>}</label>
              </>}
            </>)}
            {selected.type === "button" && section("action", "Eylem", <>
              <div className="pd-field">Eylem türü<div className="pd-segment pd-action-type" role="group" aria-label="Eylem türü">
                {buttonActionTypes.map(([value, label]) => <button type="button" key={value} aria-pressed={buttonAction === value} className={buttonAction === value ? "active" : ""}
                  onClick={() => { if (buttonAction !== value) patchComponent(selected.id, { actionType: value }); }}>{label}</button>)}
              </div></div>
              {buttonAction === "workflow" && <label className="pd-field">İş akışı<select value={String(selected.props.workflowId || "")} onChange={(event) => updateComponent(selected.id, "workflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce İş akışları bölümünde bir akış oluşturup yayımlayın.</small>}</label>}
              {buttonAction === "openDialog" && <label className="pd-field">Açılacak pencere<select value={typeof selected.props.dialogId === "string" ? selected.props.dialogId : ""} onChange={(event) => patchComponent(selected.id, { dialogId: event.target.value || undefined })}>
                <option value="">Pencere seçin</option>{pageDialogs.map((dialog) => <option key={dialog.id} value={dialog.id}>{summaryOf(dialog)}{dialog.name ? ` (${dialog.name})` : ""}</option>)}</select>
                {pageDialogs.length === 0 ? <small>Önce sayfaya bir Pencere bileşeni ekleyin.</small> : !selected.props.dialogId && <small className="pd-query-warning">Pencere açan düğme için 'dialogId' gerekli.</small>}</label>}
              {buttonAction === "query" && <>
                <label className="pd-field">Çalıştırılacak sorgu<select value={actionQuery?.id ?? ""} onChange={(event) => {
                  const chosen = definition.queries.find((query) => query.id === event.target.value);
                  // Güncelle/Sil sorguları verileri değiştirdiği için onay otomatik açılır.
                  patchComponent(selected.id, { queryId: event.target.value || undefined, ...(chosen && (chosen.kind === "update" || chosen.kind === "delete") ? { confirmEnabled: true } : {}) });
                }}><option value="">Sorgu seçin</option>{definition.queries.map((query) => <option key={query.id} value={query.id}>{query.name} ({queryKindLabels[query.kind]})</option>)}</select>
                  {definition.queries.length === 0 && <small>Önce Sorgular sekmesinde bir sorgu ekleyin.</small>}</label>
                </>}
              {buttonAction === "sequence" && <SequenceFields value={idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS)} when={selected.props.sequenceWhen} stopOnError={selected.props.stopOnError}
                writeQueries={writeQueries} componentsNames={pageNamesOf(definition)} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, sequencePatch(next) as Record<string, PropValue | undefined>)}/>}
              {(buttonAction === "query" || buttonAction === "sequence") && <>
                <div className="pd-field">Gerekçe iste<small>Kayıttan önce kullanıcıdan bir yanıt istenir; yanıt <code>{`{{${selected.name || "<ad>"}.yanit}}`}</code> ile bağlanır. Gerekçe sorulduğunda ayrıca onay sorulmaz.</small>
                  {!selected.name && <small className="pd-query-warning">Gerekçe sorabilmek için düğmeye ad verin.</small>}
                  <label className="pd-field">Soru metni<BindingInput value={String(selected.props.promptLabel ?? "")} maxLength={60} suggestions={bindingSuggestions} disabled={!canEdit || !selected.name} ariaLabel="Gerekçe sorusu" placeholder="Ters kayıt gerekçesi"
                    onChange={(next) => patchComponent(selected.id, next ? { promptLabel: next } : { promptLabel: undefined, promptRequired: undefined })}/></label>
                  <label className="pd-check"><input type="checkbox" checked={selected.props.promptRequired === true} disabled={!canEdit || !selected.props.promptLabel} onChange={(event) => patchComponent(selected.id, { promptRequired: event.target.checked ? true : undefined })}/>Yanıt zorunlu</label>
                </div>
                <label className="pd-check"><input type="checkbox" checked={selected.props.confirmEnabled === true} onChange={(event) => patchComponent(selected.id, { confirmEnabled: event.target.checked })}/>Onay iste</label>
                {selected.props.confirmEnabled === true && <label className="pd-field">Onay metni<BindingInput value={String(selected.props.confirmText ?? "")} maxLength={300} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Onay metni" placeholder="Boşsa standart onay sorusu gösterilir" onChange={(next) => patchComponent(selected.id, { confirmText: next || undefined })}/></label>}
                <div className="pd-field">Sonra yenile<small>Eylemden sonra yeniden çalışacak okuma sorguları.</small>
                  {refreshIds.length > 0 && <ul className="pd-action-chips">{refreshIds.map((id) => <li key={id}><span>{definition.queries.find((query) => query.id === id)?.name}</span>
                    <button type="button" aria-label={`${definition.queries.find((query) => query.id === id)?.name} yenilemesini kaldır`} onClick={() => patchComponent(selected.id, { refreshQueries: refreshIds.length > 1 ? refreshIds.filter((item) => item !== id) : undefined })}><X size={11}/></button></li>)}</ul>}
                  <select value="" aria-label="Yenilenecek sorgu ekle" disabled={refreshOptions.length === 0 || refreshIds.length >= MAX_REFRESH_QUERIES} onChange={(event) => { if (event.target.value) patchComponent(selected.id, { refreshQueries: [...refreshIds, event.target.value] }); }}>
                    <option value="">{readQueries.length === 0 ? "Okuma sorgusu yok" : refreshOptions.length === 0 ? "Tümü eklendi" : "Okuma sorgusu ekle"}</option>{refreshOptions.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select></div>
                <label className="pd-field">Başarı mesajı<BindingInput value={String(selected.props.successMessage ?? "")} maxLength={200} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Başarı mesajı" onChange={(next) => patchComponent(selected.id, { successMessage: next || undefined })}/></label>
                <label className="pd-field">Hata mesajı<BindingInput value={String(selected.props.errorMessage ?? "")} maxLength={200} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Hata mesajı" onChange={(next) => patchComponent(selected.id, { errorMessage: next || undefined })}/></label>
                <p className="pd-binding-note">{bindingNote}</p>
              </>}
            </>)}
            {selected.type === "form" && section("form", "Form", <>
              <label className="pd-field">Yayımlanmış form<select value={String(selected.props.formCode || "")} onChange={(event) => updateComponent(selected.id, "formCode", event.target.value)}><option value="">Form seçin</option>{forms.map((form) => <option key={form.id} value={form.code}>{form.name} · {form.code}</option>)}</select></label>
              <button type="button" className="pd-button small" onClick={() => setFormEditorOpen(true)}><FilePlus2 size={13}/>Formu tanımla / düzenle</button>
            </>)}
            {selected.type === "code" && section("code", "Kod", <>
              <label className="pd-field">CSS<small>Yalnızca iframe içeriğine uygulanır; dış ağ kaynaklarına izin verilmez.</small><textarea className="pd-code" rows={6} maxLength={4000} value={String(selected.props.css || "")} onChange={(event) => updateComponent(selected.id, "css", event.target.value)} placeholder=".panel { display: grid; gap: 1rem; }"/></label>
              <label className="pd-field">JavaScript<small>Yalıtılmış iframe içinde çalışır; ERP oturumuna ve API'lere doğrudan erişemez, yalnız kod köprüsünü (nexora) kullanır. En fazla {MAX_JAVASCRIPT_LENGTH.toLocaleString("tr-TR")} karakter ({String(selected.props.javascript || "").length.toLocaleString("tr-TR")} kullanıldı).</small><textarea className="pd-code" rows={8} maxLength={MAX_JAVASCRIPT_LENGTH} value={String(selected.props.javascript || "")} onChange={(event) => updateComponent(selected.id, "javascript", event.target.value)} placeholder="document.body.textContent = 'Merhaba';"/></label>
              <label className="pd-check"><input type="checkbox" checked={selected.props.hidden === true} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { hidden: event.target.checked ? true : undefined })}/> Görünmez (yalnız mantık çalıştırır)</label>
              <details className="pd-shortcuts">
                <summary>Kod köprüsü (nexora)</summary>
                <small>Kod, sayfayla <code>window.nexora</code> (sürüm 1) üzerinden konuşur. Çağrılar Promise döner; hata olursa Error ile reddedilir.</small>
                <small><b>nexora.get(yol)</b>: bağlama yolunu okur. <code>{"await nexora.get(\"liste.seciliSatir.code\")"}</code></small>
                <small><b>nexora.setInput(ad, değer)</b>: giriş kutusuna değer yazar. <code>{"await nexora.setInput(\"gunEsigi\", 30)"}</code></small>
                <small><b>nexora.runQuery(ad)</b>: sayfa sorgusunu çalıştırır; okuma {"{ rows, rowCount }"}, yazma {"{ affectedRows, sonuc }"} döner. <code>{"const { rows } = await nexora.runQuery(\"musteriler\")"}</code></small>
                <small><b>nexora.callOperation(ad, değerler)</b>: ERP işlem kataloğundan bir işlemi çağırır. <code>{"await nexora.callOperation(\"stok.kategoriler\", {})"}</code></small>
                <small><b>nexora.setHeight(px)</b>: çerçeve yüksekliğini ayarlar (0–2000). <code>{"nexora.setHeight(document.body.scrollHeight)"}</code></small>
                <small><b>nexora.on(olay, işleyici)</b>: load, select, beforeSave, afterSave olaylarını dinler. beforeSave içinde false ya da {"{ cancel: true, message }"} döndürmek kaydı durdurur. <code>{"nexora.on(\"select\", ({ table, row }) => console.log(table, row))"}</code></small>
                <small>Tasarımcıda yalnız okuma önizlenir: get ve okuma sorguları önizleme verisinden yanıtlanır; setInput ve yazma çağrıları reddedilir.</small>
              </details>
            </>)}
            {selected.type === "formCard" && section("layout", "Form kartı", <>
              <div className="pd-field">Giriş kutuları<small>Seçilen girişler yalnız bu kartta çizilir; sayfadaki kendi yerlerinden kalkar.</small>
                <InputPicker inputs={pageInputs} value={layoutInputIds} owned={layoutOwners} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { inputs: next })}/>
                {layoutInputIds.length === 0 && <small className="pd-query-warning">{pageInputs.length === 0 ? "Bu bileşen için önce bir giriş kutusu ekleyin" : "En az bir giriş kutusu seçin; boş kart kaydedilemez."}</small>}
              </div>
              <div className="pd-field">Sütun sayısı<div className="pd-segment" role="group" aria-label="Sütun sayısı">{[1, 2, 3].map((count) => <button type="button" key={count} disabled={!canEdit} aria-pressed={(Number(selected.props.columns) || 2) === count} className={(Number(selected.props.columns) || 2) === count ? "active" : ""} onClick={() => patchComponent(selected.id, { columns: count })}>{count}</button>)}</div></div>
              <label className="pd-field">Kayıt anahtarı<small>Değişince kartın girişleri yeni kaydın değerleriyle yeniden dolar.</small>
                <BindingInput value={String(selected.props.recordKey ?? "")} maxLength={200} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Kayıt anahtarı"
                  placeholder="{{kart.rows[0].id}}" onChange={(next) => patchComponent(selected.id, { recordKey: next || undefined })}/></label>
              <label className="pd-check"><input type="checkbox" checked={selected.props.trackChanges === true} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { trackChanges: event.target.checked ? true : undefined })}/>Değişiklikleri izle</label>
              <small>Açıkken kart başlığında değişiklik sayısı görünür; kaydedilmemiş değişiklik varken başka kayda geçmeden önce onay sorulur.</small>
            </>)}
            {selected.type === "filterChips" && section("layout", "Filtre çipleri", <>
              <div className="pd-field">Çip olarak gösterilecek girişler<small>Dolu girişler çip olur; ✕ yalnız o girişi boşaltır.</small>
                <InputPicker inputs={pageInputs} value={layoutInputIds} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { inputs: next })}/>
                {layoutInputIds.length === 0 && <small className="pd-query-warning">{pageInputs.length === 0 ? "Bu bileşen için önce bir giriş kutusu ekleyin" : "En az bir giriş kutusu seçin; boş liste kaydedilemez."}</small>}
              </div>
            </>)}
            {selected.type === "facetPanel" && section("layout", "Yan filtre paneli", <>
              <div className="pd-field">Süzme girişleri<small>Yalnız seçenek sorgulu açılır listeler seçilebilir.</small>
                <InputPicker inputs={pageInputs} value={layoutInputIds} owned={layoutOwners} filter={(input) => input.inputType === "select" && input.hasOptions} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { inputs: next })}/>
                {layoutInputIds.length === 0 && <small className="pd-query-warning">{pageInputs.some((input) => input.inputType === "select" && input.hasOptions) ? "En az bir açılır liste seçin; boş panel kaydedilemez." : "Bu bileşen için önce bir giriş kutusu ekleyin: seçenek sorgulu bir açılır liste."}</small>}
              </div>
              {layoutInputIds.map((id) => {
                const input = definition.components.find((component) => component.id === id);
                if (!input) return null;
                const columns = (queryPreviews[String(input.props.optionsQuery)]?.columns ?? []).filter((column) => isSafeColumnCode(column.code) && !column.code.includes("=") && column.code.length <= 128);
                const chosen = facetCountEntries.find((entry) => entry.slice(0, entry.indexOf("=")) === id)?.slice(id.length + 1) ?? "";
                return <label key={id} className="pd-field">{String(input.props.label || input.name || id)} · Sayı sütunu
                  <select value={chosen} disabled={!canEdit} onChange={(event) => setFacetCount(id, event.target.value)}>
                    <option value="">Yok</option>
                    {columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}
                    {chosen && !columns.some((column) => column.code === chosen) && <option value={chosen}>{chosen}</option>}
                  </select>
                  {columns.length === 0 && <small>Seçenek sorgusunun önizlemesi çalışınca sütunlar listelenir.</small>}
                </label>;
              })}
            </>)}
            {selected.type === "actionBar" && section("layout", "Komutlar", <>
              <small>Sıra ve kısayollar sabittir; yalnız komutların neyi çalıştıracağını bağlarsınız. Bağlanmayan komut ERP'de soluk görünür. Yenile (F5) her zaman sayfadaki sorguları yeniden çalıştırır.</small>
              <div className="pd-field">Yeni<span className="pd-action-key" aria-hidden="true">F2</span><small>Temizlenecek girişler (seçilmezse komut kapalı kalır).</small>
                <InputPicker inputs={pageInputs} value={barNewInputs} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { newInputs: next.length > 0 ? next : undefined })}/>
                {pageInputs.length === 0 && <small>Önce sayfaya bir giriş kutusu ekleyin.</small>}
              </div>
              <div className="pd-field">Kaydet<span className="pd-action-key" aria-hidden="true">Ctrl+S</span>
                <div className="pd-segment" role="group" aria-label="Kaydetme yolu">{([["query", "Tek sorgu"], ["sequence", "Kaydet dizisi"]] as const).map(([value, label]) => <button type="button" key={value} disabled={!canEdit}
                  aria-pressed={barSaveMode === value} className={barSaveMode === value ? "active" : ""} onClick={() => {
                    if (barSaveMode === value) return;
                    setBarSaveChoice({ id: selected.id, mode: value });
                    patchComponent(selected.id, value === "query" ? { saveSequence: undefined, sequenceWhen: undefined, stopOnError: undefined } : { saveQuery: undefined });
                  }}>{label}</button>)}</div>
              </div>
              {barSaveMode === "query" ? <label className="pd-field">Kaydet sorgusu
                <select value={typeof selected.props.saveQuery === "string" ? selected.props.saveQuery : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { saveQuery: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {definition.queries.filter((query) => query.kind === "insert" || query.kind === "update").map((query) => <option key={query.id} value={query.id}>{query.name} ({queryKindLabels[query.kind]})</option>)}
                </select>
              </label> : <SequenceFields value={idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS)} when={selected.props.sequenceWhen} stopOnError={selected.props.stopOnError}
                writeQueries={writeQueries} componentsNames={pageNamesOf(definition)} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, sequencePatch(next) as Record<string, PropValue | undefined>)}/>}
              <label className="pd-field">Sil<span className="pd-action-key" aria-hidden="true">Ctrl+Del</span>
                <select value={typeof selected.props.deleteQuery === "string" ? selected.props.deleteQuery : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { deleteQuery: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {definition.queries.filter((query) => query.kind === "delete").map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
                </select>
              </label>
              <label className="pd-field">Filtre<span className="pd-action-key" aria-hidden="true">Ctrl+F</span><small>Odaklanacak giriş kutusu.</small>
                <select value={typeof selected.props.focusInput === "string" ? selected.props.focusInput : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { focusInput: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {pageInputs.map((input) => <option key={input.id} value={input.id}>{input.label}{input.name ? ` (${input.name})` : ""}</option>)}
                </select>
              </label>
              <label className="pd-check"><input type="checkbox" checked={selected.props.printEnabled === true} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { printEnabled: event.target.checked ? true : undefined })}/> Yazdır<span className="pd-action-key" aria-hidden="true">Ctrl+P</span></label>
              <label className="pd-field">Excel<span className="pd-action-key" aria-hidden="true">Ctrl+E</span><small>Dışa aktarılacak ızgara; sorguya bağlı olmalı.</small>
                <select value={typeof selected.props.exportTable === "string" ? selected.props.exportTable : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { exportTable: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {queryTables.map((table) => <option key={table.id} value={table.id}>{table.name || table.id}</option>)}
                </select>
              </label>
              <div className="pd-field">İşlemler<span className="pd-action-key" aria-hidden="true">Alt+İ</span><small>Menüye taşınan düğmeler sayfada kendi yerinde çizilmez (en fazla 10; sıra değiştirilebilir).</small>
                <InputPicker inputs={pageButtons} value={barMoreButtons} max={10} owned={rowActionOwners} takenLabel="Satır işlemi" disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { moreButtons: next.length > 0 ? next : undefined })}/>
                {pageButtons.length === 0 && <small>Önce sayfaya bir eylem düğmesi ekleyin.</small>}
              </div>
            </>)}
            {selected.type === "contextPanel" && section("layout", "Bağlam paneli", <>
              <label className="pd-field">Tablo<small>Seçili satırı gösterilecek ızgara; adlı ve sorgulu olmalı.</small>
                <select value={contextTable?.id ?? ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { table: event.target.value || undefined, fields: [] })}>
                  <option value="">Tablo seçin</option>
                  {eligibleTables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
                </select>
                {eligibleTables.length === 0 && <small className="pd-query-warning">Önce sayfaya adlı ve sorguya bağlı bir ızgara ekleyin.</small>}
                {eligibleTables.length > 0 && !contextTable && <small className="pd-query-warning">Bir tablo seçin; tablosuz panel kaydedilemez.</small>}
              </label>
              {contextTable && <div className="pd-field">Alanlar<small>Her alan için sütun ve görünen etiket seçin (en fazla 12).</small>
                <FieldListEditor columns={contextColumns} value={contextFields.map((field) => `${field.code}=${field.label}`)} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { fields: next })}/>
                {contextColumns.length === 0 && <small>Izgaranın sorgu önizlemesi çalışınca sütunlar listelenir.</small>}
                {contextFields.length === 0 && <small className="pd-query-warning">En az bir alan ekleyin; boş panel kaydedilemez.</small>}
              </div>}
              <label className="pd-field">İlgili liste<small>İsteğe bağlı: seçili satıra göre ikinci bir okuma sorgusu.</small>
                <select value={typeof selected.props.relatedQuery === "string" ? selected.props.relatedQuery : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, event.target.value ? { relatedQuery: event.target.value } : { relatedQuery: undefined, relatedTitle: undefined })}>
                  <option value="">Yok</option>
                  {readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
                </select>
              </label>
              {typeof selected.props.relatedQuery === "string" && <label className="pd-field">İlgili liste başlığı<input value={String(selected.props.relatedTitle ?? "")} maxLength={60} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { relatedTitle: sanitizeSafeValue(event.target.value, false) || undefined })} onBlur={(event) => { const trimmed = event.target.value.trim(); if (trimmed !== event.target.value) patchComponent(selected.id, { relatedTitle: trimmed || undefined }); }}/></label>}
            </>)}
            {selected.type === "tabs" && section("tabs", "Sekmeler", <>
              <small>Sekmeye alınan bileşenler sayfada kendi yerinde çizilmez, yalnız sekmesinde görünür. Tuvalde sekme başlığına tıklayarak sekmeler arasında geçebilirsiniz.</small>
              <TabsFields tabs={parseTabs(selected.props.tabs)} defaultTab={Number(selected.props.defaultTab ?? 0)} candidates={tabCandidates}
                takenElsewhere={tabsTakenElsewhere} disabled={!canEdit} onChange={(tabs, defaultTab) => setTabs(selected.id, tabs, defaultTab)}/>
            </>)}
            {selected.type === "editableGrid" && section("grid", "Düzenlenebilir tablo", <EditableGridFields name={selected.name} props={selected.props} readQueries={readQueries}
              sourceColumns={typeof selected.props.sourceQuery === "string" ? queryColumns(selected.props.sourceQuery) : []}
              listParameter={selected.name ? collectionParameterFor("list", selected.name, definition.queries, erpCatalog) : null}
              suggestions={bindingSuggestions} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>)}
            {selected.type === "customFieldsBlock" && section("customFields", "Özel alanlar", <CustomFieldsBlockFields name={selected.name} props={selected.props} readQueries={readQueries}
              columnsOf={(queryId) => { const columns = queryColumns(queryId); return columns.length > 0 ? columns.map((column) => column.code) : null; }}
              disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>)}
            {selected.type === "dialog" && section("dialog", "Pencere", <DialogFields dialog={selected} components={definition.components}
              labelOf={(component) => { const summary = summaryOf(component as PageComponent); const title = titleFor(component.type as ComponentType); return summary === title ? title : `${title}: ${summary}`; }}
              writeQueries={writeQueries} readQueries={readQueries} pageNames={pageNamesOf(definition)} disabled={!canEdit}
              onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>)}
            {selected.type === "image" && section("image", "Görsel", <>
              <label className="pd-field">Görsel bağlantısı<small>Yalnız http:// ya da https:// ile başlayan tam adresler gösterilir; diğer değerlerde “Görsel yok” yazar.</small>
                <BindingInput value={String(selected.props.value ?? "")} maxLength={200} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Görsel bağlantısı"
                  placeholder="{{kart.rows[0].imageUrl}}" onChange={(next) => updateComponent(selected.id, "value", next)}/></label>
              <label className="pd-field">Yükseklik<small>40–400 piksel.</small>
                <input type="number" min={40} max={400} step={1} value={typeof selected.props.height === "number" ? selected.props.height : 160} onChange={(event) => {
                  const raw = Number(event.target.value);
                  if (event.target.value !== "" && Number.isFinite(raw)) updateComponent(selected.id, "height", Math.max(40, Math.min(400, Math.round(raw))));
                }}/></label>
              <div className="pd-field">Sığdırma<div className="pd-segment" role="group" aria-label="Sığdırma">{([["contain", "Sığdır"], ["cover", "Doldur"]] as const).map(([value, label]) => <button type="button" key={value} disabled={!canEdit}
                aria-pressed={(selected.props.fit === "cover" ? "cover" : "contain") === value} className={(selected.props.fit === "cover" ? "cover" : "contain") === value ? "active" : ""}
                onClick={() => patchComponent(selected.id, { fit: value === "contain" ? undefined : value })}>{label}</button>)}</div></div>
            </>)}
            {section("conditions", "Koşullar", <ConditionFields props={selected.props} allowDisabled={DISABLEABLE_TYPES.includes(selected.type)}
              pageNames={pageNamesOf(definition)} suggestions={bindingSuggestions} disabled={!canEdit}
              onSet={(key, value) => setOptionalProp(selected.id, key, value)}/>)}
            {section("style", "Görünüm", <>
              {selected.type === "metric" && <>
                <div className="pd-field">Anlam<ToneSelect value={(["info", "success", "warning", "danger"] as const).find((tone) => tone === selected.props.variant)} disabled={!canEdit} onChange={(tone) => patchComponent(selected.id, { variant: tone })}/></div>
                <div className="pd-field">İkon<IconSelect value={typeof selected.props.icon === "string" ? selected.props.icon : undefined} disabled={!canEdit} onChange={(icon) => patchComponent(selected.id, { icon })}/></div>
              </>}
              <div className="pd-field">Genişlik<small>Tuvalde bloğun sağ kenarını sürükleyerek de değiştirebilirsiniz.</small><div className="pd-segment">{[3, 4, 6, 8, 9, 12].map((width) => <button type="button" key={width} className={spanOf(selected) === width ? "active" : ""} onClick={() => updateComponent(selected.id, "width", width)}>{width}</button>)}{![3, 4, 6, 8, 9, 12].includes(spanOf(selected)) && <button type="button" className="active">{spanOf(selected)}</button>}</div></div>
              <div className="pd-field-row">
                <label className="pd-field">İç boşluk<input type="number" min="0" max="64" value={Number(selected.props.padding ?? defaultPadding(selected.type))} onChange={(event) => updateComponent(selected.id, "padding", event.target.value)}/></label>
                <label className="pd-field">Dış boşluk<input type="number" min="0" max="64" value={Number(selected.props.margin ?? 0)} onChange={(event) => updateComponent(selected.id, "margin", event.target.value)}/></label>
                <label className="pd-field">Köşe<input type="number" min="0" max="32" value={Number(selected.props.borderRadius ?? DEFAULT_RADIUS)} onChange={(event) => updateComponent(selected.id, "borderRadius", event.target.value)}/></label>
              </div>
              {([["backgroundColor", "Arka plan", "#ffffff"], ["textColor", "Metin rengi", "#172554"]] as const).map(([key, label, fallback]) => <div className="pd-field" key={key}>{label}<div className="pd-color"><input type="color" aria-label={label} value={String(selected.props[key] ?? fallback)} onChange={(event) => updateComponent(selected.id, key, event.target.value)}/><span>{typeof selected.props[key] === "string" ? String(selected.props[key]) : "Tema rengi"}</span>{typeof selected.props[key] === "string" && <button type="button" className="pd-button small" onClick={() => clearProp(selected.id, key)}>Sıfırla</button>}</div></div>)}
            </>)}
          </fieldset>
          <VariablesPanel suggestions={bindingSuggestions} disabled={!canEdit}/>
          {canEdit && <div className="pd-inspector-footer">
            <button type="button" className="pd-button small" disabled={selectedIndex <= 0} onClick={() => moveComponent(selectedIndex, -1)}><ArrowUp size={13}/>Yukarı</button>
            <button type="button" className="pd-button small" disabled={selected.type === "actionBar"} title={selected.type === "actionBar" ? "Sayfada yalnız bir İşlem Çubuğu olabilir" : undefined} onClick={() => duplicateComponent(selected.id)}><Copy size={13}/>Kopyala</button>
            <button type="button" className="pd-button small danger" onClick={() => removeComponent(selected.id)}><Trash2 size={13}/>Sil</button>
          </div>}
        </div> : <div className="pd-right-body">
          <div className="pd-right-head"><Settings2 size={16}/><div><b>Sayfa ayarları</b><small>Bir bileşeni düzenlemek için tuvalde seçin.</small></div></div>
          <fieldset className="pd-fieldset" disabled={!canEdit}>
            <label className="pd-field">Sayfa adı<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Satış özeti"/></label>
            <label className="pd-field">Sayfa kodu<small>{current ? "Kaydedildikten sonra değiştirilemez." : "Adres olarak kullanılır: küçük harf, rakam, - ve _."}</small><input maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))} placeholder="satis-ozeti" disabled={!!current}/></label>
            <label className="pd-field">Açıklama<textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Bu sayfanın amacı"/></label>
          </fieldset>
          <VariablesPanel suggestions={bindingSuggestions} disabled={!canEdit}/>
          <dl className="pd-facts">
            <div><dt>Durum</dt><dd>{status.label}</dd></div>
            <div><dt>Sürüm</dt><dd>{current ? current.revision : "—"}</dd></div>
            <div><dt>Bileşen</dt><dd>{definition.components.length}</dd></div>
            <div><dt>Son kayıt</dt><dd>{current ? new Date(current.updatedAt).toLocaleString("tr-TR") : "Kaydedilmedi"}</dd></div>
          </dl>
          <div className="pd-shortcuts"><b>Kısayollar</b><span><kbd>Ctrl</kbd>+<kbd>S</kbd> Kaydet</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> Geri al / yinele</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> Kopyala</span><span><kbd>Delete</kbd> Sil · <kbd>Alt</kbd>+<kbd>↑↓</kbd> Taşı</span></div>
          {current && role === "TenantAdmin" && <CustomPageAccessPanel key={current.code} token={token} pageCode={current.code} hasQueries={definition.queries.length > 0}/>}
          {current && capabilities?.canDelete && !queryPageLocked && <button type="button" className="pd-button small danger pd-delete-page" onClick={() => void deleteCurrent()} disabled={saving}><Trash2 size={13}/>Sayfayı sil</button>}
        </div>}
      </aside>
    </div>
    {formEditorOpen && <div className="custom-pages-form-popup" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFormEditorOpen(false); void refreshForms(); } }}><section role="dialog" aria-modal="true" aria-label="Form tasarımcısı"><header><div><b>Form tasarımcısı</b><small>Formu oluşturun, alanları düzenleyin ve yayımlayın.</small></div><button type="button" onClick={() => { setFormEditorOpen(false); void refreshForms(); }}>Kapat</button></header><CustomFormsPage token={token} role={role}/></section></div>}
  </main>;
}
