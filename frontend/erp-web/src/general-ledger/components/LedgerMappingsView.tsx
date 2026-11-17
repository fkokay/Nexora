import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api } from "../../erpApi";
import type { LedgerAccount, LedgerMapping } from "../../erp-types";
import { PageCommandsSlot } from "../../commands/PageCommandsSlot";
import type { PageCommands } from "../../commands/types";
import { confirmDialog } from "../../confirmDialog";
import { DefinitionEmptyPane, DefinitionLayout } from "../../list-page/DefinitionLayout";
import { ListFooter } from "../../list-page/ListFooter";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import { RecordFormGroup, RecordFormPage } from "../../record-form/RecordForm";
import { isInPopup, openDialogs, useWindowKeyDown } from "../../record-form/recordFormKeys";
import { downloadCsv, downloadXlsx } from "../ledgerReportUtils";
import { mappingInfo, mappingModuleLabels, mappingModuleOrder, type MappingModule } from "../mappingCatalog";
import { LedgerAccountCombobox } from "./LedgerAccountCombobox";
import "../../list-page/list-page-v2.css";
import "../ledger-reports.css";
import "../ledger-chart.css";

type Status = "mapped" | "missing" | "inactive";

const statusLabels: Record<Status, string> = { mapped: "Eşleşti", missing: "Eksik", inactive: "Pasif hesap" };
const statusTones: Record<Status, "ok" | "warn"> = { mapped: "ok", missing: "warn", inactive: "warn" };
const ADMIN_ONLY = "Hesap eşleştirmelerini firma yöneticisi düzenler";
const DISCARD = "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?";
const FORM_ID = "ledger-mapping-form";

/**
 * Hesap eşleştirmeleri (finance-ledger-mappings) as a definition screen (mockup 04 "Tanım ekranı", mapping in mockup
 * 09): the mapping keys grouped by module on the left, the selected mapping's account on the right. The keys are the
 * system's (no create or delete); Kaydet sends the same PUT as the former inline picker, and replacing an account
 * still asks first. A tenant user sees the card read-only.
 */
export function LedgerMappingsView({
  token,
  role,
  accounts,
  mappings,
  loaded,
  onSaved,
  onRefresh,
  onNavigate,
}: {
  token: string;
  role: string;
  accounts: LedgerAccount[];
  mappings: LedgerMapping[];
  /** False until the first load finished, so the default chip waits for the real counts. */
  loaded: boolean;
  onSaved: () => Promise<void>;
  onRefresh: () => void;
  onNavigate?: (page: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState<string | null>(null),
    [moduleFilter, setModuleFilter] = useState(""),
    [selectedKey, setSelectedKey] = useState<string | null>(null),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    // Rows saved while the "Eksik" filter is on stay in it until the filter changes.
    [keptKeys, setKeptKeys] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const activeAccounts = accounts.filter((account) => account.isActive);
  const statusOf = (mapping: LedgerMapping): Status => {
    if (!mapping.accountId) return "missing";
    return accountById.get(mapping.accountId)?.isActive ? "mapped" : "inactive";
  };
  const isAdmin = role === "TenantAdmin";
  const query = search.trim().toLocaleLowerCase("tr-TR");
  const rows = mappings
    .map((mapping) => ({ mapping, info: mappingInfo(mapping.mappingKey), status: statusOf(mapping) }))
    .filter(
      ({ mapping, info }) =>
        !query ||
        `${mapping.label} ${info.description} ${mapping.accountCode || ""} ${mapping.accountName || ""}`
          .toLocaleLowerCase("tr-TR")
          .includes(query),
    );
  const totalMissing = mappings.filter((mapping) => statusOf(mapping) !== "mapped").length;
  const doneCount = mappings.length - totalMissing;
  // Default: "Eksik" while anything is missing, otherwise "Tümü".
  const activeStatus = statusFilter ?? (loaded && totalMissing > 0 ? "missing" : "");
  const moduleRows = moduleFilter ? rows.filter((row) => row.info.module === moduleFilter) : rows;
  const visible = moduleRows.filter(
    ({ mapping, status }) => activeStatus !== "missing" || status !== "mapped" || keptKeys.has(mapping.mappingKey),
  );
  const missingCount = moduleRows.filter((row) => row.status !== "mapped").length;
  const moduleCounts = mappingModuleOrder
    .map((module) => ({ module, count: rows.filter((row) => row.info.module === module).length }))
    .filter((item) => item.count > 0);

  const selected = selectedKey ? mappings.find((mapping) => mapping.mappingKey === selectedKey) ?? null : null;
  const selectedStatus = selected ? statusOf(selected) : null;
  const baseline = selected && selectedStatus === "mapped" ? selected.accountId || "" : "";
  const dirty = Boolean(selected) && draft !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  // The card follows the reloaded mapping while it has no unsaved choice.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, baseline]);

  const confirmDiscard = async (title: string) =>
    !dirtyRef.current || (await confirmDialog({ title, message: DISCARD, confirmLabel: "Devam" }));
  async function requestRow(key: string) {
    if (key === selectedKey || savingRef.current) return;
    if (!(await confirmDiscard("Vazgeç"))) return;
    const mapping = mappings.find((row) => row.mappingKey === key);
    setSelectedKey(key);
    setDraft(mapping && statusOf(mapping) === "mapped" ? mapping.accountId || "" : "");
    setError("");
    setNotice("");
  }
  async function close() {
    if (!selected || savingRef.current || !(await confirmDiscard("Vazgeç"))) return;
    setSelectedKey(null);
    setDraft("");
    setError("");
    setNotice("");
    window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-list tr[data-mapping-key]")?.focus(), 0);
  }
  // Today's save: the same confirmation when an account is replaced, the same PUT.
  async function save(mapping: LedgerMapping, accountId: string) {
    if (!accountId || accountId === mapping.accountId) return;
    if (
      mapping.accountId &&
      !(await confirmDialog({
        title: "Hesap eşleştirmesi değiştirilsin mi?",
        message: "Bu eşleştirme sonraki aktarımlarda kullanılacak. Daha önce oluşturulmuş yevmiye fişleri değişmez.",
        tone: "warning",
        confirmLabel: "Eşleştirmeyi değiştir",
      }))
    )
      return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/finance/general-ledger/mappings/${encodeURIComponent(mapping.mappingKey)}`, token, {
        method: "PUT",
        body: JSON.stringify({ mappingKey: mapping.mappingKey, accountId }),
      });
      if (activeStatus === "missing") setKeptKeys((keys) => new Set(keys).add(mapping.mappingKey));
      await onSaved();
      setNotice("Kaydedildi");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !selected || !dirty || savingRef.current) return;
    void save(selected, draft);
  }
  function exportRows() {
    return [
      ["Modül", "Kullanım", "Açıklama", "Hesap kodu", "Hesap adı", "Durum"],
      ...visible.map(({ mapping, info, status }) => [
        mappingModuleLabels[info.module],
        mapping.label,
        info.description,
        mapping.accountCode || "",
        mapping.accountName || "",
        statusLabels[status],
      ]),
    ];
  }

  useWindowKeyDown(Boolean(selected), (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (isInPopup(event.target) || !rootRef.current || rootRef.current.closest("[hidden]")) return;
    if (openDialogs().length) return;
    event.preventDefault();
    void close();
  });
  const rowKeyHandler = (key: string) => (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void requestRow(key);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const all = [...(rootRef.current?.querySelectorAll<HTMLElement>(".nx-def-list tr[data-mapping-key]") ?? [])];
      const next = all[all.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      next.focus();
      void requestRow(next.dataset.mappingKey!);
    }
  };

  const commands: PageCommands = {
    new: { disabledReason: "Eşleştirme anahtarları sistemde tanımlıdır; yeni eşleştirme eklenmez" },
    open: {
      disabledReason: !selected ? "Önce bir kayıt seçin" : undefined,
      run: () => window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>(".nx-def-pane form input:not([disabled])")?.focus(), 0),
    },
    delete: { disabledReason: "Eşleştirmeler silinmez; başka bir hesap seçin" },
    export: {
      disabledReason: !mappings.length ? "Dışa aktarılacak eşleştirme yok" : undefined,
      run: () => void downloadXlsx("hesap-eslestirmeleri.xlsx", "Eşleştirmeler", exportRows()),
    },
    more: [
      {
        id: "ledger-mappings-chart",
        label: "Hesap planı",
        disabledReason: onNavigate ? undefined : "Bu ekranda kullanılamaz",
        run: () => onNavigate?.("finance-ledger-chart"),
      },
      {
        id: "ledger-mappings-csv",
        label: "CSV",
        disabledReason: !mappings.length ? "Dışa aktarılacak eşleştirme yok" : undefined,
        run: () => downloadCsv("hesap-eslestirmeleri.csv", exportRows()),
      },
    ],
  };

  const info = selected ? mappingInfo(selected.mappingKey) : null;
  const pane =
    !selected || !info || !selectedStatus ? (
      <DefinitionEmptyPane>Hesabını görmek ya da değiştirmek için bir eşleştirme seçin.</DefinitionEmptyPane>
    ) : (
      <div className="inv-rf-embedded glmp-form">
        <RecordFormPage
          variant="dialog"
          title={selected.label}
          mode="edit"
          busy={saving}
          saveLabel="Kaydet"
          formId={FORM_ID}
          onSubmit={submit}
          onCancel={() => void close()}
          saveDisabledReason={
            !isAdmin ? ADMIN_ONLY : !draft ? "Bir hesap seçin" : !dirty ? "Kaydedilecek değişiklik yok" : undefined
          }
          dirty={dirty}
          error={error}
          onDismissError={() => setError("")}
          subtitle={
            <>
              <span>{mappingModuleLabels[info.module]}</span> <StatusTag tone={statusTones[selectedStatus]}>{statusLabels[selectedStatus]}</StatusTag>
            </>
          }
          status={notice ? <span className="rf-status-notice" role="status">{notice}</span> : undefined}
        >
          <RecordFormGroup title="Kullanım">
            <dl className="glch-summary glmp-facts">
              <div>
                <dt>Modül</dt>
                <dd>{mappingModuleLabels[info.module]}</dd>
              </div>
              <div className="glmp-wide">
                <dt>Nerede kullanılır</dt>
                <dd>{info.description || "—"}</dd>
              </div>
              <div className="glmp-wide">
                <dt>Eşleştirme anahtarı</dt>
                <dd className="nx-code">{selected.mappingKey}</dd>
              </div>
            </dl>
          </RecordFormGroup>
          <RecordFormGroup title="Muhasebe hesabı">
            <div className="rf-span-2 glmp-account">
              <span className="glmp-account-label">Hesap</span>
              {isAdmin ? (
                <LedgerAccountCombobox
                  accounts={activeAccounts}
                  value={draft}
                  onChange={(accountId) => {
                    setDraft(accountId);
                    setNotice("");
                  }}
                  ariaLabel={`${selected.label} için hesap ara`}
                  disabled={saving}
                  preferredPrefixes={info.prefixes}
                />
              ) : selected.accountId ? (
                <span>{`${selected.accountCode} · ${selected.accountName}`}</span>
              ) : (
                <span className="glmp-unset">Eşleştirilmedi</span>
              )}
              {selectedStatus === "inactive" && (
                <small className="glmp-hint">{`Önceki hesap pasif: ${selected.accountCode} · ${selected.accountName}`}</small>
              )}
            </div>
            <p className="fin-rf-hint">
              Bu eşleştirme sonraki aktarımlarda kullanılacak. Daha önce oluşturulmuş yevmiye fişleri değişmez. Eksik eşleştirme
              aktarımı engeller.
            </p>
          </RecordFormGroup>
        </RecordFormPage>
      </div>
    );

  const list = (
    <>
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchLabel="Eşleştirmelerde ara"
        searchPlaceholder="Kullanım veya hesap kodu/adı"
        onRefresh={onRefresh}
      >
        <ListChipGroup
          label="Eşleştirme durumu"
          value={activeStatus}
          onChange={(value) => {
            setStatusFilter(value);
            setKeptKeys(new Set());
          }}
          options={[
            { value: "", label: "Tümü", count: moduleRows.length },
            ...(missingCount > 0 || activeStatus === "missing" ? [{ value: "missing", label: "Eksik", count: missingCount }] : []),
          ]}
        />
        <label className="list-v2-filter">
          <span>Modül</span>
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} aria-label="Modül">
            <option value="">{`Tümü (${rows.length.toLocaleString("tr-TR")})`}</option>
            {moduleCounts.map(({ module, count }) => (
              <option key={module} value={module}>{`${mappingModuleLabels[module as MappingModule]} · ${count}`}</option>
            ))}
          </select>
        </label>
      </ListToolbar>
      <section className="list-v2-list glch-list glmp-list" aria-label="Hesap eşleştirmeleri">
        <div className="glrp-table-wrap">
          <table className="glch-table glmp-table">
            <thead>
              <tr>
                <th scope="col">Kullanım</th>
                <th scope="col">Muhasebe hesabı</th>
                <th scope="col">Durum</th>
              </tr>
            </thead>
            <tbody>
              {mappingModuleOrder.map((module) => {
                const groupRows = visible.filter((row) => row.info.module === module);
                if (!groupRows.length) return null;
                return (
                  <Fragment key={module}>
                    <tr className="glch-class-row">
                      <th scope="rowgroup" colSpan={3}>{`${mappingModuleLabels[module]} · ${groupRows.length}`}</th>
                    </tr>
                    {groupRows.map(({ mapping, info: rowInfo, status }) => {
                      const isSelected = mapping.mappingKey === selectedKey;
                      return (
                        <tr
                          key={mapping.mappingKey}
                          data-mapping-key={mapping.mappingKey}
                          className={`glch-row${isSelected ? " is-selected" : ""}`}
                          tabIndex={0}
                          aria-current={isSelected || undefined}
                          title={rowInfo.description || undefined}
                          onClick={() => void requestRow(mapping.mappingKey)}
                          onKeyDown={rowKeyHandler(mapping.mappingKey)}
                        >
                          <td className="glch-name">{mapping.label}</td>
                          <td className="glch-name">
                            {mapping.accountId ? `${mapping.accountCode} · ${mapping.accountName}` : <span className="glmp-unset">Eşleştirilmedi</span>}
                          </td>
                          <td>
                            <StatusTag tone={statusTones[status]}>{statusLabels[status]}</StatusTag>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3} className="glrp-empty">
                    {mappings.length
                      ? activeStatus === "missing"
                        ? "Eksik eşleştirme yok."
                        : "Aramayla eşleşen kaynak bulunamadı."
                      : "Henüz alt defter kaynağı bulunmuyor."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListFooter hints="↑↓ listede gez · Tab forma geç · Ctrl+S kaydet · Esc listeye dön">
          <span>
            <span>{mappings.length.toLocaleString("tr-TR")}</span> <span>eşleştirme</span> · <span>{doneCount.toLocaleString("tr-TR")}</span>{" "}
            <span>tamam</span> · <span>{totalMissing.toLocaleString("tr-TR")}</span> <span>eksik</span>
          </span>
        </ListFooter>
      </section>
    </>
  );

  return (
    <>
      <PageCommandsSlot commands={commands} />
      <ListPageHeader
        title="Hesap eşleştirmeleri"
        description="Alt defter kaynaklarını muhasebe hesaplarıyla eşleştirin. Eksik eşleştirme aktarımı engeller."
        count={mappings.length}
        countLabel={`eşleştirme · ${doneCount.toLocaleString("tr-TR")} tamam`}
      />
      <DefinitionLayout
        rootRef={rootRef}
        className="glch-def glmp-def"
        paneOpen={Boolean(selected)}
        paneLabel="Hesap eşleştirmesi"
        list={list}
        pane={pane}
      />
    </>
  );
}
