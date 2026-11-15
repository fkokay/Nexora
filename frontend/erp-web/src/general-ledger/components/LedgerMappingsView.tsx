import { Fragment, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../../erpApi";
import type { LedgerAccount, LedgerMapping } from "../../erp-types";
import { confirmLocalized } from "../../locale";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListToolbar } from "../../list-page/ListToolbar";
import { downloadCsv, downloadXlsx } from "../ledgerReportUtils";
import { mappingInfo, mappingModuleLabels, mappingModuleOrder, type MappingModule } from "../mappingCatalog";
import { LedgerAccountCombobox } from "./LedgerAccountCombobox";
import "../journal-voucher.css";
import "../ledger-reports.css";
import "../ledger-chart.css";

type RowState = { state: "saving" | "saved" | "error"; message?: string };
type Status = "mapped" | "missing" | "inactive";

const statusLabels: Record<Status, string> = { mapped: "Eşleşti", missing: "Eksik", inactive: "Pasif hesap" };

/** Hesap eşleştirmeleri (finance-ledger-mappings): mapping keys grouped by module, saved per row. */
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
    [filter, setFilter] = useState<string | null>(null),
    [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const timers = useRef<Record<string, number>>({});
  useEffect(() => () => Object.values(timers.current).forEach((timer) => window.clearTimeout(timer)), []);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const activeAccounts = accounts.filter((account) => account.isActive);
  const statusOf = (mapping: LedgerMapping): Status => {
    if (!mapping.accountId) return "missing";
    return accountById.get(mapping.accountId)?.isActive ? "mapped" : "inactive";
  };
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
  const missingCount = rows.filter((row) => row.status !== "mapped").length;
  const totalMissing = mappings.filter((mapping) => statusOf(mapping) !== "mapped").length;
  const doneCount = mappings.length - totalMissing;
  // Default: "Eksik" while anything is missing, otherwise "Tümü".
  const activeFilter = filter ?? (loaded && totalMissing > 0 ? "missing" : "");
  // A row just saved stays in the "Eksik" view while its "Kaydedildi" confirmation shows.
  const visible = rows.filter(({ mapping, info, status }) =>
    activeFilter === "missing"
      ? status !== "mapped" || rowStates[mapping.mappingKey]?.state === "saved"
      : activeFilter
        ? info.module === activeFilter
        : true,
  );
  const moduleCounts = mappingModuleOrder
    .map((module) => ({ module, count: rows.filter((row) => row.info.module === module).length }))
    .filter((item) => item.count > 0);
  const isAdmin = role === "TenantAdmin";

  function flash(key: string, value: RowState | null) {
    window.clearTimeout(timers.current[key]);
    setRowStates((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    if (value?.state === "saved")
      timers.current[key] = window.setTimeout(() => flash(key, null), 2500);
  }
  async function save(mapping: LedgerMapping, accountId: string) {
    if (!accountId || accountId === mapping.accountId) return;
    if (
      mapping.accountId &&
      !confirmLocalized(
        "Bu eşleştirme sonraki aktarımlarda kullanılacak. Daha önce oluşturulmuş yevmiye fişleri değişmez. Devam edilsin mi?",
      )
    )
      return;
    flash(mapping.mappingKey, { state: "saving" });
    try {
      await api(`/api/finance/general-ledger/mappings/${encodeURIComponent(mapping.mappingKey)}`, token, {
        method: "PUT",
        body: JSON.stringify({ mappingKey: mapping.mappingKey, accountId }),
      });
      await onSaved();
      flash(mapping.mappingKey, { state: "saved" });
    } catch (e) {
      flash(mapping.mappingKey, { state: "error", message: (e as Error).message });
    }
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
  const chip = (value: string, label: string, count: number, extraClass = "") => (
    <button
      type="button"
      key={value || "all"}
      className={`list-v2-chip${extraClass}${activeFilter === value ? " is-active" : ""}`}
      aria-pressed={activeFilter === value}
      onClick={() => setFilter(value)}
    >
      <span>{label}</span>
      <span className="list-v2-chip-count">{count.toLocaleString("tr-TR")}</span>
    </button>
  );
  return (
    <>
      <ListPageHeader
        title="Hesap eşleştirmeleri"
        description="Alt defter kaynaklarını muhasebe hesaplarıyla eşleştirin."
        count={mappings.length}
        countLabel={`eşleştirme · ${doneCount.toLocaleString("tr-TR")} tamam`}
      >
        <button type="button" className="secondary" disabled={!mappings.length} onClick={() => void downloadXlsx("hesap-eslestirmeleri.xlsx", "Eşleştirmeler", exportRows())}>
          XLSX
        </button>
        <button type="button" className="secondary" disabled={!mappings.length} onClick={() => downloadCsv("hesap-eslestirmeleri.csv", exportRows())}>
          CSV
        </button>
        <button type="button" className="secondary" onClick={() => onNavigate?.("finance-ledger-chart")}>
          Hesap planı
        </button>
      </ListPageHeader>
      <section className="ledger-subpanel glmp" aria-label="Hesap eşleştirmeleri">
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchLabel="Eşleştirmelerde ara"
          searchPlaceholder="Kullanım veya hesap kodu/adı"
          onRefresh={onRefresh}
        >
          <div className="list-v2-chips" role="group" aria-label="Eşleştirme filtresi">
            {(missingCount > 0 || activeFilter === "missing") && chip("missing", "Eksik", missingCount, " glmp-missing-chip")}
            {chip("", "Tümü", rows.length)}
            {moduleCounts.map(({ module, count }) => chip(module, mappingModuleLabels[module as MappingModule], count))}
          </div>
        </ListToolbar>
        <div className="glrp-table-wrap">
          <table className="glmp-table">
            <thead>
              <tr>
                <th scope="col">Kullanım</th>
                <th scope="col">Muhasebe hesabı</th>
                <th scope="col">Durum</th>
              </tr>
            </thead>
            <tbody>
              {mappingModuleOrder.map((module) => {
                const moduleRows = visible.filter((row) => row.info.module === module);
                if (!moduleRows.length) return null;
                return (
                  <Fragment key={module}>
                    <tr className="glrp-group-row">
                      <th scope="rowgroup" colSpan={3}>{`${mappingModuleLabels[module]} · ${moduleRows.length}`}</th>
                    </tr>
                    {moduleRows.map(({ mapping, info, status }) => {
                      const rowState = rowStates[mapping.mappingKey];
                      return (
                        <tr key={mapping.mappingKey} className={`glmp-row is-${status}`}>
                          <td className="glmp-usage">
                            <b>{mapping.label}</b>
                            {info.description && <small>{info.description}</small>}
                          </td>
                          <td className="glmp-account">
                            {isAdmin ? (
                              <LedgerAccountCombobox
                                accounts={activeAccounts}
                                value={status === "mapped" ? mapping.accountId || "" : ""}
                                onChange={(accountId) => void save(mapping, accountId)}
                                ariaLabel={`${mapping.label} için hesap ara`}
                                disabled={rowState?.state === "saving"}
                                preferredPrefixes={info.prefixes}
                              />
                            ) : mapping.accountId ? (
                              `${mapping.accountCode} · ${mapping.accountName}`
                            ) : (
                              <span className="glmp-unset">Eşleştirilmedi</span>
                            )}
                            {status === "inactive" && (
                              <small className="glmp-hint">{`Önceki hesap pasif: ${mapping.accountCode} · ${mapping.accountName}`}</small>
                            )}
                            {rowState?.state === "saving" && <small className="glmp-hint">Kaydediliyor…</small>}
                            {rowState?.state === "saved" && (
                              <small className="glmp-hint is-ok" role="status">
                                <CheckCircle2 size={12} aria-hidden="true" /> Kaydedildi
                              </small>
                            )}
                            {rowState?.state === "error" && (
                              <small className="glmp-hint is-error" role="alert">
                                {rowState.message}
                              </small>
                            )}
                          </td>
                          <td>
                            <span className={`glmp-status is-${status}`}>
                              {status === "mapped" ? (
                                <CheckCircle2 size={13} aria-hidden="true" />
                              ) : (
                                <AlertTriangle size={13} aria-hidden="true" />
                              )}
                              {statusLabels[status]}
                            </span>
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
                      ? activeFilter === "missing"
                        ? "Eksik eşleştirme yok."
                        : "Aramayla eşleşen kaynak bulunamadı."
                      : "Henüz alt defter kaynağı bulunmuyor."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
