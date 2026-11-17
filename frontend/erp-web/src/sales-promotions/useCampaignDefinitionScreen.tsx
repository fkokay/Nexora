import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { CommandSpec, MenuCommand } from "../commands/types";
import { confirmDialog } from "../confirmDialog";
import { addLocalCalendarDays, localDateString } from "../dateUtils";
import { DefinitionEmptyPane, DefinitionLayout } from "../list-page/DefinitionLayout";
import { isInPopup, openDialogs, useWindowKeyDown } from "../record-form/recordFormKeys";
import { campaignState, type CampaignState } from "./campaignState";
import {
  CampaignDefinitionForm,
  campaignFieldChanged,
  type CampaignDraft,
  type CampaignDraftKey,
} from "./components/CampaignDefinitionForm";
import { CampaignDefinitionList } from "./components/CampaignDefinitionList";
import type { Campaign, CampaignScreenField, Performance, Quote } from "./components/types";

const BUSY = "İşlem sürüyor…";
const NO_RECORD = "Önce bir kayıt seçin";
const UNSAVED = "Önce değişiklikleri kaydedin veya vazgeçin";
const DISCARD = "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?";
const KEYS: CampaignDraftKey[] = ["code", "name", "percent", "from", "through"];

const draftOf = (c: Campaign): CampaignDraft => ({
  code: c.code,
  name: c.name,
  percent: String(c.discountPercent),
  from: c.effectiveFrom,
  through: c.effectiveThrough,
});
const createDefaults = (): CampaignDraft => ({
  code: "",
  name: "",
  percent: "10",
  from: localDateString(),
  through: addLocalCalendarDays(30),
});
/** A row as the form last loaded it; a refreshed row that differs in any of these rebuilds an unchanged form. */
const rowKey = (c: Campaign) => `${c.code}|${c.name}|${c.discountPercent}|${c.effectiveFrom}|${c.effectiveThrough}|${c.isActive}`;

type Options = {
  /** The campaign list is shown (not the performance report) and no other dialog of the page is open. */
  active: boolean;
  admin: boolean;
  campaigns: Campaign[];
  quotes: Quote[];
  performanceById: Map<string, Performance>;
  fields: CampaignScreenField[];
  busy: boolean;
  error: string;
  setError: (error: string) => void;
  /** Today's PUT / POST: the body and the endpoint are the page's (unchanged). */
  save: (draft: CampaignDraft, editing: Campaign | null) => Promise<Campaign | null>;
  setStatus: (campaign: Campaign, isActive: boolean) => Promise<Campaign | null>;
  apply: (campaignId: string, quoteId: string) => Promise<boolean>;
  toolsSlot: HTMLDivElement | null;
  toolsSlotRef: (element: HTMLDivElement | null) => void;
  onRefresh: () => void;
};

/**
 * Kampanyalar as a definition screen (mockup 04 "Tanım ekranı", mapping in mockup 06): the compact campaign list on
 * the left and the selected campaign's form on the right, with its results and Teklife uygula. Selecting a row (click,
 * ↑/↓) opens it, Yeni (F2) opens an empty form, Kaydet / Ctrl+S saves it and Esc closes it; each asks first when the
 * form has unsaved changes. Campaigns are never deleted (no delete exists): Sil explains that and offers Pasifleştir.
 * The API has no row version; the form keeps the campaign's active flag so a save never reverts a status change.
 */
export function useCampaignDefinitionScreen(o: Options) {
  const today = localDateString();
  const [search, setSearch] = useState(""),
    [stateFilter, setStateFilter] = useState<CampaignState | "">(""),
    [mode, setMode] = useState<"none" | "create" | "edit">("none"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [draft, setDraft] = useState<CampaignDraft>(createDefaults),
    [baseline, setBaseline] = useState<CampaignDraft | null>(null),
    // The open row as loaded (or last saved / status-changed): an unchanged form follows a refreshed row.
    [baseRow, setBaseRow] = useState<string | null>(null),
    [quoteId, setQuoteId] = useState("");
  const formId = `campaign-definition${useId()}`;
  const applySelectId = `${formId}-quote`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const createBase = useRef<CampaignDraft>(createDefaults());
  const current = selectedId ? o.campaigns.find((row) => row.id === selectedId) : undefined;

  const changedCount = mode === "edit" && baseline ? KEYS.filter((key) => campaignFieldChanged(key, draft, baseline)).length : 0;
  const hasChanges =
    mode === "edit" ? changedCount > 0 : mode === "create" && KEYS.some((key) => campaignFieldChanged(key, draft, createBase.current));
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const busyRef = useRef(o.busy);
  busyRef.current = o.busy;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const confirmDiscard = async (title: string) =>
    !hasChangesRef.current || (await confirmDialog({ title, message: DISCARD, confirmLabel: "Devam" }));
  const focusForm = (expected: "create" | "edit") =>
    window.setTimeout(() => {
      if (modeRef.current !== expected) return;
      document.getElementById(formId)?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    }, 0);
  const focusList = () =>
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-list .advanced-grid-scroll")?.focus(), 0);

  function openRecord(campaign: Campaign) {
    const base = draftOf(campaign);
    setSelectedId(campaign.id);
    setMode("edit");
    setBaseline(base);
    setBaseRow(rowKey(campaign));
    setDraft(base);
    setQuoteId("");
  }
  function closeRecord() {
    setSelectedId(null);
    setMode("none");
    setBaseline(null);
    setBaseRow(null);
    setDraft(createDefaults());
    setQuoteId("");
  }
  async function requestRow(key: string | null) {
    if (key === selectedId || busyRef.current) return;
    if (!(await confirmDiscard("Vazgeç"))) return;
    const campaign = key ? o.campaigns.find((row) => row.id === key) : undefined;
    if (campaign) openRecord(campaign);
    else closeRecord();
  }
  async function close() {
    if (mode === "none" || busyRef.current || !(await confirmDiscard("Vazgeç"))) return;
    closeRecord();
    focusList();
  }
  async function startCreate() {
    if (busyRef.current || !(await confirmDiscard("Yeni kayıt"))) return;
    closeRecord();
    const base = createDefaults();
    createBase.current = base;
    setDraft(base);
    setMode("create");
    o.setError("");
    focusForm("create");
  }
  // The list was refreshed and the open campaign changed elsewhere: an unchanged form shows the new values; a changed
  // one keeps the user's values until they are saved or undone.
  useEffect(() => {
    if (mode !== "edit" || !current || !baseRow || rowKey(current) === baseRow) return;
    if (busyRef.current || hasChanges) return;
    openRecord(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current && rowKey(current), hasChanges]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!o.admin) return;
    const editing = mode === "edit" ? (current ?? null) : null;
    if (mode === "edit" && !editing) return;
    const saved = await o.save(draft, editing);
    if (saved) openRecord(saved);
  }
  async function setActive(campaign: Campaign, isActive: boolean) {
    const updated = await o.setStatus(campaign, isActive);
    // The open, unchanged form takes the new row (and so its active flag) as its baseline.
    if (updated && updated.id === selectedId && !hasChangesRef.current) openRecord(updated);
  }
  // No delete exists for campaigns: Sil says so and offers the existing deactivation.
  async function deleteBlocked(campaign: Campaign) {
    if (
      await confirmDialog({
        title: `${campaign.code} · ${campaign.name} silinemez`,
        message:
          "Kampanyalar silinmez; uygulandığı teklifler ve performans sonuçları korunur. Pasifleştirebilirsiniz: pasif kampanya tekliflere uygulanamaz, etkinleştirildiğinde yeniden kullanılabilir.",
        tone: "warning",
        confirmLabel: "Pasifleştir",
        cancelLabel: "Vazgeç",
        keyHints: true,
      })
    )
      await setActive(campaign, false);
  }
  async function applyToQuote() {
    if (!current || !quoteId) return;
    if (await o.apply(current.id, quoteId)) setQuoteId("");
  }
  const focusApply = () =>
    window.setTimeout(() => {
      const target =
        document.getElementById(applySelectId) ??
        rootRef.current?.querySelector<HTMLElement>(".nx-def-pane .kmp-hint");
      target?.scrollIntoView?.({ block: "nearest" });
      if (target instanceof HTMLSelectElement) target.focus();
    }, 0);

  // Esc = Vazgeç: closes the open form (or the drawer below 1280px); not while a dialog or a picker owns the key.
  useWindowKeyDown(o.active && mode !== "none", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || !rootRef.current || rootRef.current.closest("[hidden]")) return;
    if (openDialogs().length) return;
    event.preventDefault();
    void close();
  });

  const commands: { new?: CommandSpec; open?: CommandSpec; delete?: CommandSpec } = {};
  if (o.admin) {
    commands.new = { primary: mode === "none", disabledReason: o.busy ? BUSY : undefined, run: () => void startCreate() };
    // The former Düzenle: the open campaign's form takes the focus.
    if (current && mode === "edit")
      commands.open = { disabledReason: o.busy ? "Kaydediliyor…" : undefined, run: () => void focusForm("edit") };
    commands.delete = {
      disabledReason: !current
        ? NO_RECORD
        : hasChanges
          ? UNSAVED
          : !current.isActive
            ? "Kampanyalar silinemez; bu kampanya zaten pasif."
            : o.busy
              ? BUSY
              : undefined,
      run: () => {
        if (current) void deleteBlocked(current);
      },
    };
  }
  const moreItems: MenuCommand[] = [];
  if (current) {
    const usable = campaignState(current, today) === "current";
    moreItems.push({
      id: "campaign-apply",
      label: "Teklife uygula",
      disabledReason: o.busy ? BUSY : usable ? undefined : "Yalnızca bugün geçerli kampanyalar uygulanabilir.",
      run: () => void focusApply(),
    });
    if (o.admin)
      moreItems.push({
        id: "campaign-status",
        label: current.isActive ? "Pasifleştir" : "Etkinleştir",
        disabledReason: o.busy ? BUSY : hasChanges ? UNSAVED : undefined,
        run: () => void setActive(current, !current.isActive),
      });
  }

  const term = search.trim().toLocaleLowerCase("tr-TR");
  const visible = o.campaigns.filter(
    (item) =>
      (!stateFilter || campaignState(item, today) === stateFilter) &&
      `${item.code} ${item.name}`.toLocaleLowerCase("tr-TR").includes(term),
  );

  const pane =
    mode === "none" ? (
      <DefinitionEmptyPane>Bir kampanya seçin ya da F2 ile yeni kampanya ekleyin.</DefinitionEmptyPane>
    ) : (
      <CampaignDefinitionForm
        mode={mode}
        current={current}
        draft={draft}
        baseline={mode === "edit" ? baseline : null}
        changedCount={changedCount}
        admin={o.admin}
        busy={o.busy}
        error={o.error}
        saveDisabledReason={
          !o.admin ? "Kampanyaları firma yöneticisi düzenler" : mode === "edit" && !hasChanges ? "Kaydedilecek değişiklik yok" : undefined
        }
        formId={formId}
        today={today}
        performance={current ? o.performanceById.get(current.id) : undefined}
        quotes={o.quotes}
        quoteId={quoteId}
        applySelectId={applySelectId}
        onDismissError={() => o.setError("")}
        onChange={setDraft}
        onSubmit={(event) => void submit(event)}
        onCancel={() => void close()}
        onQuoteChange={setQuoteId}
        onApply={() => void applyToQuote()}
      />
    );

  const view = (
    <DefinitionLayout
      rootRef={rootRef}
      className="kmp-def"
      paneOpen={mode !== "none"}
      paneLabel="Kampanya kaydı"
      list={
        <CampaignDefinitionList
          fields={o.fields}
          campaigns={o.campaigns}
          visible={visible}
          today={today}
          search={search}
          stateFilter={stateFilter}
          currentId={selectedId}
          admin={o.admin}
          onSearchChange={setSearch}
          onStateFilterChange={setStateFilter}
          onClearFilters={() => {
            setSearch("");
            setStateFilter("");
          }}
          onRefresh={o.onRefresh}
          onCurrentRowChange={(key) => void requestRow(key)}
          toolsSlot={o.toolsSlot}
          toolsSlotRef={o.toolsSlotRef}
          emptyAction={
            o.admin ? (
              <button type="button" className="primary small-button" onClick={() => void startCreate()}>
                <Plus size={15} /> Kampanya oluştur
              </button>
            ) : undefined
          }
        />
      }
      pane={pane}
    />
  );

  return { commands, moreItems, view, visible, formOpen: mode !== "none", startCreate };
}
