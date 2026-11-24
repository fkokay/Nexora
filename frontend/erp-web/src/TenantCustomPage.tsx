import { createElement, useCallback, type ComponentProps, type CSSProperties, type FormEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, Archive, CheckCircle2, Eye, Filter, Info, LayoutTemplate, Maximize2, PanelRight, Search, ShieldAlert, ShieldCheck, X, type LucideIcon } from "lucide-react";
import { api } from "./erpApi";
import TenantReportWidget from "./TenantReportWidget";
import { MetricCard } from "./custom-page/MetricCard";
import { countRowsWhen, countText } from "./custom-page/countWhen";
import { openParamRow, openParamTargets, sameOpenRequest } from "./custom-page/openParam";
import TenantWorkflowAction from "./TenantWorkflowAction";
import { setWorkspacePageTitle } from "./workspacePageTitles";
import { bindingPath, bindingsAllEmpty, displayText, interpolate, interpolateWith, joinTextParts, pageDateScope, resolvePath, type PageScope } from "./custom-page/pageBindings";
import { readPageQueries, resolveQueryParameters, usePageQueries, type PageQueryDefinition, type QueryState, type WriteResult } from "./custom-page/usePageQueries";
import { collectTexts, COUNTS_ROOT, referencedCountCodes, usePageCounts } from "./custom-page/usePageCounts";
import { columnTotal, formatCell, trendPoints, isRightAligned, parseColumnFormats, parseToneMap, toneFor, type ColumnFormat, type Tone } from "./custom-page/cellFormat";
import { chipText, ContextPanel, facetCount, FacetPanel, FilterChips, FormCard, type FacetGroup } from "./custom-page/LayoutComponents";
import { dialogOwnedIds, headerButtonIds, idList, ownedInputIds, parseFieldList, parseTabs, rowActionIds, tableDetailToggleIds, tableSearchInputIds, tabOwnedIds } from "./custom-page/layoutRefs";
import { activeStepIndex, stepLabels, StepsIndicator } from "./custom-page/StepsIndicator";
import { RecordHeader, recordHeaderFields, templateText } from "./custom-page/RecordHeader";
import { assignmentsValid, resolveAssignments } from "./custom-page/setInputAction";
import { toIsoDateTime, toLocalInputText } from "./custom-page/dateTimeInput";
import { LookupInput, lookupCandidates, lookupOptions, lookupOptionsWithValue, staticLookupOptions, type LookupOption } from "./custom-page/LookupInput";
import { PagedTableFooter } from "./custom-page/PagedTableFooter";
import { blockedInPreview, PREVIEW_ERP_WRITE_BLOCKED, PREVIEW_WRITE_WARNING, runWriteAction } from "./custom-page/writeAction";
import { conditionHolds } from "./custom-page/conditions";
import { applyTyping, boundInputNames, inputRules, validateInputValue, VALIDATION_BLOCKED } from "./custom-page/inputValidation";
import { boundTab, PageTabs } from "./custom-page/PageTabs";
import type { BridgeHost } from "./custom-page/codeBridge";
import { CodeFrame } from "./custom-page/CodeFrame";
import { createPageEvents, type PageEvents } from "./custom-page/pageEvents";
import { mapOperationResult, missingRequiredValue, type ErpOperation } from "./custom-page/erpOperations";
import { CREATED_REOPEN, SOURCE_FAILED, SOURCE_LOADING } from "./custom-page/recordMessages";
import { useErpOperations } from "./custom-page/useErpOperations";
import { actionBarOf, barCommandHidden, barCommandPlan, buildPageCommands, commandWhenOf, exportRows, movedButtonIds, parseBarLook, SAVE_AND_NEW_COMMAND_ID, VIEW_MODE_PARAM, VIEW_MODE_REASON, VIEW_MODE_VALUE, type BarCommandId, type BarPageNavigation } from "./custom-page/pageActions";
import { openDialogs, useWindowKeyDown } from "./record-form/recordFormKeys";
import { usePageCommands } from "./commands/CommandProvider";
import { startPageWorkflow } from "./custom-page/workflowStart";
import { downloadCsv, downloadXlsx } from "./general-ledger/ledgerReportUtils";
import { confirmDialog, promptDialog } from "./confirmDialog";
import { confirmStartNew } from "./commands/PageCommandsSlot";
import { EditableGrid, type GridPicker } from "./custom-page/EditableGrid";
import { gridColumnTotals, parseGridTotals } from "./custom-page/gridTotals";
import { CALC_EMPTY, calcText, previewRows, previewScopeState, usePreviewQueries, withRowKeys, type PreviewPlan } from "./custom-page/previewQueries";
import { DataTableGrid, gridToolsOf } from "./custom-page/DataTableGrid";
import { CustomFieldsBlock } from "./custom-page/CustomFieldsBlock";
import { emptyGridState, fixedRowValues, gridReducer, gridScope, iterationRows, parseColumnEntries, parseGridColumns, sentDrafts, validateGrid, wireRow, MATRIX_MAX_ROWS,
  type GridAction, type GridColumn, type GridDraft, type GridMode, type GridState } from "./custom-page/gridState";
import { countedGridState, filledGridState, gridEngineReducer, lockedColumns, lookupFillCells, optionRowOf, parseGridEngine, withFormulaColumns, withoutLockedErrors,
  type GridEngine, type GridEngineAction } from "./custom-page/gridFill";
import { customFieldSpecs, customFieldValues, validateCustomFields, type CustomFieldSpec } from "./custom-page/customFields";
import { countVariantDrafts } from "./inventory/variantDrafts";
import { PageDialog, type ActionStatus } from "./custom-page/PageDialog";
import { PageImage } from "./custom-page/PageImage";
import { CompactList, compactCell } from "./custom-page/CompactList";
import { FilterBar } from "./custom-page/FilterBar";
import { SearchableSelect } from "./custom-page/SearchableSelect";
import { applyFirstChoices, firstChoiceValue, applyClientFilters, filterChoices, filterScope, filterStorageKey, loadFilterValues, parseFilterEntries, presetFromPageParams, resolveKind, saveFilterValues, EMPTY_FILTER_VALUES, type FilterBarValues, type FilterValue, type ResolvedFilter } from "./custom-page/filterBarModel";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { iterationOf, NOTHING_TO_SAVE, runSaveSequence, stepLabel, type SequenceList, type SequenceStep } from "./custom-page/saveSequence";
import { isNavigationType, runNavigation } from "./custom-page/navigationActions";
import { OPEN_PAGE_EVENT, publishRecordsDeleted, setPageParams, usePageParams, type PageParams, type WorkspaceOpenRequest } from "./pageNavigation";
import { deletedRecordIds } from "./custom-page/deletedRecords";
import "./tenant-custom-page.css";
import "./system-pages/system-pages.css";
import "./custom-page/detail-panel.css";

/** Yazmanın kaynağı: `recordDelete` İşlem Çubuğu "Sil" komutudur (sayfanın gösterdiği kaydın silmesi). */
type WriteOptions = { recordDelete?: boolean };
type DynamicField = {
  code: string; label: string; dataType: "Text" | "Decimal" | "Date" | "Boolean" | "Choice";
  isRequired: boolean; maxLength?: number; options?: string[] | null; placeholder?: string | null;
  helpText?: string | null; isMultiline?: boolean; defaultValue?: string | null;
  visibleWhenFieldCode?: string | null; visibleWhenValue?: string | null;
  requiredWhenFieldCode?: string | null; requiredWhenValue?: string | null;
  minLength?: number; minValue?: number | null; maxValue?: number | null;
  minDate?: string | null; maxDate?: string | null;
};
type EmbeddedForm = { id: string; code: string; name: string; description?: string | null; version: number; fields: DynamicField[] };
type ComponentDefinition = {
  id: string; type: string; name?: string; props?: Record<string, unknown>; children?: ComponentDefinition[];
};
type PublishedPage = {
  id: string; code: string; name: string; description?: string | null; revision: number;
  definitionJson: string; forms: EmbeddedForm[];
  rights?: { view?: boolean; insert?: boolean; update?: boolean; delete?: boolean };
};

const textValue = (value: unknown, fallback = "") =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

const BINDABLE_PROPS = ["text", "title", "description", "label", "value", "placeholder", "defaultValue", "disabledReason",
  "promptLabel", "fixedRowLabel", "matrixCode", "matrixName", "recordKey"];
type InputRaw = string | boolean;
/** v2 sayfaların çalışma zamanı: bağlama kapsamı, sorgu durumları, giriş değerleri ve ızgara seçimleri. */
type PageRuntime = {
  scope: PageScope;
  states: Record<string, QueryState>;
  queryNames: Record<string, string>;
  inputValues: Record<string, InputRaw>;
  setInput: (componentId: string, value: InputRaw) => void;
  /** Kullanıcının giriş değişikliği: `setInput` ve değer değiştiyse `clearsOnChange` hedeflerinin temizlenmesi. */
  changeInput: (componentId: string, value: InputRaw) => void;
  /** Seçim girişinin seçenek sorgusu durumu, `optionsWhen` ile süzülmüş (geçerli değerin satırı kalır). */
  inputOptions: (component: ComponentDefinition) => QueryState | undefined;
  selections: Record<string, Record<string, unknown> | null>;
  /** `user`: kullanıcının satır tıklaması (satır işlemi dahil); veri yenilemesinin seçimi temizlemesi değil. */
  select: (tableName: string, row: Record<string, unknown> | null, options?: { user?: boolean }) => void;
  queryById: Record<string, PageQueryDefinition>;
  /** ERP işlemi doğrulama hataları, giriş adına göre (parametre bağlaması `{{<giriş>.value}}`). */
  inputErrors: Record<string, string>;
  /** formCard/facetPanel'in sahiplendiği girişler (üst düzeyde ayrıca çizilmez) ve kimliğe göre giriş bileşenleri. */
  ownedInputs: Set<string>;
  inputById: Record<string, ComponentDefinition>;
  /** contextPanel'in `table` başvurusu için kimliğe göre veri tabloları. */
  tableById: Record<string, ComponentDefinition>;
  rights: NonNullable<PublishedPage["rights"]>;
  rerun: (queryIds: string[]) => void;
  /** Studio taslak önizlemesi: yazma sorguları her zaman onay sorar ve sunucuya açık onay (confirmWrite) gönderir. */
  isPreview: boolean;
  /** `recordDelete`: İşlem Çubuğu "Sil" (kaydın kendi silmesi); kaydı gösteren bu sekme de kapanır. */
  writeFor: (query: PageQueryDefinition, confirmWrite: boolean, options?: WriteOptions) => Promise<WriteResult>;
  /** Kod bileşenleri arası olay merkezi (load/select/beforeSave/afterSave) ve köprünün sayfa tarafı. */
  events: PageEvents;
  codeHost: BridgeHost;
  /** `actionBar.moreButtons` ile İşlemler menüsüne taşınan düğmeler: sayfada çizilmez. */
  movedButtons: Set<string>;
  /** Sayfadaki tüm yazma yolları (sorgu düğmeleri, İşlem Çubuğu, Ctrl+S) için tek uçuş kilidi. */
  writeLock: { current: boolean };
  /** İşlem Çubuğu eylemlerinin sonucu (sayfadaki durum satırı). */
  actionStatus: ActionStatus | null;
  /** Gösterilen istemci doğrulama iletileri, giriş kimliğine göre (bulanıklaşınca veya engellenen yazmada). */
  validationErrors: Record<string, string>;
  /** Yazmadan önce sorgunun bağladığı görünür, etkin girişleri doğrular; geçersizse VALIDATION_BLOCKED döner. */
  validateFor: (query: PageQueryDefinition) => string | null;
  /** Giriş doğrulanmıyor mu (kendisi veya bir sahibi gizli, ya da kendisi pasif). */
  skipsValidation: (inputId: string) => boolean;
  /** Engellenen yazmada hangi sekmeler bileşeninin hangi sekmesine atlanacağı (kimliğe göre); `signal` her engelde artar. */
  errorJump: { signal: number; targets: Record<string, number> } | null;
  /** Giriş bulanıklaştı: iletisi gösterilir veya kaldırılır. */
  blurInput: (componentId: string) => void;
  /** Sekmelerin sahiplendiği bileşenler (üst düzeyde ayrıca çizilmez) ve kimliğe göre üst düzey bileşenler. */
  tabOwned: Set<string>;
  topLevelById: Record<string, ComponentDefinition>;
  /** Sekme başına hata sayısı için: bileşenin sahip zinciri (giriş → formCard → sekmeler…). */
  ancestorsOf: (componentId: string) => string[];
  /** Arama kutusu (inputType: lookup) girişinin seçenekleri ve seçim/arama geri çağrıları. */
  lookupFor: (component: ComponentDefinition, props: Record<string, unknown>) => LookupBinding;
  /** Sunucu sayfalı veri listesinin geçerli sayfası ve sayfa değiştirme (sayfalı değilse undefined). */
  tablePaging: (table: ComponentDefinition) => { page: number; pageSize: number; onPage: (page: number) => void } | undefined;
  /** En güncel bağlama kapsamı (ref): bekleyen işlemler render anındaki kapsamı değil bunu okur. */
  currentScope: () => PageScope;
  /** Bu sayfanın çalışma sekmesi anahtarı (gezinme eylemi aynı sekmede açarken yerine geçilecek sekme). */
  tabKey?: string;
  writeWith: (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite: boolean) => Promise<WriteResult>;
  /** Kayıt dizisini (`saveSequence`) ya da istemli tek yazmayı çalıştırır (İşlem Çubuğu, düğme, pencere, satır işlemi). */
  runSequence: (source: SequenceSource) => Promise<void>;
  /** Düzenlenebilir tablonun yineleme satırları ve gönderilen satırların listeden düşürülmesi (Görev 6'ya kadar boş). */
  gridIteration: (grid: string, list: SequenceList) => { key: string; row: Record<string, unknown> }[];
  commitGrid: (grid: string, list: SequenceList, keys: string[]) => void;
  /** Pencereler: açık/kapalı durumu, açma (açan öğeye odak geri döner) ve kapatma. */
  dialogs: Record<string, boolean>;
  openDialog: (id: string, opener: HTMLElement | null) => void;
  closeDialog: (id: string) => void;
  saveDialog: (id: string) => void;
  dialogStatus: Record<string, ActionStatus | null>;
  dialogBusy: Record<string, boolean>;
  dialogOpener: (id: string) => HTMLElement | null;
  /** Pencerelerin ve satır işlemlerinin sahiplendiği bileşenler: üst düzeyde ayrıca çizilmez. */
  dialogOwned: Set<string>;
  rowOwned: Set<string>;
  /** Kayıt özetlerinin (`recordHeader.buttons`) sahiplendiği düğmeler: özette çizilir. */
  headerOwned: Set<string>;
  /** `setInput` düğmesi: atamaları (satır bindirmesiyle) çözer ve girişlere yazar; sunucuya bir şey gitmez. */
  applyAssignments: (props: Record<string, unknown>, overlay: Record<string, unknown>) => void;
  buttonById: Record<string, ComponentDefinition>;
  /** Düğmenin çalıştırılabilir eylemi ve gereken sayfa hakları (yoksa null). */
  buttonAction: (button: ComponentDefinition) => ButtonAction | null;
  /** Satır işlemi: satırı seçer, düğmeyi o satırın bindirmesiyle çalıştırır. */
  runRowAction: (table: ComponentDefinition, button: ComponentDefinition, row: Record<string, unknown>, opener: HTMLElement | null) => void;
  /**
   * Toplu silme (`dataTable.bulkDeleteQuery`): tek onaydan sonra silme sorgusu satır başına (satır `<tablo>.seciliSatir`)
   * sırayla çalışır, özet listenin durum satırında gösterilir ve yükleme sorguları yenilenir. Silme çalıştıysa true.
   */
  bulkDelete: (table: ComponentDefinition, query: PageQueryDefinition, rows: Record<string, unknown>[]) => Promise<boolean>;
  tableStatus: Record<string, ActionStatus | null>;
  /** Düzenlenebilir tablonun ve özel alanlar bloğunun çizim verisi (kimlik/ad, durum, iletiler, geri çağrılar). */
  gridFor: (grid: ComponentDefinition) => GridView;
  blockFor: (block: ComponentDefinition) => BlockView;
  /** `trackChanges` formCard'ının değişen giriş sayısı. */
  cardChanges: (card: ComponentDefinition) => number;
  /** Doğrulama iletisi gösterilen tablo ve blokların kimlikleri (sekme hata sayısı için). */
  componentErrorIds: string[];
  /** Kullanıcının pencereyi kapatması (Esc, Kapat, Vazgeç): kirliyse önce sorar. */
  requestCloseDialog: (id: string) => void;
  /** Sayfada kaydedilmemiş değişiklik var mı (İşlem Çubuğu Yeni). */
  isDirty: () => boolean;
  /** İşlem Çubuğu Yeni: tablolar, bloklar, kayıt tablolarının seçimi ve kayıt yolunun yazma sonuçları sıfırlanır. */
  startNew: () => void;
  /** Sorgunun bağlı ERP işlemine katalog izni var mı (`allowed`); SQL sorgusu ve katalog yüklenmeden önce true. */
  queryAllowed: (queryId: string) => boolean;
  /** İşlem Çubuğu `formDialog` (kayıt penceresi); yoksa null. */
  formDialog: {
    id: string; hasRecord: boolean; recordLoading: boolean; recordFailed: boolean; open: (opener: HTMLElement | null) => void;
    /** Pencerenin girişlerini sıfırlar, kapalıysa açar ve boyamadan sonra `focusId` girişine (sekmesini etkinleştirerek) odaklanır. */
    startNew: (focusId: string | undefined, opener: HTMLElement | null) => void;
  } | null;
  /** İşlem Çubuğu'nun Yeni komutu (onay ve sıfırlama dahil); kayıt penceresinde F2 bununla çalışır. */
  newCommand: { current: (() => void | Promise<void>) | null };
  /** İşlem Çubuğu'nun etkin Aç komutu (yoksa null); satıra çift tıklama bununla çalışır. */
  openCommand: { current: (() => void | Promise<void>) | null };
  /** Aç komutunun kaydını seçen tablolar (`openButton` bağlamalarının `<tablo>.seciliSatir` kökleri, kayıt penceresinin kayıt tabloları). */
  openTables: Set<string>;
  /** Satıra çift tıklama: satırı seçer, çizimden sonra Aç komutunu çalıştırır. */
  openRow: (tableName: string, row: Record<string, unknown>) => void;
  /** Kayıt kartlarının (`recordKey` taşıyan formCard) girişlerini kaynak değerlerine döndürür (yazılan, ileti, arama durumu). */
  clearRecordInputs: () => void;
  /** Süzgeç alanının çizim verisi (tablosu yoksa null). */
  filterBarFor: (bar: ComponentDefinition) => FilterBarView | null;
  /**
   * Göstergenin süzgeç alanı hedefi (`filterInput: "<süzgeçAlanı>.<anahtar>"`): süzgecin şu anki seçim değeri ve yazılması
   * (undefined temizler). Süzgeç alanı ya da anahtar yoksa null.
   */
  filterBarTarget: (target: string) => { value: string; set: (value: string | undefined) => void } | null;
  /** Görüntüleme kipi (`{{sayfa.parametre.mode}}` = view, İşlem Çubuğu Görüntüle): kayıt salt okunur (bkz. viewModeLocked). */
  readOnly: boolean;
  /** Listenin gösterilen satırları: bağlı süzgeç alanlarının sayfada uygulanan süzgeçleri (sorgu durumu değişmez). */
  visibleRows: (table: ComponentDefinition, state: QueryState) => QueryState;
};
type FilterBarView = {
  search: { placeholder: string; hint: string } | null; values: FilterBarValues; filters: ResolvedFilter[];
  /** Arama kutusunun kimliği (`page-input-<bileşen>`): İşlem Çubuğu'nun Filtre komutu (focusInput) buna odaklanır. */
  searchInputId: string;
  onSearch: (text: string) => void; onChange: (key: string, value: FilterValue | undefined) => void; onClearAll: () => void;
};
type GridView = {
  id: string; mode: GridMode; columns: GridColumn[]; state: GridState; sourceRows: Record<string, unknown>[]; rowKey: string;
  dispatch: (action: GridAction) => void; errors: Record<string, Record<string, string>>; maxRows: number; loading: boolean; error?: string;
  matrixPreviewCount?: number;
  /** Sütun toplamları (`totals`; yoksa boş). */
  totals: Record<string, number>;
  pickerFor: (column: GridColumn, draft: GridDraft) => GridPicker;
  pickerLabel: (column: GridColumn, value: string, draft?: GridDraft) => string;
  /** Hesaplanan (`calc`) hücrenin metni. */
  calcText: (column: GridColumn, draft: GridDraft) => string;
  /** Satırın kilitli sütunları (`lockColumnsWhen`). */
  lockedFor: (draft: GridDraft) => ReadonlySet<string>;
};
type BlockView = {
  id: string; specs: CustomFieldSpec[]; values: Record<string, string>; onChange: (code: string, value: string) => void;
  errors: Record<string, string>; loading: boolean; error?: string;
};
/** Kayıt dizisinin kaynağı: İşlem Çubuğu, düğme ya da pencere özellikleri (bağlanmamış) ve sonucun gideceği yer. */
type SequenceSource = {
  props: Record<string, unknown>;
  /** İstem yanıtının adı (`{{<düğmeAdı>.yanit}}`). */
  name?: string;
  /** Satır işlemi bindirmesi (`{ <tablo>: { seciliSatir: satır } }`): koşullar, doğrulama ve değerler bununla çözülür. */
  overlay?: Record<string, unknown>;
  onStatus: (status: ActionStatus | null) => void;
  onBusy: (busy: boolean) => void;
  /** Tüm çağrılar başarılı oldu (pencere `closeOnSave`). */
  onSuccess?: () => void;
  /** Tablonun satır işlemi: başarıdan sonra yalnız `refreshQueries` yenilenir (seçim ve açık pencere korunur). */
  rowAction?: boolean;
};
type ButtonAction = { type: "query" | "sequence" | "openDialog" | "workflow" | "navigate" | "setInput"; rights: string[]; query?: PageQueryDefinition };
export type RowAction = {
  id: string; label: string; visible: (row: Record<string, unknown>) => boolean;
  /** Pasifse nedeni, değilse null. */
  disabled: (row: Record<string, unknown>) => string | null;
  run: (row: Record<string, unknown>, opener: HTMLElement | null) => void;
};
type LookupBinding = {
  options: LookupOption[]; loading: boolean; error?: string;
  onChange: (value: string, row: Record<string, unknown> | null, label: string) => void; onSearch: (text: string) => void;
  /** Son seçimin değeri ve etiketi (çalışma zamanında saklanır; giriş yeniden bağlanınca etiket korunur). */
  selected: { value: string; label: string } | null;
};
/** Sayfalı listenin alt satırı ve başlıktaki arama girişi. */
export type TablePaging = { page: number; pageSize: number; meta: { label: string; value: string }[]; onPage: (page: number) => void; search?: ReactNode };

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
/** Bindirme kök başına birleşir: sorgu durumu ya da tablo kapsamı korunur, yalnız verilen alanlar değişir. */
const mergeOverlay = (scope: PageScope, overlay: Record<string, unknown>): PageScope => {
  const merged: PageScope = { ...scope };
  for (const [key, value] of Object.entries(overlay)) merged[key] = isPlainObject(scope[key]) && isPlainObject(value) ? { ...scope[key], ...value } : value;
  return merged;
};
const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const rightOf = (kind: string) => (kind === "read" ? "view" : kind);

/** Düğmenin çalıştırılabilir eylemi: sorgu, kayıt dizisi, pencere ya da iş akışı; eylemi yoksa null. */
function buttonActionOf(props: Record<string, unknown>, queryById: Record<string, PageQueryDefinition>, dialogIds: Set<string>, inputIds: ReadonlySet<string>): ButtonAction | null {
  if (props.actionType === "workflow") return typeof props.workflowId === "string" && props.workflowId.trim() !== "" ? { type: "workflow", rights: [] } : null;
  if (props.actionType === "query") {
    const query = typeof props.queryId === "string" ? queryById[props.queryId] : undefined;
    return query ? { type: "query", rights: [rightOf(query.kind)], query } : null;
  }
  if (props.actionType === "sequence") {
    const steps = idList(props.saveSequence, 8).map((id) => queryById[id]);
    if (steps.length === 0 || steps.some((query) => !query || query.kind === "read")) return null;
    return { type: "sequence", rights: [...new Set(steps.map((query) => query!.kind))] };
  }
  if (props.actionType === "openDialog") return typeof props.dialogId === "string" && dialogIds.has(props.dialogId) ? { type: "openDialog", rights: ["view"] } : null;
  // Giriş ataması yalnız sayfa durumunu değiştirir (veri yazmaz): her ataması sayfadaki bir girişe gitmeli.
  if (props.actionType === "setInput") return assignmentsValid(props.assignments, inputIds) ? { type: "setInput", rights: ["view"] } : null;
  // Gezinme (bağlantı, ERP ekranı, sayfa) veri yazmaz; hedef tıklamada kapsamla çözülür ve yeniden doğrulanır.
  if (isNavigationType(props.actionType)) {
    const target = props.actionType === "link" ? props.href : props.actionType === "erpPage" ? props.pageKey : props.pageCode;
    return typeof target === "string" && target !== "" ? { type: "navigate", rights: ["view"] } : null;
  }
  return null;
}
const actionAllowed = (action: ButtonAction | null, rights: Record<string, boolean | undefined>) => !!action && action.rights.every((right) => rights[right] === true);
const NO_OPERATION_RIGHT = "Bu işlem için yetkiniz yok";
/** Sorgu eylemi, bağlı ERP işleminin katalog izni (`allowed === false`) yüzünden çalışamaz: düğme nedenli pasif çizilir. */
const operationBlocked = (action: ButtonAction | null | undefined, runtime: Pick<PageRuntime, "queryAllowed">) =>
  action?.type === "query" && !!action.query && !runtime.queryAllowed(action.query.id);
/** İstemli (promptLabel) yazma ya da dizi düğmesi `runSaveSequence` ile çalışır; düz sorgu düğmesi Faz A yolunu korur. */
const usesSequence = (action: ButtonAction | null, props: Record<string, unknown>) =>
  !!action && (action.type === "sequence" || (action.type === "query" && action.query!.kind !== "read" && textValue(props.promptLabel).trim() !== ""));

const bindProps = (props: Record<string, unknown>, scope: PageScope): Record<string, unknown> => {
  const bound = { ...props };
  for (const key of BINDABLE_PROPS) if (typeof bound[key] === "string") bound[key] = interpolate(bound[key] as string, scope);
  return bound;
};

const cellText = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number" && Number.isFinite(value)) return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

/** Sayı (öndeki sıfırsız tamsayı ya da ondalık): gösterge açıklamasında `format` ile yazılır; kod gibi "0012" dokunulmaz. */
const PLAIN_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
/**
 * Göstergenin açıklaması: `descriptionFormat` (number/money) verilmişse bağlamaların sayı çözülenleri o biçimle yazılır
 * (ör. "matrah {{onizleme.meta.taxableTotal}}" → "matrah 2.000,00"); metin bağlamaları olduğu gibi kalır. Biçimsiz açıklama
 * (ör. "+ {{x.digerDovizSayisi}} dövizde" sayacı) düz çözülür.
 */
export function metricDescription(raw: unknown, format: unknown, scope: PageScope): string {
  const template = textValue(raw);
  if (format !== "money" && format !== "number") return interpolate(template, scope);
  return interpolateWith(template, scope, (text) => (PLAIN_NUMBER.test(text) ? formatCell(Number(text), format) : text));
}

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const sessionUser = (token: string) => {
  let id = "";
  let rol = "";
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { sub?: unknown; role?: unknown };
    id = String(claims.sub ?? "");
    // `role` talebi dizi olabilir: ilk öğe kullanılır; yoksa boş.
    const role = Array.isArray(claims.role) ? claims.role[0] : claims.role;
    rol = typeof role === "string" ? role : "";
  } catch { /* geçersiz belirteç: kimlik ve rol boş kalır */ }
  let name = "";
  try { name = localStorage.getItem("aierp.user") ?? ""; } catch { /* depolama kapalı */ }
  return { id, ad: name, rol };
};

/** Belirtecin firma talebi (`tenant_id`); yoksa ya da okunamazsa boş. */
const sessionTenant = (token: string) => {
  try {
    const payload = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { tenant_id?: unknown };
    return typeof claims.tenant_id === "string" ? claims.tenant_id : "";
  } catch { return ""; }
};

/** v2 bileşen koşulları (`visibleWhen`, `disabledWhen`) sayfa kapsamında; v1'de (çalışma zamanı yok) her şey görünür ve etkindir. */
const componentVisible = (component: ComponentDefinition, runtime?: PageRuntime) =>
  !runtime || conditionHolds(component.props?.visibleWhen, runtime.scope, true);
/** Veri yazan düğme eylemi (yazma sorgusu, kayıt dizisi, iş akışı): görüntüleme kipinde kilitlidir. */
const actionWrites = (action: ButtonAction | null) =>
  !!action && (action.type === "sequence" || action.type === "workflow" || (action.type === "query" && !!action.query && action.query.kind !== "read"));
/**
 * Görüntüleme kipi (`mode=view`, İşlem Çubuğu Görüntüle): girişler, düzenlenebilir tablolar, özel alan blokları ve veri yazan
 * düğmeler kilitlidir; gezinen, pencere açan ve okuyan düğmeler çalışır.
 */
const viewModeLocked = (component: ComponentDefinition, runtime?: PageRuntime) =>
  !!runtime?.readOnly && (component.type === "input" || component.type === "editableGrid" || component.type === "customFieldsBlock"
    || (component.type === "button" && actionWrites(runtime.buttonAction(component))));
const componentDisabled = (component: ComponentDefinition, runtime?: PageRuntime) =>
  !!runtime && (component.type === "button" || component.type === "input" || component.type === "editableGrid" || component.type === "customFieldsBlock")
  && (viewModeLocked(component, runtime) || conditionHolds(component.props?.disabledWhen, runtime.scope, false));
/** Pasif bileşenin nedeni: görüntüleme kipi kilidi, yoksa bileşenin `disabledReason`'ı. */
const disabledReasonOf = (component: ComponentDefinition, props: Record<string, unknown>, runtime?: PageRuntime) =>
  viewModeLocked(component, runtime) ? VIEW_MODE_REASON : textValue(props.disabledReason).trim();
/** İşlem Çubuğu `commandWhen`: komutun koşulu `visibleWhen` ile aynı değerlendiriciyle sayfa kapsamında; koşulsuz komut görünür. */
const barCommandVisible = (barProps: Record<string, unknown>, scope: PageScope) => {
  const when = commandWhenOf(barProps);
  return (id: BarCommandId) => when[id] === undefined || conditionHolds(when[id], scope, true);
};
const BUTTON_UNAVAILABLE = "Bu işlem şu anda kullanılamaz.";

const flattenComponents = (components: ComponentDefinition[]): ComponentDefinition[] =>
  components.flatMap((component) => [component, ...flattenComponents(component.children ?? [])]);

const rawInputDefault = (inputType: string, defaultValue: string): InputRaw =>
  inputType === "checkbox" ? /^(true|1|evet)$/i.test(defaultValue.trim()) : defaultValue;

/** Giriş değerini bağlama kapsamındaki türüne çevirir: sayı → number|null, onay kutusu → boolean. */
const scopeInputValue = (inputType: string, raw: InputRaw): unknown => {
  if (inputType === "checkbox") return raw === true;
  if (typeof raw !== "string") return null;
  if (inputType === "number") { const parsed = raw.trim() === "" ? Number.NaN : Number(raw); return Number.isFinite(parsed) ? parsed : null; }
  // Tarih + saat: yerel ham metin (veya kaynaktan gelen ISO) UTC ISO 8601'e; boş/geçersiz → null.
  if (inputType === "datetime") return toIsoDateTime(raw);
  return raw;
};


// Tasarım dili varsayılanları (kart iç boşluğu 12px, köşe 8px); Studio tuvali aynı değerleri kullanır.
const DEFAULT_BLOCK_PADDING = 12;
const DEFAULT_RADIUS = 8;
const visualStyle = (type: string, props: Record<string, unknown>): CSSProperties => {
  const bounded = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = value == null || value === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  const span = bounded(props.width, type === "metric" ? 3 : type === "heading" || type === "text" || type === "label" || type === "divider" || type === "spacer" || type === "formCard" || type === "tabs" || type === "filterChips" || type === "actionBar" || type === "editableGrid" || type === "customFieldsBlock" || type === "filterBar" || type === "steps" || type === "recordHeader" ? 12 : type === "facetPanel" ? 3 : type === "contextPanel" ? 4 : 6, 1, 12);
  const number = (key: string, fallback: number, max: number) => bounded(props[key], fallback, 0, max);
  const color = (key: string) => typeof props[key] === "string" && /^#[\da-f]{6}$/i.test(props[key] as string) ? props[key] as string : undefined;
  return {
    // Süzgeç alanı her zaman yeni bir satırda başlar: üstündeki göstergeler satırı doldurmasa da yanlarına kaymaz.
    gridColumn: `${type === "filterBar" ? "1 / " : ""}span ${Math.max(1, Math.min(12, span))}`,
    margin: `${number("margin", 0, 64)}px`,
    padding: `${number("padding", ["card", "section", "dataTable", "metric", "form", "alert", "list", "progress", "formCard", "facetPanel", "contextPanel", "tabs", "editableGrid", "customFieldsBlock", "recordHeader"].includes(type) ? DEFAULT_BLOCK_PADDING : 0, 64)}px`,
    backgroundColor: color("backgroundColor"),
    color: color("textColor"),
    borderRadius: `${number("borderRadius", DEFAULT_RADIUS, 32)}px`,
    // ERP kabuğunun eski `[class*="-card"]`/`-panel` köşe kuralı !important; seçilen köşe bu değişkenle korunur.
    ["--tp-radius" as string]: `${number("borderRadius", DEFAULT_RADIUS, 32)}px`,
  };
};

/**
 * `widthWhen: "8=koşul"`: koşul tutunca bileşenin sütun genişliği verilen değerdir (ör. satır seçilince liste 8, yan panel 4).
 * Biçimi bozuk veya koşulu tutmayan değer stili değiştirmez.
 */
const withConditionalWidth = (style: CSSProperties, raw: unknown, scope: PageScope | undefined): CSSProperties => {
  if (!scope || typeof raw !== "string") return style;
  const match = /^([1-9]|1[0-2])=([\s\S]+)$/.exec(raw);
  return match && conditionHolds(match[2], scope, false) ? { ...style, gridColumn: `${String(style.gridColumn ?? "").startsWith("1 / ") ? "1 / " : ""}span ${match[1]}` } : style;
};

/** `valueLabels: ["kolon:değer=Etiket"]`: kolon başına ham değerin gösterilen etiketi (ör. "stockItem.trackingMode:None=Yok"). */
const parseValueLabels =(value: unknown): Record<string, Record<string, string>> => {
  const map: Record<string, Record<string, string>> = {};
  if (!Array.isArray(value)) return map;
  for (const item of value) {
    const match = typeof item === "string" ? /^([^=:]{1,128}):([^=]{0,60})=([^=]{1,60})$/.exec(item) : null;
    if (match) (map[match[1]] ??= {})[match[2]] = match[3];
  }
  return map;
};

/** "anahtar=değer" listesi (columnLabels, columnUnits); ilk "=" ayraçtır, bozuk öğe atlanır. */
const pairMap = (value: unknown): Record<string, string> => Object.fromEntries((Array.isArray(value) ? value : []).flatMap((item) => {
  const text = typeof item === "string" ? item : "";
  const at = text.indexOf("=");
  return at > 0 && at < text.length - 1 ? [[text.slice(0, at), text.slice(at + 1)]] : [];
}));

/** Hücre değeri: eşleşen değer etiketi varsa o, yoksa biçimlenmiş değer. */
const labeledCell = (labels: Record<string, Record<string, string>>, code: string, value: unknown, format?: ColumnFormat, dataType?: string) => {
  const own = labels[code];
  const key = value == null ? "" : typeof value === "object" ? null : String(value);
  return own && key !== null && Object.prototype.hasOwnProperty.call(own, key) ? own[key] : formatCell(value, format, dataType);
};

function EmbeddedCustomForm({ form, token }: { form: EmbeddedForm; token: string }) {
  const [values, setValues] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.code, field.defaultValue ?? (field.dataType === "Boolean" ? "false" : "")])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const isVisible = (field: DynamicField) => !field.visibleWhenFieldCode || field.visibleWhenValue == null
    || values[field.visibleWhenFieldCode]?.trim() === field.visibleWhenValue.trim()
    || (form.fields.find((source) => source.code === field.visibleWhenFieldCode)?.dataType === "Decimal"
      && Number(values[field.visibleWhenFieldCode]) === Number(field.visibleWhenValue));
  const isRequired = (field: DynamicField) => field.isRequired || (!!field.requiredWhenFieldCode
    && field.requiredWhenValue != null && (values[field.requiredWhenFieldCode]?.trim() === field.requiredWhenValue.trim()
      || (form.fields.find((source) => source.code === field.requiredWhenFieldCode)?.dataType === "Decimal"
        && Number(values[field.requiredWhenFieldCode]) === Number(field.requiredWhenValue))));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/api/custom-forms/${form.id}/submissions`, token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }),
      });
      setSubmitted(true);
    } catch (cause) { setError((cause as Error).message || "Form gönderilemedi."); }
    finally { setBusy(false); }
  };
  if (submitted) return <section className="tenant-page-block tenant-page-form tenant-page-form-success" role="status"><h3>{form.name}</h3><p>Formunuz gönderildi.</p></section>;
  return <form className="tenant-page-block tenant-page-form" onSubmit={(event) => void submit(event)}>
    <h3>{form.name}</h3>{form.description && <p>{form.description}</p>}
    {form.fields.filter(isVisible).map((field) => {
      const required = isRequired(field);
      return <label className="tenant-page-form-field" key={field.code}>
        <span>{field.label}{required && <b aria-hidden="true"> *</b>}</span>
        {field.dataType === "Boolean" ? <input type="checkbox" checked={values[field.code] === "true"} onChange={(event) => setValues((current) => ({ ...current, [field.code]: String(event.target.checked) }))} />
          : field.dataType === "Choice" ? <select required={required} value={values[field.code] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.code]: event.target.value }))}><option value="">Seçin</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : field.isMultiline ? <textarea required={required} minLength={field.minLength || undefined} maxLength={field.maxLength || undefined} placeholder={field.placeholder ?? ""} value={values[field.code] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.code]: event.target.value }))} />
          : <input required={required} minLength={field.dataType === "Text" ? field.minLength || undefined : undefined} maxLength={field.dataType === "Text" ? field.maxLength || undefined : undefined} min={field.dataType === "Decimal" ? field.minValue ?? undefined : field.dataType === "Date" ? field.minDate ?? undefined : undefined} max={field.dataType === "Decimal" ? field.maxValue ?? undefined : field.dataType === "Date" ? field.maxDate ?? undefined : undefined} type={field.dataType === "Date" ? "date" : field.dataType === "Decimal" ? "number" : "text"} step={field.dataType === "Decimal" ? "any" : undefined} placeholder={field.placeholder ?? ""} value={values[field.code] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.code]: event.target.value }))} />}
        {field.helpText && <small>{field.helpText}</small>}
      </label>;
    })}
    {error && <p className="tenant-page-form-error" role="alert">{error}</p>}
    <button className="tenant-page-submit" type="submit" disabled={busy}>{busy ? "Gönderiliyor…" : "Gönder"}</button>
  </form>;
}

function QueryError({ message }: { message: string }) {
  return <div className="tenant-custom-page-error tenant-page-query-error" role="alert"><AlertCircle size={16} /><span>{message}</span></div>;
}

type MetricExtras = Pick<ComponentProps<typeof MetricCard>, "tone" | "icon" | "trend" | "active" | "onActivate">;

const MANUAL_QUERY_IDLE = "Bu sorgu elle çalıştırılır.";
/** Elle çalışan ve henüz hiç çalışmamış sorgu (yükleme sorguları açılışta yüklenme durumuyla başlar). */
const neverRan = (state: QueryState) => !state.ran && !state.loading && !state.error;

function QueryMetric({ state, title, description, style, count, ...card }: { state: QueryState; title: string; description: string; style: CSSProperties; count?: number | null } & MetricExtras) {
  const first = state.columns[0]?.code;
  // `countWhen` varsa değer koşulu sağlayan yüklenmiş satır sayısıdır; yoksa ilk satırın ilk sütunu.
  const value = count !== undefined ? countText(count) : state.rows.length > 0 && first ? cellText(state.rows[0][first]) : "—";
  return <MetricCard title={title} description={description} style={style} hasError={!!state.error} {...card}
    value={state.loading ? <strong className="tenant-report-status" role="status">Yükleniyor…</strong> : state.error ? <QueryError message={state.error} />
      : neverRan(state) ? <strong className="tenant-report-status" role="status">{MANUAL_QUERY_IDLE}</strong> : <strong>{value}</strong>} />;
}

export function QueryTable({ state, columns, title, description, style, selected, onSelect, onOpenRow, formats = parseColumnFormats(undefined), toneMap = [], totals = [], density = "dense", paging, rowActions = [], emptyText = "", limit, status = null, valueLabels = {}, columnLabels = {}, columnUnits = {} }: {
  state: QueryState; columns: string[]; title: string; description: string; style: CSSProperties;
  /** Kolon başına ham değer → gösterilen etiket (`valueLabels`). */
  valueLabels?: Record<string, Record<string, string>>;
  /** Kolon → başlık (`columnLabels`) ve kolon → aynı satırdaki birim kolonu (`columnUnits`). */
  columnLabels?: Record<string, string>; columnUnits?: Record<string, string>;
  selected?: Record<string, unknown> | null; onSelect?: (row: Record<string, unknown> | null, options?: { user?: boolean }) => void;
  /** Satıra çift tıklama (Aç); verilmezse çift tıklama yalnız seçimi değiştirir. */
  onOpenRow?: (row: Record<string, unknown>) => void;
  formats?: Record<string, ColumnFormat>; toneMap?: { key: string; tone: Tone }[]; totals?: string[]; density?: "dense" | "comfort";
  /** Sunucu sayfalı liste: sonuç her zaman "kesilmiş"tir; uyarı yerine sayfa alt satırı gösterilir. */
  paging?: TablePaging;
  /** Satır işlemleri: en az biri çizilen bir satırda görünürse son sütun "İşlemler" eklenir. */
  rowActions?: RowAction[];
  /** Boş liste metni: elle çalışan sorgunun bekleme metninin ve boş sonuç metninin yerine geçer. */
  emptyText?: string;
  /** Yalnız ilk `limit` satır çizilir (toplamlar da çizilen satırlardan). */
  limit?: number;
  /** Satır işleminin sonucu. */
  status?: ActionStatus | null;
}) {
  // Seçilen sütunlar tasarımcının seçim sırasıyla çizilir (sorgunun sütun sırasıyla değil); başlık `columnLabels` ile değişebilir.
  const chosen = columns.length > 0 ? columns.flatMap((code) => state.columns.filter((column) => column.code === code)
    .map((column) => columnLabels[code] ? { ...column, label: columnLabels[code] } : column)) : [];
  const visible = (chosen.length > 0 ? chosen : state.columns).slice(0, 20);
  const hasTotals = visible.some((column) => totals.includes(column.code));
  const drawn = limit !== undefined ? state.rows.slice(0, limit) : state.rows;
  const actionsShown = rowActions.length > 0 && drawn.some((row) => rowActions.some((action) => action.visible(row)));
  // Yeni sonuç gelince eski satır nesnesi geçersizdir: aynı kimlikli satır (ör. Yenile) varsa seçim ona geçer, yoksa kalkar.
  // Böylece açık kayıt penceresi yenilemeden sonra da aynı kaydı günceller.
  useEffect(() => {
    if (!selected || state.rows.includes(selected)) return;
    const identity = rowIdentity(selected);
    const same = identity === null ? undefined : state.rows.find((row) => rowIdentity(row) === identity);
    onSelect?.(same ?? null);
  }, [state.rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (row: Record<string, unknown>) => onSelect?.(selected === row ? null : row, { user: true });
  // Kod sütunu bölünmez, metin sütunu en az okunur genişlikte kalır: dar tabloda sözcükler harf harf kırılmaz.
  const cellClass = (column: { code: string; dataType?: string }) => {
    const format = formats[column.code];
    const right = isRightAligned(format, column.dataType);
    const isText = !right && (format === "text" || (format === undefined && (column.dataType ?? "text") === "text"));
    return [right ? "num" : "", format === "code" ? "code" : "", isText ? "is-text" : ""].filter(Boolean).join(" ") || undefined;
  };
  const renderCell = (column: { code: string; dataType?: string }, row: Record<string, unknown>) => {
    const value = labeledCell(valueLabels, column.code, row[column.code], formats[column.code], column.dataType);
    const unit = columnUnits[column.code] ? displayText(row[columnUnits[column.code]]) : "";
    const text = unit && value !== "—" ? `${value} ${unit}` : value;
    if (formats[column.code] !== "status" || text === "—") return text;
    const tone = toneFor(text, toneMap);
    return <span className={`tenant-page-tag${tone ? ` tone-${tone}` : ""}`}>{text}</span>;
  };
  const totalLabel = paging ? `Sayfa toplamı · ${drawn.length} kayıt`
    : state.truncated ? `Toplam · ilk ${drawn.length} satır` : `Toplam · ${drawn.length} kayıt`;
  // Satır işlemi tıklaması (ve klavyesi) satır seçimini değiştirmez; satırı işlem kendisi seçer.
  const actionCell = (row: Record<string, unknown>) => <td className="tenant-page-row-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    {rowActions.filter((action) => action.visible(row)).map((action) => {
      const reason = action.disabled(row);
      return <button key={action.id} type="button" className="tenant-page-row-action" disabled={reason !== null} title={reason ?? undefined}
        onClick={(event) => { event.stopPropagation(); action.run(row, event.currentTarget); }}>{action.label}</button>;
    })}
  </td>;
  return <section className={`tenant-page-block tenant-page-table tenant-page-report-widget ${state.error ? "is-error" : ""}`} style={style}>
    {title && <h3>{title}</h3>}
    {description && <p>{description}</p>}
    {/* Arama girişi yükleme sırasında da yerinde kalır (yazarken odak kaybolmasın). */}
    {paging?.search && <div className="tenant-page-table-search">{paging.search}</div>}
    {state.loading ? <div className="tenant-report-state" role="status">Yükleniyor…</div>
      : state.error ? <QueryError message={state.error} />
        : neverRan(state) ? <div className="tenant-report-state" role="status">{emptyText || MANUAL_QUERY_IDLE}</div>
        : <div className="tenant-page-table-scroll"><table className={density === "comfort" ? "is-comfort" : undefined}>
          <thead><tr>{visible.map((column) => <th scope="col" key={column.code} className={isRightAligned(formats[column.code], column.dataType) ? "num" : undefined}>{column.label || column.code}</th>)}
            {actionsShown && <th scope="col" className="tenant-page-row-actions">İşlemler</th>}</tr></thead>
          <tbody>
            {drawn.length === 0 && <tr><td colSpan={Math.max(1, visible.length)} className="tenant-report-state">{emptyText || "Gösterilecek kayıt bulunamadı."}</td></tr>}
            {drawn.map((row, index) => <tr key={index} className={onSelect ? `tenant-page-row-selectable${selected === row ? " is-selected" : ""}` : undefined}
              aria-selected={onSelect ? selected === row : undefined} tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => toggle(row) : undefined}
              onDoubleClick={onOpenRow ? () => onOpenRow(row) : undefined}
              onKeyDown={onSelect ? (event) => {
                // Enter bir sayfa komutunu (Aç) çalıştırdıysa satır seçimi değişmez: açılan kayıt seçili kalır.
                if (event.defaultPrevented) return;
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(row); }
              } : undefined}>
              {visible.map((column) => <td key={column.code} className={cellClass(column)}>{renderCell(column, row)}</td>)}
              {actionsShown && actionCell(row)}
            </tr>)}
          </tbody>
          {hasTotals && drawn.length > 0 && <tfoot><tr className="tenant-page-total">
            {visible.map((column, index) => {
              const total = totals.includes(column.code) ? columnTotal(drawn, column.code) : null;
              const inTotals = totals.includes(column.code);
          const text = total !== null ? formatCell(total, formats[column.code] === "money" ? "money" : "number") : inTotals ? "—" : "";
              if (index === 0 && total !== null) return <td key={column.code}><span className="tenant-page-total-label">{totalLabel}</span><span className="num">{text}</span></td>;
              return <td key={column.code} className={total !== null ? "num" : undefined}>{index === 0 ? totalLabel : text}</td>;
            })}
            {actionsShown && <td />}
          </tr></tfoot>}
        </table></div>}
    {status && <p className={`tenant-page-action-feedback is-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>{status.text}</p>}
    {!paging && !state.loading && !state.error && state.truncated && <p className="tenant-page-truncated" role="status">İlk 5.000 satır gösteriliyor.</p>}
    {paging && !state.error && !neverRan(state) && <PagedTableFooter page={paging.page} pageSize={paging.pageSize} total={state.rowCount}
      meta={paging.meta} onPage={paging.onPage} loading={state.loading} />}
  </section>;
}

/** Durum rozeti: değer toneMap ile eşleşirse o ton, yoksa variant geri dönüş tonudur. */
export function PageBadge({ text, variant, toneMap, style }: { text: string; variant?: unknown; toneMap?: unknown; style?: CSSProperties }) {
  const fallback = ["success", "warning", "danger", "info"].includes(textValue(variant)) ? textValue(variant) : "info";
  const tone = toneFor(text, parseToneMap(toneMap)) ?? fallback;
  return <span className={`tenant-page-badge tone-${tone}`} style={style}>{text}</span>;
}

/**
 * Yazma hatasının metni. 400/403/409 yanıtlarında sunucunun nedeni (ProblemDetails `detail`/`title`) her zaman gösterilir:
 * yapılandırılmış hata mesajı varsa "{mesaj} ({sunucu})" biçiminde, yoksa yalnız sunucu mesajı.
 */
function writeErrorText(configured: string, cause: unknown): string {
  const failure = cause as Error & { status?: number; serverError?: string };
  const server = failure.status === 400 || failure.status === 403 || failure.status === 409 ? (failure.serverError || failure.message || "").trim() : "";
  if (configured) return server ? `${configured} (${server})` : configured;
  return failure.serverError || failure.message || "İşlem tamamlanamadı.";
}

/**
 * Eylemli düğme (sorgu, kayıt dizisi, pencere): hak yoksa gizlenir; yazma türünde isteğe bağlı onay sorar, çalışırken pasif
 * kalır ve sonucu bildirir. İstemli yazma ve dizi `runtime.runSequence` ile, düz sorgu Faz A yoluyla çalışır.
 */
function QueryActionButton({ component, props, label, runtime, disabled: conditionDisabled = false, disabledReason: conditionReason = "" }: {
  component: ComponentDefinition; props: Record<string, unknown>; label: ReactNode; runtime: PageRuntime; disabled?: boolean; disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionStatus | null>(null);
  const action = runtime.buttonAction(component);
  // Bağlı ERP işlemine katalog izni yoksa düğme yetki nedeniyle pasiftir.
  const blocked = operationBlocked(action, runtime);
  const disabled = conditionDisabled || blocked;
  const disabledReason = blocked ? NO_OPERATION_RIGHT : conditionReason;
  // ERP işlemi yazmaları da (SQL yazmaları gibi) sayfanın insert/update/delete hakkını ister; sunucu yalnız işlemin kendi iznine bakar, istemci bilerek daha sıkıdır.
  const allowed = actionAllowed(action, runtime.rights);
  const mounted = useRef(true);
  // Okuma yeniden çalıştırmada çift tıklamayı engeller; yazmalar sayfanın ortak kilidini (runtime.writeLock) kullanır.
  const inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!allowed || !action) return null;
  const query = action.query;
  const write = action.type === "sequence" || (!!query && query.kind !== "read");
  const refreshIds = stringList(props.refreshQueries);
  const bound = (key: string) => interpolate(textValue(props[key]), runtime.scope).trim();

  const click = async (opener: HTMLElement) => {
    if (disabled) return;
    setFeedback(null);
    if (action.type === "openDialog") { runtime.openDialog(props.dialogId as string, opener); return; }
    if (action.type === "setInput") { runtime.applyAssignments(component.props ?? {}, {}); return; }
    if (action.type === "navigate") {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const failure = await runNavigation(component.props ?? {}, runtime.currentScope, runtime.tabKey);
        if (failure && mounted.current) setFeedback({ tone: "error", text: failure });
      } finally { inFlight.current = false; }
      return;
    }
    if (usesSequence(action, props)) {
      await runtime.runSequence({
        props: component.props ?? {}, name: component.name,
        onStatus: (status) => { if (mounted.current) setFeedback(status); },
        onBusy: (next) => { if (mounted.current) setBusy(next); },
      });
      return;
    }
    if (!query) return;
    if (!write) {
      if (inFlight.current) return;
      inFlight.current = true;
      try { runtime.rerun([query.id]); } finally { inFlight.current = false; }
      return;
    }
    const result = await runWriteAction({
      query, isPreview: runtime.isPreview, inFlight: runtime.writeLock,
      confirm: {
        enabled: props.confirmEnabled === true, text: bound("confirmText"),
        tone: query.kind === "delete" || query.kind === "update" ? "danger" : "default",
      },
      write: async (target, confirmWrite) => {
        if (mounted.current) setBusy(true);
        try { return await runtime.writeFor(target, confirmWrite); } finally { if (mounted.current) setBusy(false); }
      },
      errorText: (cause) => writeErrorText(bound("errorMessage"), cause),
      validate: () => runtime.validateFor(query),
      ...codeWriteHooks(runtime.events),
    });
    if ("ok" in result && result.ok) {
      if (mounted.current) setFeedback({ tone: "success", text: `${bound("successMessage") || "İşlem tamamlandı."} (${result.affectedRows} kayıt)` });
      runtime.rerun(refreshIds);
    } else if ("error" in result) {
      if (mounted.current) setFeedback({ tone: "error", text: result.error });
    }
  };
  return <div className="tenant-page-query-action">
    <button className={`tenant-page-button${query && write && (query.kind === "delete" || query.kind === "update") ? " is-danger" : ""}`} type="button"
      disabled={busy || disabled} title={disabled && disabledReason ? disabledReason : undefined} onClick={(event) => void click(event.currentTarget)}>{busy ? "Çalışıyor…" : label}</button>
    {disabled && disabledReason && <small className="tenant-page-disabled-reason">{disabledReason}</small>}
    {feedback && <p className={`tenant-page-action-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p>}
  </div>;
}

/**
 * Seçim girişinin seçenekleri: önce sabit seçenekler (`staticOptions`, "değer=Etiket"), sonra optionsQuery satırları;
 * satır başına seçilen sütun değeri ve etiketi. Sayı sütunu için `row` korunur (sabit seçeneklerde boş satır). Açıklama sütunu
 * (`optionDescriptionColumn`) verilmişse etiket eski depo seçicileri gibi "etiket · açıklama" olur (ör. "D01 · Merkez").
 */
const selectOptions = (props: Record<string, unknown>, optionsState?: QueryState) => {
  const valueColumn = textValue(props.optionValueColumn) || optionsState?.columns[0]?.code || "";
  const labelColumn = textValue(props.optionLabelColumn) || valueColumn;
  const descriptionColumn = textValue(props.optionDescriptionColumn);
  const fixed = staticLookupOptions(props.staticOptions).map(({ value, label }) => ({ value, label, row: {} as Record<string, unknown> }));
  return [...fixed, ...(optionsState?.rows ?? []).map((row) => {
    const label = displayText(row[labelColumn]) || displayText(row[valueColumn]);
    const description = descriptionColumn ? displayText(row[descriptionColumn]).trim() : "";
    return { value: displayText(row[valueColumn]), label: description ? `${label} · ${description}` : label, row };
  })];
};

/**
 * `optionsWhen`: seçenek satırı koşulu; `satir` seçenek satırıdır, diğer yollar sayfa kapsamından çözülür. Tutmayan satırlar
 * gizlenir; `keep` tutan satırlar (ör. geçerli değerin satırı) her zaman kalır. Koşul yoksa durum olduğu gibi döner.
 */
const filterOptionRows = (state: QueryState | undefined, condition: unknown, scope: PageScope, keep?: (row: Record<string, unknown>) => boolean): QueryState | undefined => {
  if (!state || typeof condition !== "string" || condition.trim() === "") return state;
  const rows = state.rows.filter((row) => keep?.(row) || conditionHolds(condition, { ...scope, satir: row }, true));
  return rows.length === state.rows.length ? state : { ...state, rows };
};

/** Tekrar deneme kimliği (`autoId`): yeni bir GUID (randomUUID yoksa rastgele baytlardan sürüm 4). */
const newRequestId = (): string => {
  const source = globalThis.crypto;
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === "function") source.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const isAutoId = (input: ComponentDefinition | undefined) => input?.props?.autoId === true;
/** Seçeneğin görünen metni: "etiket · açıklama" (açıklama yoksa etiket). */
const optionText = (option: LookupOption) => (option.description ? `${option.label} · ${option.description}` : option.label);

/** İlk seçenek varsayılanı (`defaultFirst`) için girişin ilk boş olmayan seçeneği; seçenekler henüz yüklenmediyse null. */
const firstInputOption = (props: Record<string, unknown>, optionsState: QueryState | undefined): string | null => {
  if (optionsState?.loading) return null;
  const inputType = textValue(props.inputType, "text");
  const options = inputType === "lookup" ? lookupCandidates(props, optionsState, "", false) : inputType === "select" ? selectOptions(props, optionsState) : [];
  return firstChoiceValue(options);
};

/** Düğme simgeleri (`icon`): ör. detay panelinin "Aç" düğmesi. */
const BUTTON_ICONS: Record<string, LucideIcon> = { open: Maximize2 };

/**
 * Kart `variant: "panel"` — eski liste ekranlarının sağ detay paneli (InventoryStockDetailPanel): üst satırda kod
 * (`description`), başlıktan önceki düğmeler ve `closeInput` verilmişse ✕ (o onay kutusunu kapatır); başlık (`title`);
 * rozet alt bileşenleri etiket satırında; diğer alt bileşenler (ör. sekmeler) gövdede; gövdeden sonraki düğmeler altlıkta.
 */
function DetailPanel({ component, title, code, style, runtime, render, closeInput }: {
  component: ComponentDefinition; title: string; code: string; style: CSSProperties; runtime?: PageRuntime;
  render: (child: ComponentDefinition) => ReactNode; closeInput: string;
}) {
  const head: ReactNode[] = [], tags: ReactNode[] = [], body: ReactNode[] = [], foot: ReactNode[] = [];
  for (const child of component.children ?? []) {
    if (child.type === "badge") tags.push(render(child));
    else if (child.type === "button") (body.length > 0 ? foot : head).push(render(child));
    else body.push(render(child));
  }
  const canClose = !!runtime && !!closeInput && closeInput in runtime.inputById;
  return <aside className="tenant-page-detail" style={style} aria-label={title || undefined}>
    <div className="tenant-page-detail-head">
      <div className="tenant-page-detail-top">
        <span className="nx-code">{code}</span>
        <span className="tenant-page-detail-actions">
          {head}
          {canClose && <button type="button" className="tenant-page-detail-close" aria-label="Detay panelini kapat" onClick={() => runtime!.setInput(closeInput, false)}>
            <X size={15} aria-hidden="true" />
          </button>}
        </span>
      </div>
      {title && <h3>{title}</h3>}
      {tags.some(Boolean) && <div className="tenant-page-detail-labels">{tags}</div>}
    </div>
    <div className="tenant-page-detail-body">{body}</div>
    {foot.some(Boolean) && <div className="tenant-page-detail-foot">{foot}</div>}
  </aside>;
}

/** Durum şeridi (simgeli uyarı) simgeleri; sunucudaki AlertIcons ile aynı küme. */
const ALERT_STRIP_ICONS: Record<string, LucideIcon> = { shield: ShieldCheck, shieldAlert: ShieldAlert, check: CheckCircle2, alert: AlertTriangle, info: Info };

/** Tek satır süzgeç diziliminde onay kutusunu düz anahtar düğmesi olarak çizen simgeler (`icon`); simgesiz onay kutusu çiptir. */
const INLINE_TOGGLE_ICONS: Record<string, LucideIcon> = { panel: PanelRight, archive: Archive, eye: Eye, filter: Filter };

/**
 * `inline`: giriş, tek satırlık süzgeç diziliminde (form kartı `layout: "inline"`) eski liste araç satırının görünümüyle çizilir —
 * yer tutuculu metin girişi büyüteçli arama kutusu (`list-v2-search`), arama kutusu (lookup) açılır liste, onay kutusu çip
 * (`list-v2-chip`; `description` sayaç olur) ya da `icon` verilmişse düz anahtar düğmesi (eski "Detay paneli" düğmesi).
 */
export function PageInput({ component, props, raw, onChange, optionsState, style, error, disabled = false, onBlur, lookup, inline = false }: {
  component: ComponentDefinition; props: Record<string, unknown>; raw: InputRaw; onChange: (value: InputRaw) => void;
  optionsState?: QueryState; style: CSSProperties; error?: string; disabled?: boolean; onBlur?: () => void; lookup?: LookupBinding;
  inline?: boolean;
}) {
  const inputType = textValue(props.inputType, "text");
  const label = textValue(props.label);
  const inputId = `page-input-${component.id}`;
  // Zorunlu giriş (required veya tutan requiredWhen) etiketin ardında "*" ile işaretlenir (CSS ::after; erişilebilir ad değişmez).
  const requiredClass = props.required === true && inputType !== "checkbox" ? " is-required" : "";
  if (inputType === "lookup") {
    // Arama kutusu yalnız `required` kuralını destekler; bulanıklaşma sarmalayıcıda yakalanır (doğrulama iletisi için).
    return <div className={`tenant-page-input tenant-page-input-lookup${requiredClass}${error ? " is-invalid" : ""}`} style={style} onBlur={onBlur}>
      <LookupInput inputId={inputId} label={label} raw={typeof raw === "string" ? raw : ""} placeholder={textValue(props.placeholder)}
        allowClear={props.allowClear === true} disabled={disabled} options={lookup?.options ?? []} loading={lookup?.loading ?? false}
        error={lookup?.error} selected={lookup?.selected} onChange={(value, row, chosenLabel) => (lookup ? lookup.onChange(value, row, chosenLabel) : onChange(value))}
        onSearch={(text) => lookup?.onSearch(text)} appearance={inline ? "select" : "search"} />
      {error && <small className="tenant-page-input-error" role="alert">{error}</small>}
    </div>;
  }
  const rules = inputRules(props);
  const invalid = !!error;
  // Erişilebilir ad sarmalayan etiketten de gelir; `aria-label` onu etiket ağacını izlemeyen araçlar (ve tarih girişinin
  // parçalı denetimi) için de açık kılar.
  const common = { id: inputId, required: rules.required || undefined, "aria-invalid": invalid || undefined, "aria-label": label || undefined, onBlur };
  const limit = (value: number | string | undefined) =>
    value === undefined ? undefined : inputType === "number" ? (typeof value === "number" ? value : undefined) : inputType === "date" ? (typeof value === "string" ? value : undefined) : undefined;
  let control;
  if (inputType === "checkbox") {
    control = <input {...common} type="checkbox" checked={raw === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />;
  } else if (inputType === "select" && props.searchable === true) {
    // Aranabilir açılır liste: yazarak süzülen seçenekler; sarmalayıcı arama kutusunun sınıflarını taşır (aynı görünüm).
    return <div className={`tenant-page-input tenant-page-input-lookup tenant-page-input-searchable${requiredClass}${invalid ? " is-invalid" : ""}`} style={style} onBlur={onBlur}>
      <SearchableSelect inputId={inputId} label={label} value={typeof raw === "string" ? raw : ""} choices={selectOptions(props, optionsState)}
        emptyLabel={optionsState && neverRan(optionsState) && !optionsState.loading ? MANUAL_QUERY_IDLE : selectOptions(props, optionsState).find((option) => option.value === "")?.label || "Seçin"} loading={Boolean(optionsState?.loading)}
        disabled={disabled} onChange={(next) => onChange(next)} />
      {optionsState?.error && <QueryError message={optionsState.error} />}
      {error && <small className="tenant-page-input-error" role="alert">{error}</small>}
    </div>;
  } else if (inputType === "select") {
    const options = selectOptions(props, optionsState);
    const current = typeof raw === "string" ? raw : "";
    // Seçeneklerde olmayan geçerli değer (ör. listeden kaldırılmış kategori) silinmez; kendi seçeneğiyle gösterilir.
    const orphan = current !== "" && !optionsState?.loading && !options.some((option) => option.value === current);
    // Boş değerli bir sabit seçenek (ör. "=Türkiye (varsayılan)") varsa "Seçin" eklenmez: boş değer tek seçenekle gösterilir.
    const loading = Boolean(optionsState?.loading);
    const ownEmpty = !loading && options.some((option) => option.value === "");
    control = <select {...common} value={current} disabled={disabled || loading} onChange={(event) => onChange(event.target.value)}>
      {!ownEmpty && <option value="">{loading ? "Yükleniyor…" : "Seçin"}</option>}
      {options.filter((option) => !loading || option.value !== "").map((option, index) => <option key={`${index}-${option.value}`} value={option.value}>{option.label}</option>)}
      {orphan && <option value={current}>{current}</option>}
    </select>;
  } else {
    const htmlType = inputType === "number" || inputType === "date" ? inputType : inputType === "datetime" ? "datetime-local" : "text";
    // Tarih + saat girişi kaynaktan gelen ISO değeri yerel saatle gösterir; ham değer kullanıcı değiştirene kadar ISO kalır.
    const shown = typeof raw !== "string" ? "" : inputType === "datetime" ? toLocalInputText(raw) : raw;
    control = <input {...common} type={htmlType} disabled={disabled}
      step={inputType === "number" ? rules.step ?? "any" : undefined} min={limit(rules.min)} max={limit(rules.max)}
      maxLength={htmlType === "text" ? rules.maxLength : undefined}
      placeholder={textValue(props.placeholder)} value={shown} onChange={(event) => onChange(applyTyping(rules, event.target.value))} />;
  }
  // Etiket girişi sarar ve `htmlFor` taşımaz: açık tutulan sekmelerde aynı bileşen kimliği (`page-input-kod`) birden çok sayfada
  // bulunabilir; `for` belgedeki ilk kimliğe (gizli sekmedeki girişe) gider ve görünen giriş adsız kalırdı.
  let field = <label>{label && <span>{label}</span>}{control}</label>;
  if (inline && inputType === "checkbox") {
    const Icon = INLINE_TOGGLE_ICONS[textValue(props.icon)];
    const count = textValue(props.description);
    const active = raw === true ? " is-active" : "";
    field = Icon
      ? <label className={`tenant-page-toggle${active}`}>{control}<Icon size={15} aria-hidden="true" /><span>{label}</span></label>
      : <label className={`list-v2-chip${active}`}>{control}<span>{label}</span>
        {count && <>{" "}<span className="list-v2-chip-count">{count}</span></>}</label>;
  } else if (inline && inputType === "text" && textValue(props.placeholder)) {
    field = <label className="list-v2-search"><Search size={16} aria-hidden="true" />{label && <span>{label}</span>}{control}</label>;
  } else if (inline) {
    field = <label className="list-v2-filter">{label && <span>{label}</span>}{control}</label>;
  }
  return <div className={`tenant-page-input tenant-page-input-${inputType}${requiredClass}${invalid ? " is-invalid" : ""}`} style={style}>
    {field}
    {inputType === "select" && optionsState?.error && <QueryError message={optionsState.error} />}
    {error && <small className="tenant-page-input-error" role="alert">{error}</small>}
  </div>;
}

/** `requiredWhen` koşulu tutan giriş zorunludur (ör. yalnız kayıtlı kart düzenlenirken); kural `required` gibi uygulanır. */
const withConditionalRequired = (props: Record<string, unknown>, raw: Record<string, unknown> | undefined, scope: PageScope) =>
  props.required !== true && conditionHolds(raw?.requiredWhen, scope, false) ? { ...props, required: true } : props;

function renderPageInput(component: ComponentDefinition, boundProps: Record<string, unknown>, style: CSSProperties, runtime?: PageRuntime, inline = false) {
  // `hidden`: giriş hiç çizilmez, değeri (varsayılan ve sayfa parametresi bağlaması dahil) kapsamda kalır.
  if (!componentVisible(component, runtime) || component.props?.hidden === true) return null;
  const props = runtime ? withConditionalRequired(boundProps, component.props, runtime.scope) : boundProps;
  // İstemci doğrulama iletisi sunucunun alan hatasından önce gelir.
  const error = runtime ? runtime.validationErrors[component.id] ?? (component.name ? runtime.inputErrors[component.name] : undefined) : undefined;
  return <PageInput key={component.id} component={component} props={props} style={style}
    raw={runtime?.inputValues[component.id] ?? ""} onChange={(next) => runtime?.changeInput(component.id, next)}
    error={error} disabled={componentDisabled(component, runtime)} onBlur={runtime ? () => runtime.blurInput(component.id) : undefined}
    optionsState={runtime ? runtime.inputOptions(component) : undefined}
    lookup={runtime && textValue(props.inputType, "text") === "lookup" ? runtime.lookupFor(component, props) : undefined} inline={inline} />;
}

/** Sayfa düğmesi (üst düzeyde ya da kayıt özetinin sağında): eylemli düğme, iş akışı ya da pasif düğme. */
function renderPageButton(component: ComponentDefinition, props: Record<string, unknown>, style: CSSProperties, token: string, pageCode: string, runtime?: PageRuntime): ReactNode {
  const text = textValue(props.text ?? props.label);
  const title = textValue(props.title);
  const disabled = componentDisabled(component, runtime);
  const reason = disabled ? disabledReasonOf(component, props, runtime) : "";
  const workflow = props.actionType === "workflow" && typeof props.workflowId === "string";
  const action = runtime?.buttonAction(component);
  return <div className="tenant-page-action" style={style} key={component.id}>
    {runtime && action && action.type !== "workflow"
      ? <QueryActionButton component={component} props={props} label={BUTTON_ICONS[textValue(props.icon)] ? <>{createElement(BUTTON_ICONS[textValue(props.icon)], { size: 13, "aria-hidden": true })}<span>{text || title || "Eylem"}</span></> : text || title || "Eylem"} runtime={runtime} disabled={disabled} disabledReason={reason} />
      : workflow && !disabled
        ? <TenantWorkflowAction token={token} workflowId={props.workflowId as string} title={text || title || "İş akışını başlat"} pageCode={pageCode} componentId={component.id} />
        : <>
          <button className="tenant-page-button" type="button" disabled title={reason || undefined}>{text || title || (workflow ? "İş akışını başlat" : "Eylem")}</button>
          {reason && <small className="tenant-page-disabled-reason">{reason}</small>}
        </>}
  </div>;
}

/** `rowOpenAction` düğmesinin çalışabileceği eylemler (satıra çift tıklama / Enter). */
const ROW_OPEN_ACTIONS = new Set<ButtonAction["type"]>(["setInput", "navigate", "openDialog", "query"]);

function renderComponent(component: ComponentDefinition, forms: EmbeddedForm[], token: string, pageCode: string, runtime?: PageRuntime): ReactNode {
  // `visibleWhen` her şeyden önce uygulanır (formCard, sekmeler ve iç içe bileşenler dahil).
  if (!componentVisible(component, runtime)) return null;
  const props = runtime ? bindProps(component.props ?? {}, runtime.scope) : component.props ?? {};
  const style = withConditionalWidth(visualStyle(component.type, props), component.props?.widthWhen, runtime?.scope);
  const title = textValue(props.title);
  const text = textValue(props.text ?? props.label);
  const description = textValue(props.description);
  const value = textValue(props.value);
  const children = (component.children ?? []).map((child) => renderComponent(child, forms, token, pageCode, runtime));

  switch (component.type) {
    // `pageTitle`: başlık sayfa üst bilgisinde (h1) çizilir, gövdede tekrarlanmaz.
    case "heading": return runtime && component.props?.pageTitle === true ? null : <h2 key={component.id} className="tenant-page-heading" style={style}>{title || text}</h2>;
    // `parts`: boş bağlamalı parçalar (etiketleri ve ayraçlarıyla) düşer; varsa `text` yerine çizilir.
    case "text": return <p key={component.id} className="tenant-page-text" style={style}>{runtime && Array.isArray(component.props?.parts) ? joinTextParts(component.props.parts, runtime.scope) : text || description}</p>;
    case "label": return <p key={component.id} className="tenant-page-text tenant-page-label" style={style}>{text}</p>;
    case "input": return runtime?.ownedInputs.has(component.id) ? null : renderPageInput(component, props, style, runtime);
    case "formCard": {
      const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
      const owned = runtime ? idList(props.inputs).map((id) => runtime.inputById[id]).filter((input): input is ComponentDefinition => Boolean(input)) : [];
      const changes = runtime && props.trackChanges === true ? runtime.cardChanges(component) : 0;
      const inline = props.layout === "inline";
      return <FormCard key={component.id} title={title} columns={columns} style={style} meta={changes > 0 ? `${changes} değişiklik` : undefined} inline={inline}>
        {owned.map((input) => renderPageInput(input, bindProps(input.props ?? {}, runtime!.scope), {}, runtime, inline))}
      </FormCard>;
    }
    case "filterChips": {
      if (!runtime) return null;
      const chips = idList(props.inputs).flatMap((id) => {
        const input = runtime.inputById[id];
        if (!input || !componentVisible(input, runtime)) return [];
        const inputProps = bindProps(input.props ?? {}, runtime.scope);
        const inputType = textValue(inputProps.inputType, "text");
        const optionsState = typeof inputProps.optionsQuery === "string" ? runtime.states[runtime.queryNames[inputProps.optionsQuery]] : undefined;
        const text = chipText(runtime.inputValues[id], inputType, inputType === "select" ? selectOptions(inputProps, optionsState) : undefined);
        return text === null ? [] : [{ id, label: textValue(inputProps.label) || input.name || id, text }];
      });
      const clear = (id: string) => runtime.setInput(id, textValue(runtime.inputById[id]?.props?.inputType, "text") === "checkbox" ? false : "");
      return <FilterChips key={component.id} chips={chips} style={style} onClear={clear} onClearAll={() => chips.forEach((chip) => clear(chip.id))} />;
    }
    case "facetPanel": {
      if (!runtime) return null;
      const counts = Object.fromEntries(parseFieldList(props.facetCounts).map((entry) => [entry.code, entry.label]));
      const groups = idList(props.inputs).flatMap((id): FacetGroup[] => {
        const input = runtime.inputById[id];
        if (!input || !componentVisible(input, runtime)) return [];
        const inputProps = bindProps(input.props ?? {}, runtime.scope);
        if (textValue(inputProps.inputType, "text") !== "select") return [];
        const optionsState = typeof inputProps.optionsQuery === "string" ? runtime.states[runtime.queryNames[inputProps.optionsQuery]] : undefined;
        const countColumn = counts[id];
        const options = selectOptions(inputProps, optionsState).map(({ value, label, row }) => {
          return { value, label, count: countColumn ? facetCount(row[countColumn]) : undefined };
        });
        const raw = runtime.inputValues[id];
        return [{ id, label: textValue(inputProps.label) || input.name || id, options, selected: typeof raw === "string" ? raw : "", loading: Boolean(optionsState?.loading), error: optionsState?.error || undefined, disabled: componentDisabled(input, runtime) }];
      });
      return <FacetPanel key={component.id} title={title} groups={groups} style={style} onSelect={(inputId, next) => runtime.setInput(inputId, next)} />;
    }
    case "filterBar": {
      const view = runtime?.filterBarFor(component);
      return view ? <FilterBar key={component.id} style={style} {...view} /> : null;
    }
    case "contextPanel": {
      if (!runtime) return null;
      const table = typeof props.table === "string" ? runtime.tableById[props.table] : undefined;
      const row = table?.name ? runtime.selections[table.name] ?? null : null;
      const formats = parseColumnFormats(table?.props?.columnFormats);
      const labels = parseValueLabels(table?.props?.valueLabels);
      // Birim, listenin `columnUnits` eşlemesinden gelir (ör. "0,00 TRY", "0 EA"); listede gösterildiği gibi.
      const units = pairMap(table?.props?.columnUnits);
      const fields = parseFieldList(props.fields).map((field) => {
        const value = row ? labeledCell(labels, field.code, row[field.code], formats[field.code]) : "";
        const unit = row && units[field.code] ? displayText(row[units[field.code]]) : "";
        return { ...field, text: unit && value !== "—" ? `${value} ${unit}` : value };
      });
      const relatedState = typeof props.relatedQuery === "string" ? runtime.states[runtime.queryNames[props.relatedQuery]] : undefined;
      const relatedCodes = (relatedState?.columns ?? []).slice(0, 2).map((column) => column.code);
      const related = relatedState ? {
        title: textValue(props.relatedTitle) || "İlgili kayıtlar", loading: relatedState.loading, error: relatedState.error || undefined,
        rows: relatedState.rows.map((relatedRow) => relatedCodes.map((code) => displayText(relatedRow[code])).filter(Boolean).join(" · ")),
      } : undefined;
      return <ContextPanel key={component.id} title={title} row={row} fields={fields} related={related} style={style} />;
    }
    case "metric": {
      const queryName = runtime && typeof props.query === "string" ? runtime.queryNames[props.query] : undefined;
      const description = runtime ? metricDescription(component.props?.description, props.descriptionFormat, runtime.scope) : textValue(props.description);
      const tone = runtime ? (["info", "success", "warning", "danger"] as const).find((name) => name === props.variant) ?? "info" : "info";
      const icon = runtime && typeof props.icon === "string" ? props.icon : undefined;
      const trendState = runtime && typeof props.trendQuery === "string" ? runtime.states[runtime.queryNames[props.trendQuery]] : undefined;
      const trend = trendState ? trendPoints(trendState.rows) : undefined;
      const filterInput = typeof props.filterInput === "string" && props.filterInput ? props.filterInput : undefined;
      const filterValue = typeof props.filterValue === "string" ? props.filterValue : "";
      // `filterInput` bir giriş kimliği ya da süzgeç alanının bir süzgeci ("<süzgeçAlanı>.<anahtar>"): karta tıklamak değeri yazar,
      // yeniden tıklamak temizler.
      const barTarget = runtime && filterInput && !runtime.inputById[filterInput] ? runtime.filterBarTarget(filterInput) : null;
      const active = !!runtime && !!filterInput && filterValue !== ""
        && (barTarget ? barTarget.value === filterValue : String(runtime.inputValues[filterInput] ?? "") === filterValue);
      // Onay kutusu süzgeci mantıksal değer alır (true/false); diğer girişler metin.
      const filterIsCheckbox = !!runtime && !!filterInput && inputIsCheckbox(runtime.inputById[filterInput]);
      const onActivate = !runtime || !filterInput || filterValue === "" ? undefined
        : barTarget ? () => barTarget.set(active ? undefined : filterValue)
        : runtime.inputById[filterInput] ? () => runtime.setInput(filterInput, filterIsCheckbox ? (active ? filterValue !== "true" : filterValue === "true") : active ? "" : filterValue)
        : undefined;
      const card = { tone, icon, trend, active, onActivate };
      if (runtime && queryName && runtime.states[queryName]) return <QueryMetric key={component.id} state={runtime.states[queryName]} title={title || text || "Gösterge"} description={description} style={style} {...card}
        count={countRowsWhen(component.props?.countWhen, runtime.states[queryName].rows, queryName, runtime.scope)} />;
      // Değeri bağlama olan (sorgusuz, kaynaksız) v2 gösterge: çözülen değer `format` ile (number/money; diğerleri metin) yazılır.
      const rawValue = component.props?.value;
      if (runtime && !queryName && !textValue(props.source).trim() && typeof rawValue === "string" && rawValue.includes("{{")) {
        // Değer tek bağlamayla başlayıp metinle sürebilir (ör. "{{b.tutar}} {{b.doviz}} {{b.yon}}" → "4.050.000,00 TRY B"):
        // baştaki bağlama `format` ile yazılır, kalan şablon çözülüp ardına eklenir.
        const lead = /^\s*(\{\{[^{}]*\}\})([\s\S]*)$/.exec(rawValue);
        const path = lead ? bindingPath(lead[1]) : null;
        const resolved = path ? resolvePath(runtime.scope, path) : value;
        const rest = path && lead ? interpolate(lead[2], runtime.scope).replace(/\s+/g, " ").trim() : "";
        const format = props.format === "number" || props.format === "money" || props.format === "date" || props.format === "datetime" ? props.format : "text";
        const shown = formatCell(typeof resolved === "object" && resolved !== null ? null : resolved, format);
        return <MetricCard key={component.id} title={title || text || "Gösterge"} description={description} style={style} {...card}
          value={<strong>{rest ? `${shown} ${rest}` : shown}</strong>} />;
      }
      return <TenantReportWidget key={component.id} kind="metric" source={props.source} title={title || text || "Gösterge"} description={description} fallbackValue={value} style={style} token={token} {...card} />;
    }
    case "card": case "section": if (component.type === "card" && props.variant === "panel") return <DetailPanel key={component.id} component={component} title={title} code={description} style={style}
      runtime={runtime} render={(child) => renderComponent(child, forms, token, pageCode, runtime)} closeInput={textValue(props.closeInput).trim()} />;
      return <section className={`tenant-page-block tenant-page-${component.type}`} style={style} key={component.id}>{title && <h3>{title}</h3>}{description && <p>{description}</p>}{text && <p>{text}</p>}{children}</section>;
    case "divider": return <hr key={component.id} style={style} />;
    case "spacer": return <div className="tenant-page-spacer" style={style} aria-hidden="true" key={component.id} />;
    case "actionBar": {
      const status = runtime?.actionStatus;
      return status ? <div key={component.id} className={`tenant-page-action-status is-${status.tone}`} role={status.tone === "error" ? "alert" : "status"} style={{ gridColumn: style.gridColumn, margin: style.margin }}>{status.text}</div> : null;
    }
    case "button": {
      if (runtime?.movedButtons.has(component.id) || runtime?.rowOwned.has(component.id) || runtime?.headerOwned.has(component.id)) return null;
      return renderPageButton(component, props, style, token, pageCode, runtime);
    }
    case "steps": {
      const labels = stepLabels(component.props?.steps);
      return <StepsIndicator key={component.id} labels={labels} style={style}
        active={runtime ? activeStepIndex(labels.length, component.props?.activeWhen, runtime.scope) : 0} />;
    }
    case "recordHeader": {
      if (!runtime) return null;
      const raw = component.props ?? {};
      // Özetin düğmeleri sayfa düğmesi gibi çalışır (koşulları dahil); en fazla 3.
      const buttons = idList(raw.buttons, 3).map((id) => runtime.buttonById[id])
        .filter((button): button is ComponentDefinition => !!button && componentVisible(button, runtime))
        .map((button) => renderPageButton(button, bindProps(button.props ?? {}, runtime.scope), {}, token, pageCode, runtime));
      return <RecordHeader key={component.id} icon={textValue(raw.icon) || undefined} style={style}
        title={templateText(textValue(raw.title), runtime.scope)} subtitle={templateText(textValue(raw.subtitle), runtime.scope)}
        fields={recordHeaderFields(raw, runtime.scope)} buttons={buttons.length > 0 ? buttons : undefined} />;
    }
    case "tabs": {
      if (!runtime) return null;
      const tabs = parseTabs(props.tabs).map((tab) => boundTab(tab, runtime.scope));
      const defaultTab = typeof props.defaultTab === "number" ? props.defaultTab : 0;
      // Doğrulanmayan (gizli veya pasif) girişlerin kalan iletileri sayılmaz.
      // Doğrulama iletisi gösterilen düzenlenebilir tablolar ve özel alan blokları da sayılır.
      const errorCounts = tabs.map((tab) => [...Object.keys(runtime.validationErrors).filter((inputId) => !runtime.skipsValidation(inputId)), ...runtime.componentErrorIds]
        .filter((id) => runtime.ancestorsOf(id).some((owner) => tab.ids.includes(owner))).length);
      const target = runtime.errorJump?.targets[component.id];
      const jumpTo = runtime.errorJump && target !== undefined ? { tab: target, signal: runtime.errorJump.signal } : null;
      const renderOwned = (id: string) => {
        const owned = runtime.topLevelById[id];
        // Sekme yalnız üst düzey bileşen sahiplenir; sekme içinde sekme, pencere ve İşlem Çubuğu çizilmez.
        if (!owned || owned.type === "tabs" || owned.type === "actionBar" || owned.type === "dialog") return null;
        return renderComponent(owned, forms, token, pageCode, runtime);
      };
      return <PageTabs key={component.id} id={component.id} tabs={tabs} defaultTab={defaultTab} renderOwned={renderOwned}
        errorCounts={errorCounts} jumpTo={jumpTo} style={style} />;
    }
    case "dataTable": {
      const columns = Array.isArray(props.columns) ? props.columns.filter((column): column is string => typeof column === "string").slice(0, 20) : [];
      const queryName = runtime && typeof props.query === "string" ? runtime.queryNames[props.query] : undefined;
      if (runtime && queryName && runtime.states[queryName]) {
        const tableName = component.name;
        if (props.variant === "bars" || props.variant === "list") {
          // Dar panel görünümleri (eski detay panelinin "Depo dağılımı" ve "Son hareketler" satırları); seçim ve sayfalama yok.
          const cell = compactCell(parseValueLabels(props.valueLabels), parseColumnFormats(props.columnFormats), pairMap(props.columnUnits), displayText);
          return <CompactList key={component.id} variant={props.variant} state={runtime.states[queryName]} columns={columns} title={title}
            emptyText={textValue(props.emptyText).trim()} limit={tableLimit(props.limit)} cell={cell} toneMap={parseToneMap(props.toneMap)} style={style} />;
        }
        const totals = Array.isArray(props.totals) ? props.totals.filter((code): code is string => typeof code === "string") : [];
        const state = runtime.visibleRows(component, runtime.states[queryName]);
        const pager = runtime.tablePaging(component);
        let paging: TablePaging | undefined;
        if (pager) {
          const searchInput = typeof props.searchInput === "string" ? runtime.inputById[props.searchInput.trim()] : undefined;
          paging = {
            ...pager,
            meta: parseFieldList(props.footerMeta).map((item) => ({ label: item.label, value: cellText(state.meta?.[item.code]) })),
            search: searchInput ? renderPageInput(searchInput, bindProps(searchInput.props ?? {}, runtime.scope), {}, runtime) : undefined,
          };
        }
        // Satır işlemleri satır bindirmesiyle (`<tablo>.seciliSatir = satır`) değerlendirilir; tablo adsızsa çizilmez.
        const rowActions: RowAction[] = tableName ? idList(props.rowActions, 4).flatMap((id) => {
          const button = runtime.buttonById[id];
          if (!button || !actionAllowed(runtime.buttonAction(button), runtime.rights)) return [];
          const raw = button.props ?? {};
          const rowScope = (row: Record<string, unknown>) => mergeOverlay(runtime.scope, { [tableName]: { seciliSatir: row } });
          const buttonProps = bindProps(raw, runtime.scope);
          const blocked = operationBlocked(runtime.buttonAction(button), runtime);
          const locked = viewModeLocked(button, runtime);
          return [{
            id, label: textValue(buttonProps.text ?? buttonProps.label) || textValue(buttonProps.title) || "Eylem",
            visible: (row) => conditionHolds(raw.visibleWhen, rowScope(row), true),
            disabled: (row) => blocked ? NO_OPERATION_RIGHT : locked ? VIEW_MODE_REASON : conditionHolds(raw.disabledWhen, rowScope(row), false)
              ? interpolate(textValue(raw.disabledReason), rowScope(row)).trim() || BUTTON_UNAVAILABLE : null,
            run: (row, opener) => runtime.runRowAction(component, button, row, opener),
          }];
        }) : [];
        const limit = tableLimit(props.limit);
        // `bulkDeleteQuery`: ızgaranın işaretli satırları için "Seçilenleri sil"; tek silme gibi sayfanın silme hakkını ve işlemin
        // katalog iznini ister (yoksa nedeniyle pasif).
        const bulkQuery = tableName && typeof props.bulkDeleteQuery === "string" ? runtime.queryById[props.bulkDeleteQuery.trim()] : undefined;
        const bulkDelete = bulkQuery && bulkQuery.kind === "delete" ? {
          disabledReason: runtime.rights.delete !== true || !runtime.queryAllowed(bulkQuery.id) ? NO_OPERATION_RIGHT : runtime.readOnly ? VIEW_MODE_REASON : null,
          run: (rows: Record<string, unknown>[]) => runtime.bulkDelete(component, bulkQuery, rows),
        } : undefined;
        // `rowOpenAction`: satıra çift tıklama / Enter o düğmeyi satır işlemi olarak çalıştırır (İşlem Çubuğu Aç'ın önüne geçer).
        const openButton = tableName && typeof props.rowOpenAction === "string" ? runtime.buttonById[props.rowOpenAction.trim()] : undefined;
        const openAction = openButton ? runtime.buttonAction(openButton) : null;
        const openByAction = openButton && openAction && ROW_OPEN_ACTIONS.has(openAction.type) && actionAllowed(openAction, runtime.rights)
          ? (row: Record<string, unknown>) => runtime.runRowAction(component, openButton, row, null) : undefined;
        // `detailToggleInput`: araç çubuğundaki "Detay paneli" düğmesi bağlı onay kutusunu açıp kapatır (etiket girişin etiketidir);
        // panelin `visibleWhen`/`closeInput` koşulları aynı girişe bağlı kaldığından davranış onay kutusuyla aynıdır.
        const toggleInput = typeof props.detailToggleInput === "string" ? runtime.inputById[props.detailToggleInput.trim()] : undefined;
        const toolbarToggles = toggleInput && inputIsCheckbox(toggleInput) ? [{
          id: toggleInput.id, label: textValue(toggleInput.props?.label).trim() || "Detay paneli", pressed: runtime.inputValues[toggleInput.id] === true,
          icon: <PanelRight size={15} aria-hidden="true" />,
          onToggle: () => runtime.changeInput(toggleInput.id, runtime.inputValues[toggleInput.id] !== true),
        }] : undefined;
        return <DataTableGrid key={component.id} gridId={`custom-page.${pageCode}.${component.id}`} state={state} columns={columns} title={title || "Kayıtlar"} description={description} style={style}
          formats={parseColumnFormats(props.columnFormats)} toneMap={parseToneMap(props.toneMap)} totals={totals} density={props.density === "comfort" ? "comfort" : "dense"}
          selected={tableName ? runtime.selections[tableName] : undefined} onSelect={tableName ? (row, options) => runtime.select(tableName, row, options) : undefined} paging={paging}
          rowActions={rowActions} bulkDelete={bulkDelete} emptyText={textValue(props.emptyText).trim()} limit={limit} status={runtime.tableStatus[component.id] ?? null}
          valueLabels={parseValueLabels(props.valueLabels)} columnLabels={pairMap(props.columnLabels)} columnUnits={pairMap(props.columnUnits)} tools={gridToolsOf(props)} toolbarToggles={toolbarToggles}
          onOpenRow={openByAction ?? (tableName && runtime.openTables.has(tableName) ? (row) => runtime.openRow(tableName, row) : undefined)} />;
      }
      return <TenantReportWidget key={component.id} kind="dataTable" source={props.source} columns={columns} title={title || "Kayıtlar"} description={description} style={style} token={token} rowActionsEnabled={props.rowActionsEnabled === true} rowActionWorkflowId={textValue(props.rowActionWorkflowId) || undefined} rowActionLabel={textValue(props.rowActionLabel, "İşlemi başlat")} pageCode={pageCode} componentId={component.id} columnFormats={props.columnFormats} toneMap={props.toneMap} density={props.density} />;
    }
    case "form": {
      const formCode = textValue(props.formCode);
      const form = forms.find((item) => item.code === formCode);
      return form ? <div key={component.id} className="tenant-page-form-wrap" style={style}><EmbeddedCustomForm form={form} token={token} /></div> : <section className="tenant-page-block tenant-page-form" style={style} key={component.id}><h3>{title || "Form"}</h3><p>Bu sayfa için seçilen form artık yayımlanmış değil.</p></section>;
    }
    case "code": return <CodeFrame key={component.id} id={component.id} css={textValue(props.css)} javascript={textValue(props.javascript)}
      hidden={props.hidden === true} style={style} title={title || "Yalıtılmış özel kod"} host={runtime?.codeHost ?? INERT_CODE_HOST} events={runtime?.events ?? INERT_PAGE_EVENTS} />;
    case "alert": {
      const variant = ["success", "warning", "danger", "info"].includes(textValue(props.variant)) ? textValue(props.variant) : "info";
      const role = variant === "danger" ? "alert" : "status";
      // `icon` verilen uyarı eski Stok Kartları alt notunun (NegativeStockPolicyNote) durum şeridi olarak çizilir: beyaz kart,
      // tonlu simge kutusu, kalın başlık, soluk alt metin ve sağda `value` rozeti.
      const StripIcon = ALERT_STRIP_ICONS[textValue(props.icon)];
      if (StripIcon) {
        const badge = textValue(props.value);
        return <aside key={component.id} className={`tenant-page-status-strip tone-${variant}`} style={style} role={role}>
          <span className="tenant-page-status-strip-mark" aria-hidden="true"><StripIcon size={17} /></span>
          <span className="tenant-page-status-strip-text"><b>{title || "Bilgilendirme"}</b>{text && <small>{text}</small>}</span>
          {badge && <span className="tenant-page-status-strip-badge">{badge}</span>}
        </aside>;
      }
      return <aside key={component.id} className={`tenant-page-alert tone-${variant}`} style={style} role={role}><strong>{title || "Bilgilendirme"}</strong>{text && <p>{text}</p>}</aside>;
    }
    case "badge": {
      return <PageBadge key={component.id} text={text || title || "Durum"} variant={props.variant} toneMap={props.toneMap} style={style} />;
    }
    case "list": {
      const items = Array.isArray(props.items) ? props.items.filter((item): item is string => typeof item === "string").slice(0, 40) : [];
      return <section key={component.id} className="tenant-page-block tenant-page-list" style={style}>{title && <h3>{title}</h3>}{description && <p>{description}</p>}{items.length ? <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>Henüz liste öğesi eklenmedi.</p>}</section>;
    }
    case "dialog": {
      if (!runtime) return null;
      const ids = idList(props.contains, 20);
      const steps = idList(props.saveSequence, 8);
      const saveIds = steps.length > 0 ? steps : typeof props.saveQuery === "string" && props.saveQuery.trim() ? [props.saveQuery.trim()] : [];
      const saveQueries = saveIds.map((id) => runtime.queryById[id]);
      const canSave = !runtime.readOnly && saveQueries.length > 0 && saveQueries.every((query) => query && query.kind !== "read" && runtime.rights[query.kind] === true);
      const renderOwned = (id: string) => {
        const owned = runtime.topLevelById[id];
        // Pencere yalnız üst düzey bileşen sahiplenir; pencere içinde pencere ve İşlem Çubuğu çizilmez.
        if (!owned || owned.type === "dialog" || owned.type === "actionBar") return null;
        return renderComponent(owned, forms, token, pageCode, runtime);
      };
      // Kayıt penceresi açıkken (kısayollar pencere içinde çalışmaz) F2 İşlem Çubuğu'nun Yeni komutunu çalıştırır.
      const onNew = runtime.formDialog?.id === component.id ? () => { void runtime.newCommand.current?.(); } : undefined;
      return <PageDialog key={component.id} id={component.id} title={title || "Pencere"} presentation={props.presentation === "drawer" ? "drawer" : "dialog"}
        size={props.size === "sm" || props.size === "lg" || props.size === "xl" || props.size === "full" ? props.size : undefined} backdropClose={props.backdropClose === true}
        open={runtime.dialogs[component.id] === true} onClose={() => runtime.requestCloseDialog(component.id)} renderOwned={renderOwned} ids={ids} onNew={onNew}
        save={canSave ? { label: textValue(props.saveLabel).trim() || "Kaydet", busy: runtime.dialogBusy[component.id] === true, run: () => runtime.saveDialog(component.id) } : undefined}
        status={runtime.dialogStatus[component.id] ?? null} returnFocus={runtime.dialogOpener(component.id)} />;
    }
    case "editableGrid": {
      if (!runtime || !component.name) return null;
      const grid = runtime.gridFor(component);
      const disabled = componentDisabled(component, runtime);
      return <EditableGrid key={component.id} {...grid} title={title} style={style} disabled={disabled}
        disabledReason={disabled ? disabledReasonOf(component, props, runtime) || BUTTON_UNAVAILABLE : ""}
        fixedRowLabel={textValue(props.fixedRowLabel).trim()} addLabel={textValue(props.addLabel).trim() || "Satır ekle"} />;
    }
    case "customFieldsBlock": {
      if (!runtime || !component.name) return null;
      const block = runtime.blockFor(component);
      const disabled = componentDisabled(component, runtime);
      const columns = props.columns === 1 || props.columns === 3 ? props.columns : 2;
      return <CustomFieldsBlock key={component.id} {...block} title={title} columns={columns} disabled={disabled} style={style} />;
    }
    case "image": {
      const height = typeof props.height === "number" && Number.isFinite(props.height) ? Math.max(40, Math.min(400, Math.round(props.height))) : 160;
      return <PageImage key={component.id} url={value} alt={title} height={height} fit={props.fit === "cover" ? "cover" : "contain"} style={style} />;
    }
    case "progress": {
      const progress = Math.max(0, Math.min(100, Number(props.value) || 0));
      return <section key={component.id} className="tenant-page-block tenant-page-progress" style={style}><div><strong>{title || "İlerleme"}</strong><span>{progress}%</span></div><progress max={100} value={progress} aria-label={title || "İlerleme"} /></section>;
    }
    default: return null;
  }
}

type GridSpec = {
  name: string; mode: GridMode; columns: GridColumn[]; maxRows: number; rowKey: string; sourceQuery: string;
  /** En az satır (`minRows`, 0–100); yoksa sınır yok. */
  minRows?: number;
  /** Seçim sütunlarının sabit ilk seçenekleri (`columnStaticOptions`, "değer=Etiket") ve seçenek koşulları (`columnOptionsWhen`). */
  staticOptions: Record<string, string[]>; optionsWhen: Record<string, string>;
  /** Toplamı alınan `number` sütunları (`totals`). */
  totals: string[];
  /** `list` kipinin doldurma, seçimle doldurma ve formül ekleri (gridFill.ts). */
  engine: GridEngine;
};
/**
 * Düzenlenebilir tablonun özellikleri: kip, sütunlar, en fazla satır (1–500, varsayılan 50), en az satır, satır anahtarı, kaynak
 * sorgu ve seçim sütunlarının sabit seçenekleri ile koşulları.
 */
const gridSpecOf = (grid: ComponentDefinition): GridSpec => {
  const props = grid.props ?? {};
  const mode: GridMode = props.gridMode === "list" || props.gridMode === "matrix" ? props.gridMode : "stage";
  const maxRows = typeof props.maxRows === "number" && Number.isInteger(props.maxRows) && props.maxRows >= 1 && props.maxRows <= 500 ? props.maxRows : 50;
  const parsedColumns = mode === "matrix" ? [] : parseGridColumns(props.gridColumns);
  const engine = parseGridEngine(props, parsedColumns, mode);
  const columns = withFormulaColumns(parsedColumns, engine);
  return {
    name: grid.name ?? "", mode, columns, maxRows, engine,
    rowKey: mode === "stage" ? textValue(props.rowKey).trim() || "id" : "id", sourceQuery: mode === "stage" ? textValue(props.sourceQuery).trim() : "",
    ...(typeof props.minRows === "number" && Number.isInteger(props.minRows) && props.minRows >= 0 && props.minRows <= 100 ? { minRows: props.minRows } : {}),
    staticOptions: parseColumnEntries(props.columnStaticOptions),
    optionsWhen: Object.fromEntries(Object.entries(parseColumnEntries(props.columnOptionsWhen)).map(([code, conditions]) => [code, conditions[conditions.length - 1]])),
    totals: parseGridTotals(props.totals, columns, mode),
  };
};
/** Satır kapsamlı okuma: bir parametresi `{{<tablo>.satir.<sütun>}}` bağlıyorsa o tablonun adı (yoksa null). */
const rowScopeOf = (query: PageQueryDefinition, gridNames: ReadonlySet<string>): string | null => {
  if (query.kind !== "read") return null;
  for (const parameter of query.parameters) {
    const root = /^([A-Za-z_][A-Za-z0-9_]*)\.satir\./.exec(bindingPath(parameter.binding) ?? "")?.[1];
    if (root && gridNames.has(root)) return root;
  }
  return null;
};
/** Varyant kipinin önizleme sayısı: geçerli özelliklerin (adı ve değeri olan) farklı değer sayılarının çarpımı (200 sınırı uygulanmadan). */
const matrixVariantCount = (state: GridState) => countVariantDrafts(state.rows.slice(0, MATRIX_MAX_ROWS)
  .map((draft) => ({ name: String(draft.cells.name ?? ""), values: String(draft.cells.values ?? "") })));
/** `stage` tablosunun sabit satır (ör. ana birim) değerleri: `unique` sütunlar bunlarla da karşılaştırılır. */
const gridFixedValues = (grid: ComponentDefinition, spec: GridSpec, scope: PageScope) => spec.mode === "stage"
  ? fixedRowValues(textValue(grid.props?.fixedRowLabel), spec.columns, (path) => resolvePath(scope, path)) : undefined;
/** Bağlama yolu tablonun `satirlar`/`eklenenSatir`/`silinenSatir` alanına bakıyorsa o alan, değilse null. */
const gridBindingList = (path: string | null, name: string) => {
  if (!path || !path.startsWith(`${name}.`)) return null;
  return /^(satirlar|eklenenSatir|silinenSatir)(?:\.|\[|$)/.exec(path.slice(name.length + 1))?.[1] ?? null;
};
const bindsGrid = (query: PageQueryDefinition, name: string, list?: string) =>
  query.parameters.some((parameter) => { const bound = gridBindingList(bindingPath(parameter.binding), name); return bound !== null && (!list || bound === list); });
/**
 * Satırın kimliği (yeniden yüklemede aynı kaydı bulmak için): üst düzey `id`, yoksa iç nesnelerin `id` alanları
 * (ör. `stockItem.id`) ya da düzleştirilmiş `<ad>.id` anahtarları. Kimliği olmayan satırda null.
 */
const rowIdentity = (row: Record<string, unknown>): string | null => {
  const scalar = (value: unknown) => (typeof value === "string" || typeof value === "number") && value !== "";
  if (scalar(row.id)) return `id=${String(row.id)}`;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value) && scalar((value as Record<string, unknown>).id)) parts.push(`${key}.id=${String((value as Record<string, unknown>).id)}`);
    else if (key.endsWith(".id") && scalar(value) && !(key.slice(0, -3) in row)) parts.push(`${key}=${String(value)}`);
  }
  return parts.length > 0 ? parts.sort().join("|") : null;
};
const bindsBlock = (query: PageQueryDefinition, name: string) => query.parameters.some((parameter) => bindingPath(parameter.binding) === `${name}.degerler`);
/** Verilen anahtarlar olmadan kayıt (hiçbiri yoksa aynı nesne). */
const without = <T,>(record: Record<string, T>, ids: string[]) => {
  if (!ids.some((id) => id in record)) return record;
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};
const LEAVE_MESSAGE = "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?";
const PLACEHOLDER_ROOT = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)/g;

const inputIsCheckbox = (input: ComponentDefinition | undefined) => textValue(input?.props?.inputType, "text") === "checkbox";
/** Veri listesinin `limit` özelliği (1–100 tamsayı); geçersizse sınır yok. */
const tableLimit = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100 ? value : undefined);

/** Sayfa yazma yollarının kod bileşeni kancaları: beforeSave sorusu ve afterSave olayı. */
const codeWriteHooks = (events: PageEvents) => ({
  beforeWrite: (query: PageQueryDefinition) => events.beforeSave(query.name),
  afterWrite: (query: PageQueryDefinition, result: WriteResult) => events.emit("afterSave", { query: query.name, sonuc: result.sonuc ?? null }),
});

/** v1 sayfalarda bağlama/sorgu yoktur: köprü yalnız yüksekliği ve abonelikleri kabul eder, veri isteklerini reddeder. */
const V1_BRIDGE_ERROR = "Bu sayfada kod köprüsü kullanılamaz.";
const INERT_CODE_HOST: BridgeHost = {
  get: () => { throw new Error(V1_BRIDGE_ERROR); },
  setInput: () => { throw new Error(V1_BRIDGE_ERROR); },
  runQuery: async () => { throw new Error(V1_BRIDGE_ERROR); },
  callOperation: async () => { throw new Error(V1_BRIDGE_ERROR); },
  subscribe: () => undefined,
  setHeight: () => undefined,
};
const INERT_PAGE_EVENTS = createPageEvents();

const NO_RIGHTS = "Bu işlem için yetkiniz yok.";
const WRITE_BUSY = "Başka bir yazma işlemi sürüyor; biraz sonra yeniden deneyin.";
const CATALOG_WAIT_MS = 10_000;

/**
 * Sayfadaki `actionBar` bileşeninin komutlarını kabuğun İşlem Çubuğu'na kaydeder (yalnız actionBar varken bağlanır;
 * kalkınca kayıt da kalkar). Tüm yazma yolları tek uçuş kilidini paylaşır.
 */
function PageActionCommands({ barProps, runtime, page, token, flat, loadIds, onStatus, onBusy, busy, rootRef }: {
  barProps: Record<string, unknown>; runtime: PageRuntime; page: PublishedPage; token: string; flat: ComponentDefinition[];
  loadIds: string[]; onStatus: (status: ActionStatus | null) => void; onBusy: (busy: boolean) => void; busy: boolean;
  /** Sayfa içeriği: gizli (arka plandaki) sekmede ya da açık pencere varken Ctrl+F2 çalışmaz. */
  rootRef?: { current: HTMLElement | null };
}) {
  const inFlight = runtime.writeLock;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const latest = useRef(runtime);
  latest.current = runtime;
  /** Yeni komutunun onaysız ve sıfırlamasız çekirdeği (gezinme ya da girişleri temizleme); Kaydet ve yeni kayıttan sonra çalıştırır. */
  const newAfterSave = useRef<(() => void | Promise<void>) | null>(null);
  const buttonProps = (component: ComponentDefinition) => bindProps(component.props ?? {}, latest.current.scope);
  const buttonLabel = (id: string) => {
    const component = flat.find((item) => item.id === id && item.type === "button");
    if (!component) return undefined;
    const props = buttonProps(component);
    const label = textValue(props.text ?? props.label) || textValue(props.title);
    if (props.actionType === "workflow" && typeof props.workflowId === "string" && props.workflowId) return label || "İş akışını başlat";
    // Sorgu ve dizi her adım türünün sayfa hakkını, pencere yalnız görüntüleme hakkını ister.
    if (!actionAllowed(runtime.buttonAction(component), runtime.rights)) return undefined;
    return label || "Eylem";
  };
  const sequenceSource = (props: Record<string, unknown>, name?: string, onSuccess?: () => void): SequenceSource => ({
    props, name, onSuccess,
    onStatus: (status) => { if (mounted.current) onStatus(status); },
    onBusy: (next) => { if (mounted.current) onBusy(next); },
  });
  // `afterSaveButton`: kayıt yolu tam başarılı olunca kayıt kartları kaynak değerlerine döner (aynı değerlerle ikinci bir oluşturma
  // gitmez) ve düğmenin eylemi çalışır (ör. listeye dön); gezinilen sayfa açılış sorgularını yeniler.
  // Düz özelliklerde (`afterSaveAction: page`) sayfa doğrudan açılır; yenileme `afterSaveRefresh` ile seçilir.
  const barPlan = barCommandPlan(barProps, !!runtime.formDialog);
  const afterSavePlan = barPlan.afterSave;
  const navigateBar = (navigation: BarPageNavigation, options?: { refreshTarget?: boolean }) => {
    onStatus(null);
    void runNavigation(navigation, latest.current.currentScope, latest.current.tabKey, options)
      .then((failure) => { if (failure && mounted.current) onStatus({ tone: "error", text: failure }); });
  };
  const afterSave = afterSavePlan.mode === "button" && afterSavePlan.button ? () => {
    if (!mounted.current) return;
    latest.current.clearRecordInputs();
    runButton(afterSavePlan.button!, { refreshTarget: true });
  } : afterSavePlan.mode === "page" && afterSavePlan.page ? () => {
    if (!mounted.current) return;
    latest.current.clearRecordInputs();
    if (!actionAllowed({ type: "navigate", rights: ["view"] }, latest.current.rights)) return;
    navigateBar(afterSavePlan.page!, afterSavePlan.refresh ? { refreshTarget: true } : undefined);
  } : undefined;

  const writeThroughBar = async (query: PageQueryDefinition, confirm: Parameters<typeof runWriteAction>[0]["confirm"], successText: string, errorPrefix: string, extraRefresh: string[] = [], onSuccess?: () => void, options?: WriteOptions) => {
    onStatus(null);
    const result = await runWriteAction({
      query, isPreview: latest.current.isPreview, inFlight, confirm,
      write: async (target, confirmWrite) => {
        if (mounted.current) onBusy(true);
        try { return await latest.current.writeFor(target, confirmWrite, options); } finally { if (mounted.current) onBusy(false); }
      },
      errorText: (cause) => writeErrorText(errorPrefix, cause),
      validate: () => latest.current.validateFor(query),
      ...codeWriteHooks(latest.current.events),
    });
    if (!mounted.current || !("ok" in result)) return;
    if (result.ok) {
      onStatus({ tone: "success", text: `${successText} (${result.affectedRows} kayıt)` });
      latest.current.rerun([...new Set([...loadIds, ...extraRefresh])]);
      onSuccess?.();
    } else if ("error" in result) onStatus({ tone: "error", text: result.error });
  };

  const runButton = (id: string, options?: { refreshTarget?: boolean }) => {
    const component = flat.find((item) => item.id === id && item.type === "button");
    if (!component) return;
    // Menü komutu oluşturulduktan sonra koşul değişmiş olabilir: gizli veya pasif düğme çalışmaz.
    if (!componentVisible(component, latest.current) || componentDisabled(component, latest.current)) return;
    const props = buttonProps(component);
    const bound = (key: string) => interpolate(textValue(props[key]), latest.current.scope).trim();
    if (props.actionType === "workflow" && typeof props.workflowId === "string") {
      const title = textValue(props.text ?? props.label) || textValue(props.title) || "İş akışını başlat";
      if (inFlight.current) return;
      inFlight.current = true;
      onStatus(null);
      void startPageWorkflow(token, props.workflowId, title, page.code, id)
        .then(() => { if (mounted.current) onStatus({ tone: "success", text: "İş akışı başlatıldı." }); })
        .catch((cause: unknown) => { if (mounted.current) onStatus({ tone: "error", text: (cause as Error).message || "İş akışı başlatılamadı." }); })
        .finally(() => { inFlight.current = false; });
      return;
    }
    const action = latest.current.buttonAction(component);
    if (!actionAllowed(action, latest.current.rights) || operationBlocked(action, latest.current)) return;
    if (action?.type === "openDialog") {
      latest.current.openDialog(props.dialogId as string, document.activeElement instanceof HTMLElement ? document.activeElement : null);
      return;
    }
    if (action?.type === "setInput") { onStatus(null); latest.current.applyAssignments(component.props ?? {}, {}); return; }
    if (action?.type === "navigate") {
      onStatus(null);
      void runNavigation(component.props ?? {}, latest.current.currentScope, latest.current.tabKey, options)
        .then((failure) => { if (failure && mounted.current) onStatus({ tone: "error", text: failure }); });
      return;
    }
    if (usesSequence(action, props)) {
      onStatus(null);
      void latest.current.runSequence(sequenceSource(component.props ?? {}, component.name));
      return;
    }
    const query = action?.query;
    if (!query) return;
    if (query.kind === "read") { latest.current.rerun([query.id]); return; }
    const refresh = Array.isArray(props.refreshQueries) ? props.refreshQueries.filter((item): item is string => typeof item === "string") : [];
    void writeThroughBar(query, {
      enabled: props.confirmEnabled === true, text: bound("confirmText"),
      tone: query.kind === "delete" || query.kind === "update" ? "danger" : "default",
    }, bound("successMessage") || "İşlem tamamlandı.", bound("errorMessage"), refresh);
  };

  const exportTable = async (tableId: string, format: "xlsx" | "csv" = "xlsx") => {
    const current = latest.current;
    const table = current.tableById[tableId];
    const loaded = table && typeof table.props?.query === "string" ? current.states[current.queryNames[table.props.query]] : undefined;
    if (!table || !loaded) return;
    // Aktarım listede görünen (süzgeç alanının sayfada uyguladığı) satırları kullanır.
    const state = current.visibleRows(table, loaded);
    const chosen = Array.isArray(table.props?.columns) ? table.props.columns.filter((column): column is string => typeof column === "string").slice(0, 20) : [];
    const title = interpolate(textValue(table.props?.title), current.scope).trim() || "Liste";
    // `limit`: aktarım da yalnız çizilen satırları kullanır.
    const limit = tableLimit(table.props?.limit);
    const rows = limit !== undefined ? state.rows.slice(0, limit) : state.rows;
    onStatus(null);
    try {
      // CSV: eski listelerle aynı yardımcı (UTF-8 BOM, virgül ayraç, formül korumalı hücreler).
      if (format === "csv") downloadCsv(`${page.code}.csv`, exportRows(state.columns, rows, chosen));
      else await downloadXlsx(`${page.code}.xlsx`, title, exportRows(state.columns, rows, chosen));
      // Sunucu sayfalı liste her zaman "kesilmiş"tir: yalnız görünen sayfa aktarılır ve bu bildirilir.
      if (mounted.current && table.props?.paging === "server") onStatus({ tone: "warning", text: `Yalnız görünen sayfa aktarıldı (${state.rows.length} satır).` });
      else if (mounted.current && state.truncated) onStatus({ tone: "warning", text: `Liste ilk ${state.rows.length} satırla sınırlı` });
    } catch (cause) {
      if (mounted.current) onStatus({ tone: "error", text: (cause as Error).message || (format === "csv" ? "CSV dosyası oluşturulamadı." : "Excel dosyası oluşturulamadı.") });
    }
  };

  const commands = buildPageCommands(barProps, {
    rights: runtime.rights, busy,
    queryKind: (id) => runtime.queryById[id]?.kind,
    inputIds: new Set(Object.keys(runtime.inputById)),
    searchBarIds: new Set(flat.filter((component) => component.type === "filterBar" && component.props?.search === true).map((component) => component.id)),
    tableState: (tableId) => {
      const table = runtime.tableById[tableId];
      const state = table && typeof table.props?.query === "string" ? runtime.states[runtime.queryNames[table.props.query]] : undefined;
      return state ? { loading: state.loading || neverRan(state), error: state.error || undefined, rowCount: state.rowCount } : undefined;
    },
    buttonLabel,
    // Aktarım tablosu ya da bir sahibi `visibleWhen` ile gizliyse Excel/CSV gizlenir.
    tableVisible: (tableId) => runtime.ancestorsOf(tableId).every((id) => {
      const component = flat.find((item) => item.id === id);
      return !component || componentVisible(component, runtime);
    }),
    buttonGate: (id) => {
      const component = flat.find((item) => item.id === id && item.type === "button");
      if (!component) return undefined;
      if (!componentVisible(component, runtime)) return { hidden: true };
      if (operationBlocked(runtime.buttonAction(component), runtime)) return { disabled: true, disabledReason: NO_OPERATION_RIGHT };
      if (!componentDisabled(component, runtime)) return undefined;
      return { disabled: true, disabledReason: disabledReasonOf(component, buttonProps(component), runtime) || BUTTON_UNAVAILABLE };
    },
    deleteNeedsSelection: (() => {
      const deleteQuery = latest.current.queryById[typeof barProps.deleteQuery === "string" ? barProps.deleteQuery.trim() : ""];
      return !!deleteQuery && deleteQuery.parameters.some((parameter) => {
        const table = /^([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir(?:\.|$)/.exec(bindingPath(parameter.binding) ?? "")?.[1];
        return !!table && !runtime.selections[table];
      });
    })(),
    queryAllowed: (id) => runtime.queryAllowed(id),
    commandVisible: barCommandVisible(barProps, runtime.scope),
    readOnly: runtime.readOnly,
    formDialog: runtime.formDialog ? {
      hasRecord: runtime.formDialog.hasRecord, recordLoading: runtime.formDialog.recordLoading, recordFailed: runtime.formDialog.recordFailed,
      open: () => latest.current.formDialog?.open(document.activeElement instanceof HTMLElement ? document.activeElement : null),
      startNew: (focusId) => latest.current.formDialog?.startNew(focusId, document.activeElement instanceof HTMLElement ? document.activeElement : null),
    } : undefined,
    tableSelected: (tableId) => {
      const name = runtime.tableById[tableId]?.name;
      return !!name && !!runtime.selections[name];
    },
    run: {
      navigate: (navigation) => navigateBar(navigation),
      clearInputs: (ids) => ids.forEach((id) => latest.current.setInput(id, inputIsCheckbox(latest.current.inputById[id]) ? false : "")),
      write: (queryId, kind) => {
        const query = latest.current.queryById[queryId];
        if (!query) return;
        if (kind === "save") void writeThroughBar(query, { enabled: false }, "İşlem tamamlandı.", "", [], afterSave);
        else void writeThroughBar(query, { enabled: true, title: barDeleteConfirmTitle(barProps.deleteConfirmText, latest.current.scope), confirmLabel: "Sil", tone: "danger" }, "İşlem tamamlandı.", "", [], undefined, { recordDelete: true });
      },
      saveSequence: () => {
        onStatus(null);
        void latest.current.runSequence(sequenceSource(barProps, undefined, afterSave));
      },
      // Kaydet ve yeni: kayıttan sonra eylemi yerine Yeni'nin sıfırlaması (onaysız: değişiklikler az önce kaydedildi) çalışır.
      saveAndNew: () => {
        const startNext = () => {
          if (!mounted.current) return;
          latest.current.startNew();
          latest.current.clearRecordInputs();
          const next = newAfterSave.current;
          void Promise.resolve(next?.()).then(() => {
            if (mounted.current) onStatus({ tone: "success", text: "Kaydedildi. Yeni kayıt için alanlar temizlendi." });
          });
        };
        const saveId = textValue(barProps.saveQuery).trim();
        onStatus(null);
        if (idList(barProps.saveSequence, 8).length > 0) { void latest.current.runSequence(sequenceSource(barProps, undefined, startNext)); return; }
        const query = latest.current.queryById[saveId];
        if (query) void writeThroughBar(query, { enabled: false }, "İşlem tamamlandı.", "", [], startNext);
      },
      refresh: () => latest.current.rerun(loadIds),
      focus: (inputId) => document.getElementById(`page-input-${inputId}`)?.focus(),
      print: () => window.print(),
      exportTable: (tableId, format) => void exportTable(tableId, format),
      button: runButton,
    },
  });
  // Yeni: kaydedilmemiş değişiklik varsa önce sorulur; devam edilirse tablolar, bloklar ve kayıt sonuçları da sıfırlanır.
  const clearAndFocus = commands.new?.run;
  newAfterSave.current = clearAndFocus ?? null;
  if (commands.new && clearAndFocus) {
    commands.new = {
      ...commands.new,
      run: async () => {
        if (!(await confirmStartNew(latest.current.isDirty()))) return;
        latest.current.startNew();
        // Yeni bir düğmeyi çalıştırıyorsa (ör. aynı kayıt ekranını parametresiz açar) kayıt kartları da boşalır.
        if (barPlan.new.mode === "button" || barPlan.new.mode === "page") latest.current.clearRecordInputs();
        await clearAndFocus();
      },
    };
  }
  // Kayıt penceresi açıkken F2 aynı Yeni komutunu (onay dahil) çalıştırır. Gizli komutun (`hiddenCommands` / `commandWhen`)
  // `run`'ı yoktur: gizli Aç'ta satıra çift tıklama / Enter, gizli Yeni'de pencere içi F2 bir şey yapmaz.
  runtime.newCommand.current = commands.new?.run && !commands.new.disabledReason ? commands.new.run : null;
  runtime.openCommand.current = commands.open?.run && !commands.open.disabledReason ? commands.open.run : null;
  usePageCommands(commands);
  // Ctrl+F2 = Kaydet ve yeni (kayıt formlarındaki gibi): yalnız görünen sekmede ve açık pencere yokken.
  const saveAndNewRun = commands.more?.find((item) => item.id === SAVE_AND_NEW_COMMAND_ID);
  useWindowKeyDown(!!saveAndNewRun, (event) => {
    if (event.key !== "F2" || !event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    const root = rootRef?.current;
    if (!root || root.closest("[hidden]") || openDialogs().length > 0) return;
    event.preventDefault();
    void saveAndNewRun?.run?.();
  });
  return null;
}

/** Sayfa içeriği: v2 tanımlarda sorguları çalıştırır, girişleri ve ızgara seçimini tutar, bağlama kapsamını kurar. v1'de bağlama yoktur. */
function PageBody({ page, components, queryDefinitions, isV2, token, previewId, tabKey, pageParams, legacyLink = null, onTitle }: {
  page: PublishedPage; components: ComponentDefinition[]; queryDefinitions: ReturnType<typeof readPageQueries>; isV2: boolean; token: string; previewId?: string;
  /** Sayfanın çalışma sekmesi anahtarı ve "Sayfa aç" eyleminin verdiği parametreler (`{{sayfa.parametre.<ad>}}`). */
  tabKey?: string; pageParams: PageParams;
  /** İşlem çubuklu sayfada başlık satırına konan "Eski ekranda aç" bağlantısı. */
  legacyLink?: ReactNode;
  /** Görünen ilk `pageTitle` başlığının metni (yoksa null): sayfa üst bilgisinin başlığı olur. */
  onTitle?: (title: string | null, recordTitle: boolean) => void;
}) {
  // Görüntüleme kipi: başka bir sayfanın Görüntüle komutu bu sayfayı `mode=view` ile açtı (kayıt salt okunur).
  const readOnly = isV2 && pageParams[VIEW_MODE_PARAM] === VIEW_MODE_VALUE;
  const [touched, setTouched] = useState<Record<string, InputRaw>>({});
  // Sayfa içerik alanının genişliği (`{{sayfa.genislik}}`, px); ölçülemezse 0. Eski liste ekranları detay panelini yalnız
  // geniş alanda kendiliğinden açar: onay kutusunun `defaultWhen` koşulu buna bağlanır.
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    // Gizli (keep-alive) görünüm 0 ölçer: son genişlik korunur, sekme değişimi varsayılanı sıfırlamaz.
    const measure = () => { const width = Math.round(element.getBoundingClientRect().width); if (width > 0) setPageWidth(width); };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const touchedRef = useRef(touched);
  touchedRef.current = touched;
  const [selections, setSelections] = useState<Record<string, Record<string, unknown> | null>>({});
  const selectionsRef = useRef(selections);
  selectionsRef.current = selections;
  const [actionStatus, setActionStatus] = useState<ActionStatus | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const flat = useMemo(() => flattenComponents(components), [components]);
  const bar = useMemo(() => (isV2 ? actionBarOf(flat) : null), [isV2, flat]);
  const queryById = useMemo(() => Object.fromEntries(queryDefinitions.map((query) => [query.id, query])), [queryDefinitions]);
  const dialogById = useMemo(() => Object.fromEntries((isV2 ? components : []).filter((component) => component.type === "dialog").map((dialog) => [dialog.id, dialog])), [isV2, components]);
  const dialogIds = useMemo(() => new Set(Object.keys(dialogById)), [dialogById]);
  const dialogOwned = useMemo(() => (isV2 ? dialogOwnedIds(components) : new Set<string>()), [isV2, components]);
  const rowOwned = useMemo(() => (isV2 ? rowActionIds(flat) : new Set<string>()), [isV2, flat]);
  const buttonById = useMemo(() => Object.fromEntries(flat.filter((component) => component.type === "button").map((button) => [button.id, button])), [flat]);
  const headerOwned = useMemo(() => (isV2 ? headerButtonIds(flat) : new Set<string>()), [isV2, flat]);
  // Sayfadaki tüm yazma yolları (sorgu düğmeleri ve İşlem Çubuğu) için tek uçuş kilidi.
  const writeLock = useRef(false);
  const newCommand = useRef<(() => void | Promise<void>) | null>(null);
  const openCommand = useRef<(() => void | Promise<void>) | null>(null);
  const user = useMemo(() => sessionUser(token), [token]);
  const inputs = useMemo(() => flattenComponents(components).filter((component) => component.type === "input"), [components]);
  // {{sayilar.x}}: yalnız sayfada geçen rapor kaynaklarının kayıt sayısı getirilir.
  const countCodes = useMemo(() => isV2
    ? referencedCountCodes(collectTexts([flattenComponents(components).map((component) => component.props ?? {}), queryDefinitions.map((query) => query.parameters)]))
    : [], [isV2, components, queryDefinitions]);
  const counts = usePageCounts(countCodes, token);
  const queryNames = useMemo(() => Object.fromEntries(queryDefinitions.map((query) => [query.id, query.name])), [queryDefinitions]);
  // formCard/facetPanel girişleri, sayfalı listelerin arama girişleri ve listelerin "Detay paneli" düğmesine bağlı onay kutuları
  // üst düzeyde ayrıca çizilmez.
  const ownedInputs = useMemo(() => {
    const layout = flattenComponents(components).map((component) => ({ id: component.id, type: component.type, props: component.props }));
    return new Set([...ownedInputIds(layout), ...(isV2 ? [...tableSearchInputIds(layout), ...tableDetailToggleIds(layout)] : [])]);
  }, [components, isV2]);
  const pagedTables = useMemo(() => (isV2 ? flat.filter((component) => component.type === "dataTable" && component.props?.paging === "server" && !!component.name) : []), [isV2, flat]);
  const inputById = useMemo(() => Object.fromEntries(inputs.map((input) => [input.id, input])), [inputs]);
  // Tekrar deneme kimlikleri (`autoId`): sayfa açılınca üretilir; `touched`'dan ayrı tutulur (girişleri sıfırlayan yollar
  // kimliği boşaltmasın). Yenilenir: girişi içeren pencere `resetOnOpen` ile açılınca ve girişi bağlayan yazma başarılı olunca.
  const [autoIds, setAutoIds] = useState<Record<string, string>>(() => Object.fromEntries(inputs.filter(isAutoId).map((input) => [input.id, newRequestId()])));
  useEffect(() => {
    const missing = inputs.filter((input) => isAutoId(input) && !(input.id in autoIds));
    if (missing.length === 0) return;
    const fresh = Object.fromEntries(missing.map((input) => [input.id, newRequestId()]));
    setAutoIds((previous) => ({ ...fresh, ...previous }));
  }, [inputs]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Verilen girişlerden `autoId` olanların kimliği yenilenir (yazılmış değer de atılır). */
  const rotateAutoIds = (ids: string[]) => {
    const owned = ids.filter((id) => isAutoId(inputById[id]));
    if (owned.length === 0) return;
    const fresh = Object.fromEntries(owned.map((id) => [id, newRequestId()]));
    setAutoIds((previous) => ({ ...previous, ...fresh }));
    setTouched((previous) => without(previous, owned));
  };
  const inputIds = useMemo(() => new Set(inputs.map((input) => input.id)), [inputs]);
  const tableById = useMemo(() => Object.fromEntries(flattenComponents(components).filter((component) => component.type === "dataTable").map((table) => [table.id, table])), [components]);
  const flatById = useMemo(() => Object.fromEntries(flat.map((component) => [component.id, component])), [flat]);
  const topLevelById = useMemo(() => Object.fromEntries(components.map((component) => [component.id, component])), [components]);
  const tabOwned = useMemo(() => (isV2 ? tabOwnedIds(flat) : new Set<string>()), [isV2, flat]);
  // Sahip zinciri: iç içe çocuk → üst bileşen, formCard/facetPanel girişi → kart, sekmenin bileşeni → sekmeler.
  const parentOf = useMemo(() => {
    const map: Record<string, string> = {};
    const walk = (list: ComponentDefinition[], parent?: string) => list.forEach((component) => {
      if (parent) map[component.id] = parent;
      walk(component.children ?? [], component.id);
    });
    walk(components);
    for (const component of flat) {
      if (component.type === "formCard" || component.type === "facetPanel") for (const id of idList(component.props?.inputs)) map[id] = component.id;
      // Sayfalı listenin arama girişi liste başlığında çizilir: görünürlüğü ve sekme hata zinciri listeyi izler.
      if (component.type === "dataTable" && component.props?.paging === "server" && typeof component.props.searchInput === "string") {
        const searchId = component.props.searchInput.trim();
        if (searchId && !(searchId in map)) map[searchId] = component.id;
      }
    }
    // Pencerenin bileşeni → pencere (kapalı pencere gizli sahip sayılır: girişleri doğrulanmaz).
    for (const component of components) {
      if (component.type !== "dialog") continue;
      for (const id of idList(component.props?.contains, 20)) if (!(id in map)) map[id] = component.id;
    }
    for (const component of flat) {
      if (component.type !== "tabs") continue;
      for (const tab of parseTabs(component.props?.tabs)) for (const id of tab.ids) if (!(id in map)) map[id] = component.id;
    }
    return map;
  }, [components, flat]);
  const ancestorsOf = (componentId: string): string[] => {
    const chain: string[] = [];
    for (let id: string | undefined = componentId; id !== undefined && !chain.includes(id); id = parentOf[id]) chain.push(id);
    return chain;
  };
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [errorJump, setErrorJump] = useState<PageRuntime["errorJump"]>(null);
  // Arama kutuları: yazılan metin ve seçim anında saklanan satır (yalnız değer hâlâ aynıyken geçerli).
  const [lookupState, setLookupState] = useState<Record<string, { search: string; value?: string; row?: Record<string, unknown> | null; label?: string }>>({});
  // İlk seçenek varsayılanı (`defaultFirst`): seçenekler ilk yüklendiğinde bir kez saklanır (sorgu yeniden çalışınca ya da sunucu
  // aramasında değer sıçramaz); yalnız varsayılan değer (`defaultValue`, sayfa parametresi bağlaması dahil) boşken kullanılır.
  const [firstOptions, setFirstOptions] = useState<Record<string, string>>({});
  // Sayfalı listeler: sayfa, hangi sorgu değerleri (sayfa parametreleri hariç) ve arama metniyle seçildiyse o anahtarla saklanır.
  const [tablePages, setTablePages] = useState<Record<string, { page: number; key: string }>>({});
  // Pencereler: açık durumu, kayıt sonucu ve meşguliyeti; açan öğe odağın döneceği yerdir.
  const [dialogs, setDialogs] = useState<Record<string, boolean>>({});
  const [dialogStatus, setDialogStatus] = useState<Record<string, ActionStatus | null>>({});
  const [dialogBusy, setDialogBusy] = useState<Record<string, boolean>>({});
  const dialogOpeners = useRef<Record<string, HTMLElement | null>>({});
  const [tableStatus, setTableStatus] = useState<Record<string, ActionStatus | null>>({});
  // Düzenlenebilir tablolar (ada göre bekleyen satırlar) ve özel alan blokları (ada göre yazılan değerler).
  const [grids, setGrids] = useState<Record<string, GridState>>({});
  // Yazma sorgusu başına gönderilen tablo satırlarının taslak anahtarları (sunucu satır hatalarını hücrelere eşlemek için).
  const sentKeys = useRef<Record<string, Record<string, string[]>>>({});
  const [customTyped, setCustomTyped] = useState<Record<string, Record<string, string>>>({});
  const customTypedRef = useRef(customTyped);
  customTypedRef.current = customTyped;
  // Engellenen kayıttan sonra iletisi gösterilen tablolar ve bloklar (iletiler düzeltildikçe canlı güncellenir).
  const [gridShown, setGridShown] = useState<Record<string, boolean>>({});
  const [blockShown, setBlockShown] = useState<Record<string, boolean>>({});
  const gridComponents = useMemo(() => (isV2 ? flat.filter((component) => component.type === "editableGrid" && !!component.name) : []), [isV2, flat]);
  // Satır kapsamlı seçenek sorguları (`{{<tablo>.satir.<sütun>}}`) sayfa düzeyinde çalışmaz: satır değeri başına önbellekten okunur.
  const gridNames = useMemo(() => new Set(gridComponents.map((grid) => grid.name!)), [gridComponents]);
  const rowScopedQueries = useMemo(() => new Set(queryDefinitions.filter((query) => rowScopeOf(query, gridNames) !== null).map((query) => query.id)), [queryDefinitions, gridNames]);
  // Önizleme sorguları (`runOn` dizisi) sayfa sorgusu olarak çalışmaz; ayrı zamanlayıcıyla çalışır (previewQueries.ts).
  const pageQueries = useMemo(() => queryDefinitions.filter((query) => !rowScopedQueries.has(query.id) && !query.preview), [queryDefinitions, rowScopedQueries]);
  const previewQueries = useMemo(() => (isV2 ? queryDefinitions.filter((query) => !!query.preview && !!query.operation) : []), [isV2, queryDefinitions]);
  // Seçim hücresinde yazılan arama: tablo başına odaktaki hücre ve metni. `{{<tablo>.arama}}` yalnız odaktaki hücrenin sorgusu
  // onu bağlıyorsa doludur (başka sütunda yazmak sunucu aramasını yeniden çalıştırmaz).
  const [gridSearch, setGridSearch] = useState<Record<string, { cell: string; code: string; text: string }>>({});
  const bindsGridSearch = (queryId: string, gridName: string) =>
    !!queryById[queryId]?.parameters.some((parameter) => bindingPath(parameter.binding) === `${gridName}.arama`);
  const gridSearchText = (spec: GridSpec): string | null => {
    const entry = gridSearch[spec.name];
    const column = entry ? spec.columns.find((item) => item.code === entry.code) : undefined;
    return entry && entry.text !== "" && column?.lookup && bindsGridSearch(column.lookup.query, spec.name) ? entry.text : null;
  };
  const blockComponents = useMemo(() => (isV2 ? flat.filter((component) => component.type === "customFieldsBlock" && !!component.name) : []), [isV2, flat]);
  const formCards = useMemo(() => (isV2 ? flat.filter((component) => component.type === "formCard") : []), [isV2, flat]);
  // Süzgeç alanları: değerler sayfa + bileşen başına tarayıcıda saklanır (önizlemede okunmaz, yazılmaz). İlk değerler eşzamanlı
  // okunur; böylece sunucuya giden süzgeçli sorgu açılışta iki kez çalışmaz. Sayfa parametreleri aynı adlı parametreli süzgeci
  // doldurur (gövde parametreler değişince baştan kurulur, ilk değer yeter).
  const filterBars = useMemo(() => (isV2 ? flat.filter((component) => component.type === "filterBar" && !!component.name) : []), [isV2, flat]);
  const tenantId = useMemo(() => sessionTenant(token), [token]);
  const [filterValues, setFilterValues] = useState<Record<string, FilterBarValues>>(() => Object.fromEntries(filterBars.map((filterBar) => {
    const specs = parseFilterEntries(filterBar.props?.filters);
    const stored = previewId ? EMPTY_FILTER_VALUES : loadFilterValues(filterStorageKey(page.code, filterBar.id, tenantId), specs);
    const searchParam = filterBar.props?.search === true ? textValue(filterBar.props?.searchParam).trim() : "";
    return [filterBar.id, presetFromPageParams(stored, specs, pageParams, searchParam)];
  })));
  // Süzgeç alanında ilk seçenek varsayılanı (`defaultFirst`): süzgeç başına bir kez (bileşen ömründe) uygulanır.
  const firstFilterApplied = useRef(new Set<string>());
  useEffect(() => {
    if (previewId) return;
    for (const filterBar of filterBars) saveFilterValues(filterStorageKey(page.code, filterBar.id, tenantId), filterValues[filterBar.id] ?? EMPTY_FILTER_VALUES,
      parseFilterEntries(filterBar.props?.filters).filter((spec) => spec.defaultFirst).map((spec) => spec.key));
  }, [filterValues, filterBars, previewId, page.code, tenantId]);
  const visibleCache = useRef(new Map<string, { state: QueryState; key: string; result: QueryState }>());
  /** Süzgeç alanının tablosu, sorgusu ve türü/etiketi/seçenekleri çözülmüş süzgeçleri; tablo ya da sorgu yoksa null. */
  const filterBarModel = (filterBar: ComponentDefinition, states: Record<string, QueryState>) => {
    const props = filterBar.props ?? {};
    const table = typeof props.table === "string" ? tableById[props.table] : undefined;
    const query = table && typeof table.props?.query === "string" ? queryById[table.props.query] : undefined;
    if (!table || !query) return null;
    const tableState = states[query.name];
    const formats = parseColumnFormats(table.props?.columnFormats);
    const labels = parseValueLabels(table.props?.valueLabels);
    const headings = pairMap(table.props?.columnLabels);
    const columns = tableState?.columns ?? [];
    const headingOf = (code: string) => headings[code] || columns.find((column) => column.code === code)?.label || code;
    const filters: ResolvedFilter[] = parseFilterEntries(props.filters).map((spec) => {
      const column = columns.find((item) => item.code === spec.key);
      const paramType = spec.param ? query.parameters.find((parameter) => parameter.name === spec.param)?.type : undefined;
      const kind = resolveKind(spec, { format: formats[spec.key], hasValueLabels: !!labels[spec.key], dataType: column?.dataType, paramType });
      const optionsState = spec.options ? states[queryNames[spec.options.query]] : undefined;
      const choices = kind === "select" ? filterChoices(spec, { optionRows: optionsState?.rows, valueLabels: labels[spec.key], rows: tableState?.rows ?? [] }) : [];
      return { ...spec, kind, label: spec.label || headingOf(spec.key), choices };
    });
    const search = props.search === true;
    const searchParam = search && typeof props.searchParam === "string" && props.searchParam ? props.searchParam : undefined;
    const chosenColumns = stringList(props.searchColumns);
    const tableColumns = stringList(table.props?.columns);
    return {
      filters, values: filterValues[filterBar.id] ?? EMPTY_FILTER_VALUES, search, searchParam, labels,
      searchColumns: chosenColumns.length > 0 ? chosenColumns : tableColumns.length > 0 ? tableColumns : columns.map((column) => column.code),
      hint: chosenColumns.length > 0 ? `${chosenColumns.map(headingOf).join(", ")} içinde arar` : "",
    };
  };

  /** Girişin kapsamdaki nesnesi; arama kutusunda `search` (minChars altında null) ve `seciliSatir` da vardır. */
  const inputScope = (input: ComponentDefinition, raw: InputRaw, states: Record<string, QueryState>): Record<string, unknown> => {
    const inputType = textValue(input.props?.inputType, "text");
    const value = scopeInputValue(inputType, raw);
    if (inputType !== "lookup") return { value };
    const stored = lookupState[input.id];
    const search = stored?.search ?? "";
    const minChars = typeof input.props?.minChars === "number" ? input.props.minChars : 1;
    const text = typeof raw === "string" ? raw : "";
    let seciliSatir: Record<string, unknown> | null = null;
    if (stored && "value" in stored && stored.value === text) seciliSatir = stored.row ?? null;
    else if (text !== "") {
      // Değer dışarıdan geldi (varsayılan, setInput): eşleşen sorgu satırı; sabit veya bilinmeyen seçenekte null.
      const optionsId = input.props?.optionsQuery;
      const optionsState = typeof optionsId === "string" ? states[queryNames[optionsId]] : undefined;
      seciliSatir = lookupCandidates(input.props ?? {}, optionsState, "", false).find((option) => option.value === text)?.row ?? null;
    }
    return { value, search: search.length >= minChars ? search : null, seciliSatir };
  };
  /** Sayfalı listenin sayfası: saklanan anahtar güncel sorgu değerleriyle (sayfa parametreleri hariç) ve arama metniyle eşleşmezse 1. */
  const tablePageInfo = (table: ComponentDefinition, scope: PageScope, raw: Record<string, InputRaw>) => {
    const props = table.props ?? {};
    const pageSize = typeof props.pageSize === "number" && Number.isInteger(props.pageSize) && props.pageSize >= 5 && props.pageSize <= 100 ? props.pageSize : 25;
    const pageParam = textValue(props.pageParam) || "page";
    const pageSizeParam = textValue(props.pageSizeParam) || "pageSize";
    const query = typeof props.query === "string" ? queryById[props.query] : undefined;
    const values = query ? resolveQueryParameters({ ...query, parameters: query.parameters.filter((parameter) => parameter.name !== pageParam && parameter.name !== pageSizeParam) }, scope) : null;
    const searchId = typeof props.searchInput === "string" ? props.searchInput.trim() : "";
    const key = JSON.stringify([values, searchId ? raw[searchId] ?? "" : null]);
    const stored = tablePages[table.name!];
    return { page: stored && stored.key === key ? stored.page : 1, pageSize, key };
  };

  /** `stage` tablosunun kaynak sorgu durumu (diğer kiplerde yok). */
  const gridSourceState = (spec: GridSpec, states: Record<string, QueryState>) => (spec.sourceQuery ? states[queryNames[spec.sourceQuery]] : undefined);
  /** Kaynak anahtarı: kaynak okumasının çalıştığı değerler (`ranWith`). */
  const gridKey = (spec: GridSpec, states: Record<string, QueryState>) => JSON.stringify(gridSourceState(spec, states)?.ranWith ?? null);
  const gridSourceRows = (spec: GridSpec, states: Record<string, QueryState>) => (spec.mode === "stage" ? gridSourceState(spec, states)?.rows ?? [] : []);
  /** Doldurma (`fillQuery`) anahtarı: yanıt almış ve hatasız doldurma sorgusunun `ranWith`'i; yoksa null. */
  const gridFillKey = (spec: GridSpec, states: Record<string, QueryState>) => {
    const fill = spec.engine.fillQuery ? states[queryNames[spec.engine.fillQuery]] : undefined;
    return fill && fill.ran && !fill.error ? JSON.stringify(fill.ranWith ?? null) : null;
  };
  /**
   * Saklanmamış tablo, güncel kaynak anahtarıyla boş başlar. Doldurma sorgulu tablo, saklı durumu o doldurma anahtarına ait
   * değilse (yeni sonuç, sıfırlama, başarılı kayıt) doldurma satırlarından türetilir.
   */
  const resolvedGridState = (spec: GridSpec, stored: GridState | undefined, states: Record<string, QueryState>): GridState => {
    const fillKey = gridFillKey(spec, states);
    if (fillKey !== null && stored?.fillKey !== fillKey)
      return filledGridState(spec.columns, spec.engine, fillKey, states[queryNames[spec.engine.fillQuery]]?.rows ?? []);
    return stored ?? emptyGridState(gridKey(spec, states));
  };
  const gridStateOf = (spec: GridSpec, states: Record<string, QueryState>) => resolvedGridState(spec, grids[spec.name], states);
  /** `list` tablosunun doldurma sorgusunun durumu (`fillQuery`; yoksa undefined): yüklenirken ya da yüklenemediyse kayıt bekler. */
  const gridFillState = (spec: GridSpec, states: Record<string, QueryState>) => (spec.engine.fillQuery ? states[queryNames[spec.engine.fillQuery]] : undefined);
  const blockData = (block: ComponentDefinition, states: Record<string, QueryState>) => {
    const definitionsId = textValue(block.props?.definitionsQuery).trim();
    const valuesId = textValue(block.props?.valuesQuery).trim();
    const definitions = definitionsId ? states[queryNames[definitionsId]] : undefined;
    const valuesState = valuesId ? states[queryNames[valuesId]] : undefined;
    const specs = customFieldSpecs(definitions?.rows ?? []);
    const typed = customTyped[block.name!] ?? {};
    const values = customFieldValues(specs, valuesState?.rows ?? [], typed);
    // Kirli: yazılan değerlerden en az biri kaynak değerden farklı (başarılı kayıttan sonra yazılanlar kaynağa eşitlenir).
    const stored = customFieldValues(specs, valuesState?.rows ?? [], {});
    const dirty = specs.some((spec) => Object.prototype.hasOwnProperty.call(typed, spec.code) && typed[spec.code] !== stored[spec.code]);
    return { specs, values, dirty, definitions, valuesState };
  };

  // Kapsam: oturum + sorgu durumları + ızgara seçimleri + girişler. Girişin varsayılanı yalnız sorgu/oturum/dokunulmuş
  // girişlerden çözülür (başka girişin varsayılanına bağlanamaz), böylece döngü oluşmaz.
  const effective = (states: Record<string, QueryState>) => {
    // `tarih` (ay/yıl başı, son 3 ay) ve sorguların `satirSayisi`'ı (`rowCount`: sayfalı işlemde sunucunun totalCount'u, diğerlerinde
    // satır sayısı) kapsamdadır; aynı adlı sorgu ya da giriş bunları ezer.
    const counted: PageScope = {};
    for (const [name, state] of Object.entries(states)) counted[name] = { ...state, satirSayisi: state.rowCount };
    const base: PageScope = { kullanici: user, bugun: localToday(), tarih: pageDateScope(), [COUNTS_ROOT]: counts, ...counted, sayfa: { parametre: pageParams, genislik: pageWidth, genis: pageWidth >= WIDE_PAGE } };
    for (const [name, row] of Object.entries(selections)) base[name] = { seciliSatir: row };
    for (const dialog of Object.values(dialogById)) if (dialog.name) base[dialog.name] = { acik: dialogs[dialog.id] === true };
    // Süzgeç alanı değerleri (`{{<ad>.<parametre>}}`): parametreli süzgeç sorguyu yeniden çalıştırır, sayfalı liste 1. sayfaya döner.
    for (const filterBar of filterBars) {
      const model = filterBarModel(filterBar, states);
      if (model) base[filterBar.name!] = filterScope(model.filters, model.values, model.searchParam);
    }
    // Sayfalı listenin kapsamı seçimden önce de vardır (ilk istek sayfa 1 ile gider); kesin sayfa girişlerden sonra çözülür.
    for (const table of pagedTables) base[table.name!] = { seciliSatir: selections[table.name!] ?? null, sayfa: tablePages[table.name!]?.page ?? 1, sayfaBoyutu: 25 };
    for (const input of inputs) {
      if (input.name && input.id in touched) base[input.name] = inputScope(input, touched[input.id], states);
    }
    const scope: PageScope = { ...base };
    const raw: Record<string, InputRaw> = {};
    const defaults: Record<string, InputRaw> = {};
    for (const input of inputs) {
      const inputType = textValue(input.props?.inputType, "text");
      defaults[input.id] = isAutoId(input) ? autoIds[input.id] ?? ""
        : inputType === "checkbox" && typeof input.props?.defaultWhen === "string" && input.props.defaultWhen.trim()
        // Onay kutusunun koşullu varsayılanı (ör. "sayfa.genis == true"); kullanıcı değiştirince onun seçimi geçerlidir.
        ? conditionHolds(input.props.defaultWhen, base, false)
        // `emptyDefault`: varsayılan değer boş çözülürse (ör. yeni kayıtta `{{kart.rows[0].currencyCode}}`) kullanılan sabit değer
        // ("TRY"); kayıt yüklenince saklı değer geçerli olur (her çizimde yeniden çözülür, kullanıcı değiştirene dek). Tarih
        // girişinde şema tek bir tarih bağlamasına da izin verir (`{{bugun}}`: yeni belge bugünle başlar); o da çözülür.
        : rawInputDefault(inputType, interpolate(textValue(input.props?.defaultValue), base) || interpolate(textValue(input.props?.emptyDefault), base));
      if (defaults[input.id] === "" && input.id in firstOptions) defaults[input.id] = firstOptions[input.id];
      raw[input.id] = input.id in touched ? touched[input.id] : defaults[input.id];
      if (input.name) scope[input.name] = inputScope(input, raw[input.id], states);
    }
    // Düzenlenebilir tablolar ve özel alan blokları girişlerden sonra çözülür (varyant kod/ad önekleri girişlere bağlanır).
    for (const grid of gridComponents) {
      const spec = gridSpecOf(grid);
      const matrix = spec.mode === "matrix"
        ? { code: interpolate(textValue(grid.props?.matrixCode), scope), name: interpolate(textValue(grid.props?.matrixName), scope) } : undefined;
      const state = gridStateOf(spec, states);
      const view = gridScope(spec.mode, spec.columns, countedGridState(spec.engine, state), gridSourceRows(spec, states), spec.rowKey, matrix);
      // Doldurma satırlarından türetilen (dokunulmamış) tablo değişmiş sayılmaz.
      const derived = !!spec.engine.fillQuery && state !== grids[spec.name];
      scope[spec.name] = { ...view, degisti: view.degisti && !derived, arama: gridSearchText(spec), ...(spec.totals.length > 0 ? { toplam: gridColumnTotals(spec.totals, view.satirlar) } : {}) };
    }
    for (const block of blockComponents) {
      const data = blockData(block, states);
      scope[block.name!] = { degerler: data.values, degisti: data.dirty };
    }
    const pages: Record<string, { page: number; pageSize: number; key: string }> = {};
    for (const table of pagedTables) {
      const info = tablePageInfo(table, scope, raw);
      pages[table.name!] = info;
      scope[table.name!] = { seciliSatir: selections[table.name!] ?? null, sayfa: info.page, sayfaBoyutu: info.pageSize };
    }
    return { scope, raw, pages, defaults };
  };

  // ERP işlem kataloğu yalnız işlem kullanan sayfalarda getirilir; SQL sorgulu sayfalar ek istek yapmaz.
  // Kod bileşeni callOperation çağırınca katalog ilk kez o an istenir (kod kullanmayan sayfalar ek istek yapmaz).
  const usesOperations = isV2 && queryDefinitions.some((query) => query.operation !== undefined);
  const [codeWantsOperations, setCodeWantsOperations] = useState(false);
  const erpOperations = useErpOperations(token, usesOperations || codeWantsOperations);
  const preview = usePreviewQueries(token, erpOperations.operations);
  // Önizleme sonuçları kapsama sorgu durumu olarak girer; eskimiş önizlemenin satırları gizlenir (`eskidi`).
  const previewStates = useMemo<Record<string, QueryState>>(() => Object.fromEntries(previewQueries.map((query) =>
    [query.name, previewScopeState(preview.entries[query.name])])), [previewQueries, preview.entries]);
  const { states: pageStates, scope, rerun, runWrite, runRead, callOperation, clearResults, resetReads, fetchRead } = usePageQueries({
    queries: isV2 ? pageQueries : [], token, pageCode: page.code, previewId, buildScope: (current) => effective({ ...current, ...previewStates }).scope,
    operations: erpOperations.operations,
  });
  const states = useMemo<Record<string, QueryState>>(() => (previewQueries.length > 0 ? { ...pageStates, ...previewStates } : pageStates),
    [pageStates, previewStates, previewQueries]);
  const statesRef = useRef(states);
  statesRef.current = states;
  // İlk seçenek varsayılanları: seçenekleri yüklenen girişler ve süzgeçler (bkz. firstOptions, firstFilterApplied).
  useEffect(() => {
    const found: Record<string, string> = {};
    for (const input of inputs) {
      if (input.props?.defaultFirst !== true || input.id in firstOptions) continue;
      const optionsId = input.props?.optionsQuery;
      const first = firstInputOption(input.props, filterOptionRows(typeof optionsId === "string" ? states[queryNames[optionsId]] : undefined, input.props?.optionsWhen, scope));
      if (first !== null) found[input.id] = first;
    }
    if (Object.keys(found).length > 0) setFirstOptions((previous) => ({ ...found, ...previous }));
    // Uygulanacak ilk seçenekler güncel değerlerle (çizimdeki) hesaplanır; güncelleyici yalnız hâlâ anahtarı olmayanlara yazar.
    const additions: Record<string, Record<string, string>> = {};
    for (const filterBar of filterBars) {
      if (!parseFilterEntries(filterBar.props?.filters).some((spec) => spec.defaultFirst && !firstFilterApplied.current.has(`${filterBar.id}.${spec.key}`))) continue;
      const filters = filterBarModel(filterBar, states)?.filters ?? [];
      const current = filterValues[filterBar.id] ?? EMPTY_FILTER_VALUES;
      const applied = applyFirstChoices(current, filters, firstFilterApplied.current, `${filterBar.id}.`);
      if (applied === current) continue;
      additions[filterBar.id] = Object.fromEntries(Object.entries(applied.values).filter(([key]) => !Object.prototype.hasOwnProperty.call(current.values, key))) as Record<string, string>;
    }
    if (Object.keys(additions).length === 0) return;
    setFilterValues((previous) => {
      const next = { ...previous };
      for (const [id, values] of Object.entries(additions)) {
        const current = previous[id] ?? EMPTY_FILTER_VALUES;
        const kept = Object.fromEntries(Object.entries(values).filter(([key]) => !Object.prototype.hasOwnProperty.call(current.values, key)));
        next[id] = { ...current, values: { ...current.values, ...kept } };
      }
      return next;
    });
  });
  const inputErrors = operationInputErrors(queryDefinitions, states);
  const events = useMemo(() => createPageEvents(), []);
  const rights = page.rights ?? { view: true };
  const isPreview = Boolean(previewId);
  /**
   * Düzenleme (bodyMap) eşlemi kaynak satırların üzerine birleştirilir: yalnız kullanıcının yazdığı kodlar ve kaynakta değeri
   * olmayan Boolean alanların "false"u gönderilir; dokunulmamış kodlar "" ile gidip kayıtlı değeri silmez.
   */
  const editMapValues = (query: PageQueryDefinition, values: Record<string, unknown>): Record<string, unknown> => {
    const op = query.operation ? erpOperations.operations?.get(query.operation) : undefined;
    if (!op?.bodyMap) return values;
    const parameter = query.parameters.find((item) => item.name === op.bodyMap!.property);
    const path = parameter ? bindingPath(parameter.binding) : null;
    const block = path ? blockComponents.find((component) => `${component.name}.degerler` === path) : undefined;
    if (!parameter || !block) return values;
    const current = currentScope() as Record<string, unknown>;
    const stateOf = (id: string) => (id ? current[queryNames[id]] as QueryState | undefined : undefined);
    const specs = customFieldSpecs(stateOf(textValue(block.props?.definitionsQuery).trim())?.rows ?? []);
    const rows = stateOf(textValue(block.props?.valuesQuery).trim())?.rows ?? [];
    const typed = customTypedRef.current[block.name!] ?? {};
    const all = customFieldValues(specs, rows, typed);
    // Kaynakta değeri olan kodlar eşlemin gerçek kaynağından (bodyMap.sourceOperation okuması) okunur, bloğun valuesQuery'sinden değil.
    const { sourceOperation, keyColumn, valueColumn } = op.bodyMap;
    const mapSource = queryDefinitions.find((candidate) => candidate.kind === "read" && candidate.operation === sourceOperation);
    const mapRows = (mapSource ? (current[mapSource.name] as QueryState | undefined)?.rows : undefined) ?? [];
    const sourceHas = new Set(mapRows.filter((row) => typeof row?.[keyColumn] === "string" && displayText(row[valueColumn]) !== "")
      .map((row) => row[keyColumn] as string));
    const overlay: Record<string, string> = {};
    for (const spec of specs) {
      if (Object.prototype.hasOwnProperty.call(typed, spec.code)) overlay[spec.code] = all[spec.code];
      else if (spec.inputType === "checkbox" && !sourceHas.has(spec.code)) overlay[spec.code] = "false";
    }
    return { ...values, [parameter.name]: overlay };
  };
  /**
   * Kullanıcının boşalttığı alanlar: `{{<giriş>.value}}` bağlı, girişi dokunulmuş ve ham değeri boş, çözülen değeri null olan
   * parametreler. Kaynak kayıttan başlayan güncellemede bunlar kaynak değeri korumak yerine null yazar (isteğe bağlı sayıyı
   * temizlemek). Boşaltılması geçersiz alanlar (null kabul etmeyen istek üyeleri) tanımda zorunlu işaretlenir, buraya ulaşmaz.
   */
  const clearedParameters = (query: PageQueryDefinition, values: Record<string, unknown>): Set<string> => {
    const cleared = new Set<string>();
    const typed = touchedRef.current;
    for (const parameter of query.parameters) {
      const name = bindingPath(parameter.binding)?.match(/^([A-Za-z_][A-Za-z0-9_]*)\.value$/)?.[1];
      const input = name ? inputs.find((candidate) => candidate.name === name) : undefined;
      if (!input || !(input.id in typed) || inputIsCheckbox(input)) continue;
      const raw = typed[input.id];
      if (typeof raw === "string" && raw.trim() === "" && values[parameter.name] === null) cleared.add(parameter.name);
    }
    return cleared;
  };
  // Başarılı yazma `{{<tablo>.satirlar}}` bağlıyorsa o list/matrix tablosunun satırları sıfırlanır (her yazma yolu buradan geçer).
  const trackedWrite = async (query: PageQueryDefinition, resolved: Record<string, unknown>, confirmWrite: boolean, options?: WriteOptions) => {
    const values = editMapValues(query, resolved);
    // Gönderilen satırların taslak anahtarları: sunucunun `<liste>[i]` hataları sonradan silinen/atlanan satırlarda kaymasın.
    sentKeys.current[query.name] = Object.fromEntries(gridComponents.filter((grid) => bindsGrid(query, grid.name!, "satirlar")).map((grid) => {
      const spec = gridSpecOf(grid);
      return [spec.name, gridSentRows(spec, gridStateOf(spec, statesRef.current)).map((row) => row.key)];
    }));
    const result = await runWrite(query, values, confirmWrite, clearedParameters(query, values));
    // Silinen kaydın kart sekmeleri kapanır (her silme yolu: İşlem Çubuğu, toplu/satır silme, düğme, dizi). Bu sekme yalnız
    // kendi kaydını sildiğinde (`recordDelete`) kapanır; satır silmesi belgeyi gösteren kartı kapatmaz.
    const recordDelete = options?.recordDelete === true;
    publishRecordsDeleted({ ids: deletedRecordIds(query, values, { recordDelete }), from: tabKey, closeSource: recordDelete });
    // Yazma sonucu (`<sorgu>.sonuc`) bir sonraki çizime kadar güncel kapsama bindirilir: kayıttan hemen sonra çalışan eylem
    // (ör. `afterSaveButton` gezinmesi `{{olustur.sonuc.id}}`) sonucu görür.
    if (result && typeof result === "object" && "sonuc" in result && result.sonuc !== undefined) freshResults.current[query.name] = { sonuc: result.sonuc };
    // Başarılı yazma bağladığı tekrar deneme kimliklerini yeniler (hata fırlatırsa kimlik korunur: yeniden deneme aynı istektir).
    const boundNames = new Set(boundInputNames(query));
    rotateAutoIds(inputs.filter((input) => isAutoId(input) && !!input.name && boundNames.has(input.name)).map((input) => input.id));
    const sent = gridComponents.filter((grid) => gridSpecOf(grid).mode !== "stage" && bindsGrid(query, grid.name!, "satirlar")).map((grid) => grid.name!);
    if (sent.length > 0) {
      setGrids((previous) => without(previous, sent));
      setGridShown((previous) => without(previous, sent));
    }
    return result;
  };
  const writeFor = (query: PageQueryDefinition, confirmWrite: boolean, options?: WriteOptions) => trackedWrite(query, resolveQueryParameters(query, scope), confirmWrite, options);
  const writeWith = (query: PageQueryDefinition, values: Record<string, unknown>, confirmWrite: boolean) => trackedWrite(query, values, confirmWrite);
  // Bekleyen işlemler (dizi adımları, istem/onay sonrası) render anındaki değil en güncel kapsamı okur.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Çizimden beri biten yazmaların sonuçları (çizim kapsamı onları içerince boşalır).
  const freshResults = useRef<Record<string, { sonuc: unknown }>>({});
  freshResults.current = {};
  const currentScope = () => (Object.keys(freshResults.current).length > 0 ? mergeOverlay(scopeRef.current, freshResults.current) : scopeRef.current);
  // Eylemi olan düğme (sorgu, dizi, pencere, iş akışı) İşlemler menüsüne taşınır; eylemsiz düğme sayfada kalır. İşlemler menüsü
  // gizliyse (`hiddenCommands` / `commandWhen`, kapsama bağlı) menü düğmeleri de sayfada kalır.
  const moreHidden = !!bar && barCommandHidden(bar.props, "more", barCommandVisible(bar.props, scope));
  const movedButtons = useMemo(() => (bar ? movedButtonIds(flat, (button) => buttonActionOf(button.props ?? {}, queryById, dialogIds, inputIds) !== null, moreHidden)
    : new Set<string>()), [bar, flat, queryById, dialogIds, inputIds, moreHidden]);
  const loadIds = useMemo(() => queryDefinitions.filter((query) => query.kind === "read" && query.runOn === "load").map((query) => query.id), [queryDefinitions]);

  // Sayfa yüklendi: açılış sorgularının hiçbiri yüklenmiyorken load bir kez yayımlanır. ERP kataloğu yüklenemediyse
  // işlem sorguları hiç çalışmaz; onlar sonuçlanmış sayılır (load yine yayımlanır).
  const operationsFailed = Boolean(erpOperations.error);
  const loadSettled = isV2 && queryDefinitions.every((query) => query.kind !== "read" || query.runOn !== "load"
    || (query.operation !== undefined && operationsFailed) || !states[query.name]?.loading);
  useEffect(() => { if (loadSettled && !events.isLoaded()) events.emit("load", {}); }, [loadSettled, events]);

  // Köprü (BridgeHost) bir kez kurulur ve sayfanın en güncel durumunu okur; çerçeve her girdiye güvenilmez gözle bakar.
  const codeLatest = useRef({ scope, inputs, queryDefinitions, rights, isPreview, writeFor, runRead, callOperation, erpOperations });
  codeLatest.current = { scope, inputs, queryDefinitions, rights, isPreview, writeFor, runRead, callOperation, erpOperations };
  // İstemci giriş doğrulaması (aşağıda tanımlanır); köprünün yazma yolu da diğer yazma yolları gibi önce doğrular.
  const codeValidate = useRef<(query: PageQueryDefinition) => string | null>(() => null);
  const catalogWaiters = useRef(new Set<() => void>());
  useEffect(() => {
    if (!erpOperations.operations && !erpOperations.error) return;
    const waiters = [...catalogWaiters.current];
    catalogWaiters.current.clear();
    waiters.forEach((wake) => wake());
  }, [erpOperations.operations, erpOperations.error]);
  useEffect(() => () => { catalogWaiters.current.forEach((wake) => wake()); catalogWaiters.current.clear(); }, []);
  const codeHost = useMemo<BridgeHost>(() => {
    const catalog = async (): Promise<Map<string, ErpOperation>> => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { operations, error } = codeLatest.current.erpOperations;
        if (operations) return operations;
        if (error) throw new Error(`ERP işlem kataloğu yüklenemedi: ${error}`);
        if (attempt === 1) break;
        setCodeWantsOperations(true);
        await new Promise<void>((resolve) => {
          const wake = () => { clearTimeout(timer); catalogWaiters.current.delete(wake); resolve(); };
          const timer = setTimeout(wake, CATALOG_WAIT_MS);
          catalogWaiters.current.add(wake);
        });
      }
      throw new Error("ERP işlem kataloğu yüklenemedi.");
    };
    return {
      get: (path) => resolvePath(codeLatest.current.scope, path),
      setInput: (name, value) => {
        const input = codeLatest.current.inputs.find((candidate) => candidate.name === name);
        if (!input) throw new Error(`Giriş bulunamadı: ${name}`);
        const raw: InputRaw = inputIsCheckbox(input) ? value === true || value === "true" : value === null ? "" : String(value);
        setTouched((current) => ({ ...current, [input.id]: raw }));
      },
      runQuery: async (name) => {
        const current = codeLatest.current;
        const query = current.queryDefinitions.find((candidate) => candidate.name === name);
        if (!query) throw new Error(`Sorgu bulunamadı: ${name}`);
        if (current.rights[query.kind === "read" ? "view" : query.kind] !== true) throw new Error(NO_RIGHTS);
        if (query.kind === "read") {
          const state = await current.runRead(query.id);
          return { rows: state.rows, rowCount: state.rowCount };
        }
        const outcome = await runWriteAction({
          query, isPreview: current.isPreview, inFlight: writeLock, confirm: { enabled: false },
          write: (target, confirmWrite) => codeLatest.current.writeFor(target, confirmWrite),
          validate: () => codeValidate.current(query),
          errorText: (cause) => writeErrorText("", cause),
          ...codeWriteHooks(events),
        });
        if (outcome.ok) return { affectedRows: outcome.affectedRows, sonuc: outcome.sonuc ?? null };
        if ("busy" in outcome) throw new Error(WRITE_BUSY);
        if ("cancelled" in outcome) throw new Error("İşlem iptal edildi.");
        throw new Error(outcome.error);
      },
      callOperation: async (name, values) => {
        const op = (await catalog()).get(name);
        if (!op) throw new Error(`ERP işlemi bulunamadı: ${name}`);
        const current = codeLatest.current;
        // Yazma işlemi sayfanın ekle/güncelle/sil hakkını ister; tutarsız (yazma + pageKind "read") giriş reddedilir.
        const right = op.kind === "read" ? "view" : op.pageKind === "read" ? null : op.pageKind;
        if (!op.allowed || !right || current.rights[right] !== true) throw new Error(NO_RIGHTS);
        if (op.kind === "read") {
          const mapped = mapOperationResult(op, await current.callOperation(op, values));
          return { rows: mapped.rows, rowCount: mapped.rowCount };
        }
        if (current.isPreview) throw new Error("Önizlemede ERP yazma işlemi çalıştırılmaz.");
        if (writeLock.current) throw new Error(WRITE_BUSY);
        writeLock.current = true;
        try { return { sonuc: await current.callOperation(op, values) }; } finally { writeLock.current = false; }
      },
      subscribe: () => undefined,
      setHeight: () => undefined,
    };
  }, [events]);

  const current = effective(states);
  const inputValues = current.raw;
  // Arama metni veya listenin sorgu değerleri değişti: sayfa 1'e döner ve öyle saklanır (eski anahtara dönülse de 1 kalır).
  const stalePages = Object.entries(current.pages).filter(([name, info]) => tablePages[name] && tablePages[name].key !== info.key);
  const stalePageSignature = JSON.stringify(stalePages.map(([name, info]) => [name, info.key]));
  useEffect(() => {
    if (stalePages.length === 0) return;
    setTablePages((previous) => {
      const next = { ...previous };
      for (const [name, info] of stalePages) next[name] = { page: 1, key: info.key };
      return next;
    });
  }, [stalePageSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Girişin istemci doğrulama iletisi (yoksa null); kurallar girişin kendi özelliklerinden okunur. */
  const inputMessage = (componentId: string, raw: InputRaw | undefined): string | null => {
    const input = inputById[componentId];
    if (!input) return null;
    return validateInputValue(textValue(input.props?.inputType, "text"), inputRules(withConditionalRequired(input.props ?? {}, input.props, currentScope())), raw ?? "");
  };
  const storeMessage = (componentId: string, message: string | null) => setValidationErrors((current) => {
    if (message === null) {
      if (!(componentId in current)) return current;
      const next = { ...current };
      delete next[componentId];
      return next;
    }
    return current[componentId] === message ? current : { ...current, [componentId]: message };
  });
  // Doğrulanmayan girişler: kendisi veya bir sahibi `visibleWhen` ile gizli (kapalı pencere de gizli sahiptir), ya da kendisi `disabledWhen` ile pasif.
  const skipsValidation = (input: ComponentDefinition) =>
    ancestorsOf(input.id).some((id) => flatById[id] && (!conditionHolds(flatById[id].props?.visibleWhen, scope, true)
      || (flatById[id].type === "dialog" && dialogs[id] !== true)))
    || conditionHolds(input.props?.disabledWhen, scope, false)
    // Gizli (`hidden`) giriş hiç çizilmez: doğrulanmaz.
    || (input.type === "input" && input.props?.hidden === true);
  const validateFor = (query: PageQueryDefinition): string | null => validateForAll([query]);
  /** Sorguların bağladığı girişlerin birleşimini tek geçişte doğrular (kayıt dizisi: etkin adımlar). */
  const validateForAll = (queries: PageQueryDefinition[]): string | null => {
    const names: string[] = [];
    for (const query of queries) {
      for (const name of boundInputNames(query)) if (!names.includes(name)) names.push(name);
      // Arama kutusu `{{ad.seciliSatir…}}` ile de bağlanabilir: o zaman da doğrulanır.
      for (const parameter of query.parameters) {
        const root = /^([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir(?:\.|$)/.exec(bindingPath(parameter.binding) ?? "")?.[1];
        if (root && !names.includes(root) && inputs.some((input) => input.name === root && textValue(input.props?.inputType, "text") === "lookup")) names.push(root);
      }
    }
    const failures: Record<string, string> = {};
    const cleared: string[] = [];
    for (const input of inputs) {
      if (!input.name || !names.includes(input.name)) continue;
      const message = skipsValidation(input) ? null : inputMessage(input.id, inputValues[input.id]);
      if (message) failures[input.id] = message; else cleared.push(input.id);
    }
    setValidationErrors((current) => {
      const next = { ...current, ...failures };
      for (const id of cleared) delete next[id];
      return next;
    });
    // Sorguların bağladığı düzenlenebilir tablolar (`satirlar` ya da yineleme listesi) ve özel alan blokları (`degerler`).
    const componentFailures: string[] = [];
    const shownGrids: Record<string, boolean> = {};
    for (const grid of gridComponents) {
      const spec = gridSpecOf(grid);
      if (!queries.some((query) => bindsGrid(query, spec.name))) continue;
      // Doldurma satırları yükleniyor ya da yüklenemedi: yarım belge kaydedilmez (güncelleme tüm satır listesini gönderir).
      const fill = gridFillState(spec, states);
      if (fill?.loading) return SOURCE_LOADING;
      if (fill?.error) return SOURCE_FAILED;
      const counted = countedGridState(spec.engine, gridStateOf(spec, states));
      const errors = skipsValidation(grid) ? {} : withoutLockedErrors(spec.engine, counted, validateGrid(spec.mode, spec.columns, counted, gridSourceRows(spec, states), spec.rowKey, spec.maxRows, gridFixedValues(grid, spec, currentScope()), spec.minRows));
      shownGrids[spec.name] = Object.keys(errors).length > 0;
      if (shownGrids[spec.name]) componentFailures.push(grid.id);
    }
    const shownBlocks: Record<string, boolean> = {};
    for (const block of blockComponents) {
      if (!queries.some((query) => bindsBlock(query, block.name!))) continue;
      const data = blockData(block, states);
      const errors = skipsValidation(block) ? {} : validateCustomFields(data.specs, data.values);
      shownBlocks[block.name!] = Object.keys(errors).length > 0;
      if (shownBlocks[block.name!]) componentFailures.push(block.id);
    }
    if (Object.keys(shownGrids).length > 0) setGridShown((current) => ({ ...current, ...shownGrids }));
    if (Object.keys(shownBlocks).length > 0) setBlockShown((current) => ({ ...current, ...shownBlocks }));
    const failing = [...Object.keys(failures), ...componentFailures];
    if (failing.length === 0) return null;
    // Her sekmeler bileşeninde (sekme sırasıyla) geçersiz girişi doğrudan veya bir sahip üzerinden içeren ilk sekme.
    const targets: Record<string, number> = {};
    for (const component of flat) {
      if (component.type !== "tabs") continue;
      const index = parseTabs(component.props?.tabs).findIndex((tab) => failing.some((id) => ancestorsOf(id).some((owner) => tab.ids.includes(owner))));
      if (index >= 0) targets[component.id] = index;
    }
    setErrorJump((current) => ({ signal: (current?.signal ?? 0) + 1, targets }));
    return VALIDATION_BLOCKED;
  };

  codeValidate.current = validateFor;

  const setInput = (componentId: string, value: InputRaw) => {
    setTouched((previous) => ({ ...previous, [componentId]: value }));
    // Gösterilen ileti, değer geçerli olunca kalkar (geçersiz kaldıkça güncel iletiyle kalır).
    const message = inputMessage(componentId, value);
    setValidationErrors((previous) => {
      if (!(componentId in previous)) return previous;
      const next = { ...previous };
      if (message) next[componentId] = message; else delete next[componentId];
      return next;
    });
  };
  /** `setInput` atamaları: şablonlar en güncel kapsamla (ve satır bindirmesiyle) birlikte çözülür, sonra girişlere yazılır. */
  const applyAssignments = (props: Record<string, unknown>, overlay: Record<string, unknown>) => {
    const assignmentScope = mergeOverlay(currentScope(), overlay);
    for (const { inputId, raw } of resolveAssignments(props.assignments, assignmentScope, (id) => inputIsCheckbox(inputById[id]))) {
      if (inputById[inputId]) setInput(inputId, raw);
    }
  };
  /** `clearsOnChange`: girişin değeri kullanıcı tarafından değişince hedef girişler ve tablo sütunları (her satırda) temizlenir. */
  const applyClears = (componentId: string) => {
    for (const target of stringList(inputById[componentId]?.props?.clearsOnChange)) {
      const dot = target.indexOf(".");
      if (dot < 0) {
        if (target === componentId || !inputById[target]) continue;
        setInput(target, inputIsCheckbox(inputById[target]) ? false : "");
        setLookupState((previous) => without(previous, [target]));
        continue;
      }
      const grid = gridByName[target.slice(0, dot)];
      if (grid) dispatchGrid(gridSpecOf(grid), { type: "clearColumn", code: target.slice(dot + 1) });
    }
  };
  const changeInput = (componentId: string, value: InputRaw) => {
    const previous = inputValues[componentId] ?? "";
    setInput(componentId, value);
    if (previous !== value) applyClears(componentId);
  };
  /** Seçim girişinin (select) seçenek durumu: `optionsWhen` ile süzülür, geçerli değerin satırı kalır (değer görünmeye devam eder). */
  const inputOptions = (component: ComponentDefinition): QueryState | undefined => {
    const optionsId = component.props?.optionsQuery;
    if (typeof optionsId !== "string") return undefined;
    const state = states[queryNames[optionsId]];
    const valueColumn = textValue(component.props?.optionValueColumn) || state?.columns[0]?.code || "";
    const currentValue = textValue(inputValues[component.id]);
    return filterOptionRows(state, component.props?.optionsWhen, scope, (row) => currentValue !== "" && displayText(row[valueColumn]) === currentValue);
  };
  const lookupFor = (component: ComponentDefinition, props: Record<string, unknown>): LookupBinding => {
    const optionsId = typeof props.optionsQuery === "string" ? props.optionsQuery : "";
    const optionsState = optionsId ? states[queryNames[optionsId]] : undefined;
    // `optionsWhen` tutmayan satırları listeden gizler; seçili değerin etiketi süzülmemiş satırlardan çözülür.
    const shownState = filterOptionRows(optionsState, props.optionsWhen, scope);
    // Sunucu araması: seçenek sorgusunun bir parametresi `{{<ad>.search}}` bağlıyor; değilse satırlar istemcide süzülür.
    const serverSearch = !!component.name && !!queryById[optionsId]?.parameters.some((parameter) => bindingPath(parameter.binding) === `${component.name}.search`);
    const id = component.id;
    const value = textValue(inputValues[id]);
    const stored = lookupState[id] && "value" in lookupState[id] ? { value: lookupState[id].value ?? "", label: lookupState[id].label ?? "" } : null;
    const own = !stored && value !== "" && shownState !== optionsState ? lookupCandidates(props, optionsState, "", false).find((option) => option.value === value) : undefined;
    return {
      options: lookupOptionsWithValue(props, shownState, lookupState[id]?.search ?? "", serverSearch, value),
      loading: Boolean(optionsState?.loading), error: optionsState?.error || undefined,
      onSearch: (text) => setLookupState((previous) => ({ ...previous, [id]: { ...previous[id], search: text } })),
      selected: stored ?? (own ? { value: own.value, label: own.label } : null),
      onChange: (next, row, label) => {
        setLookupState((previous) => ({ ...previous, [id]: { search: previous[id]?.search ?? "", value: next, row, label } }));
        changeInput(id, next);
      },
    };
  };
  const tablePaging = (table: ComponentDefinition) => {
    const name = table.name;
    const info = name && table.props?.paging === "server" ? current.pages[name] : undefined;
    if (!name || !info) return undefined;
    return { page: info.page, pageSize: info.pageSize, onPage: (page: number) => setTablePages((previous) => ({ ...previous, [name]: { page: Math.max(1, page), key: info.key } })) };
  };

  /** Pencerenin doğrudan ya da formCard/facetPanel, sekmeler, bölüm/kart çocukları ve sayfalı liste araması üzerinden sahiplendiği girişler. */
  const dialogInputIds = (dialogId: string): string[] => dialogContent(dialogId).filter((id) => flatById[id]?.type === "input");
  /** Pencerenin doğrudan ya da sahipler üzerinden içerdiği tüm bileşenler (girişler, kartlar, tablolar, bloklar…). */
  const dialogContent = (dialogId: string): string[] => {
    const found: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const component = flatById[id];
      if (!component) return;
      found.push(id);
      if (component.type === "input") return;
      if (component.type === "formCard" || component.type === "facetPanel") idList(component.props?.inputs).forEach(visit);
      if (component.type === "tabs") parseTabs(component.props?.tabs).forEach((tab) => tab.ids.forEach(visit));
      if (component.type === "dataTable" && typeof component.props?.searchInput === "string") visit(component.props.searchInput.trim());
      (component.children ?? []).forEach((child) => visit(child.id));
    };
    idList(dialogById[dialogId]?.props?.contains, 20).forEach(visit);
    return found;
  };
  const openDialog = (id: string, opener: HTMLElement | null) => {
    const dialog = dialogById[id];
    if (!dialog) return;
    // resetOnOpen (varsayılan açık): sahip olunan girişlerin yazılan değeri, doğrulama iletisi ve arama durumu temizlenir.
    if (dialog.props?.resetOnOpen !== false) {
      const owned = dialogInputIds(id);
      setTouched((previous) => without(previous, owned));
      setValidationErrors((previous) => without(previous, owned));
      setLookupState((previous) => without(previous, owned));
      // Yeni açılış yeni istektir: pencerenin tekrar deneme kimlikleri yenilenir.
      rotateAutoIds(owned);
    }
    dialogOpeners.current[id] = opener;
    setDialogStatus((previous) => ({ ...previous, [id]: null }));
    setDialogs((previous) => ({ ...previous, [id]: true }));
  };
  const closeDialog = (id: string) => setDialogs((previous) => (previous[id] ? { ...previous, [id]: false } : previous));
  /** Tabloların bekleyen satırları ve blokların yazılan değerleri (ve gösterilen iletileri) atılır. */
  const resetCollections = (ids: string[]) => {
    const names = ids.map((id) => flatById[id]).filter((component) => component && (component.type === "editableGrid" || component.type === "customFieldsBlock") && component.name)
      .map((component) => component!.name!);
    if (names.length === 0) return;
    setGrids((previous) => without(previous, names));
    setGridShown((previous) => without(previous, names));
    setCustomTyped((previous) => without(previous, names));
    setBlockShown((previous) => without(previous, names));
  };
  /** Kullanıcı kapatması (Esc, Kapat, Vazgeç): içerik kirliyse sorulur; kapanınca tabloları ve blokları atılır (kirliyse girişleri de). */
  const requestCloseDialog = (id: string) => {
    const content = dialogContent(id);
    const close = (dirty: boolean) => {
      resetCollections(content);
      if (dirty) {
        const owned = content.filter((owned) => flatById[owned]?.type === "input");
        setTouched((previous) => without(previous, owned));
        setValidationErrors((previous) => without(previous, owned));
        setLookupState((previous) => without(previous, owned));
      }
      closeDialog(id);
    };
    if (!content.some((owned) => flatById[owned] && componentDirty(flatById[owned]))) { close(false); return; }
    void confirmDialog({ title: "Pencere kapatılsın mı?", message: LEAVE_MESSAGE, confirmLabel: "Kapat" }).then((ok) => { if (ok) close(true); });
  };

  /** Kaynak okumaları: adımların `sourceOperation` ve `bodyMap.sourceOperation` okumaları ile yinelenen tabloların `sourceQuery`'si. */
  const sourceReadIds = (steps: SequenceStep[]): string[] => {
    const ids = new Set<string>();
    const readOf = (operation: string | null | undefined) => {
      if (!operation) return;
      for (const query of queryDefinitions) if (query.kind === "read" && query.operation === operation) ids.add(query.id);
    };
    for (const step of steps) {
      const op = step.query.operation ? erpOperations.operations?.get(step.query.operation) : undefined;
      readOf(op?.sourceOperation);
      readOf(op?.bodyMap?.sourceOperation);
      if (step.iterate) {
        const grid = flat.find((component) => component.type === "editableGrid" && component.name === step.iterate!.grid);
        const sourceQuery = textValue(grid?.props?.sourceQuery).trim();
        if (sourceQuery && queryById[sourceQuery]?.kind === "read") ids.add(sourceQuery);
      }
    }
    return [...ids];
  };
  /**
   * Okuma kullanılabilir mi: yükleniyor ("loading"), hata verdi ya da hiç çalışmadı ("failed"), değilse null. Parametresi
   * eksik olduğu için boş kalan okuma (ör. Yeni'de seçili kaydın ayrıntısı) kullanılabilir sayılır.
   */
  const readProblem = (query: PageQueryDefinition): "loading" | "failed" | null => {
    // Sorgu durumu kapsamdan değil sorgu durumlarından okunur: aynı adlı tablo ya da giriş kapsamda sorgunun yerini alabilir.
    const state = statesRef.current[query.name];
    if (!state) return null;
    if (state.loading) return "loading";
    if (state.error) return "failed";
    if (state.ran) return null;
    const op = query.operation ? erpOperations.operations?.get(query.operation) : undefined;
    if (op && missingRequiredValue(op, resolveQueryParameters(query, currentScope()), null)) return null;
    // Açılışta çalışan okuma birazdan çalışır; elle çalışan hiç çalışmamış okuma kaynak olarak kullanılamaz.
    return query.runOn === "load" ? "loading" : "failed";
  };
  /**
   * Adım yazacak bir şey taşımıyor mu: yalnız özel alan bloklarını (`degerler`) bağlıyor (giriş ve düzenlenebilir tablo yok)
   * ve bu bloklarda kullanıcının değiştirdiği değer yok.
   */
  const writesNothing = (query: PageQueryDefinition): boolean => {
    const blocks = blockComponents.filter((block) => bindsBlock(query, block.name!));
    if (blocks.length === 0 || boundInputNames(query).length > 0 || gridComponents.some((grid) => bindsGrid(query, grid.name!))) return false;
    const current = currentScope() as Record<string, unknown>;
    return blocks.every((block) => !(isPlainObject(current[block.name!]) && (current[block.name!] as Record<string, unknown>).degisti === true));
  };
  /** Dizinin girişlerini bağlayan formCard'lar (kayıt anahtarı olanlar). */
  const boundRecordCards = (queries: PageQueryDefinition[]) => {
    const names = new Set(queries.flatMap((query) => boundInputNames(query)));
    return formCards.filter((card) => textValue(card.props?.recordKey).trim() !== ""
      && idList(card.props?.inputs).some((id) => !!inputById[id]?.name && names.has(inputById[id].name!)));
  };
  /**
   * Kayıt dizisinin ön denetimi (ilk yazmadan önce): etkin adımların ERP izni; kayıt okumaları (girişleri bağlayan kartların
   * `recordKey`'i ve `sequenceWhen` koşulları) ile adımların kaynak okumaları yüklenmiş ve hatasız olmalı; kayıt tablosunda
   * seçim varken kayıt anahtarı boş olmamalı. Aksi halde okunamayan kayıt yeni kayıt sanılır ya da kısmi kayıt olur.
   */
  const sequenceReadGuard = (queries: PageQueryDefinition[], active: SequenceStep[], when: Record<string, string>): string | null => {
    const denied = active.find((step) => !step.allowed);
    if (denied) return `${denied.label} için yetkiniz yok; bu değişiklik kaydedilemez. Hiçbir değişiklik kaydedilmedi.`;
    const readByName = new Map(queryDefinitions.filter((query) => query.kind === "read").map((query) => [query.name, query]));
    const reads = new Set(sourceReadIds(active).map((id) => queryById[id]).filter((query): query is PageQueryDefinition => !!query));
    const cards = boundRecordCards(queries);
    const roots = [
      ...cards.flatMap((card) => [...textValue(card.props?.recordKey).matchAll(PLACEHOLDER_ROOT)].map((match) => match[1])),
      ...Object.values(when).flatMap((condition) => [...condition.matchAll(/(?<![\w.'"])([A-Za-z_][A-Za-z0-9_]*)\./g)].map((match) => match[1])),
    ];
    for (const root of roots) { const read = readByName.get(root); if (read) reads.add(read); }
    const problems = [...reads].map(readProblem);
    if (problems.includes("loading")) return SOURCE_LOADING;
    if (problems.includes("failed")) return SOURCE_FAILED;
    // Kayıt tablosunda seçim var ama kayıt anahtarı çözülmedi (okuma boş döndü): güncelleme yerine oluşturma yapılmasın.
    const selected = selectionsRef.current;
    const unread = cards.some((card) => [...(recordTableSets.byCard[card.id] ?? [])].some((name) => !!selected[name])
      && interpolate(textValue(card.props?.recordKey), currentScope()).trim() === "");
    return unread ? SOURCE_FAILED : null;
  };

  /**
   * Kayıt dizisi ya da istemli tek yazma (Wire sözleşmesi): etkin adımlar (`sequenceWhen`, yineleme satırları, katalog izni),
   * tek doğrulama, beforeSave, istem/onay, adımlar; sonra satır kesinleştirme, yenileme ve sonuç temizleme.
   */
  const startSequence = async (source: SequenceSource) => {
    const { props } = source;
    const overlay = source.overlay ?? {};
    const sequenceIds = idList(props.saveSequence, 8);
    const single = textValue(props.saveQuery).trim() || textValue(props.queryId).trim();
    const queries = (sequenceIds.length > 0 ? sequenceIds : single ? [single] : [])
      .map((id) => queryById[id]).filter((query): query is PageQueryDefinition => !!query && query.kind !== "read");
    if (queries.length === 0) return;
    const baseScope = mergeOverlay(currentScope(), overlay);
    const bound = bindProps(props, baseScope);
    const text = (key: string) => interpolate(textValue(props[key]), baseScope).trim();
    // `sequenceWhen` ilk adımdan önce bir kez, sayfa kapsamında (ve satır bindirmesiyle) değerlendirilir; anahtar sorgu kimliğidir.
    const when: Record<string, string> = {};
    for (const entry of stringList(props.sequenceWhen).slice(0, 8)) {
      const index = entry.indexOf("=");
      if (index > 0) when[entry.slice(0, index).trim()] = entry.slice(index + 1).trim();
    }
    const names = new Set(queries.map((query) => query.name));
    // İzni olmayan ve yalnız özel alan blokları yazan adım, bloklarda değişiklik yoksa yazacak bir şeyi olmadığından hiç çalışmaz
    // (sıfır satırlı yinelenen adım gibi); değişiklik varsa ön denetim tüm kaydı ilk yazmadan önce reddeder.
    const steps: SequenceStep[] = queries.filter((query) => !(query.id in when) || conditionHolds(when[query.id], baseScope, true)).map((query) => {
      const op = query.operation ? erpOperations.operations?.get(query.operation) : undefined;
      const refs = new Set<string>();
      for (const parameter of query.parameters) {
        const root = bindingPath(parameter.binding)?.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
        if (root && (root === "onceki" || (root !== query.name && names.has(root)))) refs.add(root);
      }
      const iteration = iterationOf(query);
      return {
        query, label: stepLabel(query, op), allowed: query.operation ? op?.allowed !== false : true, refs: [...refs],
        iterate: iteration ? { ...iteration, rows: gridIteration(iteration.grid, iteration.list) } : null,
      };
    }).filter((step) => step.allowed || !writesNothing(step.query));
    // Doğrulama yalnız çalışacak adımları kapsar (yürütücünün süzgeciyle aynı: sıfır satırlı yinelenen adım atlanır).
    const active = steps.filter((step) => !step.iterate || step.iterate.rows.length > 0).map((step) => step.query);
    const promptLabel = text("promptLabel");
    // İstemin açıklaması (`promptText`, bağlamalı) ve yanıtın en fazla uzunluğu (`promptMaxLength`, 1–4000).
    const promptText = text("promptText");
    const promptMaxLength = typeof props.promptMaxLength === "number" && Number.isInteger(props.promptMaxLength) && props.promptMaxLength >= 1
      && props.promptMaxLength <= 4000 ? props.promptMaxLength : undefined;
    const buttonText = textValue(bound.text ?? bound.label) || textValue(bound.title) || "Eylem";
    const kinds = new Set(queries.map((query) => query.kind));
    // Kısmi oluşturmadan sonraki deneme: girişleri yazan oluşturma ve güncelleme adımlarının hepsi koşullarıyla atlandıysa
    // (oluştur zaten başarılı, güncelle kayıt seçili olmadığı için seçilmedi) alan değişiklikleri gönderilmez; kullanıcıya söylenir.
    const fieldsSkipped = queries.some((query) => statesRef.current[query.name]?.sonuc !== undefined)
      && (["insert", "update"] as const).every((kind) => queries.some((query) => query.kind === kind && boundInputNames(query).length > 0))
      && steps.every((step) => boundInputNames(step.query).length === 0);
    const outcome = await runSaveSequence({
      steps, stopOnError: props.stopOnError !== false, lock: writeLock, isPreview,
      confirm: { enabled: props.confirmEnabled === true, text: text("confirmText"), tone: kinds.has("delete") || kinds.has("update") ? "danger" : "default" },
      successText: text("successMessage"),
      // Kayıt ya da kaynak okuması yüklenirken, hata verdiyse ya da hiç çalışmadıysa (ör. kart açılır açılmaz kaydet, özel alan
      // değerleri okunamadı) ve etkin bir adımın ERP işlemine izin yoksa hiçbir yazma başlamaz: kısmi kayıt olmaz.
      validate: () => sequenceReadGuard(queries, steps.filter((step) => active.includes(step.query)), when)
        ?? validateForAll(active),
      beforeWrite: (query) => events.beforeSave(query.name),
      prompt: promptLabel ? () => promptDialog({ title: buttonText, label: promptLabel, message: promptText || undefined, maxLength: promptMaxLength,
        required: props.promptRequired === true, multiline: true, confirmLabel: buttonText }) : undefined,
      promptName: promptLabel ? source.name : undefined,
      resolve: (query, stepOverlay) => resolveQueryParameters(query, mergeOverlay(mergeOverlay(currentScope(), overlay), stepOverlay)),
      write: async (query, values, confirmWrite) => {
        source.onBusy(true);
        try { return await writeWith(query, values, confirmWrite); } finally { source.onBusy(false); }
      },
      errorText: (cause) => writeErrorText(text("errorMessage"), cause),
      afterWrite: (payload) => events.emit("afterSave", payload),
    });
    if (outcome.status === "busy" || outcome.status === "cancelled") return;
    if (outcome.status === "blocked") { source.onStatus({ tone: "error", text: outcome.message }); return; }
    if (fieldsSkipped) {
      source.onStatus({ tone: "warning", text: outcome.message === NOTHING_TO_SAVE ? CREATED_REOPEN : `${outcome.message} ${CREATED_REOPEN}` });
    } else source.onStatus({ tone: outcome.tone, text: outcome.message });
    // Gönderilen yineleme satırları tablonun bekleyen listelerinden düşer.
    const committed = new Map<string, { grid: string; list: SequenceList; keys: string[] }>();
    for (const call of outcome.calls) {
      const iterate = steps.find((step) => step.query.name === call.query)?.iterate;
      if (!call.ok || !iterate || call.rowKey === undefined) continue;
      const key = `${iterate.grid}|${iterate.list}`;
      if (!committed.has(key)) committed.set(key, { grid: iterate.grid, list: iterate.list, keys: [] });
      committed.get(key)!.keys.push(call.rowKey);
    }
    committed.forEach((group) => commitGrid(group.grid, group.list, group.keys));
    if (outcome.succeeded === 0) return;
    const refresh = stringList(props.refreshQueries);
    if (outcome.calls.every((call) => call.ok)) {
      // Satır işleminin istemli tek yazması (ör. "Ters kayıt") yalnız refreshQueries'i yeniler: açılış sorgularının yenilenmesi
      // yeni satır nesneleri döndürür ve tabloların seçimini (pencere açıkken) düşürürdü. Diğer istemli düğmeler refreshQueries
      // vermezse önceki gibi açılış sorgularını yeniler.
      const reloadAll = sequenceIds.length > 0 || (!source.rowAction && refresh.length === 0);
      rerun([...new Set([...(reloadAll ? loadIds : []), ...refresh])]);
      // Alanları yazan adımlar atlandıysa sonuçlar korunur ve pencere açık kalır: temizlenseydi sonraki kayıt kartı yeniden
      // oluştururdu; kapansaydı uyarı görünmezdi.
      if (fieldsSkipped) return;
      // Tam başarı: dizinin yazma sonuçları temizlenir, sonraki kayıt yeni oluşturma ile başlar (tek saveQuery Proje 1 gibi korunur).
      if (sequenceIds.length > 0) clearResults(queries.map((query) => query.name));
      source.onSuccess?.();
    } else {
      // Kısmi hata: liste yenilenmez (seçim ve bekleyen satırlar kalır); kaynak okumaları ve refreshQueries yenilenir.
      rerun([...new Set([...sourceReadIds(steps), ...refresh])]);
    }
  };
  const sequenceRef = useRef(startSequence);
  sequenceRef.current = startSequence;

  /** Bindirmeli düz tek yazma (Faz A yolu, `runWriteAction`): satır işlemi ve pencerenin `saveQuery`'si. */
  const runQueryWrite = async (query: PageQueryDefinition, props: Record<string, unknown>, overlay: Record<string, unknown>,
    onStatus: (status: ActionStatus | null) => void, onBusy: (busy: boolean) => void, onSuccess?: () => void) => {
    const text = (key: string) => interpolate(textValue(props[key]), mergeOverlay(currentScope(), overlay)).trim();
    onStatus(null);
    const result = await runWriteAction({
      query, isPreview, inFlight: writeLock,
      confirm: { enabled: props.confirmEnabled === true, text: text("confirmText"), tone: query.kind === "delete" || query.kind === "update" ? "danger" : "default" },
      write: async (target, confirmWrite) => {
        onBusy(true);
        try { return await writeWith(target, resolveQueryParameters(target, mergeOverlay(currentScope(), overlay)), confirmWrite); } finally { onBusy(false); }
      },
      errorText: (cause) => writeErrorText(text("errorMessage"), cause),
      validate: () => validateFor(query),
      ...codeWriteHooks(events),
    });
    if (result.ok) {
      onStatus({ tone: "success", text: `${text("successMessage") || "İşlem tamamlandı."} (${result.affectedRows} kayıt)` });
      rerun(stringList(props.refreshQueries));
      onSuccess?.();
    } else if ("error" in result) onStatus({ tone: "error", text: result.error });
  };
  const queryWriteRef = useRef(runQueryWrite);
  queryWriteRef.current = runQueryWrite;

  const saveDialog = (id: string) => {
    const dialog = dialogById[id];
    if (!dialog || dialogs[id] !== true) return;
    const props = dialog.props ?? {};
    const onStatus = (status: ActionStatus | null) => setDialogStatus((previous) => ({ ...previous, [id]: status }));
    const onBusy = (busy: boolean) => setDialogBusy((previous) => ({ ...previous, [id]: busy }));
    // closeOnSave (varsayılan açık): yalnız tam başarıda kapanır.
    const onSuccess = props.closeOnSave === false ? undefined : () => closeDialog(id);
    if (idList(props.saveSequence, 8).length > 0) { void sequenceRef.current({ props, onStatus, onBusy, onSuccess }); return; }
    const query = queryById[textValue(props.saveQuery).trim()];
    if (query && query.kind !== "read") void queryWriteRef.current(query, props, {}, onStatus, onBusy, onSuccess);
  };

  // ---- Değişiklik izleme ----
  /** formCard'ın değişen girişleri: dokunulmuş ve ham değeri çözülmüş varsayılandan farklı olan sahip olunan girişler. */
  const cardChanges = (card: ComponentDefinition) =>
    idList(card.props?.inputs).filter((id) => inputById[id] && id in touched && touched[id] !== current.defaults[id]).length;
  const componentDirty = (component: ComponentDefinition): boolean => {
    if (component.type === "formCard") return component.props?.trackChanges === true && cardChanges(component) > 0;
    if ((component.type !== "editableGrid" && component.type !== "customFieldsBlock") || !component.name) return false;
    const value = scope[component.name];
    return isPlainObject(value) && value.degisti === true;
  };
  const isDirty = () => [...formCards, ...gridComponents, ...blockComponents].some(componentDirty);
  /** Kayıt tabloları: `recordKey` bağlamasının ve ondan ulaşılan sorguların parametre bağlamalarının kökündeki tablolar. */
  const recordTableSets = useMemo(() => {
    const tableNames = new Set(Object.values(tableById).map((table) => table.name).filter((name): name is string => !!name));
    const queryByName = new Map(queryDefinitions.map((query) => [query.name, query]));
    const tablesOf = (text: string) => {
      const found = new Set<string>();
      const visited = new Set<string>();
      const visit = (root: string) => {
        if (visited.has(root)) return;
        visited.add(root);
        if (tableNames.has(root)) found.add(root);
        for (const parameter of queryByName.get(root)?.parameters ?? []) for (const match of parameter.binding.matchAll(PLACEHOLDER_ROOT)) visit(match[1]);
      };
      for (const match of text.matchAll(PLACEHOLDER_ROOT)) visit(match[1]);
      return found;
    };
    const all = new Set<string>();
    const tracked = new Set<string>();
    const byCard: Record<string, Set<string>> = {};
    for (const card of formCards) {
      const tables = tablesOf(textValue(card.props?.recordKey));
      byCard[card.id] = tables;
      tables.forEach((name) => { all.add(name); if (card.props?.trackChanges === true) tracked.add(name); });
    }
    return { all, tracked, byCard };
  }, [tableById, queryDefinitions, formCards]);
  /** İşlem Çubuğu'nun kayıt penceresi (`formDialog`): sayfada bir pencerenin kimliğiyse. */
  const formDialogId = useMemo(() => {
    const id = bar ? textValue(bar.props.formDialog).trim() : "";
    return id && dialogById[id] ? id : "";
  }, [bar, dialogById]);
  /** Kayıt yolunun (İşlem Çubuğu ve kayıt penceresinin saveQuery/saveSequence) yazma sorgularının adları. */
  const saveQueryNames = useMemo(() => {
    if (!bar) return [];
    const savePath = (props: Record<string, unknown> | undefined) => [textValue(props?.saveQuery).trim(), ...idList(props?.saveSequence, 8)];
    const ids = [...savePath(bar.props), ...(formDialogId ? savePath(dialogById[formDialogId].props) : [])].filter(Boolean);
    return [...new Set(ids.map((id) => queryById[id]).filter((query) => query && query.kind !== "read").map((query) => query.name))];
  }, [bar, queryById, formDialogId, dialogById]);
  const startNew = () => {
    setGrids({});
    setGridShown({});
    setCustomTyped({});
    setBlockShown({});
    clearResults(saveQueryNames);
    // Kayıt tablolarının seçimi kalkar: kayıt yolu seçili kaydı güncellemez, yeni kayıt oluşturur.
    const cleared = [...recordTableSets.all].filter((name) => (selections[name] ?? null) !== null);
    if (cleared.length === 0) return;
    setSelections((current) => ({ ...current, ...Object.fromEntries(cleared.map((name) => [name, null])) }));
    for (const name of cleared) events.emit("select", { table: name, row: null });
    // Seçili satıra bağlı okumalar (ör. `kart`) hemen boşalır ve gecikmesiz yeniden çalışır: kayıt koşulları (`kart.rows[0].id
    // == null`) ve kayıt anahtarları okuma gecikmesi boyunca eski kaydı göstermez; yazılmaya başlanan değerler sonradan sıfırlanmaz.
    const selectionRef = new RegExp(String.raw`\{\{\s*(?:${cleared.join("|")})\.seciliSatir\b`);
    const reset = resetReads(queryDefinitions.filter((query) => query.kind === "read" && query.parameters.some((parameter) => selectionRef.test(parameter.binding)))
      .map((query) => query.name));
    // Sıfırlamadan sonraki anahtarlar önceden kaydedilir: kart anahtarı ve özel alan değer okumasının `ranWith`'i değişti diye
    // Yeni'den hemen sonra yazılan değerler silinmez.
    const after: PageScope = { ...scope, ...Object.fromEntries(cleared.map((name) => [name, { ...(isPlainObject(scope[name]) ? scope[name] as Record<string, unknown> : {}), seciliSatir: null }])) };
    for (const name of reset) after[name] = { rows: [], rowCount: 0, columns: [], truncated: false, loading: false, error: "", ran: false };
    for (const card of formCards) {
      const key = textValue(card.props?.recordKey);
      if (key.trim() !== "" && [...key.matchAll(PLACEHOLDER_ROOT)].some((match) => reset.includes(match[1]) || cleared.includes(match[1]))) {
        previousCardKeys.current[card.id] = interpolate(key, after);
      }
    }
    for (const block of blockComponents) {
      const valuesId = textValue(block.props?.valuesQuery).trim();
      if (valuesId && reset.includes(queryNames[valuesId])) blockKeys.current[block.name!] = JSON.stringify(null);
    }
  };
  /** Kayıt penceresinin bir formCard'ının kayıt tablosunda seçim var mı (Aç). */
  const formDialogCards = formDialogId ? dialogContent(formDialogId).filter((id) => recordTableSets.byCard[id]) : [];
  const formDialogHasRecord = formDialogCards.some((id) => [...recordTableSets.byCard[id]].some((name) => !!selections[name]));
  // Seçimli kartların kayıt anahtarı okumaları (ör. `kart`): Aç yalnız okuma yanıt verip hatasız bir satır döndürdüyse çalışır;
  // yükleniyorken beklenir, hata ya da boş yanıtta pasiftir. Boş satırlarla açılan pencere seçili kaydı yeni kayıt sanmasın.
  const formDialogRecordStates = formDialogCards.filter((id) => [...recordTableSets.byCard[id]].some((name) => !!selections[name]))
    .flatMap((id) => [...textValue(flatById[id]?.props?.recordKey).matchAll(PLACEHOLDER_ROOT)].map((match) => states[match[1]]))
    .filter((state): state is QueryState => !!state);
  const formDialogRecordLoading = formDialogRecordStates.some((state) => state.loading || !state.ran);
  const formDialogRecordFailed = !formDialogRecordLoading && formDialogRecordStates.some((state) => !!state.error || state.rows.length === 0);
  const pendingNewFocus = useRef<string | null>(null);
  const [newFocusSignal, setNewFocusSignal] = useState(0);
  const startNewInDialog = (focusId: string | undefined, opener: HTMLElement | null) => {
    if (!formDialogId) return;
    // resetOnOpen ile aynı sıfırlama: sahip olunan girişlerin yazılan değeri, doğrulama iletisi ve arama durumu.
    const owned = dialogInputIds(formDialogId);
    setTouched((previous) => without(previous, owned));
    setValidationErrors((previous) => without(previous, owned));
    setLookupState((previous) => without(previous, owned));
    rotateAutoIds(owned);
    setDialogStatus((previous) => ({ ...previous, [formDialogId]: null }));
    if (!dialogs[formDialogId]) {
      dialogOpeners.current[formDialogId] = opener;
      setDialogs((previous) => ({ ...previous, [formDialogId]: true }));
    }
    if (!focusId || !inputById[focusId]) return;
    // Girişin sekmesi etkinleşir (sekme atlama sinyali); odak boyamadan sonra verilir.
    const targets: Record<string, number> = {};
    for (const component of flat) {
      if (component.type !== "tabs") continue;
      const index = parseTabs(component.props?.tabs).findIndex((tab) => ancestorsOf(focusId).some((owner) => tab.ids.includes(owner)));
      if (index >= 0) targets[component.id] = index;
    }
    if (Object.keys(targets).length > 0) setErrorJump((current) => ({ signal: (current?.signal ?? 0) + 1, targets }));
    pendingNewFocus.current = focusId;
    setNewFocusSignal((value) => value + 1);
  };
  useEffect(() => {
    const focusId = pendingNewFocus.current;
    if (!focusId) return;
    pendingNewFocus.current = null;
    // Pencere açılışı ilk alana, sekme atlaması geçersiz alana odaklanır: Yeni'nin odağı onlardan sonra verilir.
    let frame = 0;
    let tries = 0;
    const focus = () => {
      const element = document.getElementById(`page-input-${focusId}`);
      element?.focus();
      if ((!element || document.activeElement !== element || element.closest("[hidden]")) && tries++ < 5) frame = schedule(focus);
    };
    const schedule = (run: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : window.setTimeout(run, 0));
    frame = schedule(focus);
    return () => { if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame); window.clearTimeout(frame); };
  }, [newFocusSignal]);

  const applySelect = (tableName: string, row: Record<string, unknown> | null) => {
    setSelections((current) => ({ ...current, [tableName]: row }));
    // Güncelleyicinin dışında: StrictMode güncelleyiciyi iki kez çalıştırır.
    events.emit("select", { table: tableName, row });
  };
  /**
   * Kullanıcının satır değiştirmesi: `trackChanges` kartının kayıt tablosunda ve sayfa kirliyken önce sorulur (Vazgeç seçimi
   * korur, olay yayımlanmaz). Kayıt tablosunda değişen seçim kayıt yolunun yazma sonuçlarını temizler; sonra `then` çalışır.
   */
  const userSelect = (tableName: string, row: Record<string, unknown> | null, then?: () => void) => {
    const changes = (selections[tableName] ?? null) !== row;
    const commit = () => {
      applySelect(tableName, row);
      if (changes && recordTableSets.all.has(tableName)) clearResults(saveQueryNames);
      then?.();
    };
    if (!changes || !recordTableSets.tracked.has(tableName) || !isDirty()) { commit(); return; }
    void confirmDialog({ title: "Kayıt değiştirilsin mi?", message: LEAVE_MESSAGE, confirmLabel: "Devam" }).then((ok) => { if (ok) commit(); });
  };
  const select = (tableName: string, row: Record<string, unknown> | null, options?: { user?: boolean }) => {
    if (options?.user) userSelect(tableName, row);
    else applySelect(tableName, row);
  };
  /** Sorgunun bağlı ERP işlemine katalog izni var mı; SQL sorgusu ve katalog yüklenmeden önce true. */
  const runtimeQueryAllowed = (queryId: string) => {
    const query = queryById[queryId];
    return !query?.operation || erpOperations.operations?.get(query.operation)?.allowed !== false;
  };
  const runRowAction = (table: ComponentDefinition, button: ComponentDefinition, row: Record<string, unknown>, opener: HTMLElement | null) => {
    const tableName = table.name;
    const action = buttonActionOf(button.props ?? {}, queryById, dialogIds, inputIds);
    if (!tableName || !actionAllowed(action, rights) || !action || operationBlocked(action, { queryAllowed: runtimeQueryAllowed })) return;
    const overlay = { [tableName]: { seciliSatir: row } };
    // Koşullar satırın bindirmesiyle yeniden denetlenir (çizimden sonra değişmiş olabilir).
    const rowScope = mergeOverlay(currentScope(), overlay);
    if (!conditionHolds(button.props?.visibleWhen, rowScope, true) || conditionHolds(button.props?.disabledWhen, rowScope, false)) return;
    const props = button.props ?? {};
    const onStatus = (status: ActionStatus | null) => setTableStatus((previous) => ({ ...previous, [table.id]: status }));
    // Satır işlemi de satır değiştirir: kayıt tablosunda kirli sayfa önce sorar; Vazgeç işlemi de çalıştırmaz.
    userSelect(tableName, row, () => {
      if (action.type === "openDialog") { openDialog(props.dialogId as string, opener); return; }
      if (action.type === "setInput") { onStatus(null); applyAssignments(props, overlay); return; }
      if (action.type === "navigate") {
        onStatus(null);
        void runNavigation(props, () => mergeOverlay(currentScope(), overlay), tabKey).then((failure) => { if (failure) onStatus({ tone: "error", text: failure }); });
        return;
      }
      if (usesSequence(action, props)) { onStatus(null); void sequenceRef.current({ props, name: button.name, overlay, onStatus, onBusy: () => undefined, rowAction: true }); return; }
      if (!action.query) return;
      if (action.query.kind === "read") { rerun([action.query.id]); return; }
      void queryWriteRef.current(action.query, props, overlay, onStatus, () => undefined);
    });
  };
  const bulkDelete = async (table: ComponentDefinition, query: PageQueryDefinition, rows: Record<string, unknown>[]): Promise<boolean> => {
    const tableName = table.name;
    const onStatus = (status: ActionStatus | null) => setTableStatus((previous) => ({ ...previous, [table.id]: status }));
    if (!tableName || rows.length === 0 || query.kind !== "delete" || rights.delete !== true || !runtimeQueryAllowed(query.id)) return false;
    // ERP işlemi önizlemede yazılmaz (tek silmeyle aynı ileti); SQL sorgusu önizlemede uyarıyla sorulur.
    if (blockedInPreview(isPreview, [query])) { onStatus({ tone: "error", text: PREVIEW_ERP_WRITE_BLOCKED }); return false; }
    if (writeLock.current) { onStatus({ tone: "warning", text: WRITE_BUSY }); return false; }
    writeLock.current = true;
    try {
      const confirmed = await confirmDialog({
        // Başlık kaç kaydın silineceğini söyler (ör. "Seçilen 3 kayıt silinsin mi?").
        title: `Seçilen ${rows.length} kayıt silinsin mi?`, message: isPreview ? PREVIEW_WRITE_WARNING : undefined,
        confirmLabel: "Sil", cancelLabel: "Vazgeç", tone: "danger",
      });
      if (!confirmed) return false;
      onStatus(null);
      let deleted = 0;
      const failures: string[] = [];
      // Sırayla: her satır kendi bindirmesiyle çözülür; bir satırın hatası diğerlerini durdurmaz.
      for (const row of rows) {
        try {
          await writeWith(query, resolveQueryParameters(query, mergeOverlay(currentScope(), { [tableName]: { seciliSatir: row } })), isPreview);
          deleted += 1;
        } catch (cause) {
          failures.push(writeErrorText("", cause));
        }
      }
      const reasons = [...new Set(failures)];
      onStatus(failures.length === 0 ? { tone: "success", text: `${deleted} kayıt silindi.` }
        : { tone: deleted > 0 ? "warning" : "error", text: `${deleted} silindi, ${failures.length} silinemedi: ${reasons.join("; ")}` });
      rerun(loadIds);
      return true;
    } finally {
      writeLock.current = false;
    }
  };

  // ---- Düzenlenebilir tablolar ve özel alan blokları ----
  const gridByName = useMemo(() => Object.fromEntries(gridComponents.map((grid) => [grid.name!, grid])), [gridComponents]);
  const dispatchGrid = (spec: GridSpec, action: GridEngineAction) => {
    setGrids((previous) => {
      const stored = resolvedGridState(spec, previous[spec.name], states);
      const next = gridEngineReducer(stored, action, { mode: spec.mode, maxRows: spec.maxRows }, spec.engine);
      return next === stored && (previous[spec.name] || spec.engine.fillQuery) ? previous : { ...previous, [spec.name]: next };
    });
  };
  /** Yinelenen dizi adımının satırları (yalnız `stage` tablosu). */
  const gridIteration = (gridName: string, list: SequenceList): { key: string; row: Record<string, unknown> }[] => {
    const grid = gridByName[gridName];
    if (!grid) return [];
    const spec = gridSpecOf(grid);
    if (spec.mode !== "stage") return [];
    return iterationRows(list, spec.columns, gridStateOf(spec, states), gridSourceRows(spec, states), spec.rowKey);
  };
  /** Gönderilen satırlar tablonun bekleyen listesinden düşer. */
  const commitGrid = (gridName: string, list: SequenceList, keys: string[]) => {
    const grid = gridByName[gridName];
    if (grid && keys.length > 0) dispatchGrid(gridSpecOf(grid), { type: "commit", list, keys });
  };
  // ---- Seçim (lookup) hücreleri ----
  // Satır kapsamlı seçenek sorgusu satırın değerleri başına bir kez çalışır; sonuç anahtar (sorgu + çözülen parametreler) ile saklanır.
  const [rowOptions, setRowOptions] = useState<Record<string, QueryState>>({});
  const rowOptionsRequested = useRef(new Set<string>());
  const rowOptionNeed = (query: PageQueryDefinition, spec: GridSpec, draft: GridDraft) => {
    const values = resolveQueryParameters(query, mergeOverlay(scope, { [spec.name]: { satir: wireRow(spec.columns, draft) } }));
    return { query, values, key: `${query.id}|${JSON.stringify(values)}`, empty: Object.values(values).every((value) => value === null) };
  };
  const rowOptionNeeds = gridComponents.flatMap((grid) => {
    const spec = gridSpecOf(grid);
    const state = gridStateOf(spec, states);
    const drafts = spec.mode === "stage" ? state.added : state.rows;
    return spec.columns.flatMap((column) => {
      const query = column.lookup && rowScopedQueries.has(column.lookup.query) ? queryById[column.lookup.query] : undefined;
      return query ? drafts.map((draft) => rowOptionNeed(query, spec, draft)).filter((need) => !need.empty) : [];
    });
  });
  const rowOptionSignature = JSON.stringify([erpOperations.operations ? 1 : 0, [...new Set(rowOptionNeeds.map((need) => need.key))]]);
  useEffect(() => {
    for (const need of rowOptionNeeds) {
      // ERP işlemi sorgusu katalog yüklenene kadar bekler; aynı anahtar bir kez istenir (hata verirse sonraki değişimde yeniden).
      if (rowOptionsRequested.current.has(need.key) || (need.query.operation !== undefined && !erpOperations.operations)) continue;
      rowOptionsRequested.current.add(need.key);
      const { key } = need;
      setRowOptions((previous) => ({ ...previous, [key]: { rows: [], rowCount: 0, columns: [], truncated: false, loading: true, error: "", ran: false } }));
      void fetchRead(need.query, need.values).then((result) => {
        if (result.error) rowOptionsRequested.current.delete(key);
        setRowOptions((previous) => ({ ...previous, [key]: result }));
      });
    }
  }, [rowOptionSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Seçim sütununun seçenek durumu: satır kapsamlı sorguda o satırın önbellek girdisi, değilse sayfa düzeyindeki sorgu durumu. */
  const pickerState = (spec: GridSpec, column: GridColumn, draft: GridDraft | undefined): QueryState | undefined => {
    const lookup = column.lookup;
    if (!lookup) return undefined;
    if (!rowScopedQueries.has(lookup.query)) return states[queryNames[lookup.query]];
    const query = queryById[lookup.query];
    if (!draft || !query) return undefined;
    const need = rowOptionNeed(query, spec, draft);
    return need.empty ? undefined : rowOptions[need.key] ?? { rows: [], rowCount: 0, columns: [], truncated: false, loading: true, error: "", ran: false };
  };
  const pickerProps = (spec: GridSpec, column: GridColumn): Record<string, unknown> => ({
    optionValueColumn: column.lookup?.valueColumn, optionLabelColumn: column.lookup?.labelColumn,
    optionDescriptionColumn: column.lookup?.descriptionColumn, staticOptions: spec.staticOptions[column.code] ?? [],
  });
  /** Seçim hücresinin görünen metni: seçimde saklanan etiket, değilse seçeneğin "etiket · açıklama"sı, değilse ham değer. */
  const pickerText = (spec: GridSpec, column: GridColumn, value: string, draft?: GridDraft): string => {
    const stored = draft?.labels?.[column.code];
    if (stored !== undefined) return stored;
    const option = lookupCandidates(pickerProps(spec, column), pickerState(spec, column, draft), "", false).find((item) => item.value === value);
    return option ? optionText(option) : value;
  };
  const pickerFor = (spec: GridSpec) => (column: GridColumn, draft: GridDraft): GridPicker => {
    const cell = `${draft.key}.${column.code}`;
    const entry = gridSearch[spec.name];
    const search = entry?.cell === cell ? entry.text : "";
    const raw = draft.cells[column.code];
    const value = typeof raw === "string" ? raw : "";
    const props = pickerProps(spec, column);
    const base = pickerState(spec, column, draft);
    // Koşul satırın kendisini de görür (`<tablo>.satir`); `satir` seçenek satırıdır.
    const shown = filterOptionRows(base, spec.optionsWhen[column.code], mergeOverlay(scope, { [spec.name]: { satir: wireRow(spec.columns, draft) } }));
    const server = !!column.lookup && bindsGridSearch(column.lookup.query, spec.name);
    const stored = draft.labels?.[column.code];
    const own = stored === undefined ? lookupCandidates(props, base, "", false).find((option) => option.value === value) : undefined;
    return {
      options: lookupOptions(props, shown, search, server), loading: Boolean(base?.loading), error: base?.error || undefined,
      selected: stored !== undefined ? { value, label: stored } : own ? { value, label: optionText(own) } : null,
      onSearch: (text) => setGridSearch((previous) => (text === "" && previous[spec.name]?.cell !== cell ? previous
        : { ...previous, [spec.name]: { cell, code: column.code, text } })),
      onChange: (next, row, label) => {
        const option = lookupCandidates(props, base, "", false).find((item) => item.value === next);
        // Seçenek seçilince `lookupFills` hücreleri aynı satıra yazılır (temizleme ve sabit seçenek doldurmaz).
        const fills = next === "" ? {} : lookupFillCells(spec.columns, spec.engine, column.code, optionRowOf(option?.row ?? row), draft);
        dispatchGrid(spec, { type: "pick", key: draft.key, code: column.code, value: next, label: option ? optionText(option) : label, fills });
      },
    };
  };
  /** Gönderilen satırlar ve taslak anahtarları (`list` kipi; atlanan satırlar hariç) — `satirlar` dizinleriyle aynı sırada. */
  const gridSentRows = (spec: GridSpec, state: GridState) => sentDrafts(spec.mode, countedGridState(spec.engine, state))
    .map((draft) => ({ key: draft.key, row: wireRow(spec.columns, draft) }));
  /**
   * Yazma sorgularının sunucu satır hataları: `{{<tablo>.satirlar}}` bağlayan liste parametresinin `<param>[i].<alan>` hataları,
   * gönderilen i. satırın (taslak anahtarı) alanla aynı kodlu (büyük/küçük harf duyarsız) sütununa yazılır (yalnız `list` kipi).
   */
  const gridServerErrors = (spec: GridSpec, state: GridState): Record<string, Record<string, string>> => {
    const result: Record<string, Record<string, string>> = {};
    if (spec.mode !== "list") return result;
    const present = new Set(state.rows.map((draft) => draft.key));
    for (const query of queryDefinitions) {
      const fieldErrors = query.kind === "read" ? undefined : states[query.name]?.fieldErrors;
      const sent = sentKeys.current[query.name]?.[spec.name];
      if (!fieldErrors || !sent) continue;
      for (const parameter of query.parameters) {
        if (bindingPath(parameter.binding) !== `${spec.name}.satirlar`) continue;
        const prefix = parameter.name.toLowerCase();
        for (const [key, message] of Object.entries(fieldErrors)) {
          const match = /^([^[\]]+)\[(\d+)\]\.(.+)$/.exec(key);
          if (!match || match[1].toLowerCase() !== prefix) continue;
          const draftKey = sent[Number(match[2])];
          const column = spec.columns.find((item) => item.code.toLowerCase() === match[3].toLowerCase());
          if (draftKey !== undefined && present.has(draftKey) && column) (result[draftKey] ??= {})[column.code] = message;
        }
      }
    }
    return result;
  };
  /** Hesaplanan hücrenin metni: önizleme sorgusunun (eskimemiş) sonucundan, satır anahtarıyla; aksi halde "—". */
  const gridCalcText = (column: GridColumn, draft: GridDraft): string => {
    const query = column.calc ? queryById[column.calc.query] : undefined;
    if (!query || !column.calc) return CALC_EMPTY;
    const op = query.operation ? erpOperations.operations?.get(query.operation) : undefined;
    const state = states[query.name];
    if (!state || (state as { eskidi?: boolean }).eskidi === true || state.loading || state.error) return CALC_EMPTY;
    return calcText(previewRows(op, state), draft.key, column.calc.field);
  };
  const gridFor = (grid: ComponentDefinition): GridView => {
    const spec = gridSpecOf(grid);
    const source = gridSourceState(spec, states);
    const state = gridStateOf(spec, states);
    const sourceRows = gridSourceRows(spec, states);
    const counted = countedGridState(spec.engine, state);
    const clientErrors = gridShown[spec.name] && !skipsValidation(grid) ? withoutLockedErrors(spec.engine, counted, validateGrid(spec.mode, spec.columns, counted, sourceRows, spec.rowKey, spec.maxRows, gridFixedValues(grid, spec, scope), spec.minRows)) : {};
    // Sunucunun satır hataları (`<liste>[i].<alan>`) hücrelerde; istemci iletisi önce gelir.
    const serverErrors = gridServerErrors(spec, state);
    const errors: Record<string, Record<string, string>> = { ...serverErrors };
    for (const [key, cells] of Object.entries(clientErrors)) errors[key] = { ...errors[key], ...cells };
    const initial = gridFillState(spec, states);
    return {
      id: spec.name, mode: spec.mode, columns: spec.columns, state, sourceRows, rowKey: spec.rowKey, errors, maxRows: spec.maxRows,
      dispatch: (action) => dispatchGrid(spec, action),
      pickerFor: pickerFor(spec), pickerLabel: (column, value, draft) => pickerText(spec, column, value, draft),
      // Yeniden yüklemede eski kaynak satırlar yerinde kalır (bekleyen satırların girişleri sökülmesin).
      loading: (!!source && source.loading && !source.ran) || !!initial?.loading, error: source?.error || initial?.error || undefined,
      matrixPreviewCount: spec.mode === "matrix" ? matrixVariantCount(state) : undefined,
      totals: spec.totals.length > 0 ? gridColumnTotals(spec.totals, gridScope(spec.mode, spec.columns, counted, sourceRows, spec.rowKey).satirlar) : {},
      calcText: (column, draft) => gridCalcText(column, draft),
      lockedFor: (draft) => lockedColumns(spec.engine, draft),
    };
  };
  /** Bloğun sunucu hataları: `degerler` bağlayan yazmaların `<param>.<KOD>` alan hataları (büyük/küçük harf duyarsız önek). */
  const blockServerErrors = (name: string): Record<string, string> => {
    const errors: Record<string, string> = {};
    for (const query of queryDefinitions) {
      const fieldErrors = query.kind === "read" ? undefined : states[query.name]?.fieldErrors;
      if (!fieldErrors) continue;
      for (const parameter of query.parameters) {
        if (bindingPath(parameter.binding) !== `${name}.degerler`) continue;
        const prefix = `${parameter.name.toLowerCase()}.`;
        for (const [key, message] of Object.entries(fieldErrors)) if (key.toLowerCase().startsWith(prefix)) errors[key.slice(prefix.length)] = message;
      }
    }
    return errors;
  };
  const blockFor = (block: ComponentDefinition): BlockView => {
    const name = block.name!;
    const data = blockData(block, states);
    // İstemci iletisi sunucu hatasından önce gelir.
    const clientErrors = blockShown[name] && !skipsValidation(block) ? validateCustomFields(data.specs, data.values) : {};
    return {
      id: name, specs: data.specs, values: data.values, errors: { ...blockServerErrors(name), ...clientErrors },
      onChange: (code, value) => setCustomTyped((previous) => ({ ...previous, [name]: { ...previous[name], [code]: value } })),
      loading: !!data.definitions && data.definitions.loading && !data.definitions.ran,
      error: data.definitions?.error || data.valuesState?.error || undefined,
    };
  };
  const componentErrorIds = [
    ...gridComponents.filter((grid) => gridShown[grid.name!] && Object.keys(gridFor(grid).errors).length > 0).map((grid) => grid.id),
    ...blockComponents.filter((block) => blockShown[block.name!] && !skipsValidation(block)
      && Object.keys(validateCustomFields(blockData(block, states).specs, blockData(block, states).values)).length > 0).map((block) => block.id),
  ];

  // ---- Önizleme sorguları (`runOn` dizisi) ----
  // İzlenen bileşenin kapsam değeri: tabloda gönderilen satırlar, girişte değeri (arama metni ve seçim etiketi tetiklemez).
  const watchedValue = (name: string): unknown => {
    const value = scope[name];
    if (!isPlainObject(value)) return value ?? null;
    if ("satirlar" in value) return value.satirlar;
    if ("value" in value) return value.value;
    return value;
  };
  const previewPlans: PreviewPlan[] = previewQueries.map((query) => {
    const op = query.operation ? erpOperations.operations?.get(query.operation) : undefined;
    const values = withRowKeys(op, query, resolveQueryParameters(query, scope), (path) => {
      const grid = gridByName[path.replace(/\.satirlar$/, "")];
      if (!grid || !path.endsWith(".satirlar")) return null;
      const spec = gridSpecOf(grid);
      return spec.mode === "list" ? gridSentRows(spec, gridStateOf(spec, states)) : null;
    });
    // Bağlı tabloda geçersiz satır varsa ya da başlangıç satırları yükleniyorsa önizleme çalışmaz (son sonuç eskimiş kalır, "—").
    const blocked = gridComponents.some((grid) => {
      if (!bindsGrid(query, grid.name!) && !query.preview!.watch.includes(grid.name!)) return false;
      const spec = gridSpecOf(grid);
      if (gridFillState(spec, states)?.loading) return true;
      const counted = countedGridState(spec.engine, gridStateOf(spec, states));
      const errors = withoutLockedErrors(spec.engine, counted, validateGrid(spec.mode, spec.columns, counted, gridSourceRows(spec, states), spec.rowKey, spec.maxRows));
      return Object.keys(errors).length > 0;
    });
    return { query, values, key: JSON.stringify([values, query.preview!.watch.map(watchedValue)]), blocked, debounceMs: query.preview!.debounceMs };
  });
  const previewSignature = JSON.stringify([erpOperations.operations ? 1 : 0, previewPlans.map((plan) => [plan.query.name, plan.key, plan.blocked])]);
  const latestPreviewPlans = useRef(previewPlans);
  latestPreviewPlans.current = previewPlans;
  useEffect(() => { if (previewQueries.length > 0) preview.sync(latestPreviewPlans.current); }, [previewSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  // Doldurma sorgusunun yeni sonucu (`ranWith`) eski düzenlemeleri atar: aynı anahtara dönülse de geri gelmezler.
  const gridFillSignature = JSON.stringify(gridComponents.flatMap((grid) => {
    const spec = gridSpecOf(grid);
    const key = gridFillKey(spec, states);
    return key === null ? [] : [[spec.name, key]];
  }));
  useEffect(() => {
    const entries = JSON.parse(gridFillSignature) as [string, string][];
    setGrids((previous) => {
      const stale = entries.filter(([name, key]) => previous[name] && previous[name].fillKey !== key).map(([name]) => name);
      return stale.length > 0 ? without(previous, stale) : previous;
    });
  }, [gridFillSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kaynak değişti (`ranWith`): bekleyen satırlar sıfırlanır; aynı kaynak yenilendiyse yalnız artık olmayan silme işaretleri düşer.
  // Yüklenmekte olan kaynak beklenir (yeniden yükleme eski satırları ve `ranWith`'i korur).
  const gridSourceSignature = JSON.stringify(gridComponents.flatMap((grid) => {
    const spec = gridSpecOf(grid);
    const source = gridSourceState(spec, states);
    if (spec.mode !== "stage" || !source || source.loading) return [];
    return [[spec.name, gridKey(spec, states), source.rows.map((row) => displayText(row[spec.rowKey]))]];
  }));
  useEffect(() => {
    const entries = JSON.parse(gridSourceSignature) as [string, string, string[]][];
    setGrids((previous) => {
      let next = previous;
      for (const [name, key, keys] of entries) {
        const stored = previous[name];
        const grid = gridByName[name];
        if (!stored || !grid) continue;
        const spec = gridSpecOf(grid);
        const reset = gridReducer(stored, stored.sourceKey === key ? { type: "reset", sourceKey: key, sourceKeys: keys } : { type: "reset", sourceKey: key },
          { mode: spec.mode, maxRows: spec.maxRows });
        if (reset === stored) continue;
        if (next === previous) next = { ...previous };
        next[name] = reset;
      }
      return next;
    });
  }, [gridSourceSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bloğun değer sorgusunun `ranWith`'i değişti: yazılan değerler atılır (ilk yanıt yalnız kaydedilir).
  const blockKeys = useRef<Record<string, string>>({});
  const blockSignature = JSON.stringify(blockComponents.flatMap((block) => {
    const valuesId = textValue(block.props?.valuesQuery).trim();
    const state = valuesId ? states[queryNames[valuesId]] : undefined;
    return state && !state.loading ? [[block.name!, JSON.stringify(state.ranWith ?? null)]] : [];
  }));
  // Düzen etkisi: sıfırlama boyamadan önce olur, kullanıcının yazmaya başladığı değer sonradan silinmez.
  useLayoutEffect(() => {
    const changed: string[] = [];
    for (const [name, key] of JSON.parse(blockSignature) as [string, string][]) {
      const previous = blockKeys.current[name];
      blockKeys.current[name] = key;
      if (previous !== undefined && previous !== key) changed.push(name);
    }
    if (changed.length === 0) return;
    setCustomTyped((previous) => without(previous, changed));
    setBlockShown((previous) => without(previous, changed));
  }, [blockSignature]);

  // formCard `recordKey`: çözülen anahtar ilk çizimden sonra değişirse kartın girişleri sıfırlanır (dokunma, ileti, arama durumu).
  const previousCardKeys = useRef<Record<string, string>>({});
  const cardKeySignature = JSON.stringify(formCards.filter((card) => textValue(card.props?.recordKey).trim() !== "")
    .map((card) => [card.id, interpolate(textValue(card.props?.recordKey), scope)]));
  useLayoutEffect(() => {
    const reset: string[] = [];
    for (const [id, key] of JSON.parse(cardKeySignature) as [string, string][]) {
      const previous = previousCardKeys.current[id];
      previousCardKeys.current[id] = key;
      if (previous !== undefined && previous !== key) reset.push(...idList(flatById[id]?.props?.inputs));
    }
    if (reset.length === 0) return;
    setTouched((previous) => without(previous, reset));
    setValidationErrors((previous) => without(previous, reset));
    setLookupState((previous) => without(previous, reset));
  }, [cardKeySignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTables = useMemo(() => {
    const tables = new Set<string>();
    const plan = bar ? barCommandPlan(bar.props, !!formDialogId) : null;
    const openId = plan?.open.mode === "button" ? plan.open.button ?? "" : "";
    const button = openId ? buttonById[openId] : undefined;
    for (const match of JSON.stringify(button?.props ?? {}).matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\.seciliSatir\b/g)) tables.add(match[1]);
    // Düz Aç (`openAction: page`): seçili satırı kullanılan liste.
    const openTableName = plan?.open.mode === "page" && plan.open.table ? tableById[plan.open.table]?.name : undefined;
    if (openTableName) tables.add(openTableName);
    if (formDialogId && plan?.open.mode === "dialog") recordTableSets.all.forEach((name) => tables.add(name));
    return tables;
  }, [bar, buttonById, formDialogId, recordTableSets, tableById]);
  const pendingOpen = useRef(false);
  const [openSignal, setOpenSignal] = useState(0);
  const openRow = (tableName: string, row: Record<string, unknown>) => {
    if ((selections[tableName] ?? null) !== row) select(tableName, row, { user: true });
    pendingOpen.current = true;
    setOpenSignal((value) => value + 1);
  };
  // Seçim çizildikten sonra (Aç komutu yeni seçimle kaydedildi) çalışır.
  useEffect(() => {
    if (!pendingOpen.current) return;
    pendingOpen.current = false;
    void openCommand.current?.();
  }, [openSignal]);
  // dataTable `openParam`: sayfa parametresiyle gelen kaydın satır açma düğmesi, liste sorgusu yanıt verdikten sonra bir kez
  // çalışır. Sekmeye aynı parametrelerle yeniden gelinirse (gövde yeniden kurulmaz) gezinme olayı kaydı yeniden açar.
  const paramOpens = useMemo(() => (isV2 ? openParamTargets(flat, pageParams) : []), [isV2, flat, pageParams]);
  const [paramOpenRound, setParamOpenRound] = useState(() => (paramOpens.length > 0 ? 1 : 0));
  const paramOpenDone = useRef(0);
  useEffect(() => {
    if (paramOpenRound === 0 || paramOpenDone.current === paramOpenRound) return;
    const stateOf = (table: ComponentDefinition) => typeof table.props?.query === "string" ? states[queryNames[table.props.query]] : undefined;
    if (paramOpens.some(({ table }) => stateOf(table)?.loading)) return;
    paramOpenDone.current = paramOpenRound;
    for (const { table, button, value } of paramOpens) {
      if (buttonById[button]) runRowAction(table, buttonById[button], openParamRow(stateOf(table)?.rows, value), null);
    }
  });
  useEffect(() => {
    if (paramOpens.length === 0) return;
    const onOpen = (event: Event) => {
      const request = (event as CustomEvent<WorkspaceOpenRequest>).detail;
      if (request?.page === tabKey && !request.legacy && request.params && sameOpenRequest(request.params, pageParams)) setParamOpenRound((round) => round + 1);
    };
    window.addEventListener(OPEN_PAGE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
  }, [paramOpens, tabKey, pageParams]);
  /** Kayıt kartlarının girişleri kaynak değerlerine döner (İşlem Çubuğu Yeni düğmesi ve `afterSaveButton`). */
  const clearRecordInputs = () => {
    const owned = formCards.filter((card) => textValue(card.props?.recordKey).trim() !== "").flatMap((card) => idList(card.props?.inputs));
    if (owned.length === 0) return;
    setTouched((previous) => without(previous, owned));
    setValidationErrors((previous) => without(previous, owned));
    setLookupState((previous) => without(previous, owned));
  };
  // Başka bir sayfanın `afterSaveButton` gezinmesi bu sekmeyi hedefliyorsa açılış sorguları yenilenir (ör. kayıttan sonra liste).
  const rerunRef = useRef(rerun);
  rerunRef.current = rerun;
  const loadIdsRef = useRef(loadIds);
  loadIdsRef.current = loadIds;
  useEffect(() => {
    if (!tabKey) return;
    const onOpen = (event: Event) => {
      const request = (event as CustomEvent<WorkspaceOpenRequest>).detail;
      if (request?.refresh && request.page === tabKey && request.from !== tabKey) rerunRef.current(loadIdsRef.current);
    };
    window.addEventListener(OPEN_PAGE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PAGE_EVENT, onOpen);
  }, [tabKey]);

  const pageTitleComponent = isV2 ? flat.find((component) => component.type === "heading" && component.props?.pageTitle === true
    && conditionHolds(component.props?.visibleWhen, scope, true)) : undefined;
  const pageTitleTemplate = pageTitleComponent ? textValue(pageTitleComponent.props?.title) || textValue(pageTitleComponent.props?.text) : "";
  const pageTitle = pageTitleComponent ? interpolate(pageTitleTemplate, scope).trim() || null : null;
  // Bağlamalı başlık (ör. "{{kart.rows[0].name}}") açık kaydı adlandırır; sabit başlık ("Yeni cari kart") sayfanın kendi adıdır.
  const recordTitle = pageTitle !== null && pageTitleTemplate.includes("{{");
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;
  useEffect(() => { onTitleRef.current?.(pageTitle, recordTitle); }, [pageTitle, recordTitle]);
  useEffect(() => () => onTitleRef.current?.(null, false), []);

  const runtime: PageRuntime | undefined = isV2 ? {
    scope, states, queryNames, inputValues, setInput, changeInput, inputOptions, lookupFor, tablePaging,
    validationErrors, validateFor, errorJump,
    skipsValidation: (inputId) => !!inputById[inputId] && skipsValidation(inputById[inputId]),
    // Kullanıcının hiç değiştirmediği giriş bulanıklaşınca doğrulanmaz (ör. pencere açılışında odaklanan boş zorunlu alandan
    // sekmeye geçmek): ileti ve sekme işareti ancak değişiklikten ya da eylem denemesinden (validateFor) sonra görünür.
    blurInput: (componentId) => { if (componentId in touchedRef.current) storeMessage(componentId, inputMessage(componentId, inputValues[componentId])); },
    tabOwned, topLevelById, ancestorsOf,
    selections, select,
    queryById, inputErrors, ownedInputs, inputById, tableById, rights, rerun, isPreview,
    writeFor, events, codeHost,
    movedButtons, writeLock, actionStatus,
    currentScope, writeWith, runSequence: (source) => sequenceRef.current(source), gridIteration, commitGrid,
    dialogs, openDialog, closeDialog, saveDialog, dialogStatus, dialogBusy, dialogOpener: (id) => dialogOpeners.current[id] ?? null,
    dialogOwned, rowOwned, headerOwned, buttonById, applyAssignments,
    buttonAction: (button) => buttonActionOf(button.props ?? {}, queryById, dialogIds, inputIds),
    runRowAction, bulkDelete, tableStatus, tabKey,
    gridFor, blockFor, cardChanges, componentErrorIds, requestCloseDialog, isDirty, startNew,
    queryAllowed: runtimeQueryAllowed,
    formDialog: formDialogId ? {
      id: formDialogId, hasRecord: formDialogHasRecord, recordLoading: formDialogRecordLoading, recordFailed: formDialogRecordFailed,
      open: (opener) => openDialog(formDialogId, opener),
      startNew: startNewInDialog,
    } : null,
    newCommand, openCommand, clearRecordInputs, openTables, openRow, readOnly,
    filterBarFor: (filterBar) => {
      const model = filterBarModel(filterBar, states);
      if (!model) return null;
      const update = (change: (current: FilterBarValues) => FilterBarValues) =>
        setFilterValues((previous) => ({ ...previous, [filterBar.id]: change(previous[filterBar.id] ?? EMPTY_FILTER_VALUES) }));
      return {
        search: model.search ? { placeholder: textValue(filterBar.props?.searchPlaceholder) || "Ara", hint: model.hint } : null,
        values: model.values, filters: model.filters, searchInputId: `page-input-${filterBar.id}`,
        onSearch: (text) => update((current) => ({ ...current, search: text })),
        // İlk seçenek varsayılanlı süzgeçte "Tümü" boş metin olarak tutulur: varsayılan (yeniden açılışta da) onu ezmez.
        onChange: (key, value) => update((current) => {
          const values = { ...current.values };
          if (value !== undefined) values[key] = value;
          else if (model.filters.some((filter) => filter.key === key && filter.defaultFirst)) values[key] = "";
          else delete values[key];
          return { ...current, values };
        }),
        onClearAll: () => update((current) => ({ ...current, values: Object.fromEntries(model.filters.filter((filter) => filter.defaultFirst).map((filter) => [filter.key, ""])) })),
      };
    },
    filterBarTarget: (target) => {
      const at = target.indexOf(".");
      const filterBar = at > 0 ? filterBars.find((item) => item.id === target.slice(0, at)) : undefined;
      if (!filterBar) return null;
      const key = target.slice(at + 1);
      const spec = parseFilterEntries(filterBar.props?.filters).find((item) => item.key === key);
      if (!spec) return null;
      const current = filterValues[filterBar.id]?.values[key];
      return {
        value: typeof current === "string" ? current : current === true ? "true" : "",
        // Süzgeç alanının kendi değişikliği gibi: ilk seçenek varsayılanlı süzgeçte temizlemek "Tümü"dür (boş metin).
        set: (value) => setFilterValues((previous) => {
          const bar = previous[filterBar.id] ?? EMPTY_FILTER_VALUES;
          const values = { ...bar.values };
          if (value !== undefined) values[key] = spec.kind === "toggle" ? value === "true" : value;
          else if (spec.defaultFirst) values[key] = "";
          else delete values[key];
          return { ...previous, [filterBar.id]: { ...bar, values } };
        }),
      };
    },
    visibleRows: (table, state) => {
      const bars = filterBars.filter((filterBar) => filterBar.props?.table === table.id);
      if (bars.length === 0) return state;
      // Aynı satırlar ve aynı süzgeç değerleri için aynı sonuç döner (ızgara her çizimde yeni dizi görmesin).
      const key = JSON.stringify(bars.map((filterBar) => filterValues[filterBar.id] ?? null));
      const cached = visibleCache.current.get(table.id);
      if (cached && cached.state === state && cached.key === key) return cached.result;
      let rows = state.rows;
      for (const filterBar of bars) {
        const model = filterBarModel(filterBar, states);
        if (model) rows = applyClientFilters(rows, model.filters, model.values, model.search ? { columns: model.searchColumns, server: !!model.searchParam } : null, model.labels);
      }
      // Sunucu sayfalı listede toplam kayıt sunucunundur; süzgeç yalnız görünen sayfaya uygulanır.
      const result = rows === state.rows ? state : { ...state, rows, rowCount: table.props?.paging === "server" ? state.rowCount : rows.length };
      visibleCache.current.set(table.id, { state, key, result });
      return result;
    },
  } : undefined;

  // İşlem çubuklu sayfa eski liste ekranlarının başlık satırını kullanır: başlık (ve isteğe bağlı kayıt sayısı) işlem çubuğunun
  // üstünde, çubuk başlığın hemen altındaki yuvaya (ActionBarSlot) taşınır; açıklama başlığın ipucudur (eski ekranda satır yok).
  // `barLook` `title=false`: başlık satırı (ve onun çubuk yuvası, "Eski ekranda aç" bağlantısı) çizilmez; çubuk kabuğun kendi
  // yerinde (sayfanın üstünde) kalır, iz (breadcrumb) kabuğun satırında bir kez görünür.
  // Kayıt sayısı aktarım tablosunu izler: tablo (ya da bir sahibi) `visibleWhen` ile gizliyken eski sorgunun sayısı gösterilmez.
  const countTable = bar && typeof bar.props.exportTable === "string" ? bar.props.exportTable.trim() : "";
  const countTableHidden = !!runtime && countTable !== "" && !ancestorsOf(countTable).every((id) => { const item = flatById[id]; return !item || componentVisible(item, runtime); });
  const titleCount = bar && !countTableHidden ? pageTitleCount(bar.props.titleCount, scope) : null;
  const showTitle = !!bar && parseBarLook(bar.props.barLook)?.title !== false;
  return <div className="tenant-custom-page-content" ref={contentRef}>
    {showTitle && <div className="list-v2 tenant-custom-page-title">
      <ListPageHeader title={pageTitle || page.name} description={page.description || undefined} count={titleCount}>{legacyLink}</ListPageHeader>
    </div>}
    {runtime && bar && conditionHolds(bar.props.visibleWhen, scope, true) && <PageActionCommands barProps={bar.props} runtime={runtime} page={page} token={token} flat={flat}
      loadIds={loadIds} onStatus={setActionStatus} onBusy={setActionBusy} busy={actionBusy} rootRef={contentRef} />}
    {/* Görüntüleme kipi şeridi: kayıt salt okunur; Düzenle aynı kaydı (mode parametresi olmadan) düzenleme kipinde yeniden açar. */}
    {readOnly && <div className="tenant-page-view-mode" role="status">
      <Eye size={15} aria-hidden="true" /><span>Görüntüleme kipi: kayıt salt okunur.</span>
      {tabKey && runtime?.rights.update === true && <button type="button" className="tenant-page-button"
        onClick={() => setPageParams(tabKey, Object.fromEntries(Object.entries(pageParams).filter(([key]) => key !== VIEW_MODE_PARAM)))}>Düzenle</button>}
    </div>}
    {usesOperations && erpOperations.error && <QueryError message={`ERP işlem kataloğu yüklenemedi: ${erpOperations.error}`} />}
    {components.filter((component) => !tabOwned.has(component.id) && !dialogOwned.has(component.id) && !rowOwned.has(component.id) && !headerOwned.has(component.id))
      .map((component) => renderComponent(component, page.forms ?? [], token, page.code, runtime))}
  </div>;
}

/**
 * `{{sayfa.genis}}`: içerik alanı en az bu kadar (px) geniş. Eski Stok Kartları gibi liste ekranları detay panelini yalnız
 * bu genişlikte kendiliğinden açar (liste varsayılan sütunlarıyla panelin yanında kaydırmasız sığar).
 */
export const WIDE_PAGE = 1440;

/** İşlem çubuğunun `titleCount` bağlaması sayıya çözülürse başlığın yanındaki kayıt sayısı; boş/sayı değilse gösterilmez. */
/** Sil komutunun varsayılan onay başlığı (`deleteConfirmText` yoksa ya da bütün bağlamaları boşsa). */
export const BAR_DELETE_CONFIRM = "Kayıt silinsin mi?";

/**
 * İşlem Çubuğu Sil onayının başlığı: `deleteConfirmText` tıklama anındaki kapsamla çözülür (ör. "{{liste.seciliSatir.code}} ·
 * {{liste.seciliSatir.name}} cari kartı silinsin mi?"). Metin yoksa ya da bağlamalarının hiçbiri çözülmediyse genel başlık kalır.
 */
export function barDeleteConfirmTitle(raw: unknown, scope: PageScope): string {
  const template = textValue(raw).trim();
  if (!template) return BAR_DELETE_CONFIRM;
  return bindingsAllEmpty(template, scope) ? BAR_DELETE_CONFIRM : interpolate(template, scope).trim() || BAR_DELETE_CONFIRM;
}

export function pageTitleCount(raw: unknown, scope: PageScope): number | null {
  const template = textValue(raw);
  if (!template) return null;
  const text = interpolate(template, scope).trim();
  const value = text === "" ? NaN : Number(text);
  return Number.isFinite(value) ? value : null;
}

/** İşlem çubuğu (iç içe bileşenler dahil) olan sayfa. */
const hasActionBar = (list: ComponentDefinition[]): boolean => list.some((component) => component.type === "actionBar" || hasActionBar(component.children ?? []));

/** Sorgu durumlarındaki ERP doğrulama hatalarını (parametre adına göre) `{{<giriş>.value}}` bağlamasıyla giriş adlarına eşler. */
function operationInputErrors(queries: PageQueryDefinition[], states: Record<string, QueryState>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const query of queries) {
    const errors = states[query.name]?.fieldErrors;
    if (!errors) continue;
    const byLower = new Map(Object.entries(errors).map(([name, message]) => [name.toLowerCase(), message]));
    for (const parameter of query.parameters) {
      const message = byLower.get(parameter.name.toLowerCase());
      const input = bindingPath(parameter.binding)?.match(/^([A-Za-z_][A-Za-z0-9_]*)\.value$/)?.[1];
      if (message && input) result[input] = message;
    }
  }
  return result;
}

type TenantCustomPageProps = {
  code?: string; previewId?: string; token: string;
  /** System mode: the page key of a built-in screen whose firm design or standard is served by `/api/system-pages`. */
  systemScreenKey?: string;
  /** The workspace tab the page lives in when it is not the screen's own key (an alias key such as `customer-edit`). */
  tabKey?: string;
  onOpenLegacy?: () => void;
  /** Called on a 404 in system mode (stale runtime map) instead of showing an error. */
  onSystemPageMissing?: () => void;
};

export default function TenantCustomPage({ code, previewId, token, systemScreenKey, tabKey: aliasTabKey, onOpenLegacy, onSystemPageMissing }: TenantCustomPageProps) {
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  // Kaydı adlandıran (bağlamalı) başlık: çalışma sekmesinin adı ve sayfa yolu olur.
  const [recordTitle, setRecordTitle] = useState<string | null>(null);
  // The router passes inline callbacks; keep them out of the load effect's dependencies.
  const onMissingRef = useRef(onSystemPageMissing);
  onMissingRef.current = onSystemPageMissing;
  // A system page (published or a Studio draft preview) lives in its built-in screen's tab.
  const tabKey = (systemScreenKey && aliasTabKey) || (systemScreenKey ?? (previewId ? `custom-page-preview:${previewId}` : code ? `custom-page:${code}` : undefined));
  const pageParams = usePageParams(tabKey);
  // Görünen bağlamalı `pageTitle` başlığı (düzenlenen kaydın adı) çalışma sekmesinin adı ve sayfa yolu olur. Sabit başlıkta
  // (ör. yeni kartta "Yeni cari kart"), başlık yokken ya da sayfa kapanınca sekme sabit adında kalır ("Yeni Cari Kart").
  useEffect(() => {
    if (!tabKey) return;
    setWorkspacePageTitle(tabKey, recordTitle);
    return () => setWorkspacePageTitle(tabKey, null);
  }, [tabKey, recordTitle]);
  const onPageTitle = useCallback((title: string | null, fromRecord: boolean) => {
    setTitleOverride(title);
    setRecordTitle(fromRecord ? title : null);
  }, []);
  // Sekme başka parametrelerle yeniden açıldı (ör. başka bir kayıt): sayfa gövdesi baştan kurulur, yazılanlar ve sonuçlar taşınmaz.
  const paramKeys = useRef(new WeakMap<object, number>());
  const paramCounter = useRef(0);
  let paramKey = paramKeys.current.get(pageParams);
  if (paramKey === undefined) { paramKey = ++paramCounter.current; paramKeys.current.set(pageParams, paramKey); }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setPage(null);
    const endpoint = previewId
      ? `/api/custom-pages/${encodeURIComponent(previewId)}/preview`
      : systemScreenKey
        ? `/api/system-pages/${encodeURIComponent(systemScreenKey)}/published`
        : `/api/custom-pages/${encodeURIComponent(code || "")}/published`;
    let missing = false;
    // api() maps every 403 to a generic text; the published endpoint's own 403 message
    // ("Bu sayfayı görüntüleme yetkiniz yok.") travels on the error as serverError.
    void api<PublishedPage>(endpoint, token)
      .catch((cause: unknown) => {
        const failure = cause as Error & { status?: number; serverError?: string };
        if (systemScreenKey && !previewId && failure.status === 404) { missing = true; throw cause; }
        throw failure.status === 403 && failure.serverError ? new Error(failure.serverError) : cause;
      })
      .then((result) => {
        if (!active) return;
        const definition = JSON.parse(result.definitionJson) as { schemaVersion?: unknown; components?: unknown };
        if ((definition.schemaVersion !== 1 && definition.schemaVersion !== 2) || !Array.isArray(definition.components)) throw new Error("Yayımlanan sayfa tanımı geçersiz.");
        setPage(result);
      })
      .then(() => { if (active) setLoading(false); }, (cause: unknown) => {
        if (!active) return;
        // Stale map: stay in the loading state while the router falls back to the legacy screen.
        if (missing) { onMissingRef.current?.(); return; }
        setError((cause as Error).message || "Sayfa yüklenemedi.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [code, previewId, systemScreenKey, token]);

  const legacyLink = onOpenLegacy
    ? <button type="button" className="link-button system-page-legacy-link" onClick={onOpenLegacy}>Eski ekranda aç</button>
    : null;
  if (loading) return <div className="tenant-custom-page-state" role="status">Sayfa yükleniyor…</div>;
  if (error || !page) return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert"><AlertCircle size={18} /><span>{error || "Yayımlanmış sayfa bulunamadı."}</span>{legacyLink}</div>;

  let components: ComponentDefinition[] = [];
  let queryDefinitions: ReturnType<typeof readPageQueries> = [];
  let isV2 = false;
  try {
    const definition = JSON.parse(page.definitionJson) as { schemaVersion?: unknown; components?: ComponentDefinition[] };
    components = Array.isArray(definition.components) ? definition.components : [];
    isV2 = definition.schemaVersion === 2;
    if (isV2) queryDefinitions = readPageQueries(definition);
  } catch { return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">Sayfa tanımı okunamadı.{legacyLink}</div>; }

  return <main className={`tenant-custom-page${previewId ? " is-preview" : ""}`}>
    {previewId && <div className="tenant-custom-page-preview-banner" role="status"><strong>Studio taslak önizlemesi</strong><span>Bu taslak henüz yayımlanmadı; ERP kullanıcılarının aktif sayfasını değiştirmez.</span></div>}
    {!(isV2 && hasActionBar(components)) && <header className="tenant-custom-page-header"><span className="tenant-custom-page-icon"><LayoutTemplate size={20} /></span><div><h1>{titleOverride || page.name}</h1>{page.description && <p>{page.description}</p>}</div>{legacyLink}</header>}
    <PageBody key={`${page.id}:${page.revision}:${paramKey}`} page={page} components={components} queryDefinitions={queryDefinitions} isV2={isV2} token={token} previewId={previewId} tabKey={tabKey} pageParams={pageParams} legacyLink={legacyLink} onTitle={onPageTitle} />
  </main>;
}
