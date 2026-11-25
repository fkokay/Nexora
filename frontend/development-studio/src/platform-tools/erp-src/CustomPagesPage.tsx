import { flushSync } from "react-dom";
import { cloneElement, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Activity, AlignLeft, AppWindow, ArrowDown, ArrowUpFromLine, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, ClipboardList, Code2, Copy, Database, Eye, FilePlus2, Filter, Gauge,
  Grid3X3, Heading1, History, ImageIcon, Info, Layers, LayoutTemplate, List, Lock, Maximize2, Minimize2, Minus, Monitor, MousePointerClick, MoveVertical, PanelRight, PanelTop, PanelsTopLeft, Redo2,
  RotateCcw, Rows3, Save, SquarePen, ListPlus, Send, Settings2, SlidersHorizontal, Smartphone, Shapes, SquareStack, Table2, Tablet, Tag, TextCursorInput, Trash2, Type, Undo2, X, type LucideIcon,
  Search,
  Plus,
  ListOrdered, BadgeInfo,
} from "lucide-react";
import { authenticatedFetch } from "./authApi";
import CustomFormsPage from "./CustomFormsPage";
import CustomPageAccessPanel from "./CustomPageAccessPanel";
import { formatCell, parseColumnFormats } from "./page-designer/cellFormat";
import { ActionBarPreview, AlertPreview, BadgePreview, ContextPanelPreview, CustomFieldsPreview, DialogPreview, EditableGridPreview, FacetGroupPreview, FacetPanelPreview, FilterChipsPreview, FormCardPreview, GridPreview, ImagePreview, LookupPreview, MetricPreview, TabsCanvas, TabsPreview, toneOf, type FacetPreviewGroup, FilterBarPreview, RecordHeaderPreview, StepsPreview } from "./page-designer/CanvasPreviews";
import { IconSelect, ToneMapEditor, ToneSelect, sanitizeSafeValue } from "./page-designer/DesignLanguageFields";
import BindingInput, { type BindingSuggestion } from "./page-designer/BindingInput";
import QueriesPanel, { MAX_QUERIES, catalogReference, NAME_PATTERN, isOperationQuery, isWriteKind, nameProblem, queryKindLabels, syncParameters, type PageQuery, type QueryParameterType, type QueryPreview } from "./page-designer/QueriesPanel";
import { ERP_WRITE_PREVIEW_BLOCKED, buildReadRequest, collectionParameterFor, collectionRoot, findOperation, loadErpOperations, mapReadResult, unboundRequiredParameter, wireParameters, type ErpCatalog, type ErpOperation } from "./page-designer/erpOperations";
import type { SqlSchemaTable } from "./page-designer/SqlQueryEditor";
import { bindingPath, coerceParameter, interpolate, pageDateScope, resolvePath, sampleText, type PageScope } from "./page-designer/pageBindings";
import { collectTexts, COUNTS_ROOT, isCountableSource, referencedCountCodes } from "./page-designer/pageCounts";
import VariablesPanel from "./page-designer/VariablesPanel";
import { CodePreviewFrame } from "./page-designer/CodePreviewFrame";
import { MAX_JAVASCRIPT_LENGTH, type StubHostData } from "./page-designer/codeBridgeStub";
import { FieldListEditor, InputPicker, isSafeColumnCode, type PickerInput } from "./page-designer/LayoutFields";
import { actionBarOf, movedButtonIds } from "./page-designer/pageActions";
import { MAX_DIALOG_IDS, MAX_ROW_ACTIONS, MAX_TABS, addTab, chipText, clampDefaultTab, dialogOwnedIds, headerButtonIds, idList, moveWithinTab, ownedInputIds, parseFieldList, parseTabs, placeInTab, removeFromTabs, renameTab, rowActionIds, tabLocation, tableDetailToggleIds, tabOwnedIds, tabPlacementProblem } from "./page-designer/layoutRefs";
import { MAX_SEQUENCE_STEPS, SequenceFields, parseSequenceWhen } from "./page-designer/SequenceFields";
import { RowActionsFields, rowActionOwners as buttonOwnersOf } from "./page-designer/RowActionsFields";
import { MAX_HEADER_BUTTONS, ROW_OPEN_ACTION_TYPES, activeStepIndex, assignmentsProblem, parseHeaderFields, prunedAssignments, recordHeaderProblem, stepsProblem } from "./page-designer/wizardParts";
import { AssignmentsFields, BulkDeleteField, OPEN_PARAM_NAME, RecordHeaderFields, RowOpenActionField, StepsFields } from "./page-designer/WizardFields";
import { BarCommandFields } from "./page-designer/BarCommandFields";
import { BAR_COMMAND_PROPS, barBound, barCommandProblem, barCsvExport, migrateBarButtons, patchBarCommands } from "./page-designer/barCommands";
import { linkProblem, NavigationFields, NAVIGATION_ACTION_TYPES, NAVIGATION_PROPS, type ScreenOption } from "./page-designer/NavigationFields";
import { EditableGridFields } from "./page-designer/EditableGridFields";
import { RUN_ON_TYPES, runOnProblem } from "./page-designer/queryRunOn";
import { calcColumnProblem } from "./page-designer/gridRowSources";
import { GRID_ENGINE_PROPS, MAX_LOCK_RULES, lockRuleProblem } from "./page-designer/gridEngine";
import { CustomFieldsBlockFields } from "./page-designer/CustomFieldsBlockFields";
import { DialogFields, sequencePatch } from "./page-designer/DialogFields";
import LeftPanel from "./page-designer/LeftPanel";
import DockPanel, { useDocks } from "./page-designer/DockPanel";
import NewPageDialog, { type NewPageResult } from "./page-designer/NewPageDialog";
import QueryEditorModal from "./page-designer/QueryEditorModal";
import { COLUMN_STATIC_OPTION, columnEntries, gridTotalCodes, parseGridColumns, splitColumnEntry } from "./page-designer/gridColumns";
import { conditionHolds, conditionProblem } from "./page-designer/conditions";
import { countRowsWhen, countText, countWhenProblem } from "./page-designer/countWhen";
import { CountWhenField } from "./page-designer/CountWhenField";
import { ConditionFields } from "./page-designer/ConditionFields";
import { TabsFields, cleanTabLabel, tabsValue, type TabEntry } from "./page-designer/TabsFields";
import { CanvasGrid, type CanvasBlock } from "./page-designer/CanvasGrid";
import ErpCanvasFrame, { type CanvasTenant } from "./page-designer/ErpCanvasFrame";
import type { CanvasBlock as ErpCanvasBlock } from "./page-designer/erpCanvasProtocol";
import { dropIndex } from "./page-designer/canvasHitTest";
import { useDraftAutosave } from "./page-designer/useDraftAutosave";
import { runSingleFlight, type FlightSlot } from "./page-designer/singleFlight";
import * as cardTree from "./page-designer/cardChildren";
import * as refTree from "./page-designer/refOwners";
import { DragSelect, createDragStore } from "./page-designer/dragStore";
import SystemPageNewItems, { addStandardItems, standardItemBundle, standardItemId, type StandardNewItem, type StandardNewItems } from "./page-designer/SystemPageNewItems";
import { DEFAULT_PAGE_SIZE, MAX_FOOTER_META, MAX_PAGE_SIZE, MIN_PAGE_SIZE, PAGING_PROPS, isPagedTable, pageBinding, pageSizeBinding, pagedTableProblem, pagingParams, stripPagingProps, supportsServerPaging, tableSearchInputIds, withPagingBindings, withoutPagingBindings } from "./page-designer/paging";
import { QueryEditorProvider, QueryFieldActions, READ_KINDS, ALL_KINDS, WRITE_KINDS, useQueryEditor, type QueryBinder } from "./page-designer/QueryEditorDialog";
import { useCanvasSamples } from "./page-designer/useCanvasSamples";
import { SettingsHost, SettingsPane, type SettingsTab } from "./page-designer/ComponentSettingsDialog";
import { barLookMap, hiddenForPreview } from "./page-designer/barLook";
import { BindingSampleContext } from "./page-designer/bindingSample";
import { ConditionBuilder } from "./page-designer/ConditionBuilder";
import { DialogLookFields } from "./page-designer/DialogLookFields";
import { BarLookFields } from "./page-designer/BarLookFields";
import { BarCommandRows } from "./page-designer/BarCommandRows";
import { DetailToggleField, GridToolsField, OpenRowField, RawWidthWhenField, VisibilityField, WidthSegment, WidthWhenField } from "./page-designer/GridSettingsFields";
import { conditionTerms, stringEntries } from "./page-designer/gridColumnSettings";
import { ColumnsEditor } from "./page-designer/ColumnsEditor";
import { designerShortcutsBlocked } from "./page-designer/designerModals";
import { proposeColumns } from "./page-designer/columnEditing";
import { FilterBarFields } from "./page-designer/FilterBarFields";
import { filterBarParams, filterBarProblem, keptFilterBindings, filterableParams, formatFilterEntry, parseFilterEntries, withFilterBindings, withoutFilterBindings, withoutStaleParams } from "./page-designer/filterBarSettings";
import "./custom-pages.css";

type PageSummary = { id: string; code: string; name: string; description: string | null; revision: number; isPublished: boolean; updatedAt: string; screenKey?: string | null };
type PageDetail = PageSummary & { definitionJson: string; standardVersion?: number | null };
/** `/api/system-pages` listesindeki bir standart (yalnız sistem kipinin kullandığı alanlar). */
type SystemPageInfo = { screenKey: string; title: string; stage: "preview" | "ready"; version: number; canEdit: boolean; draftId?: string | null; publishedId?: string | null };
type PageRevision = { id: string; revision: number; name: string; description: string | null; changeKind: string; changedByUserId: string; createdAt: string; definitionJson: string; customPageId?: string };
type CustomFormSummary = { id: string; code: string; name: string; status: string };
type WorkflowOption = { id: string; code: string; name: string; status: string };
type ReportSource = { code: string; label: string; columns: { code: string; label: string; dataType: string }[]; aggregates: { code: string; label: string }[] };
type PreviewData = { totalCount: number; rows: Record<string, unknown>[] };
type Capability = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canPublish: boolean; canDelete: boolean };
type ComponentType = "heading" | "text" | "label" | "input" | "metric" | "card" | "section" | "divider" | "spacer" | "button" | "dataTable" | "form" | "code" | "alert" | "badge" | "list" | "progress" | "formCard" | "contextPanel" | "filterChips" | "facetPanel" | "actionBar" | "tabs" | "editableGrid" | "customFieldsBlock" | "dialog" | "image" | "filterBar" | "steps" | "recordHeader";
type PropValue = string | number | boolean | string[];
type PageComponent = { id: string; type: ComponentType; name?: string; props: Record<string, PropValue>; children?: unknown };
/** Kart / bölümün `children` dizisindeki bileşenler (tuval önizlemesi için; geçersiz öğeler atlanır). */
function childComponentsOf(component: PageComponent): PageComponent[] {
  return Array.isArray(component.children) ? component.children.filter((child): child is PageComponent =>
    !!child && typeof child === "object" && typeof (child as PageComponent).id === "string" && typeof (child as PageComponent).type === "string") : [];
}
// Studio her zaman schemaVersion 2 kaydeder; v1 tanımlar açılırken v2'ye yükseltilir (v1 içeriği v2'de de geçerlidir).
type PageDefinition = { schemaVersion: 2; queries: PageQuery[]; components: PageComponent[] };
type PaletteItem = { type: ComponentType; label: string; group: string; icon: LucideIcon; sample: PageComponent["props"] };
type Device = "desktop" | "tablet" | "mobile";
type FieldSpec = { key: string; label: string; kind: "text" | "textarea" | "number" | "variant" | "choice"; options?: readonly (readonly [string, string])[] };

const palette: PaletteItem[] = [
  { type: "actionBar", label: "İşlem Çubuğu", group: "Tasarım dili", icon: PanelTop, sample: {} },
  { type: "formCard", label: "Form kartı", group: "Tasarım dili", icon: ClipboardList, sample: { title: "Form kartı", inputs: [], columns: 2 } },
  { type: "contextPanel", label: "Bağlam paneli", group: "Tasarım dili", icon: PanelRight, sample: { title: "Bağlam paneli", fields: [] } },
  { type: "filterChips", label: "Filtre çipleri", group: "Tasarım dili", icon: Filter, sample: { inputs: [] } },
  { type: "facetPanel", label: "Yan filtre paneli", group: "Tasarım dili", icon: SlidersHorizontal, sample: { title: "Filtreler", inputs: [] } },
  { type: "tabs", label: "Sekmeler", group: "Tasarım dili", icon: PanelsTopLeft, sample: { tabs: ["Genel=", "Ayrıntı="], defaultTab: 0 } },
  { type: "dialog", label: "Pencere", group: "Tasarım dili", icon: AppWindow, sample: { title: "Pencere", contains: [], presentation: "dialog" } },
  { type: "steps", label: "Adımlar", group: "Tasarım dili", icon: ListOrdered, sample: { steps: ["Seç", "Ayrıntı"], activeWhen: ["", ""] } },
  { type: "recordHeader", label: "Kayıt özeti", group: "Tasarım dili", icon: BadgeInfo, sample: { title: "Kayıt özeti", fields: [] } },
  { type: "heading", label: "Başlık", group: "Metin ve düzen", icon: Heading1, sample: { text: "Sayfa başlığı" } },
  { type: "text", label: "Açıklama", group: "Metin ve düzen", icon: AlignLeft, sample: { text: "Kısa bir açıklama yazın." } },
  { type: "label", label: "Etiket", group: "Metin ve düzen", icon: Type, sample: { text: "Etiket metni" } },
  { type: "card", label: "Bilgi kartı", group: "Metin ve düzen", icon: SquareStack, sample: { title: "Bilgi kartı", description: "Kart açıklaması" } },
  { type: "section", label: "Bölüm başlığı", group: "Metin ve düzen", icon: Rows3, sample: { title: "Yeni bölüm" } },
  { type: "divider", label: "Ayırıcı", group: "Metin ve düzen", icon: Minus, sample: {} },
  { type: "spacer", label: "Boşluk", group: "Metin ve düzen", icon: MoveVertical, sample: {} },
  { type: "dataTable", label: "Izgara", group: "Veri", icon: Table2, sample: { title: "Kayıtlar", source: "customers", columns: ["code", "name", "type"], rowActionsEnabled: false, rowActionWorkflowId: "", rowActionLabel: "İşlemi başlat" } },
  { type: "filterBar", label: "Süzgeç alanı", group: "Veri", icon: Filter, sample: { search: true } },
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
  input: [{ key: "label", label: "Etiket", kind: "text" }, { key: "placeholder", label: "Yer tutucu", kind: "text" }, { key: "defaultValue", label: "Varsayılan değer", kind: "text" },
    { key: "emptyDefault", label: "Boşsa varsayılan (sabit; tarihte {{bugun}} olabilir)", kind: "text" }],
  metric: [{ key: "title", label: "Başlık", kind: "text" }, { key: "description", label: "Açıklama", kind: "text" },
    { key: "format", label: "Biçim", kind: "choice", options: [["number", "Sayı"], ["money", "Para"], ["date", "Tarih"], ["datetime", "Tarih ve saat"], ["text", "Metin"]] },
    { key: "descriptionFormat", label: "Açıklamadaki sayıların biçimi", kind: "choice", options: [["number", "Sayı"], ["money", "Para"], ["", "Biçimsiz"]] }],
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
  filterBar: [],
  steps: [],
  recordHeader: [{ key: "title", label: "Başlık", kind: "text" }, { key: "subtitle", label: "Alt başlık", kind: "text" }],
};
// Keys the inspector edits with a dedicated control. Anything else found on a component
// (older or hand-written definitions) is still shown as a plain text field so it stays editable.
const managedKeys = new Set(["size", "backdropClose", "text", "title", "label", "description", "value", "variant", "format", "requiredWhen", "hiddenCommands", "commandWhen", "barLook", "formCode", "source", "columns", "workflowId", "rowActionsEnabled", "rowActionWorkflowId", "rowActionLabel", "actionType", "width", "margin", "padding", "backgroundColor", "textColor", "borderRadius", "css", "javascript", "hidden", "items", "query", "inputType", "placeholder", "defaultValue", "optionsQuery", "optionLabelColumn", "optionValueColumn", "queryId", "confirmEnabled", "confirmText", "refreshQueries", "successMessage", "errorMessage", "icon", "trendQuery", "filterInput", "filterValue", "toneMap", "density", "columnFormats", "totals", "inputs", "table", "fields", "relatedQuery", "relatedTitle", "facetCounts", "newInputs", "saveQuery", "deleteQuery", "focusInput", "printEnabled", "exportTable", "moreButtons", "formDialog", "titleCount", "countWhen",  "defaultWhen", "closeInput",
  // Proje 2 Faz A: koşullar, sekmeler, arama kutusu, sunucu sayfalı liste ve doğrulama (sunucudaki SafePropsV2).
  "visibleWhen", "disabledWhen", "disabledReason", "tabs", "defaultTab", "optionDescriptionColumn", "minChars", "staticOptions", "allowClear",
  "paging", "pageParam", "pageSizeParam", "pageSize", "searchInput", "footerMeta", "required", "upperCase", "min", "max", "step", "maxLength", "pattern", "patternMessage",
  // Proje 2 Faz B: kayıt dizisi, satır işlemleri, gerekçe, düzenlenebilir tablo, özel alanlar, pencere, görsel ve değişiklik izleme.
  "saveSequence", "stopOnError", "sequenceWhen", "rowActions", "emptyText", "limit", "promptLabel", "promptRequired", "dialogId",
  "gridMode", "sourceQuery", "rowKey", "gridColumns", "maxRows", "addLabel", "fixedRowLabel", "matrixCode", "matrixName",
  "definitionsQuery", "valuesQuery", "contains", "presentation", "saveLabel", "closeOnSave", "resetOnOpen", "height", "fit", "recordKey", "trackChanges",
  // Proje 4: form kartının tek satır (süzgeç) dizilimi, koşullu genişlik ve değer etiketleri.
  "layout", "widthWhen", "valueLabels", "columnLabels", "columnUnits",
  // İşlem Çubuğu Yeni / Aç / kayıttan sonra düğmeleri ve sayfa başlığı olan başlık.
  "newButton", "openButton", "afterSaveButton", "pageTitle", ...BAR_COMMAND_PROPS,
  // Izgara tablo araçları (yoksa açık; kapalıysa false yazılır).
  "showGridSearch", "showColumnFilters", "showColumnChooser", "showExport", "showPivot", "showCsv", "showSelectedExport",
  // Listenin araç çubuğundaki "Detay paneli" düğmesinin onay kutusu girişi.
  "detailToggleInput",
  // İşlem Çubuğu İşlemler › "CSV olarak dışa aktar" (Excel bağlıyken; kapalıysa false yazılır).
  "exportCsv",
  // Süzgeç alanı: bağlı tablonun arama kutusu ve süzgeçleri.
  "search", "searchPlaceholder", "searchColumns", "searchParam", "filters",
  // Aranabilir açılır liste ve ilk seçenek varsayılanı.
  "searchable", "defaultFirst",
  // Seçim → ayrıntı ekranları: alana değer ata, satır açılınca, Adımlar ve Kayıt özeti.
  "assignments", "rowOpenAction", "steps", "activeWhen", "subtitle", "fieldFormats", "fieldUnits", "buttons",
  // Seçim hücreli kalem tablosu: otomatik istek kimliği, seçenek koşulu, bağımlı temizleme, seçim sütunu ayarları, en az satır
  // ve gerekçe isteminin açıklaması / sınırı.
  "autoId", "optionsWhen", "clearsOnChange", "columnOptionsWhen", "columnStaticOptions", "minRows", "promptText", "promptMaxLength",
  // Gezinme düğmeleri (bağlantı, ERP ekranı, sayfa): "Eylem" bölümündeki gezinme alanlarında düzenlenir.
  ...Object.values(NAVIGATION_PROPS).flat(), "target",
  // İşlem Çubuğu İşlemler › "Kaydet ve yeni".
  "saveAndNew",
  // Listenin "Sayfa parametresiyle aç" alanı (Satır eylemleri › Satır açılınca) ve toplu silme sorgusu (Satır eylemleri › Toplu silme).
  "openParam", "bulkDeleteQuery",
  // Listeli tablonun motor ekleri (Düzenlenebilir tablo bölümü): sorgudan doldurma, seçimle doldurma ve formüller.
  ...GRID_ENGINE_PROPS,
  // Boş çözülen varsayılanın sabit yedeği (İçerik › "Boşsa varsayılan"), parçalı metin (İçerik › "Parçalar") ve İşlem Çubuğu
  // Sil onayının metni (Komutlar › Sil).
  "emptyDefault", "parts", "deleteConfirmText", "descriptionFormat"]);
// schemaVersion 2'de {{yol}} ifadesi alabilen alanlar (sunucudaki BindableProps ile aynı). Düğmenin sorgu eylemi
// mesajları (confirmText, successMessage, errorMessage) "Eylem" bölümünde kendi BindingInput alanlarıyla düzenlenir.
const bindableKeys = new Set(["text", "title", "description", "label", "value", "placeholder", "defaultValue", "confirmText", "successMessage", "errorMessage", "disabledReason",
  "promptLabel", "fixedRowLabel", "matrixCode", "matrixName", "recordKey", "subtitle", "promptText", "deleteConfirmText"]);
const inputTypeOptions = [{ value: "text", label: "Metin" }, { value: "number", label: "Sayı" }, { value: "date", label: "Tarih" }, { value: "datetime", label: "Tarih ve saat" }, { value: "checkbox", label: "Onay kutusu" }, { value: "select", label: "Açılır liste" }, { value: "lookup", label: "Arama kutusu" }];
/** Yalnız arama kutusunda (inputType lookup) geçerli özellikler; tür değişince silinir. */
const lookupReset: Record<string, undefined> = { optionDescriptionColumn: undefined, minChars: undefined, staticOptions: undefined, allowClear: undefined };
/**
 * Giriş türü değişince türe özgü özelliklerin sıfırlanması: arama kutusu özellikleri (sabit seçenekler ve açıklama sütunu açılır
 * listede de geçerlidir, korunur), `searchable` yalnız açılır listede, `defaultFirst` açılır liste ve arama kutusunda kalır.
 */
const inputTypeReset = (value: string, props: Record<string, PropValue>): Record<string, PropValue | undefined> => ({
  ...(value !== "lookup" ? { ...lookupReset, ...(value === "select" ? { staticOptions: props.staticOptions, optionDescriptionColumn: props.optionDescriptionColumn } : {}) } : {}),
  ...(value !== "select" ? { searchable: undefined } : {}),
  ...(value !== "select" && value !== "lookup" ? { defaultFirst: undefined, optionsWhen: undefined } : {}),
});
/** Gerekçe isteminin açıklaması (bağlanabilir şablon) ve yanıt alanının karakter sınırı (sunucu kuralı). */
const MAX_PROMPT_TEXT = 300;
const MAX_PROMPT_LENGTH = 4000;
/** Girişin değeri değişince temizlenecek en çok hedef ("<girişKimliği>" ya da "<tablo>.<sütun>"). */
const MAX_CLEARS_ON_CHANGE = 10;
/** Izgaranın `columnOptionsWhen` / `columnStaticOptions` listelerinin en çok öğesi (sunucudaki MaxStaticOptions). */
const MAX_COLUMN_ENTRIES = 20;
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
const buttonActionTypes: [string, string][] = [["workflow", "İş akışı"], ["query", "Sorgu"], ["sequence", "Kayıt dizisi"], ["openDialog", "Pencere aç"],
  ["link", "Bağlantıya git"], ["erpPage", "ERP ekranı aç"], ["page", "Sayfa aç"], ["setInput", "Alana değer ata"]];
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
  const readRefs = readGone ? ["sourceQuery", "definitionsQuery", "valuesQuery", "fillQuery"].filter((key) => component.props[key] === queryId) : [];
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
  // Doldurma eşlemi doldurma sorgusuna bağlıdır; sorgu kalkınca birlikte kalkar.
  if (readRefs.includes("fillQuery")) delete props.fillColumns;
  if (staleDialogSave) delete props.saveQuery;
  // Sunucu sayfalaması ERP işlemi sorgusuna bağlıdır; sorgu kalkınca sayfalama özellikleri de kalkar.
  if (readGone && props.query === queryId) { delete props.query; delete props.countWhen; delete props.totals; delete props.columnFormats; delete props.toneMap; for (const key of PAGING_PROPS) delete props[key]; }
  if (readGone && props.trendQuery === queryId) delete props.trendQuery;
  // Seçenek sütunları (arama kutusunun açıklama sütunu dahil) sorguya bağlıdır; sabit seçenekler, en az karakter ve
  // temizlenebilir sorgudan bağımsızdır, kalır (sabit seçenekli arama kutusu sorgusuz da geçerlidir).
  if (readGone && props.optionsQuery === queryId) { delete props.optionsQuery; delete props.optionLabelColumn; delete props.optionValueColumn; delete props.optionDescriptionColumn; }
  if (removed && props.queryId === queryId) delete props.queryId;
  if (staleRefresh) { const next = (refresh as string[]).filter((item) => item !== queryId); if (next.length > 0) props.refreshQueries = next; else delete props.refreshQueries; }
  return { ...component, props };
}
/** Giriş türü değişince silinen, türe bağlı doğrulama özellikleri ("Zorunlu" türden bağımsızdır, kalır). */
/** Doğrulama "Kod" biçimi: büyük harf, rakam ve tire. */
const CODE_PATTERN = "[A-Z0-9-]+";
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
/** Örnek veride görünürlük koşulu tutmayan bileşen (ERP'de gizlenirdi): tuvalde soluk ve "Koşullu" işaretli çizilir. */
const hiddenInSample = (component: PageComponent, scope: PageScope) => isConditional(component) && !conditionHolds(component.props.visibleWhen, scope, true);
/** Düğme görünümü (`variant`): primary dolu, secondary çerçeveli, danger kırmızı, link düz bağlantı; diğerleri varsayılan (dolu). */
const BUTTON_VARIANTS = new Set(["primary", "secondary", "danger", "link"]);
const buttonVariantClass = (variant: unknown) => typeof variant === "string" && BUTTON_VARIANTS.has(variant) ? ` is-${variant}` : "";
/** Koşul kökü olabilecek sayfa adları: adlı bileşenler ve sorgular. */
const pageNamesOf = (definition: PageDefinition) => [
  ...definition.queries.map((query) => query.name).filter(Boolean),
  ...cardTree.flattenComponents(definition.components).map((component) => component.name).filter((name): name is string => !!name),
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
/** Izgaranın ayar penceresi sekmeleri (pencere kapalıyken Gelişmiş panelde hepsi alt alta çizilir). */
/** Izgara dışındaki bileşenlerin ayar sekmeleri: İçerik, türe özel ana bölüm, Koşul, Görünüm (boş sekme çizilmez). */
const MAIN_TAB_LABEL: Partial<Record<string, string>> = {
  button: "Eylem", form: "Form", code: "Kod", formCard: "Form kartı", filterChips: "Filtre çipleri", facetPanel: "Yan filtre paneli",
  actionBar: "Komutlar", contextPanel: "Bağlam paneli", heading: "Sayfa başlığı", tabs: "Sekmeler", editableGrid: "Tablo",
  customFieldsBlock: "Özel alanlar", dialog: "Pencere", image: "Görsel", input: "Doğrulama", metric: "Veri", filterBar: "Alanlar",
  steps: "Adımlar", recordHeader: "Kayıt özeti",
};
const settingsTabsFor = (type: string, hasContent: boolean): SettingsTab[] => [
  ...(hasContent ? [{ key: "content", label: "İçerik" }] : []),
  ...(MAIN_TAB_LABEL[type] ? [{ key: "main", label: MAIN_TAB_LABEL[type]! }] : []),
  ...(type === "dialog" ? [{ key: "save", label: "Kaydetme" }] : []),
  { key: "cond", label: "Koşul" }, { key: "view", label: "Görünüm" },
];
/** Bölüm anahtarının sekmesi (ızgara kendi sekmelerini `pane` ile verir). */
const tabOfSection = (key: string) => key === "content" ? "content" : key.startsWith("conditions") ? "cond" : key === "style" ? "view" : "main";
const GRID_SETTINGS_TABS: SettingsTab[] = [{ key: "data", label: "Veri" }, { key: "columns", label: "Sütunlar" }, { key: "rows", label: "Satır eylemleri" }, { key: "view", label: "Görünüm" }];
/** Satır işlemi olabilen düğme eylem türleri. */
const ROW_ACTION_TYPES = ["query", "sequence", "openDialog", "setInput", ...NAVIGATION_ACTION_TYPES];
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
/** `disabledReason` yalnız `disabledWhen` ile, ikisi de yalnız devre dışı bırakılabilen türlerde geçerlidir. Değişmezse aynı nesne. */
function cleanDisabledProps(component: PageComponent): PageComponent {
  const disableable = DISABLEABLE_TYPES.includes(component.type);
  const dropWhen = !disableable && "disabledWhen" in component.props;
  const dropReason = "disabledReason" in component.props
    && (!disableable || !(typeof component.props.disabledWhen === "string" && component.props.disabledWhen !== ""));
  if (!dropWhen && !dropReason) return component;
  const props = { ...component.props };
  if (dropWhen) delete props.disabledWhen;
  if (dropReason) delete props.disabledReason;
  return { ...component, props };
}
/** Düğmenin eylem türüne bağlı özellikleri (Faz B ve gezinme). Değişmezse aynı nesne. */
function cleanButtonProps(component: PageComponent, dialogIds: Set<string>, writeKinds: Map<string, PageQuery["kind"]>, inputIds?: ReadonlySet<string>): PageComponent {
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
  // Gezinme özellikleri yalnız kendi eylem türünde; gezinme düğmesi sorgu çalıştırmaz ve yenilemez.
  const navigation = NAVIGATION_ACTION_TYPES.includes(String(next.actionType));
  // Birden çok türde geçen özellik (ör. params: erpPage ve page) geçerli türde kalır.
  const ownNavigation = NAVIGATION_PROPS[String(next.actionType)] ?? [];
  for (const [type, keys] of Object.entries(NAVIGATION_PROPS)) if (next.actionType !== type) drop(...keys.filter((key) => !ownNavigation.includes(key)));
  if (navigation) drop("queryId", "refreshQueries", "successMessage", "errorMessage"); else drop("target");
  if (!(typeof next.promptLabel === "string" && next.promptLabel !== "")) drop("promptRequired", "promptText", "promptMaxLength");
  // Alana değer ata: atamalar yalnız bu eylemde; sunucuya yazmadığından sorgu ve yenileme alamaz. Silinen girişe atama kalkar.
  if (next.actionType !== "setInput") drop("assignments");
  else {
    drop("queryId", "refreshQueries");
    const pruned = inputIds && "assignments" in next ? prunedAssignments(next.assignments, inputIds) : null;
    if (pruned) { next.assignments = pruned; touched = true; }
  }
  return touched ? { ...component, props: next } : component;
}
/** `clearsOnChange` hedefi: başka bir giriş kimliği ya da adlı düzenlenebilir tablonun sütunu ("<tablo>.<sütun>"). */
function clearTargetOk(entry: string, selfId: string, inputIds: ReadonlySet<string>, gridColumns: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const dot = entry.indexOf(".");
  if (dot < 0) return entry !== selfId && inputIds.has(entry);
  return gridColumns.get(entry.slice(0, dot))?.has(entry.slice(dot + 1)) === true;
}
/** Girişin `clearsOnChange` listesi: silinen giriş ve tabloda olmayan sütun kalkar; liste boşalınca özellik silinir. Değişmezse aynı nesne. */
function cleanInputProps(component: PageComponent, inputIds: ReadonlySet<string>, gridColumns: ReadonlyMap<string, ReadonlySet<string>>): PageComponent {
  if (component.type !== "input" || !("clearsOnChange" in component.props)) return component;
  const raw = Array.isArray(component.props.clearsOnChange) ? component.props.clearsOnChange : [];
  const seen = new Set<string>();
  const kept = raw.filter((entry): entry is string => typeof entry === "string" && !seen.has(entry) && !!seen.add(entry)
    && clearTargetOk(entry, component.id, inputIds, gridColumns)).slice(0, MAX_CLEARS_ON_CHANGE);
  if (sameList(raw, kept)) return component;
  const props = { ...component.props };
  if (kept.length > 0) props.clearsOnChange = kept; else delete props.clearsOnChange;
  return { ...component, props };
}
/** Adlı düzenlenebilir tabloların sütun kodları (bağımlı temizleme hedefleri için). */
const gridColumnCodes = (components: PageComponent[]) => new Map(cardTree.flattenComponents(components)
  .filter((component) => component.type === "editableGrid" && !!component.name)
  .map((component) => [component.name!, new Set(parseGridColumns(component.props.gridColumns).map((column) => column.code))]));
function reconcileLayoutRefs(definition: PageDefinition, options: ReconcileOptions = {}): PageDefinition {
  const catalog = options.catalog;
  let changed = false;
  const pageInputIds = new Set(cardTree.flattenComponents(definition.components).filter((component) => component.type === "input").map((component) => component.id));
  const pageGridColumns = gridColumnCodes(definition.components);
  // `disabledReason` yalnız `disabledWhen` ile geçerlidir (sunucu kuralı); koşul silinince neden de kalkar. İkisi de yalnız
  // düğme, giriş, düzenlenebilir tablo ve özel alanlar bloğunda geçerlidir; başka türde kalanlar silinir.
  const reasoned = definition.components.map((component) => {
    const next = cleanInputProps(cleanDisabledProps(component), pageInputIds, pageGridColumns);
    if (next !== component) changed = true;
    return next;
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
  const allInputIds = new Set(cardTree.flattenComponents(source).filter((component) => component.type === "input").map((component) => component.id));
  const buttoned = source.map((component) => {
    const next = cleanButtonProps(component, dialogIds, writeKinds, allInputIds);
    if (next !== component) changed = true;
    return next;
  });
  const byId = new Map(buttoned.map((component) => [component.id, component]));
  // İşlem Çubuğu ve bağlam paneli kartın içindeki düğme/listeye de başvurabilir (sunucu her düzeye bakar); sekme, pencere ve
  // satır işlemleri yalnız üst düzey bileşenleri sahiplenir (`byId`).
  const anyById = new Map(cardTree.flattenComponents(buttoned).map((component) => [component.id, component]));
  // Sahiplik sunucudaki sırayla çözülür: sekmeler, pencere içerikleri, liste satır işlemleri. Bir kimliğin tek sahibi olur.
  const preLayoutOwned = ownedInputIds(buttoned);
  const preSearchInputs = new Set(buttoned.filter((component) => component.type === "dataTable" && typeof component.props.searchInput === "string").map((component) => String(component.props.searchInput)));
  // Listenin "Detay paneli" düğmesi: var olan, onay kutusu türünde, form kartı / yan filtre paneline ve başka listeye ait olmayan
  // bir giriş; geçerli olanlar sekme ve pencerelere alınmaz (liste sahiplenir).
  const detailToggleResult = new Map<string, boolean>();
  const preDetailToggles = new Set<string>();
  for (const component of buttoned) {
    if (component.type !== "dataTable" || !("detailToggleInput" in component.props)) continue;
    const id = typeof component.props.detailToggleInput === "string" ? component.props.detailToggleInput : "";
    const target = byId.get(id);
    // Düğme sorguya bağlı tam ızgaranın araç çubuğundadır (sunucu kuralı): dar `bars`/`list` görünümünde ve sorgusuz listede kalkar.
    const fullGrid = typeof component.props.query === "string" && component.props.query !== "" && component.props.variant !== "bars" && component.props.variant !== "list";
    const ok = fullGrid && !!target && target.type === "input" && target.props.inputType === "checkbox" && !preLayoutOwned.has(id) && !preSearchInputs.has(id) && !preDetailToggles.has(id);
    if (ok) preDetailToggles.add(id);
    detailToggleResult.set(component.id, ok);
  }
  const claimed = new Set<string>();
  const tabResult = new Map<string, TabEntry[]>();
  for (const component of buttoned) {
    if (component.type !== "tabs") continue;
    tabResult.set(component.id, parseTabs(component.props.tabs).map((tab) => ({ label: tab.label, ids: tab.ids.filter((id) => {
      const target = byId.get(id);
      if (!target || target.type === "tabs" || target.type === "actionBar" || target.type === "dialog" || claimed.has(id)) return false;
      if (target.type === "input" && (preLayoutOwned.has(id) || preSearchInputs.has(id) || preDetailToggles.has(id))) return false;
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
      if (target.type === "input" && (preLayoutOwned.has(id) || preSearchInputs.has(id) || preDetailToggles.has(id))) return false;
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
  // Satır açılınca düğmesi: aynı listenin satır işlemi olabilir; başka sahibi olamaz. Sorgusuz listede kalkar.
  const rowOpenResult = new Map<string, boolean>();
  for (const component of buttoned) {
    if (component.type !== "dataTable" || !("rowOpenAction" in component.props)) continue;
    const id = typeof component.props.rowOpenAction === "string" ? component.props.rowOpenAction : "";
    const target = byId.get(id);
    const queryBound = typeof component.props.query === "string" && component.props.query !== "";
    const ok = queryBound && !!target && target.type === "button" && ROW_OPEN_ACTION_TYPES.includes(String(target.props.actionType ?? ""))
      && (!claimed.has(id) || (rowActionResult.get(component.id) ?? []).includes(id));
    if (ok) claimed.add(id);
    rowOpenResult.set(component.id, ok);
  }
  // Kayıt özetinin düğmeleri (en çok 3): satır işlemi olabilen eylemli düğmeler, tek sahipli.
  const headerResult = new Map<string, string[]>();
  for (const component of buttoned) {
    if (component.type !== "recordHeader" || !("buttons" in component.props)) continue;
    headerResult.set(component.id, idList(component.props.buttons, MAX_HEADER_BUTTONS).filter((id) => {
      const target = byId.get(id);
      if (!target || target.type !== "button" || !ROW_ACTION_TYPES.includes(String(target.props.actionType ?? "")) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    }));
  }
  const rowActionOwned = new Set([...rowActionResult.values()].flat());
  for (const component of buttoned) if (component.type === "dataTable" && rowOpenResult.get(component.id)) rowActionOwned.add(String(component.props.rowOpenAction));
  for (const ids of headerResult.values()) for (const id of ids) rowActionOwned.add(id);
  const owned = new Set<string>();
  let barSeen = false;
  let components = buttoned.map((component): PageComponent | null => {
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
      if ("rowOpenAction" in next && rowOpenResult.get(component.id) === false) { delete next.rowOpenAction; touched = true; }
      if ("detailToggleInput" in next && detailToggleResult.get(component.id) === false) { delete next.detailToggleInput; touched = true; }
      // Sayfa parametresiyle açma yalnız satır açılınca düğmesiyle çalışır (sunucu: openParam rowOpenAction ister).
      if ("openParam" in next && !(typeof next.rowOpenAction === "string" && next.rowOpenAction !== "")) { delete next.openParam; touched = true; }
      // Toplu silme: adlı, sorgulu listede bir silme sorgusu (sorgu silinince ya da türü değişince bağ kalkar).
      if ("bulkDeleteQuery" in next && !(typeof next.bulkDeleteQuery === "string" && writeKinds.get(next.bulkDeleteQuery) === "delete"
        && !!component.name && typeof next.query === "string" && next.query !== "")) { delete next.bulkDeleteQuery; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "recordHeader" && "buttons" in props) {
      const wanted = headerResult.get(component.id) ?? [];
      if (sameList(props.buttons, wanted)) return component;
      const next = { ...props };
      if (wanted.length > 0) next.buttons = wanted; else delete next.buttons;
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
      if (component.type === "editableGrid") {
        // Seçim sütunu ayarları yalnız tablonun seçim (lookup) sütunlarına; varyant kipinde sütun ve satır sınırı yoktur.
        if (props.gridMode === "matrix") for (const key of ["minRows", "columnOptionsWhen", "columnStaticOptions"]) if (key in next) { delete next[key]; touched = true; }
        // Motor ekleri yalnız listeli kipte; doldurma sorgusu sayfanın okuma sorgusu olmalı (sunucu kuralı).
        if (props.gridMode === "stage" || props.gridMode === "matrix") for (const key of GRID_ENGINE_PROPS) if (key in next) { delete next[key]; touched = true; }
        if ("fillQuery" in next && !(typeof next.fillQuery === "string" && readIds.has(next.fillQuery))) { delete next.fillQuery; delete next.fillColumns; touched = true; }
        const lookupCodes = new Set(parseGridColumns(props.gridColumns).filter((column) => column.inputType === "lookup").map((column) => column.code));
        for (const key of ["columnOptionsWhen", "columnStaticOptions"]) {
          if (!(key in next)) continue;
          const raw = Array.isArray(next[key]) ? next[key] as unknown[] : [];
          const kept = raw.filter((entry): entry is string => { const parts = splitColumnEntry(entry); return !!parts && lookupCodes.has(parts.code); });
          if (!sameList(raw, kept)) { if (kept.length > 0) next[key] = kept; else delete next[key]; touched = true; }
        }
        // Alt toplam yalnız tablonun sayı sütunlarında (varyant kipinde hiç yok).
        if ("totals" in next) {
          const kept = gridTotalCodes(props);
          if (!sameList(next.totals, kept)) { if (kept.length > 0) next.totals = kept; else delete next.totals; touched = true; }
        }
      }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "filterBar") {
      // Tablo sorgulu ızgara olmalı; seçenek kaynağı okuma sorgusu olmalı; arama kapalıyken aramaya bağlı özellikler kalkar.
      const table = typeof props.table === "string" ? byId.get(props.table) : undefined;
      const tableOk = !!table && table.type === "dataTable" && typeof table.props.query === "string" && table.props.query !== "";
      let next: PageComponent["props"] = { ...props };
      let touched = false;
      if (!tableOk && "table" in next) { delete next.table; touched = true; }
      // Sorguda artık olmayan parametreler süzgeçten düşer (ERP kataloğu yüklenmediyse işlem sorgusuna dokunulmaz).
      const tableQuery = tableOk ? definition.queries.find((query) => query.id === table!.props.query) : undefined;
      if (tableQuery) {
        const paging = isPagedTable(table!) ? Object.values(pagingParams(table!.props)) : [];
        const op = isOperationQuery(tableQuery) && options.catalog ? findOperation(options.catalog, tableQuery.operation) : undefined;
        const params = isOperationQuery(tableQuery) ? (op ? filterableParams(tableQuery, op.parameters, paging) : null) : filterableParams(tableQuery, null, paging);
        const cleaned = withoutStaleParams(next, params);
        if (cleaned !== next) { next = cleaned as PageComponent["props"]; touched = true; }
      }
      if ("filters" in next) {
        const cleaned = parseFilterEntries(next.filters).map((spec) => spec.options && !readIds.has(spec.options.query) ? { ...spec, options: undefined } : spec).map(formatFilterEntry);
        if (!sameList(next.filters, cleaned)) { if (cleaned.length > 0) next.filters = cleaned; else delete next.filters; touched = true; }
      }
      if (next.search !== true) for (const key of ["searchPlaceholder", "searchColumns", "searchParam"]) if (key in next) { delete next[key]; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    if (component.type === "contextPanel") {
      const table = typeof props.table === "string" ? anyById.get(props.table) : undefined;
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
      const isInput = (id: string) => anyById.get(id)?.type === "input";
      list("newInputs", 12, isInput);
      // Satır işlemi düğmesi İşlem Çubuğu menüsünde kullanılamaz (liste sahipliği önce gelir).
      list("moreButtons", 10, (id) => anyById.get(id)?.type === "button" && !rowActionOwned.has(id));
      // Filtre (Ctrl+F): giriş kutusu ya da arama kutulu süzgeç alanı.
      single("focusInput", (id) => isInput(id) || (anyById.get(id)?.type === "filterBar" && anyById.get(id)?.props.search === true));
      // Kayıt penceresi: pencere silinince bağ da kalkar.
      single("formDialog", (id) => dialogIds.has(id));
      // Yeni / Aç / kayıttan sonra çalışan düğmeler: düğme silinince bağ kalkar; Yeni ve Aç kayıt penceresiyle birlikte kullanılamaz.
      const isButton = (id: string) => anyById.get(id)?.type === "button";
      single("newButton", (id) => isButton(id) && !("formDialog" in next));
      single("openButton", (id) => isButton(id) && !("formDialog" in next));
      single("afterSaveButton", isButton);
      // Düz Aç: listesi silinince sayfa grubu da kalkar (eksik giriş / pencere seçimi kaydetmede uyarılır, burada silinmez).
      if ("openTable" in next && !(typeof next.openTable === "string" && (() => { const table = byId.get(next.openTable as string); return table?.type === "dataTable" && !!table.name && typeof table.props.query === "string" && table.props.query !== ""; })())) {
        for (const key of ["openAction", "openPageCode", "openTarget", "openTable", "openParams"]) delete next[key];
        touched = true;
      }
      single("saveQuery", (id) => writeKinds.get(id) === "insert" || writeKinds.get(id) === "update");
      single("deleteQuery", (id) => writeKinds.get(id) === "delete");
      if (cleanSequence(next, writeKinds)) touched = true;
      single("exportTable", (id) => { const table = anyById.get(id); return table?.type === "dataTable" && typeof table.props.query === "string" && table.props.query !== ""; });
      if ("printEnabled" in next && next.printEnabled !== true) { delete next.printEnabled; touched = true; }
      // CSV yalnız Excel listesiyle anlamlıdır; yoksa açık olduğundan yalnız false saklanır.
      if ("exportCsv" in next && (next.exportCsv !== false || !("exportTable" in next))) { delete next.exportCsv; touched = true; }
      if (!touched) return component;
      changed = true;
      return { ...component, props: next };
    }
    return component;
  }).filter((component): component is PageComponent => component !== null);
  // Kartın içindeki bileşenler: eylem türüne ve koşula bağlı özellikler üst düzeydekiyle aynı kuralla temizlenir.
  components = components.map((component) => {
    if (!cardTree.isCardType(component.type) || !Array.isArray(component.children)) return component;
    const children = cardTree.mapComponents(component.children as PageComponent[], (child) => cleanButtonProps(cleanInputProps(cleanDisabledProps(child), pageInputIds, pageGridColumns), dialogIds, writeKinds, allInputIds));
    if (children === component.children) return component;
    changed = true;
    return { ...component, children };
  });
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
  // Süzgeç alanının parametreleri listenin sorgusuna {{<ad>.<parametre>}} ile bağlanır (sunucu kuralı). SQL sorgusunda yalnız
  // tanımlı parametreler, ERP işleminde yalnız işlemin parametreleri bağlanır. Önce süzgeç alanına artık ait olmayan
  // {{<ad>.<x>}} bağlamaları (kaldırılan süzgeç, silinen ya da başka tabloya bağlanan alan) ERP işlemi sorgularından kalkar.
  // Başka sorguların süzgeç alanının güncel parametresine bağlaması (ör. hareket sorgusunun {{suzgec.warehouseId}} değeri) kalır;
  // alan başka tabloya taşındıysa eski listenin sorgusundaki bağlamalar kalkar.
  const barNames = new Set([...components, ...(options.previous?.components ?? [])].filter((item) => item.type === "filterBar" && !!item.name).map((item) => item.name!));
  const barQuery = (list: PageComponent[], barName: string) => {
    const bar = list.find((item) => item.type === "filterBar" && item.name === barName);
    const table = bar && typeof bar.props.table === "string" ? list.find((item) => item.id === bar.props.table) : undefined;
    return { bar, query: table && typeof table.props.query === "string" ? table.props.query : undefined };
  };
  for (const barName of barNames) {
    const { bar: current, query: currentQuery } = barQuery(components, barName);
    const previousQuery = barQuery(options.previous?.components ?? [], barName).query;
    const params = current ? filterBarParams(current.props) : null;
    queries = queries.map((query) => withoutFilterBindings(query, barName, keptFilterBindings(query.id, params, currentQuery, previousQuery)));
  }
  for (const component of components) {
    if (component.type !== "filterBar" || !component.name || typeof component.props.table !== "string") continue;
    const table = components.find((item) => item.id === component.props.table);
    const queryId = table && typeof table.props.query === "string" ? table.props.query : undefined;
    const names = filterBarParams(component.props);
    if (!queryId || names.length === 0) continue;
    const barName = component.name;
    queries = queries.map((query) => {
      if (query.id !== queryId) return query;
      const op = isOperationQuery(query) && options.catalog ? findOperation(options.catalog, query.operation) : undefined;
      const params = names.flatMap((name) => {
        const declared = query.parameters.find((parameter) => parameter.name === name);
        const fromOp = op?.parameters.find((parameter) => parameter.name === name);
        if (isOperationQuery(query) ? !fromOp && !declared : !declared) return [];
        return [{ name, type: declared?.type ?? fromOp?.type ?? "text" }];
      });
      return withFilterBindings(query, barName, params);
    });
  }
  if (queries.some((query, index) => query !== definition.queries[index])) changed = true;
  return changed ? { ...definition, components, queries } : definition;
}
/** Uzlaştırma ve kartın içindeki Sekmeler'in üst düzey başvuruları (silinen bileşen sekmeden kalkar). */
function reconcileDefinition(definition: PageDefinition, options: ReconcileOptions = {}): PageDefinition {
  const reconciled = reconcileLayoutRefs(definition, options);
  const components = cardTree.pruneCardTabs(reconciled.components);
  return components === reconciled.components ? reconciled : { ...reconciled, components };
}
/** Yalnız denemeler için: standart tanımların tasarımcıda kayıpsız açılıp kaydedildiğini doğrulamak. */
export const designerInternals = { reconcileDefinition, managedKeys, contentFields, palette, MAIN_TAB_LABEL, inputTypeOptions };
/** Kart tasarım ekranında kartın çocuğunu sürüklerken taşınan kimlik. */
const CARD_CHILD_MIME = "application/x-nexora-card-child";
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
    // Katalog başvurulu sorgu (dataSource/action): kod olduğu gibi kalır; sql ya da operation eklenmez.
    if (catalogReference(query) !== undefined) return rest;
    if (!isOperationQuery(query)) return { ...rest, sql: sql ?? "" };
    const op = findOperation(catalog, operation);
    return { ...rest, operation, parameters: op ? wireParameters(op, rest.parameters) : rest.parameters };
  }),
});
/** Yükleme (normalizeDefinition) ve kayıt (wireDefinition) dönüşümleri; testler için. */
export const designerPersistence = { normalizeDefinition, wireDefinition };
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
const defaultSpan = (type: ComponentType) => type === "metric" || type === "image" ? 3 : type === "editableGrid" || type === "customFieldsBlock" || type === "dialog" || type === "formCard" || type === "filterChips" || type === "filterBar" || type === "actionBar" || type === "tabs" || type === "steps" || type === "recordHeader" ? 12 : type === "contextPanel" ? 4 : type === "facetPanel" ? 3 : type === "heading" || type === "text" || type === "label" || type === "divider" || type === "spacer" ? 12 : 6;
// ERP tasarım dili varsayılanları (kart iç boşluğu 12px, köşe 8px); ERP gösterimi aynı değerleri kullanır.
const DEFAULT_RADIUS = 8;
const defaultPadding = (type: ComponentType) => ["card", "section", "dataTable", "metric", "form", "alert", "list", "progress", "formCard", "contextPanel", "facetPanel", "tabs", "editableGrid", "customFieldsBlock", "dialog", "recordHeader"].includes(type) ? 12 : 0;
const spanOf = (component: PageComponent) => Math.max(1, Math.min(12, Number(component.props.width) || defaultSpan(component.type)));
// Mirrors erp-web's tenant-custom-page.css: tablets show every block at half width, phones stack them.
const deviceSpan = (span: number, device: Device) => device === "mobile" ? 12 : device === "tablet" ? 6 : span;
const summaryOf = (component: PageComponent) => {
  const value = component.props.title ?? component.props.text ?? component.props.label;
  if (component.type === "recordHeader" && typeof value === "string" && value.includes("{{")) return component.name || titleFor(component.type);
  return typeof value === "string" && value.trim() ? value : titleFor(component.type);
};
/** Kartın kırıntıdaki adı: bağlamalı başlık ({{…}}) yerine bileşen adı ya da tür adı. */
const cardLabelOf = (component: PageComponent) => {
  const summary = summaryOf(component);
  return summary.includes("{{") ? component.name || titleFor(component.type) : summary;
};
/**
 * İçi kendi ekranında tasarlanan bileşenler: bilgi kartı / bölüm (`children`), Pencere (`contains`), Form kartı ve Yan filtre
 * paneli (`inputs`). Kartın üyeleri kartın içindedir; diğerlerinin üyeleri sayfadaki üst düzey bileşenlerdir (kimlikle).
 */
const isFocusOwnerType = (type: string) => cardTree.isCardType(type) || refTree.isRefOwnerType(type);
const focusMembersOf = (owner: PageComponent, components: PageComponent[]): PageComponent[] => cardTree.isCardType(owner.type) ? childComponentsOf(owner)
  : refTree.refIds(owner).map((id) => components.find((component) => component.id === id)).filter((component): component is PageComponent => !!component);
const focusKindText = (type: string) => type === "dialog" ? "pencerenin içi" : type === "formCard" ? "form kartının içi" : type === "facetPanel" ? "yan panelin içi" : "kartın içi";
const ejectText = (type: string) => type === "dialog" ? "Pencereden çıkar" : type === "formCard" ? "Form kartından çıkar" : type === "facetPanel" ? "Yan panelden çıkar" : "Karttan çıkar";
const snapshotOf = (name: string, description: string, definition: PageDefinition) => JSON.stringify({ name, description, definition });
const FULLSCREEN_STORAGE_KEY = "nexora.pageDesigner.fullscreen";
const QUERY_PAGE_ADMIN_ONLY = "Bu sayfa SQL sorgusu içerdiği için yalnız yöneticiler düzenleyebilir.";
const SYSTEM_PAGE_ADMIN_ONLY = "Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir.";
const SYSTEM_PAGE_PREVIEW_STAGE = "Bu standart tanım önizleme aşamasında; eski ekranın tüm işlevlerini içermez.";
const SYSTEM_PAGE_REMOVE_CONFIRM = "Firma tasarımı kaldırılsın mı? Ekran, Nexora'nın standart ekranına döner; geçiş tamamlanmamış ekranlarda bu eski ekrandır.";
const SYSTEM_PAGE_RESET_CONFIRM = "Taslak, Nexora standart tasarımının güncel sürümüyle değiştirilsin mi? Yayımlayana kadar ERP'deki ekran değişmez.";
/** Sunucudaki TenantCustomPageQueries.HasQueries ile aynı: schemaVersion 2 ve boş olmayan queries dizisi. */
const definitionHasQueries = (definitionJson: string | undefined) => {
  if (!definitionJson) return false;
  try {
    const raw = JSON.parse(definitionJson) as { schemaVersion?: unknown; queries?: unknown };
    return raw?.schemaVersion === 2 && Array.isArray(raw.queries) && raw.queries.length > 0;
  } catch { return false; }
};
/** Faz B bileşenlerinin zorunlu başvuruları (sunucu da reddeder; metinler sunucudakiyle aynı). Sorun yoksa null. */
/**
 * Seçim hücreli düzenlenebilir tablonun kayıt sorunları (sunucu da reddeder): seçim sütununun sorgusu sayfadaki bir okuma
 * sorgusu, sütun ayarları geçerli biçimde ve seçenek koşulları geçerli olmalıdır; en az satır en fazla satırı aşamaz.
 */
const pickerGridProblem = (component: PageComponent, definition: PageDefinition): string | null => {
  if (component.type !== "editableGrid") return null;
  const props = component.props;
  const readIds = new Set(definition.queries.filter((query) => !isWriteKind(query.kind)).map((query) => query.id));
  for (const column of parseGridColumns(props.gridColumns))
    if (column.lookup && !readIds.has(column.lookup.query)) return `'${column.code}' seçim sütununun sorgusu sayfadaki bir okuma sorgusu olmalıdır: ${column.lookup.query}`;
  for (const [key, format] of [["columnOptionsWhen", "sütunKodu=koşul"], ["columnStaticOptions", "sütunKodu=değer=Etiket"]] as const)
    if (Array.isArray(props[key]) && (props[key] as unknown[]).length > MAX_COLUMN_ENTRIES) return `'${key}' 1–${MAX_COLUMN_ENTRIES} adet ${format} öğesi içermelidir.`;
  for (const entry of columnEntries(props.columnOptionsWhen)) {
    const problem = conditionProblem("columnOptionsWhen", entry.rest, [...pageNamesOf(definition), "satir"]);
    if (problem) return problem;
  }
  for (const entry of columnEntries(props.columnStaticOptions))
    if (!COLUMN_STATIC_OPTION.test(entry.rest)) return "'columnStaticOptions' öğeleri sütunKodu=değer=Etiket biçiminde olmalıdır.";
  if (typeof props.minRows === "number" && typeof props.maxRows === "number" && props.minRows > props.maxRows) return "'minRows' değeri 'maxRows' değerinden büyük olamaz.";
  if ("lockColumnsWhen" in props) {
    const locks = props.lockColumnsWhen;
    if (!Array.isArray(locks) || locks.length < 1 || locks.length > MAX_LOCK_RULES || locks.some((item) => typeof item !== "string"))
      return `'lockColumnsWhen' 1–${MAX_LOCK_RULES} adet "sütun1,sütun2=koşul" öğesi içermelidir.`;
    for (const text of locks as string[]) { const problem = lockRuleProblem(props, text); if (problem) return problem; }
  }
  return calcColumnProblem(props, readIds);
};
const fazBProblem = (component: PageComponent, label: string, inputIds: ReadonlySet<string> = new Set()): string | null => {
  const props = component.props;
  if (component.type === "dataTable" && typeof props.rowOpenAction === "string" && props.rowOpenAction !== "" && !component.name) return `Satır açma eylemi için veri listesinin adı olmalıdır: ${component.id}`;
  if (component.type === "dataTable" && "openParam" in props && !(typeof props.openParam === "string" && OPEN_PARAM_NAME.test(props.openParam)))
    return `'openParam' (sayfa parametresiyle aç) küçük harfle başlayan, en fazla 32 harf/rakamlık bir parametre adı olmalıdır: ${component.id}`;
  if (component.type === "recordHeader") { const problem = recordHeaderProblem(props, label); if (problem) return problem; }
  if ((component.type === "editableGrid" || component.type === "customFieldsBlock") && !component.name)
    return component.type === "editableGrid" ? `Düzenlenebilir tablonun adı olmalıdır: ${component.id}` : `Özel alanlar bloğunun adı olmalıdır: ${component.id}`;
  if (component.type === "dialog" && idList(props.contains, MAX_DIALOG_IDS).length === 0) return `${label} için pencerede gösterilecek en az bir bileşen seçin.`;
  if (component.type === "dataTable" && idList(props.rowActions, MAX_ROW_ACTIONS).length > 0 && !component.name) return `Satır işlemleri için veri listesinin adı olmalıdır: ${component.id}`;
  if (component.type === "dataTable" && typeof props.bulkDeleteQuery === "string" && props.bulkDeleteQuery !== "" && !component.name) return `Toplu silme için veri listesinin adı olmalıdır: ${component.id}`;
  if (component.type === "actionBar") { const problem = barCommandProblem(props); if (problem) return problem; }
  if (component.type === "button") {
    if (props.actionType === "sequence" && idList(props.saveSequence, MAX_SEQUENCE_STEPS).length === 0) return "Kayıt dizisi düğmesi için 'saveSequence' gerekli.";
    if (props.actionType === "openDialog" && !(typeof props.dialogId === "string" && props.dialogId !== "")) return "Pencere açan düğme için 'dialogId' gerekli.";
    if (props.actionType === "link") { const problem = linkProblem(props.href); if (problem) return problem; }
    if (props.actionType === "erpPage" && !(typeof props.pageKey === "string" && props.pageKey !== "")) return "ERP ekranı düğmesi için 'pageKey' gerekli.";
    if (props.actionType === "page" && !(typeof props.pageCode === "string" && props.pageCode !== "")) return "Sayfa düğmesi için 'pageCode' gerekli.";
    if (props.actionType === "setInput") { const problem = assignmentsProblem(props.assignments, inputIds); if (problem) return problem; }
    if (typeof props.promptLabel === "string" && props.promptLabel !== "" && !component.name) return `Gerekçe soran düğmenin adı olmalıdır: ${component.id}`;
  }
  return null;
};
/**
 * Düzenleme eşlemi (bodyMap) bir özel alanlar bloğuna bağlıysa bloğun `valuesQuery`'si eşlemin kaynak okuması olmalıdır
 * (sunucu ResolveCollectionBindings ile aynı kural ve metin); aksi halde dokunulmamış alanlar "" ile gidip silinir.
 */
const bodyMapBlockProblem = (query: PageQuery, op: ErpOperation, definition: PageDefinition): string | null => {
  const bodyMap = op.bodyMap;
  if (!bodyMap) return null;
  const parameter = query.parameters.find((item) => item.name === bodyMap.property);
  const root = parameter ? collectionRoot("map", parameter.binding) : null;
  const block = root ? definition.components.find((component) => component.type === "customFieldsBlock" && component.name === root) : undefined;
  if (!parameter || !block) return null;
  const valuesRead = definition.queries.find((item) => item.id === block.props.valuesQuery);
  return valuesRead?.operation === bodyMap.sourceOperation ? null
    : `'${query.name}' sorgusundaki '${parameter.name}' parametresi: '${root}' bloğunun 'valuesQuery' sorgusu '${bodyMap.sourceOperation}' okuma sorgusu olmalıdır; aksi halde kayıtlı özel alan değerleri silinebilir.`;
};
/** Adı zorunlu türlerin otomatik ad tabanı (tablo1, ozelAlanlar1…); diğer türler adsız başlar. */
const requiredNameBase = (type: ComponentType) => type === "editableGrid" ? "tablo" : type === "customFieldsBlock" ? "ozelAlanlar" : type === "filterBar" ? "suzgec" : null;
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
function StaticOptionsField({ value, onChange, max = MAX_STATIC_OPTIONS, disabled = false }: { value: string[]; onChange: (next: string[]) => void; max?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState(() => value.join("\n"));
  const linesOf = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
  const joined = value.join("\n");
  // Yalnız dış değer değişince eşitlenir (yazarken taslaktaki boş satırlar korunur).
  useEffect(() => {
    if (!sameList(value, linesOf(draft).slice(0, max))) setDraft(joined);
  }, [joined]);
  const tooMany = linesOf(draft).length > max;
  return <>
    <textarea rows={3} value={draft} spellCheck={false} disabled={disabled} onChange={(event) => {
      setDraft(event.target.value);
      const next = linesOf(event.target.value).slice(0, max);
      if (!sameList(value, next)) onChange(next);
    }}/>
    {tooMany && <small className="pd-query-warning">En fazla {max} satır; fazlası kaydedilmez.</small>}
  </>;
}

type Props = {
  token: string; role: string; platformOrigin?: string; initialPageId?: string | null; initialCreate?: boolean; embedded?: boolean; onBack?: () => void;
  /** Sistem kipi: açılan sayfa `@<systemScreenKey>` kodlu firma tasarımıdır. */
  systemScreenKey?: string;
  /** "Tasarımcıda aç" yanıtındaki aktarım notları; bir kez, kapatılabilir bildirim olarak gösterilir. */
  importNotes?: string[];
  /** Studio'da seçili firma: ERP tuvali (iframe) bununla oturum açar; yoksa yerleşik tuval çizilir. */
  tenant?: CanvasTenant;
};

export default function CustomPagesPage({ token, role, platformOrigin, initialPageId, initialCreate = false, onBack, systemScreenKey, importNotes, tenant }: Props) {
  const systemMode = !!systemScreenKey;
  const [systemInfo, setSystemInfo] = useState<SystemPageInfo | null>(null);
  const [importNotesOpen, setImportNotesOpen] = useState(() => (importNotes?.length ?? 0) > 0);
  // "Yeni" şeridi: standart tanımda firma tasarımında olmayan öğeler; `addedIds` eklenen öğenin tanımdaki kimliğidir
  // (kimlik çakışmasında yeni kimlik verilir), geri alınınca öğe yeniden önerilir.
  const [newItems, setNewItems] = useState<StandardNewItems | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, string>>({});
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
  // Sürükleme durumu (sürüklenen, tuvaldeki yer tutucu sırası, Katmanlar hedefi) bu bileşenin state'i değildir: dragover
  // başına bütün tasarımcı (müfettiş, paneller, önizlemeler) yeniden çizilmesin diye yalnız abone parçalar güncellenir.
  const [dragStore] = useState(createDragStore);
  // Tuvalde açık olan sekme (Sekmeler kimliği → sekme sırası); yalnız tasarımcı görünümüdür, tanıma yazılmaz.
  const [activeTabs, setActiveTabs] = useState<Record<string, number>>({});
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  // Sütun kılavuzları varsayılan gizlidir (şeffaf bileşenlerin arkasından görünüp üst üste binmiş gibi durur); sürüklerken her zaman görünür.
  const [showGrid, setShowGrid] = useState(false);
  // Örnek veride koşulu tutmayan bileşenler ERP'deki gibi yer kaplamaz; bu anahtarla tuvalde soluk gösterilir.
  const [showCondOff, setShowCondOff] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const [newPageDialog, setNewPageDialog] = useState<"create" | "template" | null>(null);
  const [queryEditorOpen, setQueryEditorOpen] = useState(false);
  const docks = useDocks();
  const [rightMode, setRightMode] = useState<"inspector" | "history">("inspector");
  // Tam ekran: Studio menüsü ve üst çubuğu gizlenir, tasarımcı tüm pencereyi kullanır. Tercih tarayıcıda hatırlanır.
  const [fullscreen, setFullscreen] = useState(() => { try { return localStorage.getItem(FULLSCREEN_STORAGE_KEY) === "1"; } catch { return false; } });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ rowActions: true, style: false });
  const [, setUndoTick] = useState(0);
  const [queryPreviews, setQueryPreviews] = useState<Record<string, QueryPreview>>({});
  const [erpCatalog, setErpCatalog] = useState<ErpCatalog>({ status: "loading" });
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  // İşlem Çubuğunda "Kaydet dizisi" seçildi ama henüz adım eklenmedi (boş dizi özelliği kaydedilmez).
  const [barSaveChoice, setBarSaveChoice] = useState<{ id: string; mode: "query" | "sequence" } | null>(null);
  const [sqlSchema, setSqlSchema] = useState<SqlSchemaTable[]>([]);
  // Özellikler paneli kipi (bileşen türü başına hatırlanır) ve "Tüm ayarlar" penceresinde açık bileşen.
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState("data");
  // Başlıkta adı düzenlenen bileşen (kalem simgesi).
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  // Doğrulama sekmesinde henüz yazılmamış "Koşula göre" / "Özel desen" seçimi (değer yazılana kadar seçim kaybolmasın).
  const [requiredWhenDraft, setRequiredWhenDraft] = useState<string | null>(null);
  const [customPatternDraft, setCustomPatternDraft] = useState<string | null>(null);
  // Kart tasarım ekranı: içi düzenlenen bilgi kartı / bölüm (yalnız görünüm durumu; tanıma yazılmaz).
  const [focusId, setFocusId] = useState<string | null>(null);
  const suggestionsRef = useRef<BindingSuggestion[]>([]);
  const runQueryPreviewRef = useRef<(id: string, confirmWrite: boolean) => Promise<number | null>>(async () => null);
  const parameterMemory = useRef(new Map<string, PageQuery["parameters"][number]>());
  const initialActionDone = useRef(false);
  const definitionRef = useRef(definition);
  definitionRef.current = definition;
  const undoStack = useRef<PageDefinition[]>([]);
  const redoStack = useRef<PageDefinition[]>([]);
  const lastCommit = useRef<{ key: string; at: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cardGridRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const isAdmin = role === "TenantAdmin";
  // Kayıtlı tanımı SQL sorgusu içeren sayfayı (sunucudaki kuralla aynı) yalnız tenant yöneticisi değiştirebilir.
  const storedHasQueries = useMemo(() => definitionHasQueries(current?.definitionJson), [current?.definitionJson]);
  const queryPageLocked = storedHasQueries && !isAdmin;
  // Sistem sayfası yazmaları doğrulanmış firma yöneticisi ister; liste yanıtı yoksa rol talebine bakılır (sunucu yine denetler).
  const systemAdmin = !systemMode || (systemInfo ? systemInfo.canEdit : isAdmin);
  const systemLocked = systemMode && !systemAdmin;
  const canEdit = current
    ? !current.isPublished && !!capabilities?.canUpdate && !queryPageLocked && systemAdmin
    : creating && !!capabilities?.canCreate && !systemMode;
  // Sorgu eklemek, SQL düzenlemek ve önizlemek yalnız tenant yöneticisine açıktır.
  const queryEditable = canEdit && isAdmin;
  // Sistem kipinde erişim paneli yalnız SQL sorgusu varken anlamlıdır (ERP işlemlerinin yetkisini uç noktalar verir).
  const hasSqlQueries = definition.queries.some((query) => !isOperationQuery(query));
  const dirty = (creating || !!current) && snapshotOf(name, description, definition) !== savedSnapshot;
  const designIds = useMemo(() => new Set([...cardTree.flattenComponents(definition.components).map((component) => component.id), ...definition.queries.map((query) => query.id)]), [definition]);
  const itemPresent = useCallback((key: string) => {
    const id = key.slice(key.indexOf(":") + 1);
    return designIds.has(id) || (!!addedIds[key] && designIds.has(addedIds[key]));
  }, [designIds, addedIds]);
  const pendingNewItems = useMemo(() => newItems?.items.filter((item) => !itemPresent(item.key)) ?? [], [newItems, itemPresent]);
  // Önerilen öğelerin hepsi eklendiyse sonraki kayıt tabanı güncel standart sürüme çeker.
  const allNewItemsAdded = !!newItems && newItems.items.length > 0 && pendingNewItems.length === 0 && newItems.standardVersion > newItems.baseVersion;
  const selected = selectedComponentId ? cardTree.findComponent(definition.components, selectedComponentId) : null;
  // Tanımdan türetilir: geri alma, silme ya da başka sayfa açılınca kart ortadan kalkarsa sayfa görünümüne dönülür.
  const focusOwner = focusId ? definition.components.find((component) => component.id === focusId && isFocusOwnerType(component.type)) ?? null : null;
  const focusCard = focusOwner && cardTree.isCardType(focusOwner.type) ? focusOwner : null;
  const focusMembers = useMemo(() => focusOwner ? focusMembersOf(focusOwner, definition.components) : [], [focusOwner, definition]);
  // Pencerenin içindeki form kartı / kart açıkken kırıntıda ve Esc ile dönülecek üst sahip (pencere).
  const focusParent = focusOwner ? definition.components.find((component) => component.id === refTree.refLocation(definition.components, focusOwner.id)?.ownerId) ?? null : null;
  // ERP tuvali: sayfa düzeyinde kaydedilmiş taslağı gerçek ERP sayfasında (iframe) gösterir. Bağlanamazsa yerleşik tuvale dönülür;
  // kart / pencere içi tasarım ekranı her zaman yerleşik tuvali kullanır.
  // Kalıcı yedek yalnız ERP'ye hiç bağlanılamadığında (ready zaman aşımı); sayfa yükleme hatası tuvalin üstünde ipucu olur.
  const [canvasFallback, setCanvasFallback] = useState(false);
  const [canvasInteractive, setCanvasInteractive] = useState(false);
  // Sessiz kaydın doğrulama sorunu ("Tuval güncellenmedi: …") ve ERP sayfası yükleme hatası; sonraki başarılı kayıt / düzen siler.
  const [canvasHint, setCanvasHint] = useState("");
  const [canvasError, setCanvasError] = useState("");
  const erpBlocks = useRef<ErpCanvasBlock[]>([]);
  const erpCanvasAvailable = !!platformOrigin && !!tenant && !canvasFallback;
  // Önizleme uç noktası yalnız taslak açar: yayımlı sürümde (taslak yokken) sessizce yerleşik tuval gösterilir.
  const erpCanvas = erpCanvasAvailable && !focusOwner && !current?.isPublished;
  useEffect(() => { erpBlocks.current = []; setCanvasError(""); }, [current?.id, systemScreenKey, erpCanvas]);
  // Kart / pencere odağına girip çıkmak sessiz kaydın sorununu silmez; yalnız başka sayfaya geçince silinir.
  useEffect(() => { setCanvasHint(""); }, [current?.id, systemScreenKey]);

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
    // Sistem sayfasında yayın ve geri yükleme yeni satır açar; geçmiş ekran anahtarının bütün satırlarından okunur.
    const url = systemScreenKey ? `/api/system-pages/${encodeURIComponent(systemScreenKey)}/history` : `/api/custom-pages/${pageId}/history`;
    setHistory(await request<PageRevision[]>(url).catch(() => []));
  }, [request, systemScreenKey]);
  useEffect(() => { void refresh(); }, [refresh]);
  // "ERP ekranı aç" / "Sayfa aç" için standart menü ekranları (yetki yoksa liste boş kalır).
  const [erpScreens, setErpScreens] = useState<ScreenOption[]>([]);
  useEffect(() => {
    let active = true;
    void request<{ items?: { page: string; defaultLabel: string; label?: string | null }[] }>("/api/custom-menus/standard/")
      .then((result) => { if (active) setErpScreens((result?.items ?? []).map((item) => ({ key: item.page, label: item.label || item.defaultLabel }))); })
      .catch(() => { if (active) setErpScreens([]); });
    return () => { active = false; };
  }, [request]);
  // Sistem sayfası özeti (yönetici bilgisi, aşama, yayımlı firma tasarımının kimliği); yayın ve kaldırmadan sonra yenilenir.
  const systemInfoRequest = useRef(0);
  const refreshSystemInfo = useCallback(async () => {
    if (!systemScreenKey) return;
    const requestId = ++systemInfoRequest.current;
    const info = await request<SystemPageInfo[]>("/api/system-pages")
      .then((items) => Array.isArray(items) ? items.find((item) => item.screenKey === systemScreenKey) ?? null : null)
      .catch(() => null);
    if (requestId === systemInfoRequest.current) setSystemInfo(info);
  }, [request, systemScreenKey]);
  useEffect(() => { void refreshSystemInfo(); return () => { systemInfoRequest.current++; }; }, [refreshSystemInfo]);
  // Taslak her yüklendiğinde ya da kaydedildiğinde (kimlik, revizyon veya yayın durumu değişince) öneriler yeniden alınır.
  const currentId = current?.id; const currentRevision = current?.revision; const currentPublished = current?.isPublished;
  useEffect(() => {
    if (!systemScreenKey || !currentId) { setNewItems(null); setAddedIds({}); return; }
    let active = true;
    void request<StandardNewItems>(`/api/system-pages/${encodeURIComponent(systemScreenKey)}/new-items`)
      .then((result) => {
        if (!active) return;
        setNewItems(result && Array.isArray(result.items) ? result : null);
        setAddedIds({});
      })
      .catch(() => { if (active) { setNewItems(null); setAddedIds({}); } });
    return () => { active = false; };
  }, [request, systemScreenKey, currentId, currentRevision, currentPublished]);
  useEffect(() => {
    if (initialActionDone.current || loading) return;
    if (initialCreate) {
      if (!capabilities?.canCreate) return;
      initialActionDone.current = true;
      startNew();
      return;
    }
    if (initialPageId) {
      // Liste sistem satırlarını da (screenKey ile) döner; sistem kipinde taslak az önce açıldığı için
      // listede henüz görünmüyorsa kimlikle doğrudan açılır.
      const page = pages.find((item) => item.id === initialPageId) ?? (systemMode ? { id: initialPageId } : undefined);
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
  // Kartın içindeki gösterge ve listeler de örnek veri alır.
  const allComponents = useMemo(() => cardTree.flattenComponents(definition.components), [definition]);
  const bindingKey = JSON.stringify(allComponents
    .filter((item) => (item.type === "metric" || item.type === "dataTable") && typeof item.props.query !== "string" && typeof item.props.source === "string" && item.props.source)
    .map((item) => [item.id, item.type, item.props.source, item.props.columns]));
  const countKey = referencedCountCodes(collectTexts([allComponents.map((component) => component.props), definition.queries.map((query) => query.parameters)])).join(",");
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
    if (selectedComponentId && !cardTree.findComponent(definition.components, selectedComponentId)) setSelectedComponentId(null);
  }, [definition, selectedComponentId]);
  useEffect(() => { if (focusId && !focusOwner) setFocusId(null); }, [focusId, focusOwner]);

  const resetUndo = () => { undoStack.current = []; redoStack.current = []; lastCommit.current = null; setUndoTick((tick) => tick + 1); };
  const loadEditor = (pageName: string, pageCode: string, pageDescription: string, pageDefinition: PageDefinition) => {
    setName(pageName); setCode(pageCode); setDescription(pageDescription); setDefinition(pageDefinition); definitionRef.current = pageDefinition; setFocusId(null);
    setSavedSnapshot(snapshotOf(pageName, pageDescription, pageDefinition));
    setQueryPreviews({}); setSelectedQueryId(pageDefinition.queries[0]?.id ?? null);
    resetUndo();
  };
  // Every definition change goes through commit so it can be undone. Typing into one field
  // (same coalesce key within a second) or one resize drag collapses into a single undo step.
  const commit = (update: (value: PageDefinition) => PageDefinition, coalesceKey?: string) => {
    if (!canEdit) return;
    const previous = definitionRef.current;
    const next = reconcileDefinition(update(previous), { catalog: erpCatalog, previous, queryEditable });
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

  const openPage = async (item: Pick<PageSummary, "id">) => {
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
    setNewPageDialog("create");
  };
  // "Yeni özel sayfa" penceresi: ad, kod ve şablon birlikte seçilir; taslak kaydedilene kadar yalnız tasarımcıdadır.
  const createFromDialog = (result: NewPageResult) => {
    const template = templates.find((item) => item.id === result.templateId) ?? templates[0];
    const built = template.build();
    setName(result.name); setCode(result.code);
    if (built.description) setDescription(built.description);
    if (built.components.length > 0) commit((value) => ({ ...value, components: built.components }));
    setNewPageDialog(null); setSelectedComponentId(null); setError("");
    setNotice("Yeni sayfa taslağı hazır; yayımlanana kadar kullanıcılar görmez. Bileşenleri düzenleyip taslağı kaydedin.");
  };
  const cancelNewPage = () => {
    setNewPageDialog(null);
    if (creating && !current && definition.components.length === 0 && onBack) onBack();
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
    setSelectedComponentId(null); setError("");
    setNotice(`“${template.label}” şablonu uygulandı. Bileşenleri seçerek düzenleyin, ardından taslağı kaydedin.`);
  };
  const createFromPublished = async (page: PageSummary) => {
    if (!capabilities?.canCreate) { setError("Yeni taslak oluşturma yetkiniz yok."); return; }
    setSaving(true); setError(""); setNotice("");
    if (systemScreenKey) {
      // Sistem sayfasında taslak, ekran anahtarı üzerinden açılır (idempotent: açık taslak varsa o döner).
      try {
        const detail = await request<PageDetail>(`/api/system-pages/${encodeURIComponent(systemScreenKey)}/draft`, { method: "POST" });
        await openPage(detail);
        await refresh();
        setNotice("Yayımlanmış firma tasarımından yeni bir taslak açıldı. Yayımlayana kadar ERP'deki ekran değişmez.");
      } catch (e) { setError((e as Error).message); }
      finally { setSaving(false); }
      return;
    }
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
    if (systemMode && !systemAdmin) { setError(SYSTEM_PAGE_ADMIN_ONLY); return; }
    if (!window.confirm(systemMode ? SYSTEM_PAGE_REMOVE_CONFIRM : `“${current.name}” sayfası silinsin mi? Yayımlanmışsa ERP'den de kaldırılır.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await request<void>(`/api/custom-pages/${current.id}`, { method: "DELETE" });
      setSavedSnapshot(snapshotOf(name, description, definition));
      onBack?.();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  /** "Yeni" şeridinde "Ekle": öğe ve eksik bağımlılıkları tek adımda (geri alınabilir) tanımın sonuna eklenir. */
  const addNewItem = (item: StandardNewItem) => {
    if (!canEdit || !newItems) return;
    const { bundle, missing } = standardItemBundle(item, newItems.items, itemPresent);
    if (missing.length > 0) {
      const labels = missing.map((key) => `“${key.slice(key.indexOf(":") + 1)}”`).join(", ");
      setError(`“${item.label}” eklenemedi: gerektirdiği ${labels} öğesi tasarımda yok ve standart öneriler arasında değil.`);
      return;
    }
    let ids: Record<string, string> = {};
    commit((value) => {
      const added = addStandardItems(value, bundle, (type) => newId(type as ComponentType), () => `q-${crypto.randomUUID().slice(0, 8)}`);
      ids = added.ids;
      return normalizeDefinition(added.definition);
    });
    if (Object.keys(ids).length === 0) return;
    setAddedIds((value) => ({ ...value, ...ids }));
    setError("");
    const addedId = ids[item.key] ?? standardItemId(item);
    if (item.kind === "component") { setSelectedComponentId(addedId); setRightMode("inspector"); }
    else { setQueryEditorOpen(true); setSelectedQueryId(addedId); }
    setNotice(`“${item.label}” eklendi. Değişikliği kaydedip yayımlayana kadar ERP'deki ekran değişmez.`);
  };
  /** "Tümünü yok say": taslak (kaydedilmemiş değişiklikleriyle birlikte) tabanı güncel standart sürüme çekilerek kaydedilir. */
  const ignoreAllNewItems = async () => {
    if (!canEdit || !newItems) return;
    await saveDraft({ standardVersion: newItems.standardVersion, notice: "Yeni öğeler yok sayıldı; taslak standart tasarımın güncel sürümüne göre kaydedildi." });
  };
  // Yayımlı firma tasarımının kimliği: açık sayfa yayımlıysa kendisi, değilse sistem sayfası özetindeki satır.
  const publishedFirmDesignId = !systemMode ? null : current?.isPublished ? current.id : systemInfo?.publishedId ?? null;
  /** Yayımlı firma tasarımını kaldırır; açık taslak (varsa) korunur ve tasarımcıda kalınır. */
  const removeFirmDesign = async () => {
    if (!systemMode || !publishedFirmDesignId) return;
    if (!capabilities?.canDelete) { setError("Sayfa silme yetkiniz yok."); return; }
    if (!systemAdmin) { setError(SYSTEM_PAGE_ADMIN_ONLY); return; }
    if (!window.confirm(SYSTEM_PAGE_REMOVE_CONFIRM)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await request<void>(`/api/custom-pages/${publishedFirmDesignId}`, { method: "DELETE" });
      if (current?.id === publishedFirmDesignId) {
        // Açık olan yayımlı satırdı; düzenlenecek bir şey kalmadı.
        setSavedSnapshot(snapshotOf(name, description, definition));
        onBack?.();
        return;
      }
      setNotice("Firma tasarımı kaldırıldı. ERP'de Nexora'nın standart ekranı gösterilir; açık taslağınız korundu.");
      await refreshSystemInfo();
      if (current) await refreshHistory(current.id);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const resetToStandard = async () => {
    if (!current || !systemScreenKey) return;
    if (!systemAdmin) { setError(SYSTEM_PAGE_ADMIN_ONLY); return; }
    if (!window.confirm(SYSTEM_PAGE_RESET_CONFIRM)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      // Açık taslak varsa sürümü eşleşmelidir; yayımlı satırdan çağrılırsa sunucu standarttan yeni taslak açar.
      const reset = await request<PageDetail>(`/api/system-pages/${encodeURIComponent(systemScreenKey)}/reset`, { method: "POST", body: JSON.stringify({ expectedRevision: current.isPublished ? null : current.revision }) });
      setCurrent(reset); setCreating(false);
      loadEditor(reset.name, reset.code, reset.description || "", normalizeDefinition(JSON.parse(reset.definitionJson)));
      setSelectedComponentId(null); setRightMode("inspector");
      setNotice("Taslak, Nexora standart tasarımının güncel sürümüyle değiştirildi. Yayımlayana kadar ERP'deki ekran değişmez.");
      await refreshHistory(reset.id);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const insertIndex = () => {
    const index = definition.components.findIndex((component) => component.id === selectedComponentId);
    return index < 0 ? definition.components.length : index + 1;
  };
  // Yan filtre paneline eklenen giriş seçenek sorgulu seçim girişi olarak başlar (sayfanın ilk okuma sorgusu); sorgu yoksa
  // sunucu kuralı gereği eklenemez (neden gösterilir).
  const newRefProps = (ownerId: string, type: string): Record<string, PropValue> => {
    const owner = definitionRef.current.components.find((component) => component.id === ownerId);
    if (owner?.type !== "facetPanel" || type !== "input") return {};
    const query = definitionRef.current.queries.find((item) => !isWriteKind(item.kind));
    return query ? { inputType: "select", label: "Seçim", optionsQuery: query.id } : { inputType: "select" };
  };
  const addComponent = (item: PaletteItem, at?: number, tab?: { tabsId: string; tabIndex: number; position: number }, card?: { cardId: string; at: number }, ref?: { ownerId: string; at: number }) => {
    if (!canEdit) return;
    if (tab && tabPlacementProblem(cardTree.flatWithCardTabs(definitionRef.current.components), tab.tabsId, tab.tabIndex, { type: item.type })) return;
    if (card && !cardTree.canBeCardChild(item.type)) return;
    if (item.type === "actionBar" && actionBarOf(definitionRef.current.components)) return; // sayfada en çok bir İşlem Çubuğu
    const id = newId(item.type);
    const props = { ...Object.fromEntries(Object.entries(item.sample).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])), ...(ref ? newRefProps(ref.ownerId, item.type) : {}) };
    if (ref) {
      const problem = refTree.refPlacementProblem(definitionRef.current.components, ref.ownerId, { type: item.type, props });
      if (problem) { setError(problem); return; }
    }
    // Düzenlenebilir tablo ve özel alanlar bloğu adsız olamaz: ilk boş ad (tablo1, ozelAlanlar1…) verilir.
    const autoName = requiredNameBase(item.type);
    const name = autoName ? freeName(autoName) : undefined;
    if (autoName && !name) return;
    commit((value) => {
      const components = [...value.components];
      fillLayoutDefaults(item.type, props, value);
      // Sekmeye bırakılan yeni bileşen dizide Sekmeler bileşeninin hemen arkasına girer (sekmeden çıkarılınca orada görünür)
      // ve aynı geri alma adımında sekmeye yazılır.
      const created: PageComponent = { id, type: item.type, ...(name ? { name } : {}), props };
      // Kartın içine bırakılan yeni bileşen kartın `children` dizisine girer.
      if (card) return { ...value, components: cardTree.insertCardChild(components, card.cardId, created, card.at) };
      // Pencereye / form kartına bırakılan yeni bileşen sayfada sahibinin hemen arkasına girer ve sahibin kimlik dizisine yazılır.
      if (ref) {
        const ownerAt = components.findIndex((component) => component.id === ref.ownerId);
        if (ownerAt < 0) return value;
        components.splice(ownerAt + 1, 0, created);
        return { ...value, components: refTree.insertRef(components, ref.ownerId, id, ref.at) };
      }
      // Kartın içindeki Sekmeler'in üyeleri de üst düzeydedir (sunucu kuralı): yeni bileşen kartın arkasına girer.
      const ownerIndex = tab ? components.findIndex((component) => component.id === tab.tabsId
        || (cardTree.isCardType(component.type) && childComponentsOf(component).some((child) => child.id === tab.tabsId))) : -1;
      const index = ownerIndex >= 0 ? ownerIndex + 1 : at == null ? components.length : Math.max(0, Math.min(at, components.length));
      components.splice(index, 0, created);
      if (!tab) return { ...value, components };
      const placed = cardTree.withCardTabs(components, (flat) => placeInTab(flat, tab.tabsId, tab.tabIndex, id, tab.position));
      return placed ? { ...value, components: placed } : value;
    });
    setSelectedComponentId(id);
    if (tab) setActiveTabs((value) => ({ ...value, [tab.tabsId]: tab.tabIndex }));
  };
  // Palet'ten eklenen düzen bileşenleri sunucunun kabul etmediği boş liste yerine sayfanın uygun girişleri/tablosuyla başlar.
  const fillLayoutDefaults = (type: ComponentType, props: PageComponent["props"], state: PageDefinition) => {
    // Sekmedeki girişler de sahipli sayılır: yeni form kartı onları sekmeden çekip almaz.
    const owned = new Set([...ownedInputIds(state.components), ...tabOwnedIds(state.components), ...dialogOwnedIds(state.components), ...tableSearchInputIds(state.components), ...tableDetailToggleIds(state.components)]);
    const inputs = state.components.filter((component) => component.type === "input");
    if (type === "formCard") props.inputs = inputs.filter((component) => !owned.has(component.id)).slice(0, 12).map((component) => component.id);
    else if (type === "filterChips") props.inputs = inputs.slice(0, 12).map((component) => component.id);
    else if (type === "facetPanel") props.inputs = inputs.filter((component) => !owned.has(component.id) && isFacetInput(component)).slice(0, 12).map((component) => component.id);
    else if (type === "filterBar") {
      // İlk sorgulu ızgaraya bağlanır; arama kutusu açık başlar (yer tutucu ERP'de "Ara").
      const table = state.components.find((component) => component.type === "dataTable" && typeof component.props.query === "string" && component.props.query !== "");
      if (table) props.table = table.id;
    }
    else if (type === "contextPanel") {
      const table = state.components.find((component) => component.type === "dataTable" && !!component.name && typeof component.props.query === "string" && component.props.query !== "");
      if (!table) return;
      props.table = table.id;
      const columns = queryColumns(String(table.props.query));
      props.fields = columns.filter((column) => isSafeColumnCode(column.code) && !column.code.includes("=")).slice(0, 6)
        .map((column) => `${column.code}=${sanitizeSafeValue(column.label || column.code).slice(0, 60) || "Alan"}`);
    }
  };
  // Sürükleme bitince (bırakma ya da Esc) bekleyen konum hesabı da iptal edilir; yoksa sonraki sürüklemede hayalet yer tutucu kalır.
  const cancelCanvasHit = () => { cancelAnimationFrame(canvasFrame.current); canvasFrame.current = 0; canvasHit.current = null; };
  const clearDrag = () => { cancelCanvasHit(); dragStore.set({ dropTarget: null, canvasDrop: null, dragging: null }); };
  // `detach`: tuvalde sayfaya bırakılan sekme bileşeni sekmesinden çıkar (Katmanlar'daki sıralama sekmeyi değiştirmez).
  const dropAt = (targetIndex: number, event: DragEvent, detach = false) => {
    event.preventDefault();
    event.stopPropagation();
    clearDrag();
    if (!canEdit) return;
    const type = event.dataTransfer.getData("application/x-nexora-component");
    const rawFrom = event.dataTransfer.getData("application/x-nexora-index");
    const from = rawFrom === "" ? Number.NaN : Number(rawFrom);
    if (type) {
      const item = palette.find((entry) => entry.type === type);
      if (item) addComponent(item, targetIndex);
    } else if (Number.isInteger(from) && from >= 0 && from < definition.components.length) {
      commit((state) => {
        const movedId = state.components[from]?.id;
        const base = detach && movedId ? cardTree.withCardTabs(state.components, (flat) => removeFromTabs(flat, movedId)) ?? state.components : state.components;
        const components = [...base];
        const [moved] = components.splice(from, 1);
        const insertion = from < targetIndex ? targetIndex - 1 : targetIndex;
        components.splice(Math.max(0, Math.min(insertion, components.length)), 0, moved);
        return components.every((component, index) => component === state.components[index]) ? state : { ...state, components };
      });
    }
  };
  // Sekmenin içine bırakma: paletten yeni bileşen ya da tuvaldeki/katmanlardaki var olan bileşen, tek geri alma adımı.
  const dropIntoTab = (tabsId: string, tabIndex: number, position: number, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    clearDrag();
    if (!canEdit) return;
    const type = event.dataTransfer.getData("application/x-nexora-component");
    const rawFrom = event.dataTransfer.getData("application/x-nexora-index");
    const childId = event.dataTransfer.getData(CARD_CHILD_MIME);
    const from = rawFrom === "" ? Number.NaN : Number(rawFrom);
    if (type) {
      const item = palette.find((entry) => entry.type === type);
      if (item) addComponent(item, undefined, { tabsId, tabIndex, position });
      return;
    }
    // Kartın çocuğu sekmeye alınırken önce sayfaya (kartın arkasına) çıkar: sekme üyeleri üst düzey bileşenlerdir.
    const moved = childId ? cardTree.findComponent(definitionRef.current.components, childId) ?? undefined
      : Number.isInteger(from) ? definitionRef.current.components[from] : undefined;
    if (!moved) return;
    commit((state) => {
      const base = childId ? cardTree.ejectCardChild(state.components, childId) : state.components;
      const placed = cardTree.withCardTabs(base, (flat) => placeInTab(flat, tabsId, tabIndex, moved.id, position));
      return placed && placed !== state.components ? { ...state, components: placed } : state;
    });
    setSelectedComponentId(moved.id);
    setActiveTabs((value) => ({ ...value, [tabsId]: tabIndex }));
  };
  // Sürüklenen şey: tuvaldeki bir bileşen (kimlik) ya da paletten bir tür. Sekmeye kabul ve yer tutucu genişliği buna göre.
  const dragInfo = (dragging: string | null) => {
    const draggingComponent = dragging ? cardTree.findComponent(definition.components, dragging) ?? undefined : undefined;
    const draggingType = draggingComponent?.type ?? (dragging && palette.some((item) => item.type === dragging) ? dragging as ComponentType : null);
    const dragSpan = draggingComponent ? deviceSpan(spanOf(draggingComponent), device) : draggingType ? deviceSpan(defaultSpan(draggingType), device) : 12;
    return { draggingComponent, draggingType, dragSpan };
  };
  // Tuval ızgarasında konum hesabı kare başına bir kez yapılır; yer tutucunun üstündeyken konum korunur.
  const canvasHit = useRef<{ target: Element | null; x: number; y: number } | null>(null);
  const canvasFrame = useRef(0);
  const dragOverCanvas = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!canEdit || !dragStore.get().dragging) return;
    if (erpCanvas) {
      // ERP tuvali: bloklar iframe belgesinin koordinatlarındadır; konum yalnız üst düzey bileşenler arasında hesaplanır.
      const frame = (event.currentTarget as HTMLElement).querySelector(".pd-erp-canvas");
      if (!frame) return;
      const at = dropIndex(erpBlocks.current, definitionRef.current.components.map((component) => component.id), event.clientY - frame.getBoundingClientRect().top);
      if (dragStore.get().canvasDrop !== at) dragStore.set({ canvasDrop: at });
      return;
    }
    canvasHit.current = { target: event.target as Element | null, x: event.clientX, y: event.clientY };
    if (canvasFrame.current) return;
    canvasFrame.current = requestAnimationFrame(() => {
      canvasFrame.current = 0;
      const hit = canvasHit.current;
      canvasHit.current = null;
      const grid = gridRef.current;
      if (!hit || !grid) return;
      const element = hit.target instanceof Element ? hit.target.closest<HTMLElement>("[data-page-index], [data-page-placeholder]") : null;
      if (!element || element.parentElement !== grid) {
        // Izgaranın boş yeri: son bloğun altındaysa sona; değilse konum korunur.
        const blocks = Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-page-index]")).filter((block) => block.offsetParent !== null);
        const lastBlock = blocks[blocks.length - 1];
        if (!lastBlock || hit.y > lastBlock.getBoundingClientRect().bottom) dragStore.set({ canvasDrop: definitionRef.current.components.length });
        return;
      }
      if (element.dataset.pagePlaceholder !== undefined) return;
      const index = Number(element.dataset.pageIndex);
      const component = definitionRef.current.components[index];
      if (!component) return;
      const rect = element.getBoundingClientRect();
      const horizontal = deviceSpan(spanOf(component), device) < 12;
      const before = horizontal ? hit.x < rect.left + rect.width / 2 : hit.y < rect.top + rect.height / 2;
      dragStore.set({ canvasDrop: before ? index : index + 1 });
    });
  };
  useEffect(() => () => cancelAnimationFrame(canvasFrame.current), []);
  // İç tasarım ekranı (kart, pencere, form kartı, yan filtre paneli): sahibin ızgarasına bırakılabilen şeyler. Kartta: paletten
  // karta eklenebilen bir tür, kartın kendi çocuğu (sıralama) ya da sayfadaki karta eklenebilen bir bileşen. Pencere ve form
  // kartında: sahibin üyesi (sıralama), sunucu kuralına göre alınabilen sayfa bileşeni ya da paletten alınabilen bir tür.
  const focusAccepts = (owner: PageComponent, components: PageComponent[], dragging: string) => {
    if (cardTree.isCardType(owner.type)) {
      const location = cardTree.cardLocation(components, dragging);
      if (location) return location.cardId === owner.id;
      const root = components.find((component) => component.id === dragging);
      if (root) return root.id !== owner.id && cardTree.canBeCardChild(root.type);
      return palette.some((item) => item.type === dragging) && cardTree.canBeCardChild(dragging);
    }
    const existing = components.find((component) => component.id === dragging);
    if (existing) return !refTree.refPlacementProblem(components, owner.id, { id: existing.id, type: existing.type });
    if (cardTree.cardLocation(components, dragging)) return false;
    return palette.some((item) => item.type === dragging) && !refTree.refPlacementProblem(components, owner.id, { type: dragging, props: newRefProps(owner.id, dragging) });
  };
  const focusedOwnerNow = () => focusId ? definitionRef.current.components.find((component) => component.id === focusId && isFocusOwnerType(component.type)) : undefined;
  /** Üyenin iç ekrandaki genişliği: kart ve pencerede kendi genişliği; form kartında sütun sayısı, yan panelde tam satır. */
  const memberSpan = (owner: PageComponent, member: PageComponent | undefined, type?: ComponentType) => {
    if (owner.type === "formCard") return deviceSpan(owner.props.layout === "inline" ? 3 : 12 / (owner.props.columns === 1 || owner.props.columns === 3 ? owner.props.columns : 2), device);
    if (owner.type === "facetPanel") return 12;
    return deviceSpan(member ? spanOf(member) : type ? defaultSpan(type) : 12, device);
  };
  const dragOverFocus = (event: DragEvent<HTMLElement>) => {
    const dragging = dragStore.get().dragging;
    const owner = focusedOwnerNow();
    if (!canEdit || !dragging || !owner || !focusAccepts(owner, definitionRef.current.components, dragging)) return;
    event.preventDefault();
    canvasHit.current = { target: event.target as Element | null, x: event.clientX, y: event.clientY };
    if (canvasFrame.current) return;
    canvasFrame.current = requestAnimationFrame(() => {
      canvasFrame.current = 0;
      const hit = canvasHit.current;
      canvasHit.current = null;
      const grid = cardGridRef.current;
      const current = focusedOwnerNow();
      if (!hit || !grid || !current) return;
      const members = focusMembersOf(current, definitionRef.current.components);
      const element = hit.target instanceof Element ? hit.target.closest<HTMLElement>("[data-card-index], [data-page-placeholder]") : null;
      if (!element || element.parentElement !== grid) {
        const blocks = Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-card-index]"));
        const lastBlock = blocks[blocks.length - 1];
        if (!lastBlock || hit.y > lastBlock.getBoundingClientRect().bottom) dragStore.set({ canvasDrop: members.length });
        return;
      }
      if (element.dataset.pagePlaceholder !== undefined) return;
      const index = Number(element.dataset.cardIndex);
      const member = members[index];
      if (!member) return;
      const rect = element.getBoundingClientRect();
      const horizontal = memberSpan(current, member) < 12;
      const before = horizontal ? hit.x < rect.left + rect.width / 2 : hit.y < rect.top + rect.height / 2;
      dragStore.set({ canvasDrop: before ? index : index + 1 });
    });
  };
  const dropInFocus = (target: number, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    clearDrag();
    const owner = focusedOwnerNow();
    if (!canEdit || !owner) return;
    const isCard = cardTree.isCardType(owner.type);
    const type = event.dataTransfer.getData("application/x-nexora-component");
    const childId = event.dataTransfer.getData(CARD_CHILD_MIME);
    const rawFrom = event.dataTransfer.getData("application/x-nexora-index");
    const from = rawFrom === "" ? Number.NaN : Number(rawFrom);
    if (type) {
      const item = palette.find((entry) => entry.type === type);
      if (item) { if (isCard) addComponent(item, undefined, undefined, { cardId: owner.id, at: target }); else addComponent(item, undefined, undefined, undefined, { ownerId: owner.id, at: target }); }
      return;
    }
    if (childId) {
      commit((state) => {
        const moved = isCard ? cardTree.moveCardChild(state.components, childId, target) : refTree.moveRef(state.components, owner.id, childId, target);
        return moved === state.components ? state : { ...state, components: moved };
      });
      return;
    }
    // Sayfadaki bileşen sahibe alınır: sekmesinden çıkar; kartta sayfadan kartın `children` dizisine geçer, pencere ve form
    // kartında sayfada kalır ve kimliği sahibin dizisine yazılır (tek geri alma adımı).
    const moved = Number.isInteger(from) ? definitionRef.current.components[from] : undefined;
    if (!moved || !focusAccepts(owner, definitionRef.current.components, moved.id)) return;
    commit((state) => {
      const detached = cardTree.withCardTabs(state.components, (flat) => removeFromTabs(flat, moved.id)) ?? state.components;
      const adopted = isCard ? cardTree.adoptIntoCard(detached, owner.id, moved.id, target) : refTree.adoptRef(detached, owner.id, moved.id, target);
      return adopted === detached ? state : { ...state, components: adopted };
    });
    setSelectedComponentId(moved.id);
  };
  const openFocus = (id: string) => { clearDrag(); setSettingsId(null); setFocusId(id); setSelectedComponentId(id); };
  const updateComponent = (id: string, key: string, value: PropValue) => commit((state) => ({
    ...state,
    components: cardTree.updateComponent(state.components, id, (component) => ({ ...component, props: { ...component.props, [key]: numericKeys.includes(key) ? Number(value) : value } })),
  }), `${id}:${key}`);
  const clearProp = (id: string, key: string) => commit((state) => ({
    ...state,
    components: cardTree.mapComponents(state.components, (component) => {
      if (component.id !== id || !(key in component.props)) return component;
      const props = { ...component.props };
      delete props[key];
      return { ...component, props };
    }),
  }));
  // Tek geri alma adımında birden çok özelliği değiştirir; undefined değer özelliği siler (boş dize sunucuda geçersiz olabilir).
  // İşlem Çubuğu'nun İşlemler menüsüne yeni düğme: düğme oluşturulur ve tek geri alma adımında menüye eklenir; eylemi
  // düğmenin kendi ayarlarından seçilir (seçim yeni düğmeye geçer).
  // Izgaranın satır düğmesi: "Sayfa aç" düğmesi oluşturulur ve tek geri alma adımında satır işlemlerine eklenir; açılacak
  // sayfa düğmenin kendi ayarlarından seçilir (seçim yeni düğmeye geçer).
  const addRowButton = (tableId: string) => {
    if (!canEdit) return;
    const table = definitionRef.current.components.find((component) => component.id === tableId);
    if (!table || idList(table.props.rowActions, MAX_ROW_ACTIONS).length >= MAX_ROW_ACTIONS) return;
    const id = newId("button");
    commit((value) => ({ ...value, components: [
      ...value.components.map((component) => component.id === tableId ? { ...component, props: { ...component.props, rowActions: [...idList(component.props.rowActions, MAX_ROW_ACTIONS), id] } } : component),
      { id, type: "button", props: { label: "Satır işlemi", variant: "secondary", actionType: "page" } },
    ] }));
    setSettingsId(null);
    setSelectedComponentId(id);
  };
  const addMenuButton = (barId: string) => {
    if (!canEdit) return;
    const bar = definitionRef.current.components.find((component) => component.id === barId);
    if (!bar || idList(bar.props.moreButtons, 10).length >= 10) return;
    const id = newId("button");
    commit((value) => ({ ...value, components: [
      ...value.components.map((component) => component.id === barId ? { ...component, props: { ...component.props, moreButtons: [...idList(component.props.moreButtons, 10), id] } } : component),
      { id, type: "button", props: { label: "Yeni işlem", variant: "secondary", actionType: "workflow", workflowId: "" } },
    ] }));
    setSettingsId(null);
    setSelectedComponentId(id);
  };
  const patchComponent = (id: string, patch: Record<string, PropValue | undefined>) => commit((state) => ({
    ...state,
    components: cardTree.mapComponents(state.components, (component) => {
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
    components: cardTree.mapComponents(state.components, (component) => {
      if (component.id !== id) return component;
      const next = { ...component };
      if (value) next.name = value; else delete next.name;
      return next;
    }),
  }), `${id}:name`);
  // Sorgu ve bileşen adları sayfada büyük/küçük harf duyarsız benzersizdir.
  const takenNames = (except: { queryId?: string; componentId?: string }) => [
    ...definition.queries.filter((query) => query.id !== except.queryId).map((query) => query.name.toLowerCase()),
    ...cardTree.flattenComponents(definition.components).filter((component) => component.id !== except.componentId && component.name).map((component) => component.name!.toLowerCase()),
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
        if ("runDebounceMs" in next && next.runDebounceMs === undefined) delete next.runDebounceMs;
        if (isOperationQuery(next)) return next;
        // Parametre adları SQL'den gelir; var olanların (ve bu oturumda SQL'den geçici düşenlerin) bağlaması ve türü korunur.
        if (!isOperationQuery(query)) for (const parameter of query.parameters) parameterMemory.current.set(`${id}:${parameter.name.toLowerCase()}`, parameter);
        if (patch.sql !== undefined) next.parameters = syncParameters(patch.sql, next.parameters, (name) => parameterMemory.current.get(`${id}:${name.toLowerCase()}`), defaultParameterBinding);
        return next;
      }),
      // Izgara, gösterge ve açılır liste yalnız okuma sorgusuna bağlanabilir; yazma türüne çevrilen sorgunun başvuruları aynı adımda kalkar.
      // Okumaya çevrilen sorgu kayıt dizisi adımı ya da pencerenin kaydet sorgusu olamaz; onlar da aynı adımda kalkar.
      components: patch.kind ? cardTree.mapComponents(state.components, (component) => dropQueryReferences(component, id, isWriteKind(patch.kind!) ? "toWrite" : "toRead")) : state.components,
    }), coalesceKey);
  };
  const removeQuery = (id: string) => {
    const query = definition.queries.find((item) => item.id === id);
    if (!queryEditable || !query || !window.confirm(`“${query.name}” sorgusu silinsin mi? Ona bağlı ızgara, gösterge ve açılır listeler sorgusuz kalır.`)) return;
    // Silinen sorguya bağlı bileşen başvuruları da aynı adımda kaldırılır; aksi halde tanım kaydedilemez.
    commit((state) => ({
      ...state,
      queries: state.queries.filter((item) => item.id !== id),
      components: cardTree.mapComponents(state.components, (component) => dropQueryReferences(component, id, "removed")),
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
    const scope: PageScope = { kullanici: sessionUser(token, role), bugun: localToday(), tarih: pageDateScope(), [COUNTS_ROOT]: counts };
    const state = definitionRef.current;
    for (const query of state.queries) {
      if (isWriteKind(query.kind)) continue;
      const preview = queryPreviews[query.id];
      if (preview) scope[query.name] = { rows: preview.rows, rowCount: preview.rowCount, satirSayisi: preview.rowCount, columns: preview.columns, truncated: preview.truncated, meta: preview.meta ?? {} };
    }
    for (const component of state.components) {
      if (!component.name) continue;
      if (component.type === "dataTable" && typeof component.props.query === "string") scope[component.name] = {
        seciliSatir: queryPreviews[component.props.query]?.rows[0] ?? null,
        // Sunucu sayfalı liste tasarımda hep ilk sayfadadır.
        ...(isPagedTable(component) ? { sayfa: 1, sayfaBoyutu: typeof component.props.pageSize === "number" ? component.props.pageSize : DEFAULT_PAGE_SIZE } : {}),
      };
    }
    // Düzenlenebilir tablo tasarımda boştur: {{<tablo>.satirSayisi}} ve alt toplamlar ({{<tablo>.toplam.<kod>}}) 0 olur.
    for (const component of state.components) if (component.name && component.type === "editableGrid")
      scope[component.name] = { satirSayisi: 0, toplam: Object.fromEntries(gridTotalCodes(component.props).map((code) => [code, 0])) };
    for (const component of state.components) {
      if (!component.name || component.type !== "input") continue;
      // ERP gibi: varsayılan boş çözülürse `emptyDefault` kullanılır (sabit; tarih girişinde `{{bugun}}` gibi tarih bağlaması olabilir).
      const raw = interpolate(String(component.props.defaultValue ?? ""), scope) || interpolate(String(component.props.emptyDefault ?? ""), scope);
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
  const removeComponent = (id: string) => { commit((state) => ({ ...state, components: cardTree.removeComponent(state.components, id).map((component) => { if (component.props.filterInput !== id) return component; const props = { ...component.props }; delete props.filterInput; delete props.filterValue; return { ...component, props }; }) })); setSelectedComponentId((value) => value === id ? null : value); };
  const duplicateComponent = (id: string) => {
    const original = cardTree.findComponent(definitionRef.current.components, id);
    if (!original || !canEdit || original.type === "actionBar") return;
    const copyId = newId(original.type);
    const duplicate: PageComponent = { ...original, id: copyId, props: Object.fromEntries(Object.entries(original.props).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) };
    delete duplicate.name; // Ad sayfada benzersiz olmalı; kopya adsız başlar (adı zorunlu türler yeni bir boş ad alır).
    const copyBase = requiredNameBase(duplicate.type);
    if (copyBase) { const copyName = freeName(copyBase); if (!copyName) return; duplicate.name = copyName; }
    // Satır işlemleri ve pencere içeriği tek sahiplidir; kopya bunları sahiplenmez.
    if (duplicate.type === "dataTable") { delete duplicate.props.rowActions; delete duplicate.props.rowOpenAction; delete duplicate.props.openParam; delete duplicate.props.bulkDeleteQuery; }
    if (duplicate.type === "recordHeader") delete duplicate.props.buttons;
    if (duplicate.type === "dialog") duplicate.props.contains = [];
    // Sayfalama sorgunun parametrelerini tablonun adıyla bağlar ve arama girişini sahiplenir; adsız kopya sayfasız başlar.
    if (duplicate.type === "dataTable") duplicate.props = stripPagingProps(duplicate.props);
    // Kartın kopyası çocuklarını yeni kimliklerle ve adsız alır (kimlik ve ad sayfada tekildir); kopyadaki Sekmeler boş başlar
    // (bir bileşen tek sekmede olur).
    if (Array.isArray(original.children)) {
      const children = childComponentsOf(original).map((child) => {
        const copy: PageComponent = { ...child, id: newId(child.type), props: { ...child.props } };
        delete copy.name; delete copy.children;
        if (copy.type === "tabs") copy.props.tabs = parseTabs(child.props.tabs).map((tab) => `${tab.label}=`);
        return copy;
      });
      if (children.length > 0) duplicate.children = children; else delete duplicate.children;
    }
    commit((state) => {
      // Kartın içindeki bileşenin kopyası aynı kartta, aslının arkasında başlar.
      const inCard = cardTree.cardLocation(state.components, id);
      if (inCard) return { ...state, components: cardTree.insertCardChild(state.components, inCard.cardId, duplicate, inCard.index + 1) };
      const index = state.components.findIndex((component) => component.id === id);
      if (index < 0) return state;
      const components = [...state.components];
      components.splice(index + 1, 0, duplicate);
      // Sekmedeki bileşenin kopyası aynı sekmede, aslının hemen arkasında başlar (sekme doluysa sayfaya düşer).
      const location = tabLocation(cardTree.flatWithCardTabs(state.components), id);
      const placed = location ? cardTree.withCardTabs(components, (flat) => placeInTab(flat, location.tabsId, location.tabIndex, copyId, location.position + 1)) : null;
      if (placed) return { ...state, components: placed };
      // Pencere / form kartı / yan panel üyesinin kopyası aynı sahipte, aslının arkasında başlar (sahip doluysa sayfaya düşer).
      const owner = refTree.refLocation(state.components, id);
      return { ...state, components: owner ? refTree.insertRef(components, owner.ownerId, copyId, owner.index + 1) : components };
    });
    setSelectedComponentId(copyId);
  };
  // Sekmedeki bileşen tuvalde (araç çubuğu, Alt+↑/↓) kendi sekmesinde taşınır: sekme sırası ERP'deki sıradır.
  // Katmanlar'daki ↑/↓ her zaman sayfa dizisini değiştirir.
  const moveInTab = (id: string, delta: -1 | 1) => commit((state) => {
    const moved = cardTree.withCardTabs(state.components, (flat) => moveWithinTab(flat, id, delta));
    return moved ? { ...state, components: moved } : state;
  });
  // Kartın içindeki bileşen kart içinde ±1 taşınır; "Karttan çıkar" onu sayfada kartın arkasına koyar.
  const stepInCard = (id: string, delta: -1 | 1) => commit((state) => {
    const moved = cardTree.stepCardChild(state.components, id, delta);
    return moved === state.components ? state : { ...state, components: moved };
  });
  const ejectFromCard = (id: string) => {
    commit((state) => {
      const ejected = cardTree.ejectCardChild(state.components, id);
      return ejected === state.components ? state : { ...state, components: ejected };
    });
    setFocusId(null);
    setSelectedComponentId(id);
  };
  // Pencere / form kartı / yan panel üyesi sahibinde ±1 taşınır; "…çıkar" kimliği sahibin dizisinden kaldırır (bileşen
  // sayfada kendi yerinde kalır; ekran sayfaya döner ve bileşen seçili kalır).
  const stepInOwner = (id: string, delta: -1 | 1) => commit((state) => {
    const moved = refTree.stepRef(state.components, id, delta);
    return moved === state.components ? state : { ...state, components: moved };
  });
  const ejectFromOwner = (id: string) => {
    const location = refTree.refLocation(definitionRef.current.components, id);
    if (!location) return;
    commit((state) => {
      const removed = refTree.removeRef(state.components, location.ownerId, id);
      return removed === state.components ? state : { ...state, components: removed };
    });
    // Pencerenin içindeki form kartından çıkan giriş sayfaya döner; pencere ekranı açık kalmaz.
    setFocusId(null);
    setSelectedComponentId(id);
  };
  const stepMember = (id: string, delta: -1 | 1) => { if (cardTree.cardLocation(definitionRef.current.components, id)) stepInCard(id, delta); else stepInOwner(id, delta); };
  const ejectMember = (id: string) => { if (cardTree.cardLocation(definitionRef.current.components, id)) ejectFromCard(id); else ejectFromOwner(id); };
  const moveComponent =(index: number, delta: number) => commit((state) => {
    const next = [...state.components]; const target = index + delta;
    if (target < 0 || target >= next.length) return state;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...state, components: next };
  });
  const detachFromTab = (id: string) => commit((state) => {
    const components = cardTree.withCardTabs(state.components, (flat) => removeFromTabs(flat, id)) ?? state.components;
    return components === state.components ? state : { ...state, components };
  });
  const startResize = (component: PageComponent, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!canEdit || device !== "desktop") return;
    // Sekmedeki bileşen sekme gövdesinin, kartın içindeki bileşen kart ızgarasının 12 sütununa göre boyutlanır.
    const grid = event.currentTarget.closest<HTMLElement>(".pd-tabs-canvas-panel") ?? event.currentTarget.closest<HTMLElement>(".pd-grid") ?? gridRef.current;
    if (!grid) return;
    event.preventDefault(); event.stopPropagation();
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
    const column = (grid.clientWidth + gap) / 12;
    const startX = event.clientX;
    const startSpan = spanOf(component);
    const key = `resize:${component.id}:${Date.now()}`;
    const move = (moveEvent: PointerEvent) => {
      const span = Math.max(1, Math.min(12, startSpan + Math.round((moveEvent.clientX - startX) / column)));
      if (span !== spanOf(cardTree.findComponent(definitionRef.current.components, component.id) ?? component)) {
        commit((state) => ({ ...state, components: cardTree.updateComponent(state.components, component.id, (item) => ({ ...item, props: { ...item.props, width: span } })) }), key);
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
  // `quiet`: otomatik kayıt; başarı bildirimi gösterilmez, eksik ad / kod ya da doğrulama sorunu hata yazmadan, seçimi ve
  // pencereleri değiştirmeden `null` döner (bileşen düzenlenirken tanım geçici olarak eksik olabilir; elle kayıt nedeni gösterir).
  // Kayıtlar tek uçuşludur: otomatik kayıt, elle kayıt ve önizleme / yayımlama öncesi kayıt aynı anda PUT / POST atmaz
  // (aynı expectedRevision ile 409 ya da aynı kodla iki taslak olmasın). Bekleyen çağıran, önceki kayıt bitince güncel taslak ve
  // kayıtlı anlık görüntüyle (ref'ler, başarıda hemen yazılır) yeniden karar verir: değişiklik kalmadıysa son taslak döner.
  const currentRef = useRef(current);
  currentRef.current = current;
  const savedSnapshotRef = useRef(savedSnapshot);
  savedSnapshotRef.current = savedSnapshot;
  const saveFlight: FlightSlot<PageDetail | null> = useRef<Promise<PageDetail | null> | null>(null);
  const saveDraft = (options?: { standardVersion?: number; notice?: string; quiet?: boolean }) =>
    runSingleFlight(saveFlight, () => saveDraftNow(options), () => {
      const latest = currentRef.current;
      if (options?.standardVersion !== undefined || !latest || latest.isPublished) return undefined;
      if (snapshotOf(name, description, definitionRef.current) !== savedSnapshotRef.current) return undefined;
      if (!options?.quiet) {
        setNotice(options?.notice ?? "Taslak kaydedildi. Yayımlanana kadar aktif sayfa değişmez.");
        void refreshHistory(latest.id);
        void refresh();
      }
      return latest;
    });
  const saveDraftNow = async (options?: { standardVersion?: number; notice?: string; quiet?: boolean }) => {
    const quiet = !!options?.quiet;
    // Sessiz kayıtta sorun hata olarak yazılmaz, ERP tuvalinin üstünde gösterilir (tuval son kaydedilmiş taslakta kalır).
    const fail = (message: string, reveal?: () => void) => { if (!quiet) { setError(message); reveal?.(); } else setCanvasHint(`Tuval güncellenmedi: ${message}`); return null; };
    if (!canEdit) return fail("Bu sayfayı düzenleme yetkiniz yok.");
    // Yüklenmiş ama düzenlenmemiş sayfalar da temizlensin; değişiklik editör durumuna işlenir ki kaydedilenle aynı olsun.
    const reconciled = reconcileDefinition(definitionRef.current, { catalog: erpCatalog, queryEditable });
    if (reconciled !== definitionRef.current) commit(() => reconciled);
    const definition = normalizeDefinition(reconciled);
    if (!name.trim() || !code.trim()) return fail("Sayfa adı ve kodu gerekli. Sağdaki sayfa ayarlarından girin.", () => { setSelectedComponentId(null); setRightMode("inspector"); });
    // Düzen bileşenlerinin zorunlu başvuruları: sunucu da reddeder; burada bileşen adıyla anlaşılır mesaj verilir.
    const pageInputIds = new Set(cardTree.flattenComponents(definition.components).filter((component) => component.type === "input").map((component) => component.id));
    for (const component of definition.components) {
      const label = `“${summaryOf(component)}”`;
      const empty = component.type === "formCard" || component.type === "filterChips" || component.type === "facetPanel" ? idList(component.props.inputs).length === 0 ? `${label} için en az bir giriş kutusu seçin.` : null
        : component.type === "contextPanel" ? !component.props.table ? `${label} için bir tablo seçin.` : parseFieldList(component.props.fields).length === 0 ? `${label} için en az bir alan ekleyin.` : null
          : component.type === "filterBar" ? filterBarProblem(component.props, label, (() => {
            const table = definition.components.find((item) => item.id === component.props.table);
            return !!table && table.type === "dataTable" && typeof table.props.query === "string" && table.props.query !== "";
          })())
          : component.type === "tabs" ? parseTabs(component.props.tabs).length === 0 ? `${label} için en az bir sekme ekleyin.` : null
          : component.type === "steps" ? stepsProblem(component.props, label, pageNamesOf(definition))
            : component.type === "input" && component.props.inputType === "lookup" ? !component.props.optionsQuery && parseStaticOptions(component.props.staticOptions).length === 0 ? "Arama kutusu için seçenek sorgusu veya sabit seçenek gerekli."
              : Array.isArray(component.props.staticOptions) && component.props.staticOptions.some((entry) => typeof entry !== "string" || !STATIC_OPTION.test(entry)) ? "'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır." : null
              : component.type === "dataTable" ? pagedTableProblem(component, definition.queries.find((query) => query.id === component.props.query)) ?? fazBProblem(component, label, pageInputIds)
                : fazBProblem(component, label, pageInputIds);
      // Koşul sözdizimi ve kök adları: sunucu da reddeder; burada aynı metinle ve bileşen seçilerek gösterilir.
      const condition = empty ?? conditionProblem("visibleWhen", component.props.visibleWhen, pageNamesOf(definition))
        ?? conditionProblem("disabledWhen", component.props.disabledWhen, pageNamesOf(definition))
        ?? conditionProblem("optionsWhen", component.props.optionsWhen, [...pageNamesOf(definition), "satir"])
        ?? pickerGridProblem(component, definition)
        ?? countWhenProblem(component.props.countWhen, component.type === "metric" ? definition.queries.find((query) => query.id === component.props.query)?.name ?? null : null, pageNamesOf(definition));
      if (condition) return fail(condition, () => { setSelectedComponentId(component.id); setRightMode("inspector"); });
    }
    // Bileşen listeli çalışma (önizleme sorgusu): adlar sayfadaki giriş / tablo adları, gecikme 150–3000.
    const runOnTargets = cardTree.flattenComponents(definition.components).filter((component) => RUN_ON_TYPES.has(component.type) && !!component.name).map((component) => component.name!);
    for (const query of definition.queries) {
      const problem = runOnProblem(query, runOnTargets);
      if (problem) return fail(problem, () => { setQueryEditorOpen(true); setSelectedQueryId(query.id); });
    }
    // ERP işlemi sorguları: işlem seçilmeli ve zorunlu parametreler bağlanmalı (katalog alınamadıysa sunucu denetler).
    for (const query of definition.queries) {
      if (!isOperationQuery(query)) continue;
      const op = findOperation(erpCatalog, query.operation);
      const problem = !query.operation ? `“${query.name}” sorgusu için bir ERP işlemi seçin.`
        : op ? (() => { const missing = unboundRequiredParameter(op, query.parameters); return missing ? `Zorunlu parametre bağlanmadı: ${missing}` : bodyMapBlockProblem(query, op, definition); })() : null;
      if (problem) return fail(problem, () => { setQueryEditorOpen(true); setSelectedQueryId(query.id); });
    }
    // Otomatik kayıt bildirimleri (ör. ERP tuvali yedek uyarısı) silmez.
    setSaving(true); if (!quiet) { setError(""); setNotice(""); }
    const sentSnapshot = snapshotOf(name, description, definition);
    const wire = wireDefinition(definition, erpCatalog);
    const base = currentRef.current;
    try {
      const result = base
        ? await request<PageDetail>(`/api/custom-pages/${base.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: base.revision, name, description: description || null, definition: wire, ...(systemMode ? { standardVersion: options?.standardVersion ?? (allNewItemsAdded ? newItems.standardVersion : null) } : {}) }) })
        : await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: code.trim(), name, description: description || null, definition: wire }) });
      currentRef.current = result; savedSnapshotRef.current = sentSnapshot;
      setCurrent(result); setCreating(false); setCode(result.code); setSavedSnapshot(sentSnapshot); setCanvasHint("");
      // Otomatik kayıt geçmişi ve sayfa listesini yenilemez (her kayıtta istek atılmasın); elle kayıt yeniler.
      if (!quiet) {
        setNotice(options?.notice ?? "Taslak kaydedildi. Yayımlanana kadar aktif sayfa değişmez.");
        await refreshHistory(result.id);
        await refresh();
      }
      return result;
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
    return null;
  };
  // ERP tuvali yalnız kaydedilmiş taslağı gösterir: tanım değişince taslak sessizce kaydedilir. Tuval, taslağın sunucu
  // revizyonu değişince yenilenir; böylece elle kayıt, geri yükleme ve otomatik kayıt aynı yoldan yansır. Değişiklik yoksa
  // (sayfa açılışı) ya da elle kayıt sürerken PUT atılmaz.
  useDraftAutosave({
    enabled: erpCanvasAvailable && canEdit && Boolean(name.trim() && code.trim()),
    changeKey: definition,
    save: async () => saving || (!dirty && !!current) ? false : Boolean(await saveDraft({ quiet: true })),
    // Henüz oluşturulmamış sayfada ad / kod yazılırken bekleyen ilk kayıt ertelenir (yarım kodla taslak açılmaz).
    holdKey: current ? null : JSON.stringify([name, code]),
  });
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
  // Yayımlı sayfanın ERP adresi. Sistem sayfası `@kod` ile değil, kendi yerleşik ekranının sayfa anahtarıyla açılır:
  // ERP o ekranı yönlendiricide firma tasarımıyla (ya da standartla) çizer. Taslak önizlemesi kimlikle yapılır.
  const setPublishedTarget = (destination: URL, page: PageDetail) => {
    if (systemScreenKey) destination.searchParams.set("page", systemScreenKey);
    else destination.searchParams.set("customPage", page.code);
  };
  /** Taslak önizlemesi: sistem sayfası kendi ekran anahtarıyla açılır (modül menüsü, konum satırı ve sekme o ekranınkidir). */
  const setDraftTarget = (destination: URL, draftId: string) => {
    if (systemScreenKey) {
      destination.searchParams.set("page", systemScreenKey);
      destination.searchParams.set("systemPreview", draftId);
    } else destination.searchParams.set("customPagePreview", draftId);
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
        if (current?.isPublished) setPublishedTarget(destination, current);
        else {
          const saved = dirty || !current ? await saveDraft() : current;
          if (!saved) return;
          setDraftTarget(destination, saved.id);
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
        setPublishedTarget(destination, current);
        previewWindow.location.replace(destination.toString());
        return;
      }
      const saved = dirty || !current ? await saveDraft() : current;
      if (!saved) { previewWindow.close(); return; }
      const destination = new URL("/", platformOrigin);
      setDraftTarget(destination, saved.id);
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
      await refreshSystemInfo();
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const restoreRevision = async (revisionId: string) => {
    if (!current) return;
    const revision = history.find((item) => item.id === revisionId);
    if (!revision) { setError("Seçilen geçmiş sürüm bulunamadı. Geçmişi yenileyin."); return; }
    if (current.isPublished ? !capabilities?.canCreate : !capabilities?.canUpdate) { setError("Bu sürümü geri yükleme yetkiniz yok."); return; }
    if (systemMode && !systemAdmin) { setError(SYSTEM_PAGE_ADMIN_ONLY); return; }
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikleriniz kaybolacak. Geçmiş sürüm yüklensin mi?")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      // Sistem geçmişi ekranın bütün satırlarını içerir; geri yükleme sürümün ait olduğu satır üzerinden yapılır.
      const restoreRowId = systemMode ? revision.customPageId ?? current.id : current.id;
      const restored = current.isPublished
        ? await request<PageDetail>(`/api/custom-pages/${restoreRowId}/restore/${revisionId}`, { method: "POST" })
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
    if (formEditorOpen || designerShortcutsBlocked(event)) return;
    const target = event.target as HTMLElement | null;
    // Monaco (SQL editörü) da yazım alanıdır: Delete/Ctrl+Z bileşen yerine editörde çalışmalı.
    const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || !!target.closest(".monaco-editor"));
    const mod = event.ctrlKey || event.metaKey;
    const keyName = event.key.toLowerCase();
    if (mod && keyName === "s") { event.preventDefault(); if (canEdit && !saving) void saveDraft(); return; }
    if (typing || newPageDialog || queryEditorOpen) return;
    if (mod && keyName === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
    else if (mod && (keyName === "y" || (keyName === "z" && event.shiftKey))) { event.preventDefault(); redo(); }
    else if (mod && keyName === "d" && selectedComponentId) { event.preventDefault(); duplicateComponent(selectedComponentId); }
    else if ((event.key === "Delete" || event.key === "Backspace") && selectedComponentId && canEdit) { event.preventDefault(); removeComponent(selectedComponentId); }
    else if (event.key === "Escape") { if (selectedComponentId) setSelectedComponentId(null); else if (focusOwner) setFocusId(focusParent?.id ?? null); else if (fullscreen) setFullscreen(false); }
    else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.altKey && selectedComponentId) {
      event.preventDefault();
      const index = definition.components.findIndex((component) => component.id === selectedComponentId);
      if (tabLocation(cardTree.flatWithCardTabs(definition.components), selectedComponentId)) moveInTab(selectedComponentId, event.key === "ArrowUp" ? -1 : 1);
      else if (cardTree.cardLocation(definition.components, selectedComponentId)) stepInCard(selectedComponentId, event.key === "ArrowUp" ? -1 : 1);
      else if (focusOwner && refTree.refLocation(definition.components, selectedComponentId)?.ownerId === focusOwner.id) stepInOwner(selectedComponentId, event.key === "ArrowUp" ? -1 : 1);
      else if (index >= 0) moveComponent(index, event.key === "ArrowUp" ? -1 : 1);
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

  // Form kartı / yan filtre paneli girişleri, sunucu sayfalı listelerin arama girişleri ve listelerin "Detay paneli" düğmesine
  // bağlı onay kutuları üst düzeyde çizilmez.
  const ownedIds = useMemo(() => new Set([...ownedInputIds(definition.components), ...tableSearchInputIds(definition.components), ...tableDetailToggleIds(definition.components)]), [definition]);
  // "İşlemler" menüsüne taşınan düğmeler ERP'de kendi yerinde çizilmez; tuvalde de gizlenir (katmanlardan seçilebilir kalır).
  const movedIds = useMemo(() => movedButtonIds(definition.components), [definition]);
  // Sekmelere alınan bileşenler üst düzeyde çizilmez; Sekmeler bileşeninin içinde varsayılan (ya da tıklanan) sekmede görünür.
  // Kartın içindeki Sekmeler'in üyeleri de (üst düzeyde olsalar da) sayfada ayrıca çizilmez.
  const tabIds = useMemo(() => tabOwnedIds(cardTree.flatWithCardTabs(definition.components)), [definition]);
  // Pencerenin içerdiği bileşenler ve listelerin satır işlemi düğmeleri de üst düzeyde çizilmez (pencerede / İşlemler sütununda görünür).
  const nestedIds = useMemo(() => new Set([...dialogOwnedIds(definition.components), ...rowActionIds(definition.components), ...headerButtonIds(definition.components)]), [definition]);
  runQueryPreviewRef.current = runQueryPreview;
  // "Yeni sorgu / Düzenle" penceresi: sorgu eklenir/güncellenir; türü değişen sorgunun başvuruları sayfadaki kuralla kalkar.
  const upsertQuery = (state: PageDefinition, query: PageQuery): PageDefinition => {
    const existing = state.queries.find((item) => item.id === query.id);
    if (!existing && state.queries.length >= MAX_QUERIES) return state;
    return {
      ...state,
      queries: existing ? state.queries.map((item) => item.id === query.id ? query : item) : [...state.queries, query],
      components: existing && existing.kind !== query.kind ? cardTree.mapComponents(state.components, (component) => dropQueryReferences(component, query.id, isWriteKind(query.kind) ? "toWrite" : "toRead")) : state.components,
    };
  };
  const queryEditor = useQueryEditor({
    queries: definition.queries, catalog: erpCatalog, schema: sqlSchema, suggestions: suggestionsRef.current, components: definition.components,
    editable: queryEditable, readOnlyReason: !isAdmin ? "Sorguları yalnız tenant yöneticisi ekleyip düzenleyebilir." : !canEdit ? "Bu sayfa şu an düzenlenemez." : null,
    previewBlockedReason: current?.isPublished ? "Önizleme yalnız taslakta çalışır; önce yeni taslak oluşturun." : null,
    previews: queryPreviews,
    takenNames: (exceptQueryId) => takenNames({ queryId: exceptQueryId ?? undefined }),
    defaultBinding: defaultParameterBinding,
    runOperation: async (query) => { await runOperationPreview(query); },
    // SQL önizleme ucu kayıtlı taslağı çalıştırır: sorgu önce (bağlanmadan) sayfaya işlenir, sonra mevcut kaydet-ve-çalıştır yolu kullanılır.
    runSql: async (query) => {
      if (!queryEditable) return;
      flushSync(() => commit((state) => upsertQuery(state, query)));
      await runQueryPreviewRef.current(query.id, false);
    },
    revert: (original, id) => commit((state) => original ? upsertQuery(state, original) : { ...state, queries: state.queries.filter((item) => item.id !== id) }),
    save: (query, componentId, patch) => {
      if (!queryEditable) return;
      commit((state) => {
        const next = upsertQuery(state, query);
        if (!next.queries.some((item) => item.id === query.id)) return state;
        return { ...next, components: cardTree.mapComponents(next.components, (component) => {
          if (component.id !== componentId) return component;
          const props = { ...component.props };
          for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete props[key]; else props[key] = value as PropValue; }
          return { ...component, props };
        }) };
      });
    },
    onAddSourceQuery: addSourceQuery,
  });
  // Tuvalde otomatik örnek veri (yalnız okuma; taslakta; SQL için tenant yöneticisi ve kayıtlı taslak).
  /**
   * Örnek veri kapsamı: tasarım kapsamıyla aynı, ama değeri boş arama kutusu (ör. "Tüm depolar") örnek için ilk seçeneğini
   * alır. Böylece seçim isteyen sorgular (ör. depo hareketleri) tuvalde örnek veri gösterir; tuvaldeki görünür değerler değişmez.
   */
  const sampleScope = (): PageScope => {
    const scope = designScope();
    for (const component of definitionRef.current.components) {
      if (!component.name || component.type !== "input" || component.props.inputType !== "lookup") continue;
      const current = scope[component.name] as { value?: unknown } | undefined;
      if (current && current.value !== null && current.value !== undefined) continue;
      const preview = typeof component.props.optionsQuery === "string" ? queryPreviews[component.props.optionsQuery] : undefined;
      const valueColumn = String(component.props.optionValueColumn || "") || preview?.columns[0]?.code || "";
      const row = valueColumn ? preview?.rows.find((item) => item[valueColumn] != null && item[valueColumn] !== "") : undefined;
      if (row) scope[component.name] = { value: row[valueColumn], search: null, seciliSatir: row };
    }
    return scope;
  };
  const samples = useCanvasSamples({
    pageId: current?.id ?? null, queries: definition.queries, components: allComponents, previews: queryPreviews, setPreviews: setQueryPreviews,
    enabled: !current?.isPublished, sqlAllowed: isAdmin && !!current && !current.isPublished,
    storedDefinitionJson: current?.definitionJson ?? null, catalog: erpCatalog, scope: sampleScope, fetchJson: request,
    manualRun: (queryId) => runQueryPreview(queryId, false),
    whenIdle: dragStore.whenIdle,
  });
  const sampleHint = (queryId: string) => { const info = samples.info(queryId); return info.state === "off" || info.state === "ready" ? null : info.state === "loading" || info.state === "waiting" ? "Örnek veri yükleniyor…" : info.message ?? null; };
  const sampleHintKey = definition.queries.map((query) => `${query.id}:${samples.info(query.id).state}`).join("|");
  const rendered = useMemo(() => {
  // Tuval metinlerinin ve koşullarının örnek kapsamı (liste.seciliSatir = listenin ilk örnek satırı).
  const view = designScope();
  const shown = (raw: unknown, fallback: string) => { const text = String(raw ?? ""); return text ? sampleText(text, view) : fallback; };
  const owned = ownedInputIds(definition.components);
  // Sunucu sayfalı listenin arama girişi listenin başlığında çizilir (ERP ile aynı), üst düzeyde değil.
  const searchOwned = tableSearchInputIds(definition.components);
  // Listenin "Detay paneli" düğmesine bağlı onay kutusu ERP'de listenin araç çubuğunda düğme olarak çizilir.
  for (const id of tableDetailToggleIds(definition.components)) searchOwned.add(id);
  const inputById = new Map(definition.components.filter((item) => item.type === "input").map((item) => [item.id, item]));
  const optionRows = (inputProps: Record<string, PropValue>) => {
    const preview = typeof inputProps.optionsQuery === "string" ? queryPreviews[inputProps.optionsQuery] : undefined;
    const valueColumn = String(inputProps.optionValueColumn || "") || preview?.columns[0]?.code || "";
    const labelColumn = String(inputProps.optionLabelColumn || "") || valueColumn;
    // Açılır listede açıklama sütunu ERP'deki gibi "etiket · açıklama" olur (arama kutusunda ayrı satırdadır).
    const descriptionColumn = inputProps.inputType === "select" ? String(inputProps.optionDescriptionColumn || "") : "";
    const show = (value: unknown) => value == null ? "" : String(value);
    return { ready: !!preview, rows: (preview?.rows ?? []).map((row) => {
      const label = show(row[labelColumn]) || show(row[valueColumn]);
      const description = descriptionColumn ? show(row[descriptionColumn]).trim() : "";
      return { value: show(row[valueColumn]), label: description ? `${label} · ${description}` : label, row };
    }) };
  };
  /** `inline`: tek satırlık süzgeç (FormCard `layout: "inline"`) içinde ERP görünümü: kapalı açılır kutu, düğme gibi onay kutusu. */
  const renderInput = (component: PageComponent, style: CSSProperties, inline = false) => {
    const props = component.props;
    if (props.hidden === true) {
      const value = props.autoId === true ? "otomatik kimlik" : String(props.defaultValue ?? "");
      return <div key={component.id} className="pd-binding-preview-input is-hidden" style={style}><span className="pd-hidden-input" title="Gizli giriş: ERP'de çizilmez, değerini tutar">
        Gizli · {String(props.label || component.name || "Giriş")}{value && <code>{value}</code>}</span></div>;
    }
    const inputType = String(props.inputType || "text");
    const optionsQuery = definition.queries.find((query) => query.id === props.optionsQuery);
    // Varsayılan değer ve ipucu {{…}} içerebilir: tuvalde örnek veriyle çözülür (çözülemezse ham metin kalır).
    const sample = (raw: unknown) => { const text = String(raw ?? ""); return text.includes("{{") ? interpolate(text, designScope()) || text : text; };
    const defaultShown = sample(props.defaultValue);
    const placeholderShown = sample(props.placeholder);
    // İlk seçenek varsayılanı (`defaultFirst`): varsayılan değer boşsa tuvalde ilk örnek seçenek görünür (ERP'deki gibi).
    const firstShown = (labels: string[]) => props.defaultFirst === true && !defaultShown ? labels.find(Boolean) ?? "" : "";
    const selectLabels = inputType === "select" ? [...parseStaticOptions(props.staticOptions).filter((option) => option.value !== "").map((option) => option.label),
      ...optionRows(props).rows.filter((option) => option.value !== "").map((option) => option.label)] : [];
    const control = inputType === "checkbox" ? <input type="checkbox" tabIndex={-1} readOnly checked={/^(true|1|evet)$/i.test(String(props.defaultValue ?? ""))}/>
      // Aranabilir açılır liste ERP'de değer metni ve ⌄ taşıyan kutudur (arama kutusunun kapalı görünümü).
      : inputType === "select" && props.searchable === true
        ? <LookupPreview placeholder="Seçin" value={firstShown(selectLabels) || defaultShown} options={[]} ready compact/>
      : inputType === "select" ? <select tabIndex={-1}><option>{firstShown(selectLabels) || (optionsQuery ? `Seçenekler: ${optionsQuery.name}` : "Seçin")}</option></select>
        : inputType === "lookup" ? (() => {
          // Sabit seçenekler önce, ardından seçenek sorgusunun önizleme satırları (etiket ve açıklama sütunu).
          const { ready, rows } = optionRows(props);
          const descriptionColumn = String(props.optionDescriptionColumn || "");
          const options = [
            ...parseStaticOptions(props.staticOptions).map((option) => ({ label: option.label, description: "" })),
            ...rows.map(({ label, row }) => ({ label, description: descriptionColumn && row[descriptionColumn] != null ? String(row[descriptionColumn]) : "" })),
          ];
          // ERP'deki gibi kapalı açılır kutu: varsayılan değer sabit bir seçeneğin değeriyse etiketi gösterilir (ör. Receipt → Giriş).
          const fixed = parseStaticOptions(props.staticOptions).find((option) => option.value === String(props.defaultValue ?? ""));
          const first = props.defaultFirst === true && !defaultShown
            ? [...parseStaticOptions(props.staticOptions).filter((option) => option.value !== "").map((option) => option.label), ...rows.filter((option) => option.value !== "").map((option) => option.label)].find(Boolean) ?? "" : "";
          return <LookupPreview placeholder={placeholderShown} value={fixed?.label ?? (first || defaultShown)} options={options} ready={ready || !optionsQuery} compact/>;
        })()
        : <input tabIndex={-1} readOnly placeholder={placeholderShown} value={defaultShown}/>;
    if (inline && inputType === "checkbox") return <div key={component.id} className="pd-binding-preview-input is-checkbox is-toggle" style={style}><span className="pd-inline-toggle">{String(props.label || component.name)}</span></div>;
    if (inline && inputType === "text" && props.placeholder) return <div key={component.id} className="pd-binding-preview-input is-search" style={style}><span className="pd-inline-search"><Search size={13} aria-hidden="true"/><input tabIndex={-1} readOnly placeholder={String(props.placeholder)} value={String(props.defaultValue ?? "")}/></span></div>;
    return <div key={component.id} className={`pd-binding-preview-input is-${inputType}`} style={style}><label>{props.label ? <span>{String(props.label)}</span> : null}{control}</label></div>;
  };
  /** Yan filtre panelinin grupları (seçim girişleri ve seçenek sorgusunun önizleme satırları, varsa sayıları). */
  const facetGroupsOf = (panelProps: Record<string, PropValue>) => {
    const countColumns = Object.fromEntries(parseFieldList(panelProps.facetCounts).map((entry) => [entry.code, entry.label]));
    return idList(panelProps.inputs).flatMap((id): FacetPreviewGroup[] => {
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
  };
  const byComponentId = new Map(definition.components.map((item) => [item.id, item]));
  const rowActionLabelsOf = (tableProps: Record<string, PropValue>) => idList(tableProps.rowActions, MAX_ROW_ACTIONS)
    .map((id) => byComponentId.get(id)).filter((item): item is PageComponent => !!item).map((item) => String(item.props.text || item.props.label || item.name || "İşlem"));
  // Sekmeler bileşeni sahiplendiği bileşenleri bu işlevle kendi içinde çizer (sekme bir sekme içermez; özyineleme bir düzeydir).
  const renderOne = (component: PageComponent): ReactNode => {
    const props = component.props;
    const style = componentStyle(component.type, props);
    switch (component.type) {
      case "heading": return <h2 key={component.id} className="custom-page-preview-heading" style={style}>{shown(props.text || props.title, "Başlık")}</h2>;
      case "text": return <p key={component.id} className="custom-page-preview-text" style={style}>{Array.isArray(props.parts) && props.parts.length > 0 ? shown(props.parts.join(" · "), "Metin") : shown(props.text, "Metin")}</p>;
      case "label": return <p key={component.id} className="custom-page-preview-text pd-binding-label" style={style}>{shown(props.text, "Etiket")}</p>;
      case "input": return owned.has(component.id) || searchOwned.has(component.id) ? null : renderInput(component, style);
      case "metric": if (typeof props.query === "string") {
        const query = definition.queries.find((item) => item.id === props.query);
        const preview = queryPreviews[String(props.query)];
        const first = preview?.columns[0]?.code;
        // Koşullu sayaç tuvalde örnek satırlardan (en fazla 5) sayılır.
        const count = preview && query ? countRowsWhen(props.countWhen, preview.rows, query.name, designScope()) : undefined;
        const value = count !== undefined ? countText(count) : preview && first && preview.rows.length > 0 && preview.rows[0][first] != null ? String(preview.rows[0][first]) : preview ? "—" : "Önizleme yok";
        return <MetricPreview key={component.id} title={shown(props.title, "Gösterge")} value={value} description={String(props.description || (query ? `Sorgu · ${query.name}` : ""))} tone={toneOf(props.variant)} icon={props.icon} trendRows={typeof props.trendQuery === "string" ? queryPreviews[props.trendQuery]?.rows : undefined} style={style} />;
      } else if (!props.source && typeof props.value === "string") {
        const metricValue = interpolate(props.value, designScope());
        // Açıklamadaki bağlama da örnek veriyle çözülür (ör. birim "EA"); çözülemezse ham metin kalır.
        const rawDescription = String(props.description || "");
        const description = rawDescription.includes("{{") ? interpolate(rawDescription, designScope()) || rawDescription : rawDescription;
        return <MetricPreview key={component.id} title={shown(props.title, "Gösterge")} value={metricValue || "Değer girin"} description={description} tone={toneOf(props.variant)} icon={props.icon} trendRows={typeof props.trendQuery === "string" ? queryPreviews[props.trendQuery]?.rows : undefined} style={style} />;
      } else { const data = previewData[component.id]; return <MetricPreview key={component.id} title={shown(props.title, "Gösterge")} value={!props.source ? "Veri kaynağı seçin" : data ? data.totalCount.toLocaleString("tr-TR") : "Yükleniyor…"} description={String(props.description || sources.find((source) => source.code === props.source)?.label || "")} tone={toneOf(props.variant)} icon={props.icon} trendRows={typeof props.trendQuery === "string" ? queryPreviews[props.trendQuery]?.rows : undefined} style={style} />; }
      case "card": case "section": {
        // Kartın içindeki bileşenler (düğme, etiket, sekmeler…) ERP'deki gibi kartın içinde çizilir. Örnek veride koşulu
        // tutmayan çocuk (ör. Lot/Seri etiketi) gizlenmez; soluk ve "Koşullu" işaretlidir.
        const inner = childComponentsOf(component);
        const wrap = (child: PageComponent) => {
          const off = hiddenInSample(child, view);
          return <div key={child.id} className={`pd-card-child is-${child.type}${off ? " is-cond-off" : ""}`}>
            {off && <span className="pd-cond-chip" title={String(child.props.visibleWhen)}>Koşullu</span>}{renderOne(child)}
          </div>;
        };
        const closable = typeof props.closeInput === "string" && props.closeInput.trim() !== "";
        if (component.type === "card" && (props.variant === "panel" || closable)) {
          // ERP DetailPanel ile aynı yerleşim: üstte kod + başlıktan önceki düğmeler + ✕, başlık, etiket satırı; gövde; gövdeden sonraki düğmeler altlıkta.
          const head: ReactNode[] = [], tags: ReactNode[] = [], body: ReactNode[] = [], foot: ReactNode[] = [];
          for (const child of inner) {
            if (child.type === "badge") tags.push(wrap(child));
            else if (child.type === "button") (body.length > 0 ? foot : head).push(wrap(child));
            else body.push(wrap(child));
          }
          const title = shown(props.title, "");
          return <aside key={component.id} className="pd-detail" style={style}>
            <div className="pd-detail-head">
              <div className="pd-detail-top">
                <span className="pd-detail-code">{shown(props.description, "")}</span>
                <span className="pd-detail-actions">{head}{closable && <span className="pd-detail-close" title="Detay panelini kapat"><X size={15} aria-hidden="true"/></span>}</span>
              </div>
              {title && <h3>{title}</h3>}
              {tags.length > 0 && <div className="pd-detail-labels">{tags}</div>}
            </div>
            <div className="pd-detail-body">{body.length > 0 ? body : inner.length === 0 ? <p className="pd-detail-empty">Kartın içini tasarlayın</p> : null}</div>
            {foot.length > 0 && <div className="pd-detail-foot">{foot}</div>}
          </aside>;
        }
        return <article key={component.id} className={`custom-page-preview-card ${component.type === "section" ? "is-section" : ""}${inner.length > 0 ? " has-children" : ""}`} style={style}>
          {(props.title || inner.length === 0) && <b>{shown(props.title, titleFor(component.type))}</b>}{props.description && <p>{shown(props.description, "")}</p>}
          {inner.length > 0 && <div className="pd-card-children">{inner.map(wrap)}</div>}
        </article>;
      }
      case "divider": return <hr key={component.id} className="custom-page-preview-divider" style={style} />;
      case "spacer": return <div key={component.id} className="custom-page-preview-spacer" style={style} />;
      case "button": return <div key={component.id} className="custom-page-preview-action" style={style}><button type="button" tabIndex={-1} className={`custom-page-preview-button${buttonVariantClass(props.variant)}`}>
        {props.icon === "open" && <Maximize2 size={13} aria-hidden="true"/>}{shown(props.text || props.label, "İşlem")}</button></div>;
      case "dataTable": if (typeof props.query === "string") {
        const query = definition.queries.find((item) => item.id === props.query);
        const preview = queryPreviews[String(props.query)];
        const chosen = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string") : [];
        // ERP ile aynı: seçilen sütunlar seçim sırasıyla, `columnLabels` başlıklarıyla çizilir.
        const headings = Object.fromEntries((Array.isArray(props.columnLabels) ? props.columnLabels : []).flatMap((item) => {
          const text = typeof item === "string" ? item : ""; const at = text.indexOf("=");
          return at > 0 ? [[text.slice(0, at), text.slice(at + 1)]] : [];
        }));
        const picked = preview ? chosen.flatMap((code) => preview.columns.filter((column) => column.code === code).map((column) => headings[code] ? { ...column, label: headings[code] } : column)) : [];
        const visible = (picked.length > 0 ? picked : preview?.columns ?? []).slice(0, 20);
        // Arama girişi üst düzeyde çizilmez; önizleme yokken de listenin başlığında görünür.
        const searchInput = isPagedTable(component) && typeof props.searchInput === "string" ? inputById.get(props.searchInput) : undefined;
        // "Detay paneli" düğmesi (ERP ile aynı): listenin araç çubuğunda, bağlı onay kutusunun etiketiyle.
        const toggleInput = typeof props.detailToggleInput === "string" ? inputById.get(props.detailToggleInput) : undefined;
        const detailToggleLabel = toggleInput && toggleInput.props.inputType === "checkbox" ? String(toggleInput.props.label || "Detay paneli") : undefined;
        if (!preview) return <article key={component.id} className="custom-page-preview-card" style={style}><div className="custom-page-preview-card-head"><b>{shown(props.title, "Liste")}</b><small>{query ? `Sorgu · ${query.name}` : "Sorgu seçilmedi"}</small>{detailToggleLabel && <span className="pd-adv-btn pd-adv-toggle">{detailToggleLabel}</span>}</div>{searchInput && <div className="pd-grid-search">{renderInput(searchInput, {})}</div>}<p>{sampleHint(String(props.query)) ?? "Örnek satırlar için Sorgular sekmesinde “Çalıştır ve önizle”yi kullanın."}</p>
          {rowActionLabelsOf(props).length > 0 && <p>İşlemler: {rowActionLabelsOf(props).map((label, index) => <span key={index} className="custom-page-preview-row-action" style={index > 0 ? { marginLeft: 4 } : undefined}>{label}</span>)}</p>}</article>;
        const shownRows = preview.rows.slice(0, 5);
        const paging = isPagedTable(component) ? {
          pageSize: typeof props.pageSize === "number" && props.pageSize > 0 ? props.pageSize : DEFAULT_PAGE_SIZE, total: preview.rowCount,
          meta: parseFieldList(props.footerMeta).map((entry) => ({ label: entry.label, value: preview.meta?.[entry.code] == null ? "—" : String(preview.meta[entry.code]) })),
          search: searchInput ? renderInput(searchInput, {}) : undefined,
        } : undefined;
        const limited = typeof props.limit === "number" && props.limit > 0 ? shownRows.slice(0, props.limit) : shownRows;
        return <GridPreview key={component.id} title={shown(props.title, "Liste")} subtitle={query ? `Sorgu · ${query.name}` : "Sorgu seçilmedi"} columns={visible} rows={limited} truncated={!paging && (preview.truncated || limited.length < preview.rows.length)} props={props}
          emptyText={typeof props.emptyText === "string" && props.emptyText ? props.emptyText : "Sorgu kayıt döndürmedi."} showTotals paging={paging} rowActionLabels={rowActionLabelsOf(props)} style={style} advanced detailToggleLabel={detailToggleLabel} />;
      } else {
        const source = sources.find((item) => item.code === props.source);
        const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string") : [];
        const data = previewData[component.id];
        const visibleColumns = columns.map((column) => source?.columns.find((field) => field.code === column) ?? { code: column, label: column, dataType: "text" });
        const hasRowAction = props.rowActionsEnabled === true;
        if (!props.source || !data) return <article key={component.id} className="custom-page-preview-card" style={style}><div className="custom-page-preview-card-head"><b>{shown(props.title, "Liste")}</b><small>{source?.label || "Veri kaynağı seçilmedi"}</small></div>{!props.source ? <p>Önizleme için veri kaynağı seçin.</p> : <p role="status">Örnek kayıtlar yükleniyor…</p>}</article>;
        return <GridPreview key={component.id} title={shown(props.title, "Liste")} subtitle={source?.label || "Veri kaynağı seçilmedi"} columns={visibleColumns} rows={data.rows} truncated={data.totalCount > data.rows.length} props={props} emptyText="Kaynakta gösterilecek kayıt bulunamadı." rowAction={hasRowAction ? String(props.rowActionLabel || "İşlemi başlat") : undefined} style={style} />;
      }
      case "form": return <article key={component.id} className="custom-page-preview-card" style={style}><b>{shown(props.title, "Form")}</b><p>{forms.find((form) => form.code === props.formCode)?.name || "Yayımlanmış form seçin"}</p></article>;
      case "code": return <CodePreviewFrame key={component.id} className="custom-page-code-preview" title={String(props.title || component.name || "Yalıtılmış kod önizlemesi")} hidden={props.hidden === true} style={style} css={String(props.css || "")} javascript={String(props.javascript || "")} host={bridgeHost} />;
      case "alert": { const variant = ["success", "warning", "danger", "info"].includes(String(props.variant)) ? String(props.variant) : "info";
        return <AlertPreview key={component.id} variant={variant} title={shown(props.title, "")} text={shown(props.text, "")} icon={String(props.icon || "")} value={String(props.value || "")} style={style} />; }
      // Etiket metni bağlama içerebilir ({{liste.seciliSatir.status}}): örnek veriyle çözülür, çözülemezse "Durum".
      case "badge": return <BadgePreview key={component.id} text={interpolate(String(props.text || props.label || ""), view) || String(props.label || "Durum")} variant={props.variant} toneMap={props.toneMap} style={style} />;
      case "list": return <article key={component.id} className="custom-page-preview-card" style={style}><b>{shown(props.title, "Liste")}</b><ul>{(Array.isArray(props.items) ? props.items : []).map((item, itemIndex) => <li key={itemIndex}>{String(item)}</li>)}</ul></article>;
      case "progress": { const progress = Math.max(0, Math.min(100, Number(props.value) || 0)); return <article key={component.id} className="custom-page-preview-progress" style={style}><div><b>{shown(props.title, "İlerleme")}</b><span>{progress}%</span></div><progress max={100} value={progress} /></article>; }
      case "formCard": {
        const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
        const members = idList(props.inputs).map((id) => inputById.get(id)).filter((item): item is PageComponent => !!item);
        return <FormCardPreview key={component.id} title={shown(props.title, "")} columns={columns} inline={props.layout === "inline"} style={style}>{members.map((input) => renderInput(input, {}, props.layout === "inline"))}</FormCardPreview>;
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
      case "facetPanel": return <FacetPanelPreview key={component.id} title={shown(props.title, "")} groups={facetGroupsOf(props)} style={style} />;
      case "filterBar": {
        // ERP ile aynı tek satır: arama kutusu, satırdaki süzgeçler (tür sütun biçiminden), fazlası "Daha fazla süzgeç".
        const table = typeof props.table === "string" ? definition.components.find((item) => item.id === props.table && item.type === "dataTable") : undefined;
        const queryId = table && typeof table.props.query === "string" ? table.props.query : "";
        const columns = queryId ? queryPreviews[queryId]?.columns ?? [] : [];
        const formats = parseColumnFormats(table?.props.columnFormats);
        const headings = Object.fromEntries((Array.isArray(table?.props.columnLabels) ? table!.props.columnLabels as string[] : []).flatMap((item) => {
          const text = typeof item === "string" ? item : ""; const at = text.indexOf("=");
          return at > 0 ? [[text.slice(0, at), text.slice(at + 1)]] : [];
        }));
        const labeled = new Set((Array.isArray(table?.props.valueLabels) ? table!.props.valueLabels as string[] : []).map((item) => String(item).split(":")[0]));
        const specs = parseFilterEntries(props.filters);
        const kindOf = (spec: ReturnType<typeof parseFilterEntries>[number]) => {
          if (spec.kind !== "auto") return spec.kind;
          const format = formats[spec.key];
          const dataType = (columns.find((column) => column.code === spec.key)?.dataType ?? "").toLowerCase();
          const kind = spec.options || labeled.has(spec.key) || format === "status" ? "select" : format === "number" || format === "money" ? "range" : format === "date" || format === "datetime" ? "date"
            : dataType === "boolean" || dataType === "bool" ? "toggle" : ["decimal", "int", "integer", "number"].includes(dataType) ? "range" : dataType === "date" || dataType === "datetime" ? "date" : "text";
          return spec.param && (kind === "range" || kind === "date") ? "text" : kind;
        };
        // İlk seçenek varsayılanlı seçim süzgeci tuvalde seçenek sorgusunun ilk örnek satırıyla görünür (yoksa "Tümü").
        const firstSample = (spec: ReturnType<typeof parseFilterEntries>[number]) => {
          if (!spec.defaultFirst || !spec.options) return undefined;
          const optionPreview = queryPreviews[spec.options.query];
          const row = optionPreview?.rows[0];
          if (!row) return undefined;
          const keys = Object.keys(row);
          const text = (value: unknown) => value == null || typeof value === "object" ? "" : String(value);
          const valueColumn = spec.options.valueColumn ?? keys[0];
          const label = text(row[spec.options.labelColumn ?? spec.options.valueColumn ?? keys[1] ?? valueColumn]) || text(row[valueColumn]);
          const description = spec.options.descriptionColumn ? text(row[spec.options.descriptionColumn]).trim() : "";
          return description ? `${label} · ${description}` : label || undefined;
        };
        const fieldOf = (spec: ReturnType<typeof parseFilterEntries>[number]) => ({ key: spec.key, label: spec.label || headings[spec.key] || columns.find((column) => column.code === spec.key)?.label || spec.key, kind: kindOf(spec), sample: firstSample(spec) });
        return <FilterBarPreview key={component.id} style={style} search={props.search === true ? String(props.searchPlaceholder || "") : null}
          row={specs.filter((spec) => spec.place === "row").map(fieldOf)} moreCount={specs.filter((spec) => spec.place === "more").length}
          empty={table ? "Süzgeç alanı: Ayarlar'dan süzgeç seçin" : "Süzgeç alanı: bir tablo seçin"} />;
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
        return <ContextPanelPreview key={component.id} title={shown(props.title, "")} row={row} fields={fields} related={row ? related : undefined} style={style} />;
      }
      case "actionBar": return <ActionBarPreview key={component.id} style={style} bound={{
        new: barBound(props).new,
        open: barBound(props).open, save: (typeof props.saveQuery === "string" && props.saveQuery !== "") || idList(props.saveSequence, MAX_SEQUENCE_STEPS).length > 0, remove: typeof props.deleteQuery === "string" && props.deleteQuery !== "",
        filter: typeof props.focusInput === "string" && props.focusInput !== "", print: props.printEnabled === true, excel: typeof props.exportTable === "string" && props.exportTable !== "",
      }} moreCount={idList(props.moreButtons, 10).length + (barCsvExport(props) ? 1 : 0)} hidden={hiddenForPreview(props)} look={barLookMap(props.barLook)} />;
      case "tabs": return <TabsPreview key={component.id} style={style} tabs={parseTabs(props.tabs).map((tab) => ({ ...tab, label: shown(tab.label, tab.label).trim() || tab.label }))} defaultTab={Number(props.defaultTab ?? 0)}
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
        return <DialogPreview key={component.id} style={style} title={shown(props.title, "")} presentation={props.presentation === "drawer" ? "drawer" : "dialog"} ids={ids}
          saveLabel={hasSave ? String(props.saveLabel || "") : null} onSelect={setSelectedComponentId} onDesign={() => live.current.openFocus(component.id)}
          spanFor={(id) => { const child = byComponentId.get(id); return child ? deviceSpan(spanOf(child), device) : 12; }}
          renderOwned={(id) => {
            const child = byComponentId.get(id);
            if (!child || child.type === "dialog") return null;
            return <>{isConditional(child) && <span className="pd-cond-chip">Koşullu</span>}{renderOne(child)}</>;
          }} />;
      }
      case "editableGrid": {
        const mode = props.gridMode === "stage" || props.gridMode === "matrix" ? props.gridMode : "list";
        const columns = parseGridColumns(props.gridColumns);
        // Seçim hücrelerinin örnek seçenekleri: sütunun sabit seçenekleri, ardından sorgu önizlemesinin "etiket · açıklama" satırları.
        const pickerSamples = Object.fromEntries(columns.filter((column) => column.lookup).map((column) => {
          const lookup = column.lookup!;
          const fixed = columnEntries(props.columnStaticOptions).filter((entry) => entry.code === column.code).map((entry) => entry.rest.slice(entry.rest.indexOf("=") + 1));
          const rows = (queryPreviews[lookup.query]?.rows ?? []).slice(0, 2).map((row) => {
            const label = String(row[lookup.labelColumn] ?? row[lookup.valueColumn] ?? "");
            const description = lookup.descriptionColumn && row[lookup.descriptionColumn] != null ? String(row[lookup.descriptionColumn]) : "";
            return description ? `${label} · ${description}` : label;
          });
          return [column.code, [...fixed, ...rows]];
        }));
        return <EditableGridPreview key={component.id} style={style} title={shown(props.title, "")} mode={mode} columns={columns} pickerSamples={pickerSamples}
          fixedRowLabel={String(props.fixedRowLabel || "")} addLabel={String(props.addLabel || "")} totals={gridTotalCodes(props)} />;
      }
      case "customFieldsBlock": {
        const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
        const preview = typeof props.definitionsQuery === "string" ? queryPreviews[props.definitionsQuery] : undefined;
        return <CustomFieldsPreview key={component.id} style={style} title={shown(props.title, "")} columns={columns} definitions={preview ? preview.rows : null} />;
      }
      case "image": {
        const height = typeof props.height === "number" ? Math.max(40, Math.min(400, props.height)) : 160;
        return <ImagePreview key={component.id} style={style} title={shown(props.title, "")} value={String(props.value || "")} height={height} />;
      }
      case "steps": {
        const labels = (Array.isArray(props.steps) ? props.steps : []).map((item) => String(item));
        // Etkin adım örnek veriyle hesaplanır: koşulu tutan son adım (hiçbiri tutmuyorsa ilk adım).
        return <StepsPreview key={component.id} style={style} labels={labels} active={activeStepIndex(props.activeWhen, (condition) => conditionHolds(condition, view, false))}/>;
      }
      case "recordHeader": {
        const fields = parseHeaderFields(props).map((field) => {
          const raw = interpolate(field.template, view);
          const text = field.format ? formatCell(raw, field.format) : raw.trim() === "" ? "—" : raw;
          const unit = field.unit ? interpolate(field.unit, view).trim() : "";
          return { label: field.label, text: text !== "—" && unit ? `${text} ${unit}` : text };
        });
        const buttons = idList(props.buttons, MAX_HEADER_BUTTONS).map((id) => byComponentId.get(id)).filter((item): item is PageComponent => !!item && item.type === "button").map((item) => renderOne(item));
        return <RecordHeaderPreview key={component.id} style={style} icon={props.icon} title={shown(props.title, "Kayıt özeti")} subtitle={shown(props.subtitle, "")} fields={fields} buttons={buttons}/>;
      }
      default: return <article key={component.id} className="custom-page-preview-card" style={style}><b>{String((component as PageComponent).type)}</b></article>;
    }
  };
  // Sekmedeki ve penceredeki bileşenler yalnız sahibinin içinde, satır işlemi düğmeleri listenin İşlemler sütununda çizilir
  // (kod bileşeni iki kez çalışmasın diye üst düzeyde hiç oluşturulmaz).
  // Kartların içindeki Sekmeler de sahip sayılır: sekmelerdeki bileşenler üst düzeyde ayrıca çizilmez.
  const cardInner = definition.components.flatMap((component) => component.type === "card" || component.type === "section" ? childComponentsOf(component) : []);
  const tabOwned = new Set([...tabOwnedIds(definition.components), ...tabOwnedIds(cardInner as typeof definition.components)]);
  const nested = new Set([...tabOwned, ...dialogOwnedIds(definition.components), ...rowActionIds(definition.components), ...headerButtonIds(definition.components)]);
  // Sayfadaki Sekmeler bileşeninin kabı (TabsCanvas) seçim ve sürükleme durumuna bağlı olduğundan bu önbelleğin dışında
  // çizilir; içindeki bileşenlerin önizlemesi burada bir kez hazırlanır. Pencerenin içindeki Sekmeler durağan önizlemedir.
  const tabChildren = new Map<string, ReactNode>();
  for (const id of tabOwned) {
    const child = byComponentId.get(id);
    if (child && child.type !== "tabs" && child.type !== "dialog") tabChildren.set(id, renderOne(child));
  }
  const list = definition.components.map((component) => nested.has(component.id) || component.type === "tabs" ? null : renderOne(component));
  // Kart tasarım ekranındaki bloklar: kartların çocukları (Sekmeler kap olarak ayrıca çizilir).
  const cardChildNodes = new Map<string, ReactNode>();
  for (const child of cardInner) if (child.type !== "tabs") cardChildNodes.set(child.id, renderOne(child));
  // Pencere / form kartı / yan panel tasarım ekranındaki bloklar: üyelerin önizlemesi (pencerenin Sekmeler'i kap olarak ayrıca
  // çizilir). Form kartının girişi ERP'deki gibi (satır içi düzende kompakt), yan panelin girişi süzgeç grubu olarak çizilir.
  const refNodes = new Map<string, ReactNode>();
  for (const owner of definition.components) {
    if (owner.type === "dialog") for (const id of idList(owner.props.contains, MAX_DIALOG_IDS)) {
      const child = byComponentId.get(id);
      if (child && child.type !== "tabs" && child.type !== "dialog" && !refNodes.has(id)) refNodes.set(id, renderOne(child));
    }
    if (owner.type === "formCard") for (const id of idList(owner.props.inputs)) {
      const input = inputById.get(id);
      if (input && !refNodes.has(id)) refNodes.set(id, renderInput(input, {}, owner.props.layout === "inline"));
    }
    if (owner.type === "facetPanel") for (const group of facetGroupsOf(owner.props)) if (!refNodes.has(group.id)) refNodes.set(group.id, <FacetGroupPreview group={group}/>);
  }
  return { list, tabChildren, cardChildNodes, refNodes };
  }, [definition, forms, sources, previewData, queryPreviews, counts, token, role, device, sampleHintKey]);

  // Canlı yeniden yerleşim: sürüklenen bloğun genişliğinde yer tutucu; bileşen yerinden oynamıyorsa (kendi önü/arkası)
  // gösterilmez, soluk asıl blok yerini belirtir. Sekmedeki bileşen sayfaya taşınırken her zaman gösterilir.
  const placeholderFor = useCallback((dragging: string | null, canvasDrop: number | null) => {
    if (!canEdit || !dragging || canvasDrop === null) return null;
    const components = definition.components;
    const draggingIndex = components.findIndex((component) => component.id === dragging);
    const draggingComponent = draggingIndex >= 0 ? components[draggingIndex] : undefined;
    const draggingInPlace = !!draggingComponent && !tabIds.has(draggingComponent.id) && (canvasDrop === draggingIndex || canvasDrop === draggingIndex + 1);
    if (draggingInPlace) return null;
    const draggingType = draggingComponent?.type ?? (palette.some((item) => item.type === dragging) ? dragging as ComponentType : null);
    const span = draggingComponent ? deviceSpan(spanOf(draggingComponent), device) : draggingType ? deviceSpan(defaultSpan(draggingType), device) : 12;
    return { at: canvasDrop, span };
  }, [canEdit, definition, tabIds, device]);
  // Katmanlardan ya da başka yoldan seçilen sekme bileşeni tuvalde görünsün diye sekmesi açılır.
  useEffect(() => {
    if (!selectedComponentId) return;
    const location = tabLocation(cardTree.flatWithCardTabs(definitionRef.current.components), selectedComponentId);
    if (location) setActiveTabs((value) => value[location.tabsId] === location.tabIndex ? value : { ...value, [location.tabsId]: location.tabIndex });
  }, [selectedComponentId]);
  const activeTabOf = (component: PageComponent) => {
    const tabs = parseTabs(component.props.tabs);
    const picked = activeTabs[component.id];
    return picked !== undefined && picked >= 0 && picked < tabs.length ? picked : clampDefaultTab(Number(component.props.defaultTab ?? 0), tabs.length);
  };
  const writeTabs = (tabsId: string, update: (tabs: TabEntry[]) => TabEntry[] | null) => commit((state) => {
    let changed = false;
    const components = cardTree.mapComponents(state.components, (component) => {
      if (component.id !== tabsId) return component;
      const next = update(parseTabs(component.props.tabs));
      if (!next) return component;
      changed = true;
      return { ...component, props: { ...component.props, tabs: tabsValue(next) } };
    });
    return changed ? { ...state, components } : state;
  });
  // Tuval blokları sürükleme boyunca önbellekte kalır; içlerindeki olay işleyicileri her zaman güncel işlevleri çağırır.
  const liveActions = { moveInTab, detachFromTab, duplicateComponent, removeComponent, startResize, moveComponent, dropIntoTab, writeTabs, clearDrag, cancelCanvasHit, dropAt, dragOverCanvas,
    stepMember, ejectMember, dropInFocus, dragOverFocus, openFocus };
  const live = useRef(liveActions);
  live.current = liveActions;
  const renderTabsContainer = (component: PageComponent) => {
    const tabs = parseTabs(component.props.tabs);
    const byId = new Map(definition.components.map((item) => [item.id, item]));
    const childToolbar = (id: string) => {
      const child = byId.get(id);
      const location = tabLocation(cardTree.flatWithCardTabs(definition.components), id);
      if (!child || !location) return null;
      const count = tabs[location.tabIndex]?.ids.length ?? 0;
      return <>
        {isFocusOwnerType(child.type) && <button type="button" className="pd-block-edit" title="İçini tasarla" onClick={() => live.current.openFocus(id)}>{cardTree.isCardType(child.type) ? "✎ Kartın içini tasarla" : "✎ İçini tasarla"}</button>}
        <button type="button" title="Öne taşı (Alt+↑)" aria-label="Sekmede öne taşı" disabled={location.position === 0} onClick={() => live.current.moveInTab(id, -1)}><ArrowUp size={13}/></button>
        <button type="button" title="Arkaya taşı (Alt+↓)" aria-label="Sekmede arkaya taşı" disabled={location.position >= count - 1} onClick={() => live.current.moveInTab(id, 1)}><ArrowDown size={13}/></button>
        <button type="button" title="Sekmeden çıkar" aria-label="Sekmeden çıkar" onClick={() => live.current.detachFromTab(id)}><ArrowUpFromLine size={13}/></button>
        <button type="button" title="Kopyala (Ctrl+D)" aria-label="Kopyala" onClick={() => live.current.duplicateComponent(id)}><Copy size={13}/></button>
        <button type="button" title="Sil (Delete)" aria-label="Sil" className="danger" onClick={() => live.current.removeComponent(id)}><Trash2 size={13}/></button>
      </>;
    };
    // Yalnız sürüklenen şey değişince (başla/bitir) yeniden çizilir; sekme içi konum TabsCanvas'ın kendi durumudur.
    return <DragSelect store={dragStore} select={(state) => state.dragging}>{(dragging) => {
      const { draggingComponent, draggingType, dragSpan } = dragInfo(dragging);
      return <TabsCanvas tabs={tabs} active={activeTabOf(component)} canEdit={canEdit} resizable={device === "desktop"} selectedId={selectedComponentId}
      draggingId={dragging ? draggingComponent?.id ?? `palette:${dragging}` : null} dropSpan={dragSpan} style={componentStyle(component.type, component.props)}
      acceptsTab={(tabIndex) => !!draggingType && !tabPlacementProblem(cardTree.flatWithCardTabs(definition.components), component.id, tabIndex, {
        // Kartın çocuğu sekmeye alınırken sayfaya çıkar; yeni bileşen gibi denetlenir.
        id: draggingComponent && !cardTree.cardLocation(definition.components, draggingComponent.id) ? draggingComponent.id : undefined, type: draggingType })}
      renderChild={(id) => rendered.tabChildren.get(id) ?? null}
      spanFor={(id) => { const child = byId.get(id); return child ? deviceSpan(spanOf(child), device) : 12; }}
      labelFor={(id) => { const child = byId.get(id); return child ? `${titleFor(child.type)} · ${spanOf(child)}/12` : id; }}
      conditional={(id) => { const child = byId.get(id); return !!child && isConditional(child); }}
      toolbarFor={childToolbar}
      onActivate={(index) => setActiveTabs((value) => value[component.id] === index ? value : { ...value, [component.id]: index })}
      onSelect={setSelectedComponentId}
      onClaimDrag={() => { live.current.cancelCanvasHit(); dragStore.set({ canvasDrop: null }); }}
      onDrop={(tabIndex, position, event) => live.current.dropIntoTab(component.id, tabIndex, position, event)}
      onItemDragStart={(id, event) => {
        if (resizing.current) { event.preventDefault(); return; }
        event.dataTransfer.setData("application/x-nexora-index", String(definitionRef.current.components.findIndex((item) => item.id === id)));
        event.dataTransfer.effectAllowed = "move";
        dragStore.set({ dragging: id });
      }}
      onDragEnd={() => live.current.clearDrag()}
      onRename={(index, label) => live.current.writeTabs(component.id, (current) => renameTab(current, index, cleanTabLabel(label)))}
      canAddTab={tabs.length < MAX_TABS}
      onAddTab={() => {
        live.current.writeTabs(component.id, addTab);
        setActiveTabs((value) => ({ ...value, [component.id]: Math.min(tabs.length, MAX_TABS - 1) }));
      }}
      onResizeStart={(id, event) => { const child = byId.get(id); if (child) live.current.startResize(child, event); }}/>;
    }}</DragSelect>;
  };
  // Tuval blokları: tanım, seçim, cihaz ve önizleme değişince yeniden kurulur; sürükleme durumuna bağlı değildir. Böylece
  // dragover'da yalnız ızgara (yer tutucu) çizilir, 80+ bloğun sarmalayıcısı ve önizlemesi React tarafından atlanır.
  const condOffCount = (() => { const scope = designScope(); return definition.components.filter((component) => !(ownedIds.has(component.id) || tabIds.has(component.id) || nestedIds.has(component.id)) && hiddenInSample(component, scope)).length; })();
  const canvasBlocks = useMemo<CanvasBlock[]>(() => definition.components.map((component, index) => {
    const isSelected = selectedComponentId === component.id;
    const owned = ownedIds.has(component.id) || tabIds.has(component.id) || nestedIds.has(component.id) || (component.type === "button" && movedIds.has(component.id));
    const condOff = !owned && hiddenInSample(component, designScope());
    const element = <div key={component.id} data-flip={component.id} data-page-index={index}
      className={`pd-block ${owned ? "is-owned" : ""} ${component.type === "tabs" ? "is-container" : ""} ${isSelected ? "is-selected" : ""}${condOff ? " is-cond-off" : ""}${condOff && !isSelected && !showCondOff ? " is-cond-hidden" : ""}`}
      style={{ gridColumn: `${component.type === "filterBar" ? "1 / " : ""}span ${deviceSpan(spanOf(component), device)}` }}
      draggable={canEdit}
      onClick={(event) => { event.stopPropagation(); setSelectedComponentId(component.id); }}
      onDoubleClick={isFocusOwnerType(component.type) ? (event) => { event.stopPropagation(); live.current.openFocus(component.id); } : undefined}
      onDragStart={(event) => { if (resizing.current) { event.preventDefault(); return; } event.dataTransfer.setData("application/x-nexora-index", String(index)); event.dataTransfer.effectAllowed = "move"; dragStore.set({ dragging: component.id }); }}
      onDragEnd={() => live.current.clearDrag()}>
      <span className="pd-block-label">{titleFor(component.type)} · {spanOf(component)}/12</span>
      {/* Sahibinin içinde çizilen (gizli) blokta rozetler de çizilmez: aksi hâlde boşlukta üst üste biner. */}
      {!owned && isConditional(component) && <span className="pd-cond-chip" title={String(component.props.visibleWhen)}>Koşullu</span>}
      {!owned && samples.badge(component.type === "dataTable" || component.type === "metric" ? (typeof component.props.query === "string" ? component.props.query : null) : component.type === "input" && typeof component.props.optionsQuery === "string" ? component.props.optionsQuery : null)}
      {isSelected && canEdit && <div className="pd-block-toolbar" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="pd-block-edit" title="Tüm ayarlar" aria-label="Tüm ayarlar" onClick={() => { setRightMode("inspector"); setSettingsId(component.id); }}>✎ Düzenle</button>
        {isFocusOwnerType(component.type) && <button type="button" className="pd-block-edit" title="İçini tasarla (çift tıklama)" onClick={() => live.current.openFocus(component.id)}>{cardTree.isCardType(component.type) ? "✎ Kartın içini tasarla" : "✎ İçini tasarla"}</button>}
        <button type="button" title="Yukarı taşı (Alt+↑)" aria-label="Yukarı taşı" disabled={index === 0} onClick={() => live.current.moveComponent(index, -1)}><ArrowUp size={13}/></button>
        <button type="button" title="Aşağı taşı (Alt+↓)" aria-label="Aşağı taşı" disabled={index === definition.components.length - 1} onClick={() => live.current.moveComponent(index, 1)}><ArrowDown size={13}/></button>
        <button type="button" title="Kopyala (Ctrl+D)" aria-label="Kopyala" disabled={component.type === "actionBar"} onClick={() => live.current.duplicateComponent(component.id)}><Copy size={13}/></button>
        <button type="button" title="Sil (Delete)" aria-label="Sil" className="danger" onClick={() => live.current.removeComponent(component.id)}><Trash2 size={13}/></button>
      </div>}
      <div className="pd-block-render">{component.type === "tabs" && !nestedIds.has(component.id) ? renderTabsContainer(component) : rendered.list[index]}</div>
      {isSelected && canEdit && device === "desktop" && <span className="pd-resize" role="presentation" draggable={false} title="Genişliği sürükleyerek değiştirin" onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => live.current.startResize(component, event)} onClick={(event) => event.stopPropagation()}/>}
    </div>;
    return { id: component.id, element };
  // Olay işleyicileri `live` üzerinden güncel işlevleri çağırır; örnek veri rozeti `sampleHintKey` ile izlenir.
  }), [definition, selectedComponentId, device, canEdit, rendered, ownedIds, tabIds, nestedIds, movedIds, sampleHintKey, activeTabs, dragStore, showCondOff]);
  const canvasLayoutKey = useMemo(() => `${device}|${definition.components.map((component) => component.id).join(",")}`, [device, definition]);
  const canvasGuides = useMemo(() => <div className={`pd-grid-guides${showGrid ? " is-on" : ""}`} aria-hidden="true">{Array.from({ length: device === "desktop" ? 12 : device === "tablet" ? 2 : 1 }, (_, column) => <span key={column}/>)}</div>, [showGrid, device]);
  /** İşlem çubuğunun `titleCount` bağlaması (`{{sorgu.meta.alan}}`): sorgu önizlemesinin değeri, yoksa "N". */
  const titleCountSample = (raw: unknown): string | null => {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const match = /^\{\{\s*([\w-]+)\.meta\.(\w+)\s*\}\}$/.exec(raw.trim());
    const query = match ? definition.queries.find((item) => item.name === match[1]) : undefined;
    const value = query ? queryPreviews[query.id]?.meta?.[match![2]] : undefined;
    return value == null ? "N" : Number.isFinite(Number(value)) ? Number(value).toLocaleString("tr-TR") : String(value);
  };
  const canvasEmpty = <div className="pd-canvas-empty"><LayoutTemplate size={26}/><b>Sayfanız henüz boş</b><span>Soldan bir bileşen sürükleyin, tıklayarak ekleyin ya da bir şablonla başlayın.</span>{canEdit && <button type="button" className="pd-button" onClick={(event) => { event.stopPropagation(); setNewPageDialog("template"); }}><LayoutTemplate size={14}/>Şablonla başla</button>}</div>;
  const canvasHandlers = useMemo(() => ({
    onDragOver: (event: DragEvent<HTMLElement>) => live.current.dragOverCanvas(event),
    onDragLeave: (event: DragEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) { live.current.cancelCanvasHit(); dragStore.set({ canvasDrop: null }); } },
    onDrop: (event: DragEvent<HTMLDivElement>) => live.current.dropAt(dragStore.get().canvasDrop ?? definitionRef.current.components.length, event, true),
  }), [dragStore]);

  // İç tasarım ekranının blokları (kartın `children` dizisi; pencerenin, form kartının, yan panelin kimlik dizisindeki üst düzey
  // bileşenler): sayfa tuvaliyle aynı sürükle-bırak deposu ve FLIP. Pencerenin içindeki kart / form kartı da kendi ekranında açılır.
  const focusBlocks = useMemo<CanvasBlock[]>(() => !focusOwner ? [] : focusMembers.map((child, index, all) => {
    const isSelected = selectedComponentId === child.id;
    const isCard = cardTree.isCardType(focusOwner.type);
    const resizable = isCard || focusOwner.type === "dialog";
    const nestedFocus = !isCard && isFocusOwnerType(child.type);
    const element = <div key={child.id} data-flip={child.id} data-card-index={index}
      className={`pd-block ${child.type === "tabs" ? "is-container" : ""} ${isSelected ? "is-selected" : ""}${hiddenInSample(child, designScope()) ? " is-cond-off" : ""}`}
      style={{ gridColumn: `span ${memberSpan(focusOwner, child)}` }}
      draggable={canEdit}
      onClick={(event) => { event.stopPropagation(); setSelectedComponentId(child.id); }}
      onDoubleClick={nestedFocus ? (event) => { event.stopPropagation(); live.current.openFocus(child.id); } : undefined}
      onDragStart={(event) => { if (resizing.current) { event.preventDefault(); return; } event.stopPropagation(); event.dataTransfer.setData(CARD_CHILD_MIME, child.id); event.dataTransfer.effectAllowed = "move"; dragStore.set({ dragging: child.id }); }}
      onDragEnd={() => live.current.clearDrag()}>
      <span className="pd-block-label">{titleFor(child.type)}{resizable ? ` · ${spanOf(child)}/12` : ""}</span>
      {isConditional(child) && <span className="pd-cond-chip" title={String(child.props.visibleWhen)}>Koşullu</span>}
      {isSelected && canEdit && <div className="pd-block-toolbar" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="pd-block-edit" title="Tüm ayarlar" aria-label="Tüm ayarlar" onClick={() => { setRightMode("inspector"); setSettingsId(child.id); }}>✎ Düzenle</button>
        {nestedFocus && <button type="button" className="pd-block-edit" title="İçini tasarla (çift tıklama)" onClick={() => live.current.openFocus(child.id)}>✎ İçini tasarla</button>}
        <button type="button" title="Öne taşı (Alt+↑)" aria-label="Öne taşı" disabled={index === 0} onClick={() => live.current.stepMember(child.id, -1)}><ArrowUp size={13}/></button>
        <button type="button" title="Arkaya taşı (Alt+↓)" aria-label="Arkaya taşı" disabled={index === all.length - 1} onClick={() => live.current.stepMember(child.id, 1)}><ArrowDown size={13}/></button>
        <button type="button" title={ejectText(focusOwner.type)} aria-label={ejectText(focusOwner.type)} onClick={() => live.current.ejectMember(child.id)}><ArrowUpFromLine size={13}/></button>
        <button type="button" title="Kopyala (Ctrl+D)" aria-label="Kopyala" onClick={() => live.current.duplicateComponent(child.id)}><Copy size={13}/></button>
        <button type="button" title="Sil (Delete)" aria-label="Sil" className="danger" onClick={() => live.current.removeComponent(child.id)}><Trash2 size={13}/></button>
      </div>}
      <div className="pd-block-render">{child.type === "tabs" ? renderTabsContainer(child) : isCard ? rendered.cardChildNodes.get(child.id) : rendered.refNodes.get(child.id)}</div>
      {isSelected && canEdit && resizable && device === "desktop" && <span className="pd-resize" role="presentation" draggable={false} title="Genişliği sürükleyerek değiştirin" onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onPointerDown={(event) => live.current.startResize(child, event)} onClick={(event) => event.stopPropagation()}/>}
    </div>;
    return { id: child.id, element };
  }), [focusOwner, focusMembers, definition, selectedComponentId, device, canEdit, rendered, activeTabs, dragStore]);
  const cardLayoutKey = useMemo(() => `${device}|focus|${focusOwner?.id ?? ""}|${focusMembers.map((child) => child.id).join(",")}`, [device, focusOwner, focusMembers]);
  const cardPlaceholderFor = useCallback((dragging: string | null, canvasDrop: number | null) => {
    if (!canEdit || !dragging || canvasDrop === null || !focusOwner) return null;
    const own = focusMembers.findIndex((child) => child.id === dragging);
    if (own >= 0 && (canvasDrop === own || canvasDrop === own + 1)) return null;
    if (!focusAccepts(focusOwner, definition.components, dragging)) return null;
    const moving = own >= 0 ? focusMembers[own] : cardTree.findComponent(definition.components, dragging) ?? undefined;
    return { at: canvasDrop, span: memberSpan(focusOwner, moving, moving ? undefined : dragging as ComponentType) };
  }, [canEdit, focusOwner, focusMembers, definition, device]);
  const cardHandlers = useMemo(() => ({
    onDragOver: (event: DragEvent<HTMLElement>) => live.current.dragOverFocus(event),
    onDragLeave: (event: DragEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom) { live.current.cancelCanvasHit(); dragStore.set({ canvasDrop: null }); } },
    onDrop: (event: DragEvent<HTMLDivElement>) => live.current.dropInFocus(dragStore.get().canvasDrop ?? Number.MAX_SAFE_INTEGER, event),
  }), [dragStore]);
  const focusEmptyText = !focusOwner ? "" : focusOwner.type === "dialog" ? "Pencerenin içi boş" : focusOwner.type === "formCard" ? "Form kartında giriş yok" : focusOwner.type === "facetPanel" ? "Yan panelde giriş yok" : "Kartın içi boş";
  const focusEmptyHint = !focusOwner ? "" : focusOwner.type === "dialog" ? "Soldan bir bileşen sürükleyin ya da tıklayarak ekleyin; kaydetmek için pencerede en az bir bileşen olmalıdır."
    : focusOwner.type === "formCard" ? "Soldan bir giriş kutusu sürükleyin ya da tıklayarak ekleyin; kaydetmek için en az bir giriş gerekir."
      : focusOwner.type === "facetPanel" ? "Soldan bir giriş kutusu sürükleyin: seçenek sorgulu seçim girişi olarak eklenir."
        : "Soldan karta eklenebilen bir bileşeni buraya sürükleyin ya da tıklayarak ekleyin.";
  const cardEmpty = <div className="pd-canvas-empty"><SquareStack size={24}/><b>{focusEmptyText}</b><span>{focusEmptyHint}</span></div>;

  // Katmanlar: üst düzey bileşenler (sırası kök sırasıdır), arkalarından kartların çocukları; kart açılır bir daldır
  // (kart › çocuklar › sekmeler › üyeler). Kartın içindeki bir bileşene tıklamak kart tasarım ekranını açar.
  const layerOf = (component: PageComponent) => ({ id: component.id, name: component.name, label: summaryOf(component), typeLabel: titleFor(component.type), span: spanOf(component), icon: iconFor(component.type),
    children: component.type === "tabs" ? parseTabs(component.props.tabs).map((tab) => ({ label: tab.label, ids: tab.ids }))
      : component.type === "dialog" ? [{ label: component.props.presentation === "drawer" ? "çekmece" : "pencere", ids: idList(component.props.contains, MAX_DIALOG_IDS) }]
        : component.type === "formCard" || component.type === "facetPanel" ? [{ ids: refTree.refIds(component) }]
        : cardTree.isCardType(component.type) ? [{ ids: childComponentsOf(component).map((child) => child.id) }] : [] });
  const layerItems = [...definition.components.map(layerOf),
    ...definition.components.flatMap((component) => cardTree.isCardType(component.type) ? childComponentsOf(component).map(layerOf) : [])];
  const selectFromLayers = (id: string) => {
    const components = definitionRef.current.components;
    const tabsAt = tabLocation(cardTree.flatWithCardTabs(components), id);
    // İçinde çizildiği en içteki sahip: kart, pencere, form kartı ya da yan panel (sekme üyesinde sekmenin sahibi).
    const ownerOf = (target: string) => cardTree.cardLocation(components, target)?.cardId ?? refTree.refLocation(components, target)?.ownerId;
    const ownerId = ownerOf(id) ?? (tabsAt ? ownerOf(tabsAt.tabsId) : undefined);
    if (ownerId) setFocusId(ownerId); else if (id !== focusId) setFocusId(null);
    setSelectedComponentId(id);
  };
  const status = current?.isPublished ? { label: "Yayında", tone: "published" } : current ? { label: "Taslak", tone: "draft" } : { label: "Yeni", tone: "new" };
  const settingsOpen = !!selected && settingsId === selected.id;
  const toggleSection = (key: string) => setCollapsed((value) => ({ ...value, [key]: !value[key] }));
  const section = (key: string, title: string, body: ReactNode) => selected && selected.type !== "dataTable" ? <SettingsPane key={key} tab={tabOfSection(key)}>{sectionBlock(key, title, body)}</SettingsPane> : sectionBlock(key, title, body);
  const sectionBlock = (key: string, title: string, body: ReactNode) => <section className="pd-inspector-section" key={key}>
    <button type="button" className="pd-inspector-section-toggle" aria-expanded={!collapsed[key]} onClick={() => toggleSection(key)}>{collapsed[key] ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}<span>{title}</span></button>
    <div className="pd-inspector-section-body">{body}</div>
  </section>;
  // Izgara ayar penceresi sekmelidir: her parça kendi sekmesinde çizilir; diğer bileşenlerde ve panelde etkisizdir.
  // Izgarada sekme verilen anahtardır; diğer bileşenlerde "data" (Ad alanı) ilk sekmeye düşer, bölümler sekmesini
  // `section` içinde kendisi seçer (dış sarmalama gerekmez).
  const pane = (tab: string, node: ReactNode) => selected?.type === "dataTable" ? <SettingsPane tab={tab === "name" ? "data" : tab}>{node}</SettingsPane>
    : tab === "name" ? <SettingsPane tab={firstTab}>{node}</SettingsPane> : tab === "main" ? <SettingsPane tab="main">{node}</SettingsPane> : node;
  const hasContentTab = !!selected && (contentFields[selected.type].length > 0 || Object.keys(selected.props).some((key) => !managedKeys.has(key)));
  const componentTabs = selected ? selected.type === "dataTable" ? GRID_SETTINGS_TABS : settingsTabsFor(selected.type, hasContentTab) : [];
  const firstTab = componentTabs[0]?.key ?? "content";

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
    bindingSuggestions.push({ path: `${query.name}.rows`, detail: "Sorgu satırları", group: "Sorgular" }, { path: `${query.name}.rowCount`, detail: "Satır sayısı", group: "Sorgular" },
      { path: `${query.name}.satirSayisi`, detail: "Satır sayısı (sayfalı işlemde toplam kayıt)", group: "Sorgular" });
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
        { path: `${grid}.degisti`, detail: "Tabloda kaydedilmemiş değişiklik var mı", group: "Düzenlenebilir tablolar" },
        { path: `${grid}.satirSayisi`, detail: "Tablodaki satır sayısı", group: "Düzenlenebilir tablolar" },
        ...gridTotalCodes(component.props).map((code) => ({ path: `${grid}.toplam.${code}`, detail: `${code} sütununun toplamı`, group: "Düzenlenebilir tablolar" })));
      const gridColumns = parseGridColumns(component.props.gridColumns);
      if (gridColumns.some((column) => column.inputType === "lookup")) {
        bindingSuggestions.push({ path: `${grid}.arama`, detail: "Odaktaki seçim hücresine yazılan metin (seçenek sorgusunun arama parametresine)", group: "Düzenlenebilir tablolar" });
        for (const column of gridColumns) if (columnPath.test(column.code))
          bindingSuggestions.push({ path: `${grid}.satir.${column.code}`, detail: "Satırın hücresi (seçim sütununun seçenek sorgusunda; her satır kendi seçeneklerini alır)", group: "Düzenlenebilir tablolar" });
      }
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
    { path: "kullanici.rol", detail: "Oturumdaki kullanıcının rolü", group: "Oturum" }, { path: "bugun", detail: "Bugünün tarihi (YYYY-AA-GG)", group: "Oturum" },
    { path: "tarih.ayBasi", detail: "Bu ayın ilk günü (YYYY-AA-GG)", group: "Oturum" }, { path: "tarih.yilBasi", detail: "Bu yılın ilk günü (YYYY-AA-GG)", group: "Oturum" },
    { path: "tarih.ucAyOnce", detail: "Son 3 ayın başı: iki ay önceki ayın ilk günü (YYYY-AA-GG)", group: "Oturum" });
  // {{sayfa.parametre.x}}: bu sayfa "Sayfa aç" eylemiyle açılınca verilen parametreler; tanımda geçen adlar önerilir.
  // Listelerin "Sayfa parametresiyle aç" adları da bu sayfanın parametreleridir.
  const openParams = definition.components.flatMap((component) => component.type === "dataTable" && typeof component.props.openParam === "string" && OPEN_PARAM_NAME.test(component.props.openParam) ? [component.props.openParam] : []);
  for (const name of new Set([...[...JSON.stringify(definition.components).matchAll(/sayfa\.parametre\.([a-z][a-zA-Z0-9]{0,31})/g)].map((match) => match[1]), ...openParams]))
    bindingSuggestions.push({ path: `sayfa.parametre.${name}`, detail: "Sayfa aç eyleminin verdiği parametre", group: "Sayfa" });
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
  suggestionsRef.current = bindingSuggestions;
  const readQueries = definition.queries.filter((query) => !isWriteKind(query.kind));
  const buttonAction = selected?.type === "button" && ["query", "sequence", "openDialog", "setInput", ...NAVIGATION_ACTION_TYPES].includes(String(selected.props.actionType)) ? String(selected.props.actionType) : "workflow";
  const writeQueries = definition.queries.filter((query) => isWriteKind(query.kind));
  const pageDialogs = definition.components.filter((component) => component.type === "dialog");
  const actionQuery = selected && typeof selected.props.queryId === "string" ? definition.queries.find((query) => query.id === selected.props.queryId) : undefined;
  const refreshIds = selected && Array.isArray(selected.props.refreshQueries) ? selected.props.refreshQueries.filter((id): id is string => typeof id === "string" && readQueries.some((query) => query.id === id)) : [];
  const refreshOptions = readQueries.filter((query) => !refreshIds.includes(query.id));
  const selectedQueryRef = selected && typeof selected.props.query === "string" ? selected.props.query : null;
  // Sorgu alanlarının bağlama yamaları: mevcut select'lerin sıfırlamalarıyla aynı ("Yeni sorgu / Düzenle" ve Basit kip kullanır).
  const bindDataQuery: QueryBinder = (query, columns) => {
    if (!selected) return {};
    if (selected.props.query === query.id) return {};
    const table = selected.type === "dataTable";
    return { query: query.id, value: undefined, totals: undefined, columnFormats: undefined, toneMap: undefined, ...pagingReset, ...(table ? { columns: columns.length > 0 ? proposeColumns(columns) : [] } : {}) };
  };
  const bindButtonQuery: QueryBinder = (query) => ({ queryId: query.id, ...(query.kind === "update" || query.kind === "delete" ? { confirmEnabled: true } : {}) });
  const bindSequenceStep: QueryBinder = (query) => {
    const steps = selected ? idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS) : [];
    return steps.includes(query.id) || steps.length >= MAX_SEQUENCE_STEPS ? {} : { saveSequence: [...steps, query.id], saveQuery: undefined };
  };
  // Göstergenin "Değer" modu: sorgu ve rapor kaynağı yok, değer metni (sabit sayı ya da {{değişken}}) var.
  const metricValueMode = !!selected && selected.type === "metric" && !selectedQueryRef && !selected.props.source && typeof selected.props.value === "string";
  const filterInputId = selected && typeof selected.props.filterInput === "string" ? selected.props.filterInput : "";
  const namedInputs = definition.components.filter((component) => component.type === "input" && !!component.name).map((component) => ({ id: component.id, name: component.name as string }));
  const toneMapEntries = selected && Array.isArray(selected.props.toneMap) ? selected.props.toneMap.filter((item): item is string => typeof item === "string") : [];
  const columnFormatEntries = selected && Array.isArray(selected.props.columnFormats) ? selected.props.columnFormats.filter((item): item is string => typeof item === "string") : [];
  const totalsSelected = selected && Array.isArray(selected.props.totals) ? selected.props.totals.filter((item): item is string => typeof item === "string") : [];
  const selectedQueryColumns = selectedQueryRef ? queryPreviews[selectedQueryRef]?.columns ?? [] : [];

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
  // Listenin "Detay paneli" düğmesine bağlı onay kutusu da listeye aittir.
  if (selected) for (const component of definition.components) {
    if (component.id === selected.id || component.type !== "dataTable" || typeof component.props.detailToggleInput !== "string") continue;
    layoutOwners[component.props.detailToggleInput] = `${summaryOf(component)} · Detay paneli`;
  }
  const layoutInputIds = selected ? idList(selected.props.inputs) : [];
  // İşlem Çubuğu müfettişi: bağlanabilir düğmeler, sorgulu ızgaralar ve seçili listeler.
  const pageButtons: PickerInput[] = definition.components.filter((component) => component.type === "button").map((component) => ({
    id: component.id, name: component.name, label: String(component.props.text || component.props.label || component.name || "Düğme"), inputType: "button", hasOptions: false,
  }));
  const queryTables = definition.components.filter((component) => component.type === "dataTable" && typeof component.props.query === "string" && component.props.query !== "");
  const barNewInputs = selected?.type === "actionBar" ? idList(selected.props.newInputs) : [];
  const barMoreButtons = selected?.type === "actionBar" ? idList(selected.props.moreButtons, 10) : [];
  // Satır işlemi düğmeleri listeye aittir; İşlem Çubuğu menüsüne alınamaz (soluk gösterilir).
  const rowActionOwners: Record<string, string> = {};
  if (selected?.type === "actionBar") for (const component of definition.components) {
    if (component.type !== "dataTable") continue;
    for (const id of idList(component.props.rowActions, MAX_ROW_ACTIONS)) rowActionOwners[id] = `${summaryOf(component)} · satır işlemi`;
    if (typeof component.props.rowOpenAction === "string" && component.props.rowOpenAction) rowActionOwners[component.props.rowOpenAction] = `${summaryOf(component)} · satır açma`;
  }
  if (selected?.type === "actionBar") for (const component of definition.components) {
    if (component.type !== "recordHeader") continue;
    for (const id of idList(component.props.buttons, MAX_HEADER_BUTTONS)) rowActionOwners[id] = `${summaryOf(component)} · özet düğmesi`;
  }
  // İşlem Çubuğunun kaydetme yolu: dizi doluysa "Kaydet dizisi"; boş dizi seçimi bileşen kimliğiyle birlikte hatırlanır.
  const barSaveMode: "query" | "sequence" = selected?.type !== "actionBar" ? "query"
    : idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS).length > 0 ? "sequence"
      : typeof selected.props.saveQuery === "string" && selected.props.saveQuery !== "" ? "query"
        : barSaveChoice?.id === selected.id ? barSaveChoice.mode : "query";
  const eligibleTables = definition.components.filter((component) => component.type === "dataTable" && !!component.name && typeof component.props.query === "string" && component.props.query !== "");
  // İşlem Çubuğu Yeni / Aç / kaydettikten sonra grupları: Basit ve Gelişmiş kipte aynı alanlar. Eski düğme bağını kaldıran seçim,
  // başka yerde kullanılmayan düğmeyi de aynı geri alma adımında siler.
  // Komutlar sekmesindeki satır özetleri: komutun ne yaptığı tek satırda.
  const barSummaries = (props: Record<string, PropValue>): Record<string, string> => {
    const queryName = (id: unknown) => definition.queries.find((query) => query.id === id)?.name;
    const modes = barBound(props);
    const pageOf = (code: unknown) => typeof code === "string" && code ? (pages.find((page) => page.code === code)?.name ?? code) : "";
    const plan = (action: unknown, page: unknown, fallback: boolean) => action === "page" ? `Sayfa aç → ${pageOf(page) || "seçilmedi"}`
      : action === "dialog" ? "Pencere aç" : action === "clear" ? "Formu temizle" : action === "off" ? "Kapalı" : fallback ? "Bağlı" : "Bağlı değil";
    const sequence = idList(props.saveSequence, MAX_SEQUENCE_STEPS).length;
    const filterInput = pageInputs.find((input) => input.id === props.focusInput);
    const exportTable = queryTables.find((table) => table.id === props.exportTable);
    const more = idList(props.moreButtons, 10).length;
    return {
      new: plan(props.newAction, props.newPageCode, modes.new), open: plan(props.openAction, props.openPageCode, modes.open),
      save: sequence > 0 ? `Kaydet dizisi · ${sequence} adım` : queryName(props.saveQuery) ? `Sorgu: ${queryName(props.saveQuery)}` : "Bağlı değil",
      delete: queryName(props.deleteQuery) ? `Sorgu: ${queryName(props.deleteQuery)}` : "Bağlı değil",
      refresh: "Sayfa sorgularını yeniler",
      filter: filterInput ? `Odak: ${filterInput.label}` : typeof props.focusInput === "string" && props.focusInput ? "Süzgeç alanı araması" : "Bağlı değil",
      print: props.printEnabled === true ? "Açık" : "Kapalı",
      export: exportTable ? `Liste: ${exportTable.name || exportTable.id}` : "Bağlı değil",
      more: more > 0 ? `${more} düğme` : "Boş",
      saveNew: props.saveAndNew === true ? "İşlemler menüsünde" : "Kapalı",
      afterSave: props.afterSaveAction === "page" ? `Sayfa aç → ${pageOf(props.afterSavePageCode) || "seçilmedi"}` : "Kapalı",
    };
  };
  const barCommandFields = selected?.type === "actionBar" ? <BarCommandFields props={selected.props} screens={erpScreens}
    pages={pages.filter((page) => !page.screenKey && page.code !== current?.code).map((page) => ({ code: page.code, name: page.name }))}
    tables={eligibleTables.map((table) => ({ id: table.id, name: table.name!,
      columns: (queryPreviews[String(table.props.query)]?.columns ?? []).filter((column) => /^[A-Za-z0-9_.]+$/.test(column.code)) }))}
    dialogs={pageDialogs.map((dialog) => ({ id: dialog.id, label: `${summaryOf(dialog)}${dialog.name ? ` (${dialog.name})` : ""}` }))}
    buttonLabel={(id) => pageButtons.find((button) => button.id === id)?.label ?? id}
    newInputsField={<>
      <InputPicker inputs={pageInputs} value={barNewInputs} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { newInputs: next.length > 0 ? next : undefined })}/>
      {pageInputs.length === 0 && <small>Önce sayfaya bir giriş kutusu ekleyin.</small>}
    </>}
    suggestions={bindingSuggestions} disabled={!canEdit}
    onPatch={(patch) => commit((state) => patchBarCommands(state, selected.id, patch))}
    canMigrate={migrateBarButtons(definition).moved.length > 0}
    onMigrate={() => commit((state) => migrateBarButtons(state).definition)}/> : null;
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
        <QueryFieldActions kinds={READ_KINDS} target="Arama kutusu" value={optionsQueryId} componentId={input.id} disabled={!canEdit} bind={(query) => ({ optionsQuery: query.id, optionLabelColumn: undefined, optionValueColumn: undefined, optionDescriptionColumn: undefined })}/>
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
      {defaultFirstField(input)}
    </>;
  };
  // Açılır liste ve arama kutusunun seçenek koşulu (`optionsWhen`): her seçenek satırı `satir` olarak değerlendirilir.
  const renderOptionsWhenField = (input: PageComponent) => {
    const optionsQueryId = typeof input.props.optionsQuery === "string" ? input.props.optionsQuery : "";
    const paths = [...(optionsQueryId ? queryColumns(optionsQueryId) : []).filter((column) => identifier.test(column.code))
      .map((column) => ({ path: `satir.${column.code}`, label: `satir.${column.code} · Seçenek satırı`, group: "Seçenek satırı" })),
    ...bindingSuggestions.map((item) => ({ path: item.path, label: `${item.path}${item.detail ? ` · ${item.detail}` : ""}`, group: item.group }))];
    return <div className="pd-field">Seçenek koşulu<small>Her seçenek satırı için değerlendirilir; <code>satir.&lt;sütun&gt;</code> seçenek satırıdır (ör. <code>satir.isActive == true &amp;&amp; satir.id != kaynakDepo.value</code>). Yanlışsa seçenek gizlenir; seçili değer yine görünür.</small>
      <ConditionBuilder key={`${input.id}-optionsWhen`} prop="optionsWhen" value={typeof input.props.optionsWhen === "string" && input.props.optionsWhen !== "" ? input.props.optionsWhen : undefined}
        paths={paths} pageNames={[...pageNamesOf(definition), "satir"]} disabled={!canEdit} onChange={(next) => patchComponent(input.id, { optionsWhen: next })}/>
    </div>;
  };
  // Bağımlı temizleme (`clearsOnChange`): kullanıcı değeri değiştirince temizlenecek girişler ve tablo sütunları (her satırda).
  const renderClearsOnChangeField = (input: PageComponent) => {
    const current = Array.isArray(input.props.clearsOnChange) ? input.props.clearsOnChange.filter((item): item is string => typeof item === "string") : [];
    const targets = [
      ...allComponents.filter((component) => component.type === "input" && component.id !== input.id)
        .map((component) => ({ value: component.id, label: `${String(component.props.label || component.name || component.id)}${component.props.hidden === true ? " (gizli)" : ""}` })),
      ...allComponents.filter((component) => component.type === "editableGrid" && !!component.name).flatMap((grid) => parseGridColumns(grid.props.gridColumns)
        .map((column) => ({ value: `${grid.name}.${column.code}`, label: `${String(grid.props.title || grid.name)} › ${column.label} (her satırda)` }))),
    ];
    const labelOf = (value: string) => targets.find((target) => target.value === value)?.label ?? value;
    const free = targets.filter((target) => !current.includes(target.value));
    const write = (next: string[]) => patchComponent(input.id, { clearsOnChange: next.length > 0 ? next : undefined });
    return <div className="pd-field">Değişince temizle<small>Kullanıcı bu girişin değerini değiştirince seçilen girişler ve tablo sütunları (her satırda) boşaltılır (ör. depo değişince satırların konumları).</small>
      {current.length > 0 && <ul className="pd-action-chips">{current.map((value) => <li key={value}><span>{labelOf(value)}</span>
        <button type="button" aria-label={`${labelOf(value)} temizlemesini kaldır`} disabled={!canEdit} onClick={() => write(current.filter((item) => item !== value))}><X size={11}/></button></li>)}</ul>}
      <select value="" aria-label="Temizlenecek alan ekle" disabled={!canEdit || free.length === 0 || current.length >= MAX_CLEARS_ON_CHANGE}
        onChange={(event) => { if (event.target.value) write([...current, event.target.value]); }}>
        <option value="">{targets.length === 0 ? "Temizlenecek alan yok" : free.length === 0 ? "Tümü eklendi" : "Temizlenecek alan ekle"}</option>
        {free.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
      </select>
    </div>;
  };
  // Açılır liste ve arama kutusunun ilk seçenek varsayılanı: varsayılan değer (sayfa parametresi bağlaması dahil) boşken.
  const defaultFirstField = (input: PageComponent) => <>
    <label className="pd-check"><input type="checkbox" checked={input.props.defaultFirst === true} onChange={(event) => patchComponent(input.id, { defaultFirst: event.target.checked ? true : undefined })}/>İlk seçenekle başlar</label>
    <small>Varsayılan değer boşsa seçenekler yüklenince ilk seçenek seçilir (ör. ilk aktif depo; sırayı ve süzmeyi sorgu belirler). Kullanıcının seçimi ezilmez.</small>
  </>;
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
      <div className="pd-field">Zorunlu<div className="pd-segment" role="group" aria-label="Zorunlu">
        {([["no", "Hayır"], ["yes", "Evet"], ["when", "Koşula göre"]] as const).map(([value, label]) => {
          const current = props.required === true ? "yes" : typeof props.requiredWhen === "string" && props.requiredWhen !== "" || requiredWhenDraft === input.id ? "when" : "no";
          return <button type="button" key={value} aria-pressed={current === value} className={current === value ? "active" : ""} onClick={() => {
            setRequiredWhenDraft(value === "when" ? input.id : null);
            patchComponent(input.id, value === "yes" ? { required: true, requiredWhen: undefined } : value === "no" ? { required: undefined, requiredWhen: undefined } : { required: undefined });
          }}>{label}</button>;
        })}</div>
        {(typeof props.requiredWhen === "string" && props.requiredWhen !== "" || requiredWhenDraft === input.id) && props.required !== true
          && <ConditionBuilder key={`${input.id}-requiredWhen`} prop="requiredWhen" value={typeof props.requiredWhen === "string" ? props.requiredWhen : undefined}
            paths={bindingSuggestions.map((item) => ({ path: item.path, label: `${item.path}${item.detail ? ` · ${item.detail}` : ""}`, group: item.group }))}
            pageNames={pageNamesOf(definition)} disabled={!canEdit} onChange={(next) => setOptionalProp(input.id, "requiredWhen", next)}/>}
      </div>
      {(inputType === "number" || inputType === "date") && <div className="pd-field-row">{bound("min", "En az")}{bound("max", "En fazla")}</div>}
      {rangeProblem && <small className="pd-query-warning">{rangeProblem}</small>}
      {inputType === "number" && <label className="pd-field">Adım<small>Ör. 0.01 kuruş, 1 tam sayı.</small><input type="number" min={0} value={typeof step === "number" ? step : ""} onChange={(event) => setOptionalProp(input.id, "step", numberOf(event.target.value))}/>
        {stepProblem && <small className="pd-query-warning">{stepProblem}</small>}</label>}
      {inputType === "text" && <>
        <label className="pd-field">En fazla karakter<input type="number" min={1} max={4000} value={typeof maxLength === "number" ? maxLength : ""} onChange={(event) => setOptionalProp(input.id, "maxLength", numberOf(event.target.value))}/>
          {lengthProblem && <small className="pd-query-warning">{lengthProblem}</small>}</label>
        <div className="pd-field">Biçim<div className="pd-segment" role="group" aria-label="Biçim">
          {([["free", "Serbest"], ["code", "Kod (A-Z, 0-9, -)"], ["custom", "Özel desen"]] as const).map(([value, label]) => {
            const current = pattern === "" && customPatternDraft !== input.id ? "free" : pattern === CODE_PATTERN ? "code" : "custom";
            return <button type="button" key={value} aria-pressed={current === value} className={current === value ? "active" : ""} onClick={() => {
              setCustomPatternDraft(value === "custom" ? input.id : null);
              if (value === "free") patchComponent(input.id, { pattern: undefined, patternMessage: undefined });
              else if (value === "code") updateComponent(input.id, "pattern", CODE_PATTERN);
            }}>{label}</button>;
          })}</div></div>
        {(customPatternDraft === input.id || pattern !== "" && pattern !== CODE_PATTERN) && <label className="pd-field">Özel desen (düzenli ifade)<small>Değerin tamamı eşleşmelidir, ör. [A-Z]{"{3}"}-\d+</small>
          <input className="pd-condition-input" value={pattern} maxLength={200} spellCheck={false} onChange={(event) => {
            const next = event.target.value;
            if (next === "") patchComponent(input.id, { pattern: undefined, patternMessage: undefined }); else updateComponent(input.id, "pattern", next);
          }}/>
          {pattern && patternProblem(pattern) && <small className="pd-query-warning">{patternProblem(pattern)}</small>}</label>}
        {pattern && <label className="pd-field">Hata metni<small>Boşsa “Değer beklenen biçimde değil.” gösterilir.</small>
          <input value={typeof props.patternMessage === "string" ? props.patternMessage : ""} maxLength={120} onChange={(event) => setOptionalProp(input.id, "patternMessage", sanitizeSafeValue(event.target.value, false) || undefined)}/></label>}
        <label className="pd-check"><input type="checkbox" checked={props.upperCase === true} onChange={(event) => patchComponent(input.id, { upperCase: event.target.checked ? true : undefined })}/>Büyük harfe çevir</label>
      </>}
    </div>;
  };
  // Sekmeler müfettişi: sekmeye alınabilecek bileşenler (sunucudaki sekme kuralı) ve başka Sekmeler bileşenlerinin sahiplikleri.
  // Seçili bileşen bir sekmedeyse müfettişte konumu ("Sekmeler › Özet") ve "Sekmeden çıkar" gösterilir.
  const selectedTabLocation = selected ? tabLocation(cardTree.flatWithCardTabs(definition.components), selected.id) : null;
  const selectedTabOwner = selectedTabLocation ? cardTree.findComponent(definition.components, selectedTabLocation.tabsId) ?? undefined : undefined;
  // Seçili bileşen bir kartın içindeyse müfettişte kartı ve "Karttan çıkar" gösterilir.
  const selectedCardLocation = selected ? cardTree.cardLocation(definition.components, selected.id) : null;
  const selectedCard = selectedCardLocation ? definition.components.find((component) => component.id === selectedCardLocation.cardId) : undefined;
  // Seçili bileşen bir pencerenin, form kartının ya da yan panelin üyesiyse müfettişte sahibi ve "…çıkar" gösterilir.
  const selectedRefLocation = selected && !selectedCardLocation ? refTree.refLocation(definition.components, selected.id) : null;
  // Açık iç ekranın üyesi: müfettişteki "Yukarı" sahibin içinde taşır.
  const selectedInFocusOwner = !!selectedRefLocation && selectedRefLocation.ownerId === focusOwner?.id;
  const selectedRefOwner = selectedRefLocation ? definition.components.find((component) => component.id === selectedRefLocation.ownerId) : undefined;
  const selectedTabLabel = selectedTabOwner && selectedTabLocation ? parseTabs(selectedTabOwner.props.tabs)[selectedTabLocation.tabIndex]?.label ?? "" : "";
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
      components: cardTree.mapComponents(state.components, (component) => component.id !== selected.id ? component
        : { ...component, props: on ? { ...component.props, paging: "server", pageParam: "page", pageSizeParam: "pageSize", pageSize: DEFAULT_PAGE_SIZE } : stripPagingProps(component.props) }),
    }));
  };
  // Görünüm bölümünün iç/dış boşluk, köşe ve renk alanları (ızgarada "Gelişmiş" altında kapalı durur).
  const boxFields = selected ? <>
    <div className="pd-field-row">
      <label className="pd-field">İç boşluk<input type="number" min="0" max="64" value={Number(selected.props.padding ?? defaultPadding(selected.type))} onChange={(event) => updateComponent(selected.id, "padding", event.target.value)}/></label>
      <label className="pd-field">Dış boşluk<input type="number" min="0" max="64" value={Number(selected.props.margin ?? 0)} onChange={(event) => updateComponent(selected.id, "margin", event.target.value)}/></label>
      <label className="pd-field">Köşe<input type="number" min="0" max="32" value={Number(selected.props.borderRadius ?? DEFAULT_RADIUS)} onChange={(event) => updateComponent(selected.id, "borderRadius", event.target.value)}/></label>
    </div>
    {([["backgroundColor", "Arka plan", "#ffffff"], ["textColor", "Metin rengi", "#172554"]] as const).map(([key, label, fallback]) => <div className="pd-field" key={key}>{label}<div className="pd-color"><input type="color" aria-label={label} value={String(selected.props[key] ?? fallback)} onChange={(event) => updateComponent(selected.id, key, event.target.value)}/><span>{typeof selected.props[key] === "string" ? String(selected.props[key]) : "Tema rengi"}</span>{typeof selected.props[key] === "string" && <button type="button" className="pd-button small" onClick={() => clearProp(selected.id, key)}>Sıfırla</button>}</div></div>)}
  </> : null;
  // Izgara sütunları (görünür, sıra, başlık, biçim, birim, toplam, değer etiketleri) yalnız ayar penceresinin Sütunlar sekmesinde düzenlenir.
  const columnsShortcut = selected?.type === "dataTable" ? <div className="pd-field">Sütunlar<small>{selectedColumns.length > 0 ? `${selectedColumns.length} sütun seçili` : "Tüm sütunlar (sorgu sırası)"}. Başlık, biçim, birim, toplam ve değer etiketleri sütun başına düzenlenir.</small>
    {settingsOpen ? <button type="button" className="pd-button small" onClick={() => setSettingsTab("columns")}>Sütunlar sekmesine git</button>
      : <button type="button" className="pd-button small" disabled={!canEdit} onClick={() => { setSettingsTab("columns"); setSettingsId(selected.id); }}>Sütunları düzenle…</button>}
  </div> : null;
  // Arama girişi adayları: metin türündeki girişler; form kartı / yan filtre paneli / sekme / başka listeye ait olanlar soluk.
  const searchOwners: Record<string, string> = { ...layoutOwners };
  if (pagingOn) for (const component of definition.components) {
    if (component.type !== "tabs") continue;
    for (const tab of parseTabs(component.props.tabs)) for (const id of tab.ids) searchOwners[id] ??= `${summaryOf(component)} · ${tab.label}`;
  }
  // Penceredeki giriş de arama girişi olamaz (pencere sahipliği önce gelir).
  if (pagingOn) for (const component of definition.components) {
    if (component.type !== "dialog") continue;
    for (const id of idList(component.props.contains, MAX_DIALOG_IDS)) searchOwners[id] ??= `${summaryOf(component)} · pencere`;
  }
  // "Detay paneli düğmesi" adayları: onay kutusu girişleri; form kartı / yan filtre paneli / sekme / pencere / başka listeye ait
  // olanlar seçilemez (sahibiyle gösterilir).
  const toggleOwners: Record<string, string> = { ...layoutOwners };
  for (const component of definition.components) {
    if (component.type === "tabs") for (const tab of parseTabs(component.props.tabs)) for (const id of tab.ids) toggleOwners[id] ??= `${summaryOf(component)} · ${tab.label}`;
    if (component.type === "dialog") for (const id of idList(component.props.contains, MAX_DIALOG_IDS)) toggleOwners[id] ??= `${summaryOf(component)} · pencere`;
  }
  const detailToggleCandidates = pageInputs.filter((input) => input.inputType === "checkbox")
    .map((input) => ({ id: input.id, label: input.label, takenBy: toggleOwners[input.id] }));
  const pageSizeValue = selected && typeof selected.props.pageSize === "number" ? selected.props.pageSize : DEFAULT_PAGE_SIZE;
  const pageSizeProblem = !Number.isInteger(pageSizeValue) || pageSizeValue < MIN_PAGE_SIZE || pageSizeValue > MAX_PAGE_SIZE ? `Sayfa boyutu ${MIN_PAGE_SIZE} ile ${MAX_PAGE_SIZE} arasında bir tam sayı olmalıdır.` : null;
  const metaColumns = (pagedOp?.result.metaPaths ?? []).filter((key) => identifier.test(key) && key.length <= 64).map((key) => ({ code: key, label: key }));
  const footerMetaEntries = selected && Array.isArray(selected.props.footerMeta) ? selected.props.footerMeta.filter((item): item is string => typeof item === "string") : [];

  return <QueryEditorProvider value={queryEditor.api}><main className={`pd-shell${fullscreen ? " pd-fullscreen" : ""}`}>
    <header className="pd-topbar">
      {onBack && <button type="button" className="pd-icon-button" onClick={goBack} title="Sayfa listesine dön" aria-label="Sayfa listesine dön"><ArrowLeft size={17}/></button>}
      <div className="pd-title">
        <div><h2>{name || "Adsız sayfa"}</h2><span className={`pd-status ${status.tone}`}>{status.label}{current ? ` · v${current.revision}` : ""}</span></div>
        <small>{systemScreenKey ? `Sistem sayfası · @${systemScreenKey}` : code ? `/${code}` : "Kod henüz belirlenmedi"}{dirty ? <em className="pd-dirty"> · Kaydedilmemiş değişiklikler</em> : current ? <span className="pd-clean"> · Tüm değişiklikler kaydedildi</span> : null}</small>
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
        {systemMode && current && systemAdmin && capabilities?.canUpdate && <button type="button" className="pd-button" onClick={() => void resetToStandard()} disabled={saving}><RotateCcw size={15}/>Standarda dön</button>}
        {publishedFirmDesignId && capabilities?.canDelete && systemAdmin && <button type="button" className="pd-button danger" onClick={() => void removeFirmDesign()} disabled={saving} title="Yayımlı firma tasarımını kaldırır; ekran Nexora'nın standart ekranına döner."><Trash2 size={15}/>Firma tasarımını kaldır</button>}
        {current?.isPublished && capabilities?.canCreate && !queryPageLocked && systemAdmin && <button type="button" className="pd-button primary" onClick={() => void createFromPublished(current)} disabled={saving}><FilePlus2 size={15}/>Yeni taslakta düzenle</button>}
      </div>
    </header>
    {(error || notice || (current && !canEdit) || (systemMode && (importNotesOpen || systemInfo?.stage === "preview"))) && <div className="pd-messages">
      {current && !canEdit && <div className="pd-message readonly"><Lock size={14}/><span>{systemLocked ? SYSTEM_PAGE_ADMIN_ONLY : current.isPublished && !queryPageLocked ? "Yayımlanmış sürüm salt okunur. Değişiklik yapmak için yeni bir taslak oluşturun." : queryPageLocked ? QUERY_PAGE_ADMIN_ONLY : "Bu taslağı düzenleme yetkiniz yok; yalnızca görüntüleyebilirsiniz."}</span></div>}
      {systemMode && systemInfo?.stage === "preview" && <div className="pd-message warning"><Info size={14}/><span>{SYSTEM_PAGE_PREVIEW_STAGE}</span></div>}
      {systemMode && importNotesOpen && importNotes && importNotes.length > 0 && <div className="pd-message info" role="status"><Info size={14}/><span><b>Eski ekrandan aktarım notları</b><ul>{importNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></span><button type="button" aria-label="Kapat" onClick={() => setImportNotesOpen(false)}><X size={14}/></button></div>}
      {error && <div className="pd-message error" role="alert"><span>{error}</span><button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={14}/></button></div>}
      {notice && !error && <div className="pd-message success" role="status"><span>{notice}{previewHref && notice === blockedPreviewNotice && <> <a href={previewHref} target="_blank" rel="noopener noreferrer" onClick={() => { setPreviewHref(null); setNotice(""); }}>ERP önizlemesini aç</a></>}</span><button type="button" aria-label="Kapat" onClick={() => { setNotice(""); setPreviewHref(null); }}><X size={14}/></button></div>}
    </div>}
    {systemMode && current && <SystemPageNewItems items={pendingNewItems} disabled={!canEdit} busy={saving} onAdd={addNewItem} onIgnoreAll={() => void ignoreAllNewItems()}/>}

    <div className={`pd-workspace${docks.workspaceClass}`}>
      <DockPanel side="left" pinned={docks.pinned.left} onTogglePin={() => docks.toggle("left")} rail={[{ label: "Bileşenler", icon: Shapes }, { label: "Katmanlar", icon: Layers }, { label: "Sorgular", icon: Database }]}>
      {/* Katmanlar'daki bırakma hedefi yalnız sol paneli yeniden çizer (tuvalde sürüklerken hiç değişmez). */}
      <DragSelect store={dragStore} select={(state) => state.dropTarget}>{(dropTarget) => <LeftPanel canEdit={canEdit} paletteGroups={paletteGroups}
        variables={<VariablesPanel embedded suggestions={bindingSuggestions} disabled={!canEdit}/>} variableCount={bindingSuggestions.length}
        palette={palette.filter((item) => !focusOwner || (focusCard ? cardTree.canBeCardChild(item.type) : refTree.canOwnType(focusOwner.type as refTree.RefOwnerType, item.type))).map((item) => { const taken = item.type === "actionBar" && !!actionBarOf(definition.components); return { type: item.type, label: item.label, group: item.group, icon: item.icon, disabled: taken, title: taken ? "Sayfada zaten bir İşlem Çubuğu var" : undefined }; })}
        onPaletteDragStart={(type, event) => { event.dataTransfer.setData("application/x-nexora-component", type); event.dataTransfer.effectAllowed = "copy"; dragStore.set({ dragging: type }); }}
        onPaletteDragEnd={() => live.current.clearDrag()}
        onPaletteAdd={(type) => {
          const item = palette.find((entry) => entry.type === type);
          if (!item) return;
          if (!focusOwner) { addComponent(item, insertIndex()); return; }
          // İç tasarım ekranında: seçili üyenin arkasına, yoksa sahibin sonuna.
          const at = selectedComponentId ? focusMembers.findIndex((member) => member.id === selectedComponentId) : -1;
          const position = at >= 0 ? at + 1 : Number.MAX_SAFE_INTEGER;
          if (focusCard) addComponent(item, undefined, undefined, { cardId: focusCard.id, at: position });
          else addComponent(item, undefined, undefined, undefined, { ownerId: focusOwner.id, at: position });
        }}
        layers={layerItems}
        selectedComponentId={selectedComponentId} onSelectComponent={selectFromLayers} dropTarget={dropTarget}
        onLayerDragStart={(index, id, event) => { event.dataTransfer.setData("application/x-nexora-index", String(index)); event.dataTransfer.effectAllowed = "move"; dragStore.set({ dragging: id }); }}
        onLayerDragEnd={() => live.current.clearDrag()}
        onLayerDragOver={(index, edge) => { const target = dragStore.get().dropTarget; if (target?.index !== index || target.edge !== edge) dragStore.set({ dropTarget: { index, edge } }); }}
        onLayerDrop={(index, event) => dropAt(index, event)} onLayerMove={moveComponent} componentCount={definition.components.length}
        queries={definition.queries.map((query) => ({ id: query.id, name: query.name, kindLabel: queryKindLabels[query.kind], write: isWriteKind(query.kind), detail: `${isOperationQuery(query) ? "ERP işlemi" : "SQL"}${queryPreviews[query.id] ? ` · ${queryPreviews[query.id].rowCount.toLocaleString("tr-TR")} satır` : ""}` }))}
        selectedQueryId={selectedQueryId} canAddQuery={queryEditable && definition.queries.length < MAX_QUERIES}
        addQueryTitle={!isAdmin ? "Sorguları yalnız tenant yöneticisi ekleyebilir." : definition.queries.length >= MAX_QUERIES ? `Bir sayfada en fazla ${MAX_QUERIES} sorgu olabilir.` : "Yeni sorgu"}
        onAddQuery={() => { addQuery(); setQueryEditorOpen(true); }} onOpenQuery={(id) => { setSelectedQueryId(id); setQueryEditorOpen(true); }}/>}</DragSelect>
      </DockPanel>

      <section className="pd-center" aria-label="Sayfa tuvali">
        <div className="pd-canvas-toolbar">
          <div className="pd-button-group" role="group" aria-label="Cihaz genişliği">
            {([["desktop", Monitor, "Masaüstü"], ["tablet", Tablet, "Tablet"], ["mobile", Smartphone, "Mobil"]] as const).map(([value, Icon, label]) => <button type="button" key={value} className={`pd-icon-button ${device === value ? "active" : ""}`} aria-pressed={device === value} title={label} aria-label={label} onClick={() => setDevice(value)}><Icon size={15}/></button>)}
          </div>
          <button type="button" className={`pd-button ${showGrid ? "active" : ""}`} aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={14}/>Izgara</button>
          {erpCanvas && <div className="pd-button-group" role="group" aria-label="Tuval kipi">
            <button type="button" className={`pd-button ${!canvasInteractive ? "active" : ""}`} aria-pressed={!canvasInteractive} title="Tıklanan bileşen seçilir" onClick={() => setCanvasInteractive(false)}>Seç</button>
            <button type="button" className={`pd-button ${canvasInteractive ? "active" : ""}`} aria-pressed={canvasInteractive} title="Sayfa ERP'deki gibi kullanılır" onClick={() => setCanvasInteractive(true)}>Dene</button>
          </div>}
          <span className="pd-canvas-meta">{focusOwner ? `${focusMembers.length} ${focusOwner.type === "formCard" || focusOwner.type === "facetPanel" ? "giriş" : "bileşen"} · ${focusKindText(focusOwner.type)} · ` : `${definition.components.length} bileşen · `}{erpCanvas ? "ERP önizlemesi · otomatik yerleşim" : device === "desktop" ? "12 kolon" : device === "tablet" ? "Tablet: bloklar yarım genişlik" : "Mobil: bloklar alt alta"}</span>
          {!focusOwner && !erpCanvas && condOffCount > 0 && <button type="button" className={`pd-cond-toggle${showCondOff ? " is-on" : ""}`} aria-pressed={showCondOff} title="Örnek veride koşulu tutmayan bileşenler ERP'deki gibi yer kaplamaz" onClick={() => setShowCondOff((value) => !value)}>{condOffCount} koşullu gizli · {showCondOff ? "gizle" : "göster"}</button>}
        </div>
        <div className="pd-canvas-scroll" onClick={() => setSelectedComponentId(null)}>
          {erpCanvas ? current ? <div className="pd-erp-canvas-host" onClick={(event) => event.stopPropagation()}
            onDragOver={canvasHandlers.onDragOver} onDragLeave={canvasHandlers.onDragLeave} onDrop={canvasHandlers.onDrop}>
            {canvasError && <div className="pd-erp-canvas-hint" role="status">ERP sayfası yüklenemedi; sonraki kayıtta yeniden denenir. Neden: {canvasError}</div>}
            {canvasHint && <div className="pd-erp-canvas-hint" role="status">{canvasHint}</div>}
            <ErpCanvasFrame platformOrigin={platformOrigin!} token={token} tenant={tenant!} target={{ previewId: current.id, systemScreenKey }}
              revision={current.revision} device={device} topLevelIds={definition.components.map((component) => component.id)}
              selectedId={selectedComponentId} interactive={canvasInteractive} onSelect={setSelectedComponentId}
              onBlocks={(blocks) => { erpBlocks.current = blocks; }}
              onUnavailable={(reason) => { setCanvasFallback(true); setNotice(reason); }}
              onError={(message) => setCanvasError(message ?? "")}/>
          </div>
            : <>{canvasHint && <div className="pd-erp-canvas-hint" role="status">{canvasHint}</div>}<div className="pd-canvas-empty" onDragOver={canvasHandlers.onDragOver} onDragLeave={canvasHandlers.onDragLeave} onDrop={canvasHandlers.onDrop}><LayoutTemplate size={26}/><span>Önizleme için sağdan sayfa adı ve kodunu girin.</span></div></>
          : <div className={`pd-frame device-${device}`}>
            <div className="pd-frame-top"><b>Nexora ERP</b><span>{name || "Yeni sayfa"}</span></div>
            <div className="pd-frame-breadcrumb"><span>Ana sayfa</span><span>›</span><b>{name || "Yeni sayfa"}</b></div>
            {(() => {
              // ERP'deki gibi işlem çubuklu sayfada başlık satırı ayrı durur: sayfa adı ve `titleCount` varsa "N kayıt".
              const bar = definition.components.find((item) => item.type === "actionBar");
              if (!bar) return null;
              const count = titleCountSample(bar.props.titleCount);
              return <div className="pd-page-title"><h1>{name || "Yeni sayfa"}</h1>{count != null && <span className="pd-page-title-count">{count} kayıt</span>}</div>;
            })()}
            {focusOwner ? <div className="pd-card-focus">
              <div className="pd-card-focus-crumb">
                <button type="button" className="pd-link-button" onClick={(event) => { event.stopPropagation(); setFocusId(null); }} title="Sayfaya dön (Esc)">{name || "Yeni sayfa"}</button>
                {focusParent && <><span aria-hidden="true">›</span><button type="button" className="pd-link-button" onClick={(event) => { event.stopPropagation(); openFocus(focusParent.id); }} title="Pencereye dön (Esc)">{cardLabelOf(focusParent)}</button></>}
                <span aria-hidden="true">›</span><b>{cardLabelOf(focusOwner)}</b>
                <button type="button" className="pd-card-focus-back" onClick={(event) => { event.stopPropagation(); setFocusId(null); }} title="Sayfaya dön"><ArrowLeft size={13}/>Sayfaya dön</button>
              </div>
              {/* Sayfanın geri kalanı soluk ve etkileşimsiz arka plandır. */}
              <div className="pd-card-focus-ghost" aria-hidden="true" inert>
                <div className="pd-grid">{definition.components.map((component, index) => component.id === focusOwner.id || component.id === focusParent?.id || !rendered.list[index] || (component.type === "button" && movedIds.has(component.id)) ? null
                  : <div key={component.id} className="pd-card-focus-ghost-block" style={{ gridColumn: `span ${deviceSpan(spanOf(component), device)}` }}>{rendered.list[index]}</div>)}</div>
              </div>
              <p className="pd-card-focus-hint">{focusOwner.type === "dialog" ? "Sayfanın geri kalanı düzenlenmez. Pencerenin içindekiler sayfanın bileşenleridir; sırası ve genişliği burada, başlığı, kaydetme sorgusu ve düğmeleri Özellikler'de düzenlenir."
                : focusOwner.type === "formCard" ? "Sayfanın geri kalanı düzenlenmez. Girişler form kartının sütunlarına sırayla yerleşir; sütun sayısı ve düzen Özellikler'de seçilir."
                  : focusOwner.type === "facetPanel" ? "Sayfanın geri kalanı düzenlenmez. Yan panelde her seçim girişi bir süzgeç grubudur; sırası burada düzenlenir."
                    : "Sayfanın geri kalanı düzenlenmez. Kartın sayfadaki yeri, genişliği ve koşulları sayfa tuvalinde düzenlenir."}</p>
              {(() => {
                const ownerSelected = selectedComponentId === focusOwner.id;
                const selectOwner = (event: ReactMouseEvent) => { event.stopPropagation(); setSelectedComponentId(focusOwner.id); };
                const grid = (className?: string, guides: ReactNode = canvasGuides) => <CanvasGrid store={dragStore} gridRef={cardGridRef} blocks={focusBlocks} layoutKey={cardLayoutKey} guides={guides} empty={cardEmpty}
                  placeholderFor={cardPlaceholderFor} onDragOver={cardHandlers.onDragOver} onDragLeave={cardHandlers.onDragLeave} onDrop={cardHandlers.onDrop} className={className}/>;
                const props = focusOwner.props;
                if (focusOwner.type === "dialog") {
                  // ERP'deki pencere / çekmece çerçevesi: başlık çubuğu, 12 sütunlu gövde, Vazgeç / Kaydet altbilgisi.
                  const hasSave = (typeof props.saveQuery === "string" && props.saveQuery !== "") || idList(props.saveSequence, MAX_SEQUENCE_STEPS).length > 0;
                  const rawTitle = String(props.title || "");
                  const title = rawTitle.includes("{{") ? interpolate(rawTitle, designScope()) || rawTitle : rawTitle;
                  const drawer = props.presentation === "drawer";
                  return <div className={`pd-focus-dialog${drawer ? " is-drawer" : ""}${ownerSelected ? " is-selected" : ""}`} onClick={selectOwner}>
                    <span className="pd-card-focus-chip">{drawer ? "Çekmece" : "Pencere"} · {focusMembers.length}/{MAX_DIALOG_IDS}</span>
                    <header className="pd-focus-dialog-head"><b>{title || "Başlıksız"}</b><span className="pd-focus-dialog-x" aria-hidden="true">✕</span></header>
                    {grid()}
                    <footer className="pd-focus-dialog-foot">
                      <span className="pd-focus-dialog-button is-secondary">{hasSave ? "Vazgeç" : "Kapat"}</span>
                      {hasSave && <span className="pd-focus-dialog-button">{String(props.saveLabel || "") || "Kaydet"}</span>}
                    </footer>
                  </div>;
                }
                if (focusOwner.type === "formCard") {
                  const inline = props.layout === "inline";
                  const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
                  return <section className={`pd-focus-form${inline ? " is-inline" : ""}${ownerSelected ? " is-selected" : ""}`} onClick={selectOwner}>
                    <span className="pd-card-focus-chip">Form kartı · {inline ? "tek satır" : `${columns} sütun`} · {focusMembers.length}/12</span>
                    {!inline && props.title && <h3 className="pd-focus-form-title">{String(props.title)}</h3>}
                    {grid(`pd-focus-form-grid${inline ? " is-inline" : ""}`, null)}
                  </section>;
                }
                if (focusOwner.type === "facetPanel") {
                  return <aside className={`pd-focus-facet pd-facet${ownerSelected ? " is-selected" : ""}`} onClick={selectOwner}>
                    <span className="pd-card-focus-chip">Yan filtre paneli · {focusMembers.length}/12</span>
                    <div className="pd-facet-head"><h3>{String(props.title || "")}</h3><span className="pd-facet-clear">Temizle</span></div>
                    {grid("pd-focus-facet-grid", null)}
                  </aside>;
                }
                return <div className={`pd-card-focus-card${ownerSelected ? " is-selected" : ""}`} onClick={selectOwner}>
                  <span className="pd-card-focus-chip">{cardLabelOf(focusOwner)} · {spanOf(focusOwner)}/12</span>
                  {(props.title || props.description) && <div className="pd-card-focus-head">
                    {props.title && <b>{String(props.title)}</b>}{props.description && <small>{String(props.description)}</small>}
                  </div>}
                  {grid()}
                </div>;
              })()}
            </div>
            : <CanvasGrid store={dragStore} gridRef={gridRef} blocks={canvasBlocks} layoutKey={canvasLayoutKey} guides={canvasGuides} empty={canvasEmpty}
              placeholderFor={placeholderFor} onDragOver={canvasHandlers.onDragOver} onDragLeave={canvasHandlers.onDragLeave} onDrop={canvasHandlers.onDrop}/>}
          </div>}
        </div>
      </section>

      <DockPanel side="right" pinned={docks.pinned.right} onTogglePin={() => docks.toggle("right")} rail={[{ label: rightMode === "history" ? "Geçmiş" : "Özellikler", icon: rightMode === "history" ? History : Settings2 }]} attentionKey={selectedComponentId}>
      <aside className="pd-right" aria-label={rightMode === "history" ? "Sürüm geçmişi" : "Özellikler"}>
        {rightMode === "history" ? <div className="pd-right-body">
          <div className="pd-right-head"><History size={16}/><div><b>Sürüm geçmişi</b><small>Geri yükleme yayımlanmış sayfada yeni taslak, açık taslakta yeni revizyon oluşturur.</small></div><button type="button" className="pd-icon-button" aria-label="Kapat" onClick={() => setRightMode("inspector")}><X size={15}/></button></div>
          {history.length === 0 ? <p className="pd-empty-note">Bu sayfa için geçmiş sürüm bulunamadı.</p> : <ol className="pd-history">{history.map((revision) => <li key={revision.id}><div><b>#{revision.revision} · {revision.changeKind}</b><small>{new Date(revision.createdAt).toLocaleString("tr-TR")}</small><small>{revision.name}</small></div>{(current?.isPublished ? capabilities?.canCreate : capabilities?.canUpdate) && systemAdmin && <button type="button" className="pd-button small" onClick={() => void restoreRevision(revision.id)} disabled={saving}>Geri yükle</button>}</li>)}</ol>}
        </div> : selected ? <div className="pd-right-body">
          <div className="pd-right-head pd-right-head-tools"><SelectedIcon size={16}/>
            <div className="pd-right-title">
              {editingNameId === selected.id
                ? <input className="pd-binding-name" autoFocus value={selected.name ?? ""} maxLength={64} spellCheck={false} aria-label="Bileşen adı" placeholder="Ad (bağlamada kullanılır)"
                    onChange={(event) => setComponentName(selected.id, event.target.value.trim())} onBlur={() => setEditingNameId(null)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditingNameId(null); }}/>
                : <span className="pd-right-name"><b>{selected.name || summaryOf(selected)}</b>
                  {canEdit && <button type="button" className="pd-icon-button" aria-label="Adı düzenle" title={`Ad: bağlamada kullanılır${requiredNameBase(selected.type) ? " (zorunlu)" : ""}`} onClick={() => setEditingNameId(selected.id)}><SquarePen size={12}/></button>}</span>}
              <small>{titleFor(selected.type)} · {spanOf(selected)}/12</small>
              {selected.name && nameProblem(selected.name, takenNames({ componentId: selected.id })) && <small className="pd-query-warning">{nameProblem(selected.name, takenNames({ componentId: selected.id }))}</small>}
            </div>
            {canEdit && <span className="pd-right-actions">
              <button type="button" className="pd-icon-button" aria-label="Yukarı taşı" title="Yukarı" disabled={selectedCardLocation ? selectedCardLocation.index <= 0 : selectedInFocusOwner ? selectedRefLocation!.index <= 0 : selectedIndex <= 0}
                onClick={() => selectedCardLocation ? stepInCard(selected.id, -1) : selectedInFocusOwner ? stepInOwner(selected.id, -1) : moveComponent(selectedIndex, -1)}><ArrowUp size={14}/></button>
              <button type="button" className="pd-icon-button" aria-label="Aşağı taşı" title="Aşağı" disabled={!selectedCardLocation && !selectedInFocusOwner && selectedIndex >= definition.components.length - 1}
                onClick={() => selectedCardLocation ? stepInCard(selected.id, 1) : selectedInFocusOwner ? stepInOwner(selected.id, 1) : moveComponent(selectedIndex, 1)}><ArrowDown size={14}/></button>
              <button type="button" className="pd-icon-button" aria-label="Kopyala" title={selected.type === "actionBar" ? "Sayfada yalnız bir İşlem Çubuğu olabilir" : "Kopyala (Ctrl+D)"} disabled={selected.type === "actionBar"} onClick={() => duplicateComponent(selected.id)}><Copy size={14}/></button>
              <button type="button" className="pd-icon-button danger" aria-label="Sil" title="Sil" onClick={() => removeComponent(selected.id)}><Trash2 size={14}/></button>
            </span>}
            <button type="button" className="pd-icon-button" aria-label="Seçimi kaldır" title="Sayfa ayarlarına dön (Esc)" onClick={() => setSelectedComponentId(null)}><X size={15}/></button></div>
          {selectedTabLocation && selectedTabOwner && <div className="pd-tab-location">
            <small>Konum: <button type="button" className="pd-link-button" onClick={() => setSelectedComponentId(selectedTabOwner.id)} title="Sekmeler bileşenini seç">{summaryOf(selectedTabOwner)}</button> › {selectedTabLabel}</small>
            {canEdit && <button type="button" className="pd-button small" onClick={() => detachFromTab(selected.id)} title="Bileşen sayfaya, kendi yerine geri alınır"><ArrowUpFromLine size={13}/>Sekmeden çıkar</button>}
            {canEdit && <small className="pd-tab-list-hint">"Sekmeden çıkar" ile bileşen sayfaya geri alınır.</small>}
          </div>}
          {selectedCardLocation && selectedCard && <div className="pd-tab-location pd-card-location">
            <small>Konum: <button type="button" className="pd-link-button" onClick={() => setSelectedComponentId(selectedCard.id)} title="Kartı seç">{cardLabelOf(selectedCard)}</button></small>
            {canEdit && <button type="button" className="pd-button small" onClick={() => ejectFromCard(selected.id)} title="Bileşen sayfaya, kartın arkasına taşınır"><ArrowUpFromLine size={13}/>Karttan çıkar</button>}
            {canEdit && <small className="pd-tab-list-hint">"Karttan çıkar" ile bileşen sayfaya, kartın arkasına taşınır.</small>}
          </div>}
          {selectedRefLocation && selectedRefOwner && <div className="pd-tab-location pd-card-location">
            <small>Konum: <button type="button" className="pd-link-button" onClick={() => openFocus(selectedRefOwner.id)} title="İçini tasarla">{cardLabelOf(selectedRefOwner)}</button></small>
            {canEdit && <button type="button" className="pd-button small" onClick={() => ejectFromOwner(selected.id)} title="Bileşen sayfada kendi yerinde kalır"><ArrowUpFromLine size={13}/>{ejectText(selectedRefOwner.type)}</button>}
            {canEdit && <small className="pd-tab-list-hint">"{ejectText(selectedRefOwner.type)}" ile bileşen sayfada kendi yerinde görünür.</small>}
          </div>}
          <BindingSampleContext.Provider value={(template) => sampleText(template, designScope())}>
          <SettingsHost open={settingsOpen} title={`${titleFor(selected.type)} · ${selected.name || summaryOf(selected)} — Ayarlar`} onClose={() => setSettingsId(null)}
            tabs={componentTabs} tab={settingsTab} onTab={setSettingsTab} onOpen={() => setSettingsId(selected.id)}
            panelExtra={selected.type === "dataTable" ? <SettingsPane tab="columns"><button type="button" className="pd-button small" onClick={() => { setSettingsTab("columns"); setSettingsId(selected.id); }}>Sütunları pencerede düzenle</button></SettingsPane> : null}
            extra={selected.type === "dataTable" ? <SettingsPane tab="columns"><section className="pd-inspector-section pd-settings-wide" data-settings-section="Sütunlar"><div className="pd-inspector-section-body">
              {selectedQueryRef || selectedSource ? <ColumnsEditor available={selectedQueryRef ? queryColumns(selectedQueryRef) : selectedSource?.columns ?? []} selected={selectedColumns} formats={columnFormatEntries} totals={totalsSelected}
                totalsAllowed={!!selectedQueryRef} labels={stringEntries(selected.props.columnLabels)} units={stringEntries(selected.props.columnUnits)} valueLabels={stringEntries(selected.props.valueLabels)} toneMap={toneMapEntries}
                disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>
                : <p className="pd-binding-note">Önce <button type="button" className="pd-link-button" onClick={() => setSettingsTab("data")}>Veri</button> sekmesinde listeyi bir sorguya ya da rapor kaynağına bağlayın.</p>}</div></section></SettingsPane> : null}>
          <fieldset className="pd-fieldset" disabled={!canEdit}>
            {(contentFields[selected.type].length > 0 || Object.keys(selected.props).some((key) => !managedKeys.has(key))) && pane("view", section("content", "İçerik", <>
              {selected.type === "input" && <>
              <label className="pd-field">Giriş türü<select value={String(selected.props.inputType || "text")} onChange={(event) => patchComponent(selected.id, {
                ...(event.target.value === "select" || event.target.value === "lookup" ? { inputType: event.target.value } : { inputType: event.target.value, optionsQuery: undefined, optionLabelColumn: undefined, optionValueColumn: undefined }),
                // Arama kutusuna özgü özellikler başka türde sunucuda reddedilir.
                // Sabit seçenekler açılır listede de geçerlidir; lookup ↔ select geçişinde korunur.
                ...inputTypeReset(event.target.value, selected.props),
                // Doğrulama özellikleri türe bağlıdır (sayı/tarih sınırı, metin uzunluğu…); tür değişince yalnız "Zorunlu" kalır.
                ...(event.target.value !== String(selected.props.inputType || "text") ? validationReset : {}),
              })}>{inputTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </>}
              {contentFields[selected.type].map((field) => {
                const value = selected.props[field.key];
                if (field.kind === "choice") return <div key={field.key} className="pd-field">{field.label}<div className="pd-segment">{(field.options ?? []).map(([option, title]) => <button type="button" key={option} disabled={!canEdit}
                  className={String(value ?? field.options?.[field.options.length - 1]?.[0] ?? "") === option ? "active" : ""} onClick={() => updateComponent(selected.id, field.key, option)}>{title}</button>)}</div></div>;
                if (field.kind === "variant") return <label key={field.key} className="pd-field">{field.label}<div className="pd-segment">{variantOptions.map((option) => <button type="button" key={option.value} className={`tone-${option.value} ${String(value ?? "info") === option.value ? "active" : ""}`} onClick={() => updateComponent(selected.id, field.key, option.value)}>{option.label}</button>)}</div></label>;
                if ((field.kind === "text" || field.kind === "textarea") && bindableKeys.has(field.key)) return <label key={field.key} className="pd-field">{field.label}<BindingInput value={String(value ?? "")} multiline={field.kind === "textarea"} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel={field.label} onChange={(next) => updateComponent(selected.id, field.key, next)}/></label>;
                if (field.kind === "textarea") return <label key={field.key} className="pd-field">{field.label}<textarea rows={3} value={String(value ?? "")} onChange={(event) => updateComponent(selected.id, field.key, event.target.value)}/></label>;
                if (field.kind === "number") return <label key={field.key} className="pd-field">{field.label}<div className="pd-range"><input type="range" min={0} max={100} value={Number(value) || 0} onChange={(event) => updateComponent(selected.id, field.key, Number(event.target.value))}/><input type="number" min={0} max={100} value={Number(value) || 0} onChange={(event) => updateComponent(selected.id, field.key, Math.max(0, Math.min(100, Number(event.target.value))))}/></div></label>;
                return <label key={field.key} className="pd-field">{field.label}<input value={String(value ?? "")} maxLength={field.key === "label" ? 60 : 200} onChange={(event) => updateComponent(selected.id, field.key, event.target.value)}/></label>;
              })}
              {Object.entries(selected.props).filter(([key]) => !managedKeys.has(key)).map(([key, value]) => <label key={key} className="pd-field">{key}<input value={Array.isArray(value) ? value.join(", ") : String(value)} onChange={(event) => updateComponent(selected.id, key, event.target.value)}/></label>)}
              {contentFields[selected.type].some((field) => bindableKeys.has(field.key) && field.kind !== "number" && field.kind !== "variant") && <p className="pd-binding-note">Metinlere <code>{"{{"}</code> yazarak ya da aşağıdaki <b>Kullanılabilir değişkenler</b> listesinden tıklayarak değişken ekleyin. {bindingNote}</p>}
              {selected.type === "badge" && <div className="pd-field">Değere göre ton<ToneMapEditor value={toneMapEntries} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { toneMap: next.length ? next : undefined })}/><small>Metin bu değerlerden biriyse ton otomatik seçilir; eşleşmezse yukarıdaki ton kullanılır.</small></div>}
              {selected.type === "text" && <label className="pd-field">Parçalar<small>Her satıra bir parça yazın; " · " ile birleşir ve bütün değişkenleri boş olan parça (etiketiyle) gösterilmez. Doluysa yukarıdaki metnin yerine geçer.</small><textarea rows={4} value={Array.isArray(selected.props.parts) ? selected.props.parts.join("\n") : ""} onChange={(event) => {
                const parts = event.target.value.split("\n").map((item) => item.trim()).filter(Boolean);
                patchComponent(selected.id, { parts: parts.length > 0 ? parts : undefined });
              }}/></label>}
              {selected.type === "list" && <label className="pd-field">Liste öğeleri<small>Her satıra bir madde yazın.</small><textarea rows={5} value={Array.isArray(selected.props.items) ? selected.props.items.join("\n") : ""} onChange={(event) => updateComponent(selected.id, "items", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}/></label>}
            </>))}
            {selected.type === "input" && section("input", "Giriş", <>
              <label className="pd-check"><input type="checkbox" checked={selected.props.hidden === true} onChange={(event) => patchComponent(selected.id, { hidden: event.target.checked ? true : undefined })}/>Gizli (değer tutar)</label>
              {selected.props.hidden === true && <small>ERP'de çizilmez ve doğrulanmaz; değeri (varsayılan değer ve sayfa parametresi dahil) {"{{ad.value}}"} ile kullanılır. “Alana değer ata” düğmesiyle değiştirilir.</small>}
              <label className="pd-check"><input type="checkbox" checked={selected.props.autoId === true} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { autoId: event.target.checked ? true : undefined })}/>Otomatik istek kimliği</label>
              {selected.props.autoId === true && <small>Değer yeni bir GUID'dir: sayfa açılınca, girişi içeren pencere “Açılınca sıfırla” ile açılınca ve girişi bağlayan kayıt başarılı olunca yenilenir. Kayıt başarısız olursa aynı kalır; yeniden deneme çift kayıt yazmaz. Genellikle gizli girişle birlikte kullanılır.</small>}
              {selected.props.inputType === "select" && <>
                <label className="pd-field">Seçenek sorgusu<select value={String(selected.props.optionsQuery || "")} onChange={(event) => patchComponent(selected.id, { optionsQuery: event.target.value || undefined, optionLabelColumn: undefined, optionValueColumn: undefined, optionDescriptionColumn: undefined })}><option value="">Sorgu seçin</option>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select>{readQueries.length === 0 && <small>Önce Sorgular sekmesinde bir okuma sorgusu ekleyin.</small>}</label>
                <QueryFieldActions kinds={READ_KINDS} target="Açılır liste" value={typeof selected.props.optionsQuery === "string" ? selected.props.optionsQuery : null} componentId={selected.id} disabled={!canEdit} bind={(query) => ({ optionsQuery: query.id, optionLabelColumn: undefined, optionValueColumn: undefined, optionDescriptionColumn: undefined })}/>
                {typeof selected.props.optionsQuery === "string" && (["optionValueColumn", "optionLabelColumn", "optionDescriptionColumn"] as const).map((key) => {
                  const columns = queryPreviews[String(selected.props.optionsQuery)]?.columns ?? [];
                  const chosen = String(selected.props[key] || "");
                  return <label key={key} className="pd-field">{key === "optionValueColumn" ? "Değer sütunu" : key === "optionLabelColumn" ? "Görünen sütun" : "Açıklama sütunu"}
                    {key === "optionDescriptionColumn" && <small>ERP'de “görünen · açıklama” olarak çizilir (ör. D01 · Merkez).</small>}
                    {columns.length > 0
                      ? <select value={chosen} onChange={(event) => patchComponent(selected.id, { [key]: event.target.value || undefined })}><option value="">{key === "optionValueColumn" ? "İlk sütun" : key === "optionLabelColumn" ? "Değer sütunu" : "Açıklama yok"}</option>{columns.map((column) => <option key={column.code} value={column.code}>{column.label || column.code}</option>)}{chosen && !columns.some((column) => column.code === chosen) && <option value={chosen}>{chosen}</option>}</select>
                      : <input value={chosen} maxLength={128} spellCheck={false} placeholder="Sütun adı" onChange={(event) => patchComponent(selected.id, { [key]: event.target.value.trim() || undefined })}/>}
                  </label>;
                })}
                {(() => {
                  const staticOptions = Array.isArray(selected.props.staticOptions) ? selected.props.staticOptions.filter((item): item is string => typeof item === "string") : [];
                  return <label className="pd-field">Sabit seçenekler<small>Her satıra bir “değer=Etiket” yazın (ör. “Lot=Lot”). Sorgu sonuçlarından önce gösterilir (en fazla {MAX_STATIC_OPTIONS}).</small>
                    <StaticOptionsField key={selected.id} value={staticOptions} onChange={(next) => patchComponent(selected.id, { staticOptions: next.length > 0 ? next : undefined })}/>
                    {staticOptions.some((entry) => !STATIC_OPTION.test(entry)) && <small className="pd-query-warning">'staticOptions' öğeleri değer=Etiket biçiminde olmalıdır.</small>}</label>;
                })()}
                <label className="pd-check"><input type="checkbox" checked={selected.props.searchable === true} onChange={(event) => patchComponent(selected.id, { searchable: event.target.checked ? true : undefined })}/>Yazarak aranır</label>
                <small>Açılır liste odakta yazılan metinle süzülür (eski “kod · ad” depo seçicisi gibi).</small>
                {defaultFirstField(selected)}
              </>}
              {selected.props.inputType === "lookup" && renderLookupFields(selected)}
              {(selected.props.inputType === "select" || selected.props.inputType === "lookup") && renderOptionsWhenField(selected)}
              {renderValidationFields(selected)}
              {renderClearsOnChangeField(selected)}
            </>)}
            {(selected.type === "metric" || selected.type === "dataTable") && pane("data", section("data", "Veri", <>
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
                  <small>{selected.type === "metric" ? selected.props.countWhen ? "Gösterge, koşullu sayaçtaki koşulu sağlayan satırları sayar." : "Gösterge, ilk satırın ilk sütununu gösterir." : "Seçim yoksa tüm sütunlar gösterilir."}</small></label>
                <QueryFieldActions kinds={READ_KINDS} target={selected.type === "dataTable" ? "Izgara (liste)" : "Gösterge"} value={selectedQueryRef} componentId={selected.id} disabled={!canEdit} bind={bindDataQuery}/>
                {selected.type === "metric" && <CountWhenField value={selected.props.countWhen} queryName={definition.queries.find((query) => query.id === selectedQueryRef)?.name ?? selectedQueryRef}
                  pageNames={pageNamesOf(definition)} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { countWhen: next })}/>}
                {selected.type === "dataTable" && (selectedQueryColumns.length === 0 ? <p className="pd-binding-note">Sütunları seçmek için sorguyu Sorgular sekmesinde önizleyin.</p> : columnsShortcut)}
              </> : <>
              <label className="pd-field">Rapor kaynağı<select value={String(selected.props.source || "")} onChange={(event) => { const source = sources.find((item) => item.code === event.target.value); updateComponent(selected.id, "source", event.target.value); if (selected.type === "dataTable") patchComponent(selected.id, { columns: (source?.columns ?? []).slice(0, 5).map((column) => column.code), columnFormats: undefined, toneMap: undefined, totals: undefined }); }}><option value="">Veri kaynağı seçin</option>{sources.map((source) => <option key={source.code} value={source.code}>{source.label}</option>)}</select>{sources.length === 0 && <small>Kaynak kataloğu yüklenemedi veya erişilebilir kaynak yok.</small>}</label>
              {selected.type === "dataTable" && selectedSource && columnsShortcut}
              </>}
              {selected.type === "metric" && <>
                <label className="pd-field">Eğilim<select value={typeof selected.props.trendQuery === "string" ? selected.props.trendQuery : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { trendQuery: event.target.value || undefined })}><option value="">Yok</option>{readQueries.map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}</select><small>Sorgunun ilk sayısal sütunu, satır sırasıyla çizilir.</small></label>
                <QueryFieldActions kinds={READ_KINDS} target="Gösterge eğilimi" value={typeof selected.props.trendQuery === "string" ? selected.props.trendQuery : null} componentId={selected.id} disabled={!canEdit} bind={(query) => ({ trendQuery: query.id })}/>
                <label className="pd-field">Tıklayınca süz<select value={filterInputId} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { filterInput: event.target.value || undefined, ...(event.target.value ? {} : { filterValue: undefined }) })}><option value="">Süzme yok</option>{namedInputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}{filterInputId && !namedInputs.some((input) => input.id === filterInputId) && <option value={filterInputId}>{filterInputId}</option>}</select>{namedInputs.length === 0 && <small>Önce sayfaya adlı bir giriş kutusu ekleyin.</small>}</label>
                {filterInputId && <label className="pd-field">Süzme değeri<input value={String(selected.props.filterValue ?? "")} maxLength={200} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { filterValue: sanitizeSafeValue(event.target.value, false) || undefined })} onBlur={(event) => { const trimmed = event.target.value.trim(); if (trimmed !== event.target.value) patchComponent(selected.id, { filterValue: trimmed || undefined }); }}/><small>Karta tıklanınca giriş kutusuna bu değer yazılır.</small></label>}
              </>}
              {selected.type === "dataTable" && selectedQueryRef && <RowActionsFields table={selected} components={definition.components} parts={["limit"]} serverPaged={pagingOn} disabled={!canEdit}
                onPatch={(patch) => patchComponent(selected.id, patch)}/>}
            </>))}
            {selected.type === "dataTable" && selectedQueryRef && pane("data", section("paging", "Sayfalama", <>
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
            </>))}
            {selected.type === "dataTable" && pane("rows", section("rowButtons", "Satır eylemleri", <div className="pd-rowact-list">
              <OpenRowField table={selected} components={definition.components} labelOf={(component) => String(component.props.label || component.name || summaryOf(component as PageComponent))} disabled={!canEdit}
                onPatchBar={(barId, patch) => patchComponent(barId, patch)}/>
              {selectedQueryRef && <RowOpenActionField table={selected} components={definition.components} disabled={!canEdit}
                labelOf={(component) => String(component.props.text || component.props.label || component.name || summaryOf(component as PageComponent))}
                onPatch={(patch) => patchComponent(selected.id, patch)}/>}
              {selectedQueryRef && <BulkDeleteField table={selected} queries={definition.queries} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>}
              {selectedQueryRef ? <RowActionsFields table={selected} components={definition.components} parts={["actions"]}
                labelOf={(component) => String(component.props.text || component.props.label || component.name || summaryOf(component as PageComponent))} serverPaged={pagingOn} disabled={!canEdit}
                onPatch={(patch) => patchComponent(selected.id, patch)} onAddButton={() => addRowButton(selected.id)}/> : <div className="pd-rowact-item"><span className="pd-rowact-kind">Satır düğmeleri</span><small>Yalnız bir sorguya bağlı listede kullanılabilir.</small></div>}
              <div className="pd-rowact-item"><span className="pd-rowact-kind">İş akışı</span>
                <label className="pd-check"><input type="checkbox" checked={selected.props.rowActionsEnabled === true} onChange={(event) => updateComponent(selected.id, "rowActionsEnabled", event.target.checked)}/>İş akışı başlatan “İşlemler” kolonunu göster</label>
                {selected.props.rowActionsEnabled === true && <>
                  <label className="pd-field">Düğme metni<input value={String(selected.props.rowActionLabel || "İşlemi başlat")} maxLength={60} onChange={(event) => updateComponent(selected.id, "rowActionLabel", event.target.value)}/></label>
                  <label className="pd-field">İş akışı<select value={String(selected.props.rowActionWorkflowId || "")} onChange={(event) => updateComponent(selected.id, "rowActionWorkflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce yayımlanmış bir iş akışı oluşturun.</small>}</label>
                </>}
              </div>
            </div>))}
            {selected.type === "button" && section("action", "Eylem", <>
              <div className="pd-field">Eylem türü<div className="pd-segment pd-action-type" role="group" aria-label="Eylem türü">
                {buttonActionTypes.map(([value, label]) => <button type="button" key={value} aria-pressed={buttonAction === value} className={buttonAction === value ? "active" : ""}
                  onClick={() => { if (buttonAction !== value) patchComponent(selected.id, { actionType: value }); }}>{label}</button>)}
              </div></div>
              {buttonAction === "workflow" && <label className="pd-field">İş akışı<select value={String(selected.props.workflowId || "")} onChange={(event) => updateComponent(selected.id, "workflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select>{workflows.length === 0 && <small>Önce İş akışları bölümünde bir akış oluşturup yayımlayın.</small>}</label>}
              {buttonAction === "setInput" && <AssignmentsFields value={selected.props.assignments} suggestions={bindingSuggestions} disabled={!canEdit}
                inputs={cardTree.flattenComponents(definition.components).filter((component) => component.type === "input").map((component) => ({
                  id: component.id, label: `${String(component.props.label || component.name || component.id)}${component.props.hidden === true ? " (gizli)" : ""}` }))}
                onChange={(next) => patchComponent(selected.id, { assignments: next })}/>}
              {buttonAction === "openDialog" && <label className="pd-field">Açılacak pencere<select value={typeof selected.props.dialogId === "string" ? selected.props.dialogId : ""} onChange={(event) => patchComponent(selected.id, { dialogId: event.target.value || undefined })}>
                <option value="">Pencere seçin</option>{pageDialogs.map((dialog) => <option key={dialog.id} value={dialog.id}>{summaryOf(dialog)}{dialog.name ? ` (${dialog.name})` : ""}</option>)}</select>
                {pageDialogs.length === 0 ? <small>Önce sayfaya bir Pencere bileşeni ekleyin.</small> : !selected.props.dialogId && <small className="pd-query-warning">Pencere açan düğme için 'dialogId' gerekli.</small>}</label>}
              {NAVIGATION_ACTION_TYPES.includes(buttonAction) && <NavigationFields actionType={buttonAction} props={selected.props} screens={erpScreens}
                pages={pages.filter((page) => !page.screenKey && page.code !== current?.code).map((page) => ({ code: page.code, name: page.name }))}
                suggestions={bindingSuggestions} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>}
              {buttonAction === "query" && <>
                <label className="pd-field">Çalıştırılacak sorgu<select value={actionQuery?.id ?? ""} onChange={(event) => {
                  const chosen = definition.queries.find((query) => query.id === event.target.value);
                  // Güncelle/Sil sorguları verileri değiştirdiği için onay otomatik açılır.
                  patchComponent(selected.id, { queryId: event.target.value || undefined, ...(chosen && (chosen.kind === "update" || chosen.kind === "delete") ? { confirmEnabled: true } : {}) });
                }}><option value="">Sorgu seçin</option>{definition.queries.map((query) => <option key={query.id} value={query.id}>{query.name} ({queryKindLabels[query.kind]})</option>)}</select>
                  {definition.queries.length === 0 && <small>Önce Sorgular sekmesinde bir sorgu ekleyin.</small>}</label>
                <QueryFieldActions kinds={ALL_KINDS} target="Düğme" value={actionQuery?.id ?? null} componentId={selected.id} disabled={!canEdit} bind={bindButtonQuery}/>
                </>}
              {buttonAction === "sequence" && <SequenceFields value={idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS)} when={selected.props.sequenceWhen} stopOnError={selected.props.stopOnError}
                writeQueries={writeQueries} componentsNames={pageNamesOf(definition)} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, sequencePatch(next) as Record<string, PropValue | undefined>)}/>}
              {buttonAction === "sequence" && <QueryFieldActions kinds={WRITE_KINDS} target="Kayıt dizisi" value={idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS).at(-1) ?? null} componentId={selected.id} disabled={!canEdit} bind={bindSequenceStep}/>}
              {(buttonAction === "query" || buttonAction === "sequence") && <>
                <div className="pd-field">Gerekçe iste<small>Kayıttan önce kullanıcıdan bir yanıt istenir; yanıt <code>{`{{${selected.name || "<ad>"}.yanit}}`}</code> ile bağlanır. Gerekçe sorulduğunda ayrıca onay sorulmaz.</small>
                  {!selected.name && <small className="pd-query-warning">Gerekçe sorabilmek için düğmeye ad verin.</small>}
                  <label className="pd-field">Soru metni<BindingInput value={String(selected.props.promptLabel ?? "")} maxLength={60} suggestions={bindingSuggestions} disabled={!canEdit || !selected.name} ariaLabel="Gerekçe sorusu" placeholder="Ters kayıt gerekçesi"
                    onChange={(next) => patchComponent(selected.id, next ? { promptLabel: next } : { promptLabel: undefined, promptRequired: undefined, promptText: undefined, promptMaxLength: undefined })}/></label>
                  <label className="pd-check"><input type="checkbox" checked={selected.props.promptRequired === true} disabled={!canEdit || !selected.props.promptLabel} onChange={(event) => patchComponent(selected.id, { promptRequired: event.target.checked ? true : undefined })}/>Yanıt zorunlu</label>
                  <label className="pd-field">Açıklama<small>Soru metninin altında gösterilir (ör. işlemin etkisi); en fazla {MAX_PROMPT_TEXT} karakter.</small>
                    <BindingInput value={String(selected.props.promptText ?? "")} maxLength={MAX_PROMPT_TEXT} multiline suggestions={bindingSuggestions} disabled={!canEdit || !selected.props.promptLabel} ariaLabel="Gerekçe açıklaması"
                      placeholder="{{liste.seciliSatir.code}} kaydı ters kayıtla iptal edilecek." onChange={(next) => patchComponent(selected.id, { promptText: next || undefined })}/></label>
                  <label className="pd-field">Yanıt en fazla karakter<small>1–{MAX_PROMPT_LENGTH}; boşsa sınır yok (sunucu yine denetler).</small>
                    <input type="number" min={1} max={MAX_PROMPT_LENGTH} step={1} aria-label="Yanıt en fazla karakter" disabled={!canEdit || !selected.props.promptLabel}
                      value={typeof selected.props.promptMaxLength === "number" ? selected.props.promptMaxLength : ""} onChange={(event) => {
                        const number = Number(event.target.value);
                        patchComponent(selected.id, { promptMaxLength: event.target.value === "" || !Number.isInteger(number) ? undefined : Math.max(1, Math.min(MAX_PROMPT_LENGTH, number)) });
                      }}/></label>
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
            {selected.type === "steps" && section("steps", "Adımlar", <StepsFields props={selected.props} pageNames={pageNamesOf(definition)} disabled={!canEdit}
              onPatch={(patch) => patchComponent(selected.id, patch)}/>)}
            {selected.type === "recordHeader" && section("recordHeader", "Kayıt özeti", <RecordHeaderFields props={selected.props} suggestions={bindingSuggestions} disabled={!canEdit}
              buttons={pageButtons.filter((button) => ROW_ACTION_TYPES.includes(String(definition.components.find((component) => component.id === button.id)?.props.actionType ?? "")))}
              owners={buttonOwnersOf(definition.components, selected.id, (component) => summaryOf(component as PageComponent))}
              onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>)}
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
              <div className="pd-field">Dizilim<small>Tek satır: girişler başlıksız, etiketleri yanında tek satırda dizilir (ör. listenin üstündeki süzgeç satırı).</small><div className="pd-segment" role="group" aria-label="Dizilim">{([["grid", "Izgara"], ["inline", "Tek satır"]] as const).map(([value, label]) => {
                const active = (selected.props.layout === "inline" ? "inline" : "grid") === value;
                return <button type="button" key={value} disabled={!canEdit} aria-pressed={active} className={active ? "active" : ""} onClick={() => patchComponent(selected.id, { layout: value === "inline" ? "inline" : undefined })}>{label}</button>;
              })}</div></div>
              <div className="pd-field">Sütun sayısı<div className="pd-segment" role="group" aria-label="Sütun sayısı">{[1, 2, 3].map((count) => <button type="button" key={count} disabled={!canEdit} aria-pressed={(Number(selected.props.columns) || 2) === count} className={(Number(selected.props.columns) || 2) === count ? "active" : ""} onClick={() => patchComponent(selected.id, { columns: count })}>{count}</button>)}</div></div>
              <label className="pd-field">Kayıt anahtarı<small>Değişince kartın girişleri yeni kaydın değerleriyle yeniden dolar. Yüklenen kayda bağlayın (ör. <code>{"{{kart.rows[0].id}}"}</code>); seçili satıra bağlarsanız kayıt yüklenmeden girişler boş değerlerle dolabilir.</small>
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
            {selected.type === "actionBar" && section("layout", "Komutlar", <BarCommandRows props={selected.props} disabled={!canEdit}
              paths={bindingSuggestions.map((item) => ({ path: item.path, label: `${item.path}${item.detail ? ` · ${item.detail}` : ""}`, group: item.group }))}
              pageNames={pageNamesOf(definition)} onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}
              summaries={barSummaries(selected.props)}
              renderDetail={(id) => id === "new" || id === "open" || id === "afterSave" ? (barCommandFields && cloneElement(barCommandFields, { only: id }))
                : id === "save" ? <>
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
                <QueryFieldActions kinds={["insert", "update"]} target="Kaydet komutu" value={typeof selected.props.saveQuery === "string" ? selected.props.saveQuery : null} componentId={selected.id} disabled={!canEdit} bind={(query) => ({ saveQuery: query.id })}/>
              </label> : <SequenceFields value={idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS)} when={selected.props.sequenceWhen} stopOnError={selected.props.stopOnError}
                writeQueries={writeQueries} componentsNames={pageNamesOf(definition)} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, sequencePatch(next) as Record<string, PropValue | undefined>)}/>}
              {barSaveMode === "sequence" && <QueryFieldActions kinds={WRITE_KINDS} target="Kaydet dizisi" value={idList(selected.props.saveSequence, MAX_SEQUENCE_STEPS).at(-1) ?? null} componentId={selected.id} disabled={!canEdit} bind={bindSequenceStep}/>}
                </> : id === "saveNew" ? <>
              <label className="pd-check"><input type="checkbox" checked={selected.props.saveAndNew === true} disabled={!canEdit}
                onChange={(event) => patchComponent(selected.id, { saveAndNew: event.target.checked || undefined })}/>İşlemler menüsünde “Kaydet ve yeni”</label>
              <p className="pd-binding-note">Kaydeder; başarıda kaydettikten sonra eylemi yerine Yeni komutunu çalıştırır. Kaydet ve Yeni bağlı olmalıdır; biri gizliyse bu da gizlenir.</p>
                </> : id === "delete" ? <>
              <label className="pd-field">Sil<span className="pd-action-key" aria-hidden="true">Ctrl+Del</span>
                <select value={typeof selected.props.deleteQuery === "string" ? selected.props.deleteQuery : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { deleteQuery: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {definition.queries.filter((query) => query.kind === "delete").map((query) => <option key={query.id} value={query.id}>{query.name}</option>)}
                </select>
                <QueryFieldActions kinds={["delete"]} target="Sil komutu" value={typeof selected.props.deleteQuery === "string" ? selected.props.deleteQuery : null} componentId={selected.id} disabled={!canEdit} bind={(query) => ({ deleteQuery: query.id })}/>
              </label>
              <label className="pd-field">Silme onayı metni<BindingInput value={String(selected.props.deleteConfirmText ?? "")} maxLength={300} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Silme onayı metni"
                placeholder="Boşsa “Kayıt silinsin mi?”" onChange={(next) => patchComponent(selected.id, { deleteConfirmText: next || undefined })}/></label>
                </> : id === "filter" ? <>
              <label className="pd-field">Filtre<span className="pd-action-key" aria-hidden="true">Ctrl+F</span><small>Odaklanacak giriş kutusu.</small>
                <select value={typeof selected.props.focusInput === "string" ? selected.props.focusInput : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { focusInput: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {pageInputs.map((input) => <option key={input.id} value={input.id}>{input.label}{input.name ? ` (${input.name})` : ""}</option>)}
                  {definition.components.filter((component) => component.type === "filterBar" && component.props.search === true).map((component) =>
                    <option key={component.id} value={component.id}>Süzgeç alanı araması{component.name ? ` (${component.name})` : ""}</option>)}
                </select>
              </label>
                </> : id === "print" ? <>
              <label className="pd-check"><input type="checkbox" checked={selected.props.printEnabled === true} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { printEnabled: event.target.checked ? true : undefined })}/> Yazdır<span className="pd-action-key" aria-hidden="true">Ctrl+P</span></label>
                </> : id === "export" ? <>
              <label className="pd-field">Excel<span className="pd-action-key" aria-hidden="true">Ctrl+E</span><small>Dışa aktarılacak ızgara; sorguya bağlı olmalı.</small>
                <select value={typeof selected.props.exportTable === "string" ? selected.props.exportTable : ""} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { exportTable: event.target.value || undefined })}>
                  <option value="">Yok</option>
                  {queryTables.map((table) => <option key={table.id} value={table.id}>{table.name || table.id}</option>)}
                </select>
              </label>
              {typeof selected.props.exportTable === "string" && selected.props.exportTable !== "" &&
                <label className="pd-check"><input type="checkbox" checked={selected.props.exportCsv !== false} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { exportCsv: event.target.checked ? undefined : false })}/> CSV olarak dışa aktar (İşlemler)</label>}
                </> : id === "more" ? <>
              <div className="pd-field">İşlemler<span className="pd-action-key" aria-hidden="true">Alt+İ</span><small>Menüye taşınan düğmeler sayfada kendi yerinde çizilmez (en fazla 10; sıra değiştirilebilir).</small>
                <InputPicker inputs={pageButtons} value={barMoreButtons} max={10} owned={rowActionOwners} takenLabel="Satır işlemi" disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { moreButtons: next.length > 0 ? next : undefined })}/>
                <button type="button" className="pd-button small" disabled={!canEdit || barMoreButtons.length >= 10} onClick={() => addMenuButton(selected.id)}><Plus size={13}/>Yeni menü düğmesi</button>
                {barMoreButtons.length >= 10 && <small>Menüde en fazla 10 düğme olabilir.</small>}
              </div>
                </> : <small>Yenile (F5) sayfadaki sorguları yeniden çalıştırır; bağlanması gerekmez.</small>}/>)}
            {selected.type === "filterBar" && (() => {
              const table = queryTables.find((item) => item.id === selected.props.table);
              const queryId = table ? String(table.props.query) : "";
              const query = definition.queries.find((item) => item.id === queryId);
              const op = query && isOperationQuery(query) ? findOperation(erpCatalog, query.operation) : undefined;
              const paged = !!table && isPagedTable(table);
              const paging = table && paged ? Object.values(pagingParams(table.props)) : [];
              const labels = Object.fromEntries((Array.isArray(table?.props.columnLabels) ? table!.props.columnLabels as string[] : []).flatMap((item) => {
                const text = String(item); const at = text.indexOf("=");
                return at > 0 ? [[text.slice(0, at), text.slice(at + 1)]] : [];
              }));
              const chosen = Array.isArray(table?.props.columns) ? (table!.props.columns as string[]) : [];
              const all = queryId ? queryColumns(queryId) : [];
              // Listede seçilen sütunlar seçim sırasıyla (başlıklarıyla); seçim yoksa sorgunun tüm sütunları.
              const columns = (chosen.length > 0 ? chosen.flatMap((code) => all.filter((column) => column.code === code)) : all).map((column) => labels[column.code] ? { ...column, label: labels[column.code] } : column);
              return pane("main", <section className="pd-inspector-section pd-settings-wide" data-settings-section="Süzgeç alanı"><div className="pd-inspector-section-body">
                <FilterBarFields name={selected.name} props={selected.props} tables={queryTables.map((item) => ({ id: item.id, label: item.name || summaryOf(item) }))} tableId={table?.id ?? ""}
                  columns={columns} formats={parseColumnFormats(table?.props.columnFormats) as Record<string, string>} query={query}
                  queryParams={filterableParams(query, op ? op.parameters : null, paging)} paged={paged} readQueries={readQueries}
                  columnsOf={(id) => queryColumns(id)} queryEditable={queryEditable} disabled={!canEdit}
                  onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>
              </div></section>);
            })()}
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
                <QueryFieldActions kinds={READ_KINDS} target="İlgili liste" value={typeof selected.props.relatedQuery === "string" ? selected.props.relatedQuery : null} componentId={selected.id} disabled={!canEdit} bind={(query) => ({ relatedQuery: query.id })}/>
              </label>
              {typeof selected.props.relatedQuery === "string" && <label className="pd-field">İlgili liste başlığı<input value={String(selected.props.relatedTitle ?? "")} maxLength={60} disabled={!canEdit} onChange={(event) => patchComponent(selected.id, { relatedTitle: sanitizeSafeValue(event.target.value, false) || undefined })} onBlur={(event) => { const trimmed = event.target.value.trim(); if (trimmed !== event.target.value) patchComponent(selected.id, { relatedTitle: trimmed || undefined }); }}/></label>}
            </>)}
            {selected.type === "heading" && section("layout", "Sayfa başlığı", <>
              <label className="pd-check"><input type="checkbox" checked={selected.props.pageTitle === true} disabled={!canEdit}
                onChange={(event) => patchComponent(selected.id, { pageTitle: event.target.checked ? true : undefined })}/> Sayfa başlığı olarak göster</label>
              <small>Görünürken sayfa üst bilgisindeki başlığın yerine geçer (ör. "Stok kartı {"{{kart.rows[0].code}}"}"); gövdede ayrıca çizilmez.</small>
            </>)}
            {selected.type === "tabs" && section("tabs", "Sekmeler", <>
              <TabsFields tabs={parseTabs(selected.props.tabs)} defaultTab={Number(selected.props.defaultTab ?? 0)}
                disabled={!canEdit} onChange={(tabs, defaultTab) => setTabs(selected.id, tabs, defaultTab)}/>
            </>)}
            {selected.type === "editableGrid" && section("grid", "Düzenlenebilir tablo", <EditableGridFields name={selected.name} props={selected.props} readQueries={readQueries}
              columnsOf={queryColumns} pageNames={pageNamesOf(definition)}
              sourceColumns={typeof selected.props.sourceQuery === "string" ? queryColumns(selected.props.sourceQuery) : []}
              listParameter={selected.name ? collectionParameterFor("list", selected.name, definition.queries, erpCatalog) : null}
              suggestions={bindingSuggestions} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>)}
            {selected.type === "customFieldsBlock" && section("customFields", "Özel alanlar", <CustomFieldsBlockFields name={selected.name} props={selected.props} readQueries={readQueries}
              columnsOf={(queryId) => { const columns = queryColumns(queryId); return columns.length > 0 ? columns.map((column) => column.code) : null; }}
              disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>)}
            {selected.type === "dialog" && <DialogFields dialog={selected} components={definition.components}
              viewExtra={<DialogLookFields props={selected.props} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>}
              labelOf={(component) => { const summary = summaryOf(component as PageComponent); const title = titleFor(component.type as ComponentType); return summary === title ? title : `${title}: ${summary}`; }}
              writeQueries={writeQueries} readQueries={readQueries} pageNames={pageNamesOf(definition)} disabled={!canEdit}
              onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>}
            {selected.type === "image" && section("image", "Görsel", <>
              <label className="pd-field">Görsel bağlantısı<small>Yalnız http:// ya da https:// ile başlayan tam adresler gösterilir; diğer değerlerde “Görsel yok” yazar.</small>
                <BindingInput value={String(selected.props.value ?? "")} maxLength={200} suggestions={bindingSuggestions} disabled={!canEdit} ariaLabel="Görsel bağlantısı"
                  placeholder="{{kart.rows[0].imageUrl}}" onChange={(next) => updateComponent(selected.id, "value", next)}/></label>
              <label className="pd-field">Yükseklik<small>40–400 piksel.</small>
                <input type="number" min={40} max={400} step={1} value={typeof selected.props.height === "number" ? selected.props.height : 160} onChange={(event) => {
                  const raw = Number(event.target.value);
                  if (event.target.value !== "" && Number.isFinite(raw)) updateComponent(selected.id, "height", Math.round(raw));
                }} onBlur={() => {
                  const height = typeof selected.props.height === "number" ? selected.props.height : 160;
                  const clamped = Math.max(40, Math.min(400, Math.round(height) || 160));
                  if (clamped !== height) updateComponent(selected.id, "height", clamped);
                }}/>
                {typeof selected.props.height === "number" && (selected.props.height < 40 || selected.props.height > 400) && <small className="pd-query-warning">Yükseklik 40 ile 400 arasında olmalıdır.</small>}</label>
              <div className="pd-field">Sığdırma<div className="pd-segment" role="group" aria-label="Sığdırma">{([["contain", "Sığdır"], ["cover", "Doldur"]] as const).map(([value, label]) => <button type="button" key={value} disabled={!canEdit}
                aria-pressed={(selected.props.fit === "cover" ? "cover" : "contain") === value} className={(selected.props.fit === "cover" ? "cover" : "contain") === value ? "active" : ""}
                onClick={() => patchComponent(selected.id, { fit: value === "contain" ? undefined : value })}>{label}</button>)}</div></div>
            </>)}
            {selected.type !== "dataTable" && section("conditions", "Koşullar", <ConditionFields props={selected.props} allowDisabled={DISABLEABLE_TYPES.includes(selected.type)}
              pageNames={pageNamesOf(definition)} suggestions={bindingSuggestions} disabled={!canEdit}
              onSet={(key, value) => setOptionalProp(selected.id, key, value)}/>)}
            {selected.type !== "dataTable" && section("conditions-width", "Koşullu genişlik", <>
              <WidthWhenField key={`${selected.id}-widthWhen`} value={selected.props.widthWhen} disabled={!canEdit}
                terms={conditionTerms(definition.components.filter((component) => component.id !== selected.id), (component) => typeof component.props.query === "string" ? queryColumns(component.props.query).map((column) => column.code) : [])}
                onChange={(next) => patchComponent(selected.id, { widthWhen: next })}/>
              <details className="pd-settings-advanced"><summary>Kod olarak yaz</summary>
                <RawWidthWhenField value={selected.props.widthWhen} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { widthWhen: next })}/>
              </details>
            </>)}
            {selected.type === "dataTable" && pane("view", section("style", "Görünüm", <>
              <WidthSegment span={spanOf(selected)} disabled={!canEdit} onChange={(width) => updateComponent(selected.id, "width", width)}/>
              <WidthWhenField key={`${selected.id}-widthWhen`} value={selected.props.widthWhen} disabled={!canEdit}
                terms={conditionTerms(definition.components.filter((component) => component.id !== selected.id || component.type === "dataTable"), (component) => typeof component.props.query === "string" ? queryColumns(component.props.query).map((column) => column.code) : [])}
                onChange={(next) => patchComponent(selected.id, { widthWhen: next })}/>
              <VisibilityField key={`${selected.id}-visibility`} props={selected.props} pageNames={pageNamesOf(definition)} suggestions={bindingSuggestions} disabled={!canEdit} onSet={(key, value) => setOptionalProp(selected.id, key, value)}/>
              <div className="pd-field">Yoğunluk<div className="pd-segment">{([["comfort", "Rahat"], ["dense", "Sık"]] as const).map(([value, label]) => <button type="button" key={value} disabled={!canEdit} className={(selected.props.density === "comfort" ? "comfort" : "dense") === value ? "active" : ""} onClick={() => patchComponent(selected.id, { density: value === "dense" ? undefined : value })}>{label}</button>)}</div></div>
              <RowActionsFields table={selected} components={definition.components} parts={["empty"]} serverPaged={pagingOn} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>
              <GridToolsField props={selected.props} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch)}/>
              {selectedQueryRef && selected.props.variant !== "bars" && selected.props.variant !== "list" && <DetailToggleField value={typeof selected.props.detailToggleInput === "string" ? selected.props.detailToggleInput : ""} disabled={!canEdit}
                inputs={detailToggleCandidates} onChange={(next) => patchComponent(selected.id, { detailToggleInput: next })}/>}
              <details className="pd-settings-advanced">
                <summary>Gelişmiş (iç boşluk, dış boşluk, köşe, renkler, ham koşul ifadesi)</summary>
                {boxFields}
                <RawWidthWhenField value={selected.props.widthWhen} disabled={!canEdit} onChange={(next) => patchComponent(selected.id, { widthWhen: next })}/>
              </details>
            </>))}
            {selected.type !== "dataTable" && section("style", "Görünüm", <>
              {selected.type === "actionBar" && <BarLookFields props={selected.props} disabled={!canEdit} onPatch={(patch) => patchComponent(selected.id, patch as Record<string, PropValue | undefined>)}/>}
              {selected.type === "metric" && <>
                <div className="pd-field">Anlam<ToneSelect value={(["info", "success", "warning", "danger"] as const).find((tone) => tone === selected.props.variant)} disabled={!canEdit} onChange={(tone) => patchComponent(selected.id, { variant: tone })}/></div>
                <div className="pd-field">İkon<IconSelect value={typeof selected.props.icon === "string" ? selected.props.icon : undefined} disabled={!canEdit} onChange={(icon) => patchComponent(selected.id, { icon })}/></div>
              </>}
              <div className="pd-field">Genişlik<small>Tuvalde bloğun sağ kenarını sürükleyerek de değiştirebilirsiniz.</small><div className="pd-segment">{[3, 4, 6, 8, 9, 12].map((width) => <button type="button" key={width} className={spanOf(selected) === width ? "active" : ""} onClick={() => updateComponent(selected.id, "width", width)}>{width}</button>)}{![3, 4, 6, 8, 9, 12].includes(spanOf(selected)) && <button type="button" className="active">{spanOf(selected)}</button>}</div></div>
              {boxFields}
            </>)}
          </fieldset>
          </SettingsHost>
          </BindingSampleContext.Provider>
        </div> : <div className="pd-right-body">
          <div className="pd-right-head"><Settings2 size={16}/><div><b>Sayfa ayarları</b><small>Bir bileşeni düzenlemek için tuvalde seçin.</small></div></div>
          <fieldset className="pd-fieldset" disabled={!canEdit}>
            <label className="pd-field">Sayfa adı<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Satış özeti"/></label>
            {systemScreenKey
              ? <label className="pd-field">Sayfa kodu<small>Sistem sayfasının kodu ekrana bağlıdır; değiştirilemez.</small><input value={`@${systemScreenKey}`} readOnly aria-readonly="true"/></label>
              : <label className="pd-field">Sayfa kodu<small>{current ? "Kaydedildikten sonra değiştirilemez." : "Adres olarak kullanılır: küçük harf, rakam, - ve _."}</small><input maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))} placeholder="satis-ozeti" disabled={!!current}/></label>}
            <label className="pd-field">Açıklama<textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Bu sayfanın amacı"/></label>
          </fieldset>
          <dl className="pd-facts">
            <div><dt>Durum</dt><dd>{status.label}</dd></div>
            <div><dt>Sürüm</dt><dd>{current ? current.revision : "—"}</dd></div>
            <div><dt>Bileşen</dt><dd>{definition.components.length}</dd></div>
            <div><dt>Son kayıt</dt><dd>{current ? new Date(current.updatedAt).toLocaleString("tr-TR") : "Kaydedilmedi"}</dd></div>
          </dl>
          <div className="pd-shortcuts"><b>Kısayollar</b><span><kbd>Ctrl</kbd>+<kbd>S</kbd> Kaydet</span><span><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> Geri al / yinele</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd> Kopyala</span><span><kbd>Delete</kbd> Sil · <kbd>Alt</kbd>+<kbd>↑↓</kbd> Taşı</span></div>
          {current && role === "TenantAdmin" && (!systemMode || hasSqlQueries) && <CustomPageAccessPanel key={current.code} token={token} pageCode={current.code} hasQueries={definition.queries.length > 0}/>}
          {systemMode
            ? publishedFirmDesignId && capabilities?.canDelete && systemAdmin && <button type="button" className="pd-button small danger pd-delete-page" onClick={() => void removeFirmDesign()} disabled={saving}><Trash2 size={13}/>Firma tasarımını kaldır</button>
            : current && capabilities?.canDelete && !queryPageLocked && <button type="button" className="pd-button small danger pd-delete-page" onClick={() => void deleteCurrent()} disabled={saving}><Trash2 size={13}/>Sayfayı sil</button>}
        </div>}
      </aside>
      </DockPanel>
    </div>
    {newPageDialog && <NewPageDialog mode={newPageDialog} templates={templates} takenCodes={pages.map((page) => page.code)} onCancel={cancelNewPage}
      onConfirm={(result) => { if (newPageDialog === "create") createFromDialog(result); else { setNewPageDialog(null); const template = templates.find((item) => item.id === result.templateId); if (template) applyTemplate(template); } }}/>}
    {queryEditorOpen && <QueryEditorModal title="Sorgular" onClose={() => setQueryEditorOpen(false)}>
      <QueriesPanel queries={definition.queries} selectedId={selectedQueryId} onSelect={setSelectedQueryId}
        editable={queryEditable} readOnlyReason={!isAdmin ? "Sorguları yalnız tenant yöneticisi ekleyip düzenleyebilir; bu pencereyi salt okunur görüyorsunuz." : null}
        schema={sqlSchema} suggestions={sequenceSuggestions.length > 0 ? [...bindingSuggestions, ...sequenceSuggestions] : bindingSuggestions} previews={queryPreviews} components={definition.components}
        previewBlockedReason={current?.isPublished ? "Önizleme yalnız taslakta çalışır; önce yeni taslak oluşturun." : null}
        takenNames={(queryId) => takenNames({ queryId })} onAdd={addQuery} onUpdate={updateQuery} onRemove={removeQuery} onPreview={runQueryPreview}
        catalog={erpCatalog} onAddSourceQuery={addSourceQuery}/>
    </QueryEditorModal>}
    {formEditorOpen && <div className="custom-pages-form-popup" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setFormEditorOpen(false); void refreshForms(); } }}><section role="dialog" aria-modal="true" aria-label="Form tasarımcısı"><header><div><b>Form tasarımcısı</b><small>Formu oluşturun, alanları düzenleyin ve yayımlayın.</small></div><button type="button" onClick={() => { setFormEditorOpen(false); void refreshForms(); }}>Kapat</button></header><CustomFormsPage token={token} role={role}/></section></div>}
    {queryEditor.dialog}
  </main></QueryEditorProvider>;
}
